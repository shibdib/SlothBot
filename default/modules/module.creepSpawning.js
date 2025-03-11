/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const generator = require('module.bodyGenerator');
let energyOrder = {};
let orderStored = {};
let storedLevel = {};
let remoteRoomTargets = {};
let lastBuilt = {};
let creepTTL = {};
let activeSkMining = {};
const CREEP_COUNT_CACHE = {};
let lastGlobalSpawn = Game.time;

//Build Creeps From Queue
let buildTick = {};
module.exports.processBuildQueue = function (room) {
    // Skip unbuilt rooms or if the queue is empty
    const queue = getQueue(room);
    if (!room.level || !_.size(queue)) return;

    const currentTick = Game.time;

    // Check cooldown for building
    if (buildTick[room.name] + 5 > currentTick) return;
    buildTick[room.name] = currentTick;

    // Get available spawns
    const totalSpawns = room.impassibleStructures.filter((s) => s.my && s.structureType === STRUCTURE_SPAWN);
    // If we have creeps needing renewal and more than 1 spawn, reserve one for them
    const renewalCreep = room.myCreeps.find((c) => c.memory.needsRenewal);
    let availableSpawns = totalSpawns.filter((s) => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);
    if (renewalCreep && totalSpawns.length > 1) {
        availableSpawns = totalSpawns.filter((s) => s.id !== totalSpawns[0].id && s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);
    }
    for (let availableSpawn of availableSpawns) {
        let queuedBuild;
        let body = [];
        for (let topPriority of queue) {
            const {role, other} = topPriority;
            if (!role) continue;

            const generatedInfo = new generator(room.level, role, room, topPriority).generateBody();
            body = generatedInfo.body;
            topPriority = generatedInfo.info;
            if (!body || !body.length) continue;

            const cost = global.UNIT_COST(body);
            if (cost > room.energyCapacityAvailable) continue;
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) return;

            queuedBuild = topPriority;
            break;
        }

        if (queuedBuild) {
            if (!determineEnergyOrder(room)) return;

            const {role, operation, assignedSource, destination, other, military, misc, neededBoosts} = queuedBuild;
            const name = generateCreepName(role, room ? room.level : 0, operation);

            const energyStructures = energyOrder[availableSpawn.room.name] ? JSON.parse(energyOrder[availableSpawn.room.name]) : undefined;
            const moveParts = _.filter(body, (b) => b === MOVE).length;
            const attackParts = _.filter(body, (b) => b === ATTACK).length;
            const healParts = _.filter(body, (b) => b === HEAL).length;
            const spawnResult = availableSpawn.spawnCreep(body, name, {
                memory: {
                    role,
                    colony: availableSpawn.room.name,
                    assignedSource,
                    destination,
                    other,
                    military,
                    operation,
                    misc,
                    neededBoosts,
                    canTow: moveParts >= 2 && !attackParts && !healParts
                },
                energyStructures
            });

            // Handle spawn result
            if (spawnResult === OK) {
                handleSuccessfulSpawn(room, role, queuedBuild, availableSpawn);
                return;
            } else if (spawnResult === ERR_NOT_ENOUGH_ENERGY) {
                energyOrder[availableSpawn.room.name] = undefined;  // Reset energy order
                return;
            } else {
                log.d(`Spawn error in ${availableSpawn.room.name} code ${spawnResult}. Name - ${name}. Body - ${body}`);
                return;
            }
        } else {
            renewNearbyCreepIfNeeded(room, availableSpawn);
        }
    }

    // Helper function to handle successful spawn
    function handleSuccessfulSpawn(room, role, queuedBuild, availableSpawn) {
        lastGlobalSpawn = Game.time;
        lastBuilt[availableSpawn.room.name] = Game.time;

        if (!queuedBuild.operation) log.d(`${availableSpawn.room.name} Spawning a ${role}`);

        updateRoomAndGlobalQueue(room, role, queuedBuild);
    }

    // Helper function to update room and global queues after spawning a creep
    function updateRoomAndGlobalQueue(room, role, building) {
        let roomQueue = CREEP_QUEUES[room.name] ? JSON.parse(CREEP_QUEUES[room.name]) : {};
        let globalQueue = CREEP_QUEUES["global"] ? JSON.parse(CREEP_QUEUES["global"]) : {};
        const cacheKey = `c_${building.role}_${building.destination}_${building.other.reboot ? 'reboot' : ''}_${building.misc ? 'misc' : ''}_${building.operation ? building.operation : ''}`;

        if (globalQueue[cacheKey] && building.global) {
            delete globalQueue[cacheKey];
            CREEP_QUEUES["global"] = JSON.stringify(globalQueue);
        }

        if (roomQueue[cacheKey]) {
            delete roomQueue[cacheKey];
            CREEP_QUEUES[room.name] = JSON.stringify(roomQueue);
        }

    }

    // Helper function to renew a nearby creep if necessary
    function renewNearbyCreepIfNeeded(room, availableSpawn) {
        const nearbyCreeps = _.filter(room.myCreeps, (c) =>
            !_.find(c.body, (b) => b.boost) &&
            c.pos.isNearTo(availableSpawn) &&
            c.ticksToLive < CREEP_LIFE_TIME
        );

        if (nearbyCreeps.length) {
            const creepToRenew = _.min(nearbyCreeps, c => c.ticksToLive);
            availableSpawn.renewCreep(creepToRenew);
        }
    }
};

let essentialTick = {};
module.exports.essentialCreepQueue = function (room) {
    if (essentialTick[room.name] + 10 > Game.time) return;
    essentialTick[room.name] = Game.time;

    // Local Responder (Defenders)
    if (room.memory.spawnDefenders || room.memory.defenseCooldown > Game.time || room.memory.earlyWarning) {
        let targetAmount = room.hostileCreeps.length ? room.hostileCreeps.length : 2;
        if (targetAmount > 6) targetAmount = 6;
        queueCreepIfNeeded({
            room: room,
            role: 'defender',
            priority: PRIORITIES.defender,
            numberNeeded: targetAmount,
            misc: {boosts: [ATTACK, RANGED_ATTACK]}
        });
    }

    // Drone Queueing
    const importantBuilds = _.some(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    let droneCount = 1;
    if (room.memory.energyPositive) {
        droneCount = importantBuilds ? (10 - room.level) :
            !room.storage ? Math.max(7 - room.level, 1) : room.memory.spawnDefenders ? 3 :
                room.level >= BUNKER_LEVEL && room.energyState > 1 ? 2 : 1;
    }
    queueCreepIfNeeded({
        room: room,
        role: 'drone',
        priority: PRIORITIES.drone,
        numberNeeded: droneCount,
        rebootCondition: room.friendlyCreeps.length < 5,
        misc: {boosts: [WORK]}
    });

    // Harvesters
    let harvesterCount = getCreepCount(room, 'stationaryHarvester');
    queueCreepIfNeeded({
        room: room,
        role: 'stationaryHarvester',
        priority: PRIORITIES.stationaryHarvester,
        numberNeeded: room.sources.length,
        rebootCondition: !harvesterCount
    })

    // Haulers
    if (harvesterCount) {
        if (room.storage) {
            let haulerAmount = room.level >= 7 && room.energyState ? 2 : 1;
            queueCreepIfNeeded({
                room: room,
                role: 'hauler',
                priority: PRIORITIES.hauler,
                numberNeeded: haulerAmount,
                rebootCondition: !getCreepCount(room, 'hauler')
            });
        }
        let shuttleCount = room.level < 7 || !room.storage ? 2 : 0;
        if (room.droppedEnergy.find((d) => d.amount > 500)) shuttleCount++;
        if (room.droppedEnergy.find((d) => d.amount > 1000)) shuttleCount++;
        queueCreepIfNeeded({
            room: room,
            role: 'shuttle',
            priority: PRIORITIES.hauler,
            numberNeeded: shuttleCount,
            rebootCondition: room.myCreeps.length < 4
        });
    }

    // Upgrader
    if (!room.memory.spawnDefenders && room.level === room.controller.level) {
        let upgraderAmount = 1;
        if (room.memory.energyPositive && room.energyState) {
            if (!room.memory.controllerLink) {
                let container = Game.getObjectById(room.memory.controllerContainer);
                if (container) {
                    upgraderAmount = Math.min(Math.floor(container.store.getUsedCapacity(RESOURCE_ENERGY) / 650), container.pos.countOpenTerrainAround()) || 1;
                } else if (!container) {
                    upgraderAmount = 3;
                }
                if (upgraderAmount > 5) upgraderAmount = 5;
            } else if (room.level < 8) upgraderAmount = 1 + room.energyState;
        }
        queueCreepIfNeeded({
            room: room,
            role: 'upgrader',
            priority: PRIORITIES.upgrader,
            numberNeeded: upgraderAmount,
            misc: {boosts: [WORK]}
        });
    }
};

let miscTick = {};
module.exports.miscCreepQueue = function (room) {
    if (miscTick[room.name] + 12 > Game.time) return;
    miscTick[room.name] = Game.time;

    // LabTech
    if (room.terminal && room.storage) {
        queueCreepIfNeeded({room: room, role: 'labTech', priority: PRIORITIES.hauler + 1, numberNeeded: 1});
    }

    // If under attack, no spawning misc
    if (room.memory.dangerousAttack) return;

    // Mineral Harvester
    if (room.storage && room.level >= 6 && room.memory.extractorContainer && room.mineral.mineralAmount) {
        queueCreepIfNeeded({
            room: room,
            role: 'mineralHarvester',
            priority: PRIORITIES.mineralHarvester,
            numberNeeded: 1,
            misc: {boosts: [WORK]},
            other: {assignedMineral: room.mineral.id}
        });
    }

    // High Level Assist & Defense
    if (room.level >= MAX_LEVEL - 1 && room.level >= 4) {
        // Assist with Defense (Longbow for Guard)
        let needsDefense = _.find(MY_ROOMS, (r) => r !== room.name && (Game.rooms[r].memory.dangerousAttack || Game.rooms[r].memory.defenseCooldown > Game.time) && room.routeSafe(r, 3, 999, 15));
        if (needsDefense) {
            queueCreepIfNeeded({
                room: room,
                role: 'longbowSquad',
                priority: room.energyState > 1 ? PRIORITIES.priority : PRIORITIES.secondary,
                numberNeeded: 2,
                destination: needsDefense,
                misc: {
                waitFor: 2,
                boosts: [RANGED_ATTACK, HEAL]
                },
                operation: 'guard'
            });
        }
    }

    // Border Patrol
    const longbowPower = getBodyAbilityPower(room, 'longbow').attack + getBodyAbilityPower(room, 'longbow').heal;
    const needyBorderPatrol = room.myCreeps.find((c) => c.memory.operation === 'borderPatrol' && c.memory.needsMoreSquadMembers && c.memory.destination && c.memory.squadMembers);
    let needsBorderResponse = MY_ROOMS.find((r) => Game.rooms[r].memory.requestingBorderResponse && Game.map.getRoomLinearDistance(room.name, r) <= 4);
    if (needsBorderResponse) needsBorderResponse = Game.rooms[needsBorderResponse].memory.requestingBorderResponse;
    if (needyBorderPatrol) {
        queueCreepIfNeeded({
            room: room,
            role: 'longbow',
            priority: PRIORITIES.high,
            numberNeeded: needyBorderPatrol.memory.squadMembers.length + 1,
            destination: needyBorderPatrol.memory.destination,
            operation: 'borderPatrol'
        });
    } else if (room.memory.borderPatrol && INTEL[room.memory.borderPatrol].hostilePower < (longbowPower * (room.energyState + 1))) {
        const power = INTEL[room.memory.borderPatrol] ? (INTEL[room.memory.borderPatrol].hostilePower * 1.5) - INTEL[room.memory.borderPatrol].friendlyPower || 0 : 50;
        if (power > 0) {
            queueCreepIfNeeded({
                room: room,
                role: 'longbow',
                priority: PRIORITIES.medium,
                numberNeeded: INTEL[room.memory.borderPatrol].hostilePower / longbowPower,
                destination: room.memory.borderPatrol,
                operation: 'borderPatrol',
                other: {power: power}
            });
        }
    } else if (room.energyState && needsBorderResponse && INTEL[needsBorderResponse].hostilePower < longbowPower) {
        const power = INTEL[needsBorderResponse] ? (INTEL[needsBorderResponse].hostilePower * 1.5) - INTEL[needsBorderResponse].friendlyPower || 0 : 50;
        if (power > 0) {
            queueCreepIfNeeded({
                room: room,
                role: 'longbow',
                priority: PRIORITIES.secondary,
                numberNeeded: INTEL[needsBorderResponse].hostilePower / longbowPower,
                destination: needsBorderResponse,
                operation: 'borderPatrol',
                other: {power: power}
            });
        }
    } else if (room.memory.borderPatrol) {
        room.memory.requestingBorderResponse = room.memory.borderPatrol;
    } else {
        room.memory.requestingBorderResponse = undefined;
    }

    // Guard Dogs
    if (room.energyState) {
        const needsDog = _.find(room.myCreeps, (c) => c.memory.leader && c.memory.squadMembers && c.memory.squadMembers.length && (!c.memory.dog || !Game.getObjectById(c.memory.dog)));
        if (needsDog) {
            queueCreepIfNeeded({
                room: room,
                role: 'attacker',
                priority: PRIORITIES.medium,
                numberNeeded: 1,
                misc: {guardDog: true, boosts: [ATTACK]}
            });
        }
    }
};

let remoteTick = {};
let lastRemoteRefresh = {};
let contestedRemotes = {};
let blockedRemotes = {};
module.exports.remoteCreepQueue = function (room) {
    if (remoteTick[room.name] + 10 > Game.time) return;
    room.memory.remoteSources = undefined;

    // Global remote penalty means NO remote activity at all
    if (Memory.cpuTracking && Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;

    // If under attack, no spawning remotes
    if (room.memory.dangerousAttack) {
        remoteRoomTargets[room.name] = undefined;
        return;
    }

    remoteTick[room.name] = Game.time;
    room.memory.borderPatrol = undefined;

    // Refresh remote room data
    if (!remoteRoomTargets[room.name] || lastRemoteRefresh[room.name] + CREEP_LIFE_TIME > Game.time || INTEL[room.name].refreshRemotes) {
        refreshRemoteRoomTargets(room);
        INTEL[room.name].refreshRemotes = undefined;
    }

    // Handle threats first
    const threat = remoteRoomTargets[room.name].find((r) => INTEL[r] && INTEL[r].threatLevel > 1);
    if (threat) handleThreatLevel(room, threat);

    // Process remote rooms
    if (remoteRoomTargets[room.name]) {
        let remoteRooms = remoteRoomTargets[room.name];
        remoteRooms.forEach(remoteName => processRemoteSpecificTasks(room, remoteName));
    }

    // If room remote limited, disable harvesters/haulers/special ops
    if (room.memory.noRemote) return;

    // Handle remote harvesters/haulers
    if (room.energyState < 3 || room.level < 8) {
        handleRemoteHarvesters(room);
        handleRemoteHaulers(room);
    }

    // If we have a contested remote.. contest it
    if (contestedRemotes[room.name] && room.energyState) {
        handleContestedRoom(room);
    }

    // If we have a blocked remote.. clean it
    if (blockedRemotes[room.name] && room.energyState) {
        handleBlockedRoom(room);
    }

    function processRemoteSpecificTasks(room, remoteName) {
        if (shouldSkipRemote(room, remoteName)) return;
        trackRemoteRoom(remoteName, room);

        let highestLevel = checkHighestLevel(room, remoteName);
        if (highestLevel) {
            if (!INTEL[remoteName].sk) handleReservation(room, remoteName);
            if (INTEL[remoteName].invaderCore) handleInvaderCore(room, remoteName);
            handleRoadBuilder(room);
            if (SK_MINING && INTEL[remoteName].sk && room.level >= SK_MINING_LEVEL) {
                activeSkMining[room.name] = Game.time;
                handleSkCreeps(room, remoteName);
            }
        }
    }

    function trackRemoteRoom(remoteName, room) {
        if (!INTEL[remoteName].remoteRoom || INTEL[remoteName].remoteRoom.indexOf(room.name) === -1) {
            if (!INTEL[remoteName].remoteRoom) INTEL[remoteName].remoteRoom = [];
            INTEL[remoteName].remoteRoom.push(room.name);
        }
    }

    function checkHighestLevel(room, remoteName) {
        return INTEL[remoteName].remoteRoom.every(function (r) {
            return r === room.name || (Game.rooms[r] && Game.rooms[r].level <= room.level);
        });
    }

    function shouldSkipRemote(room, remoteName) {
        if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) return true;
        if (!INTEL[remoteName]) return true;
        if (INTEL[remoteName].threatLevel > 1) return true;
        if (INTEL[remoteName].sk && (room.level < SK_MINING_LEVEL || !SK_MINING)) return true;
        if (INTEL[remoteName].level || !INTEL[remoteName].sources) return true;
        if (INTEL[remoteName].reservation && ![MY_USERNAME, "Invader"].includes(INTEL[remoteName].reservation)) return true;
        if (INTEL[remoteName].roomHeat > 250) return true;
        if (INTEL[remoteName].obstacles) return true;
        return false;
    }

    function handleContestedRoom(room) {
        const intel = INTEL[contestedRemotes[room.name]];
        if (intel.contestingCount > room.level * 2) {
            log.a(`${roomLink(room.name)} is not longer contesting ${roomLink(contestedRemotes[room.name])} due to casualties.`, "HIGH COMMAND:")
            INTEL[contestedRemotes[room.name]].lastContest = Game.time;
            INTEL[contestedRemotes[room.name]].contestingCount = 0;
            return contestedRemotes[room.name] = undefined;
        }
        // Duos if actively contested otherwise just a longbow
        if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) {
            if (queueCreepIfNeeded({
                room: room,
                role: 'longbowSquad',
                priority: PRIORITIES.remoteHarvester + 1,
                numberNeeded: 4,
                destination: contestedRemotes[room.name],
                misc: {waitFor: 4}
            })) {
                if (!intel.contestingCount) INTEL[contestedRemotes[room.name]].contestingCount = 1; else INTEL[contestedRemotes[room.name]].contestingCount++
            }
        } else {
            if (queueCreepIfNeeded({
                room: room,
                role: 'longbow',
                priority: PRIORITIES.remoteHarvester + 1,
                numberNeeded: 1,
                destination: contestedRemotes[room.name]
            })) {
                if (!intel.contestingCount) INTEL[contestedRemotes[room.name]].contestingCount = 1; else INTEL[contestedRemotes[room.name]].contestingCount++
            }
        }
        // Reservers if safe
        if (!intel.armedHostile || intel.armedHostile + CREEP_LIFE_TIME < Game.time) {
            handleReservation(room, contestedRemotes[room.name])
        }
    }

    function handleBlockedRoom(room) {
        const intel = INTEL[blockedRemotes[room.name]];
        if (intel && (!intel.armedHostile || intel.armedHostile + CREEP_LIFE_TIME < Game.time)) {
            if (intel.claimClear && Game.gcl.level > MY_ROOMS.length) {
                queueCreepIfNeeded({
                    room: room,
                    role: 'claimer',
                    priority: PRIORITIES.secondary,
                    numberNeeded: 1,
                    destination: blockedRemotes[room.name],
                    operation: 'claimClear'
                });
            } else {
                queueCreepIfNeeded({
                    room: room,
                    role: 'cleaner',
                    priority: PRIORITIES.secondary,
                    numberNeeded: 2,
                    destination: blockedRemotes[room.name]
                });
            }
        }
    }

    function handleInvaderCore(room, remoteName) {
        if (INTEL[remoteName].sk || INTEL[remoteName].obstacles) return;
        queueCreepIfNeeded({
            room: room,
            role: 'attacker',
            priority: PRIORITIES.remoteHarvester - 1,
            numberNeeded: 1,
            destination: remoteName
        });
    }

    function handleThreatLevel(room, remoteName) {
        if (INTEL[remoteName].tickDetected + CREEP_LIFE_TIME < Game.time) {
            queueCreepIfNeeded({
                room: room,
                role: 'explorer',
                priority: PRIORITIES.secondary,
                numberNeeded: 1,
                destination: remoteName
            });
        } else if (!INTEL[remoteName].sk) {
            room.memory.borderPatrol = remoteName;
        }
    }

    function handleReservation(room, remoteName) {
        if (room.level >= 4 && getCreepCount(undefined, 'remoteHarvester', remoteName) && (!INTEL[remoteName].reservationExpires || (INTEL[remoteName].reservationExpires - CREEP_LIFE_TIME) < Game.time) && !INTEL[remoteName].sk) {
            const count = !room.energyState || room.level >= 7 ? 1 : INTEL[remoteName].reserverCap && INTEL[remoteName].reserverCap < 3 ? INTEL[remoteName].reserverCap : INTEL[remoteName].reserverCap && INTEL[remoteName].reserverCap > 3 ? 3 : 1
            queueCreepIfNeeded({
                room: room,
                role: 'reserver',
                priority: PRIORITIES.reserver + getCreepCount(undefined, 'reserver', undefined, undefined, room),
                numberNeeded: count,
                destination: remoteName
            });
        }
    }

    function handleRoadBuilder(room) {
        if (getCreepCount(room, 'remoteHarvester') && !getCreepCount(undefined, 'roadBuilder', undefined, room)) {
            queueCreepIfNeeded({room: room, role: 'roadBuilder', priority: PRIORITIES.roadBuilder, numberNeeded: 1});
        }
    }

    function handleSkCreeps(room, remoteName) {
        if (Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;
        queueCreepIfNeeded({
            room: room,
            role: 'SKAttacker',
            priority: PRIORITIES.remoteHarvester + getCreepCount(undefined, 'remoteHarvester', undefined, undefined, room),
            numberNeeded: 1,
            destination: remoteName
        });
        queueCreepIfNeeded({
            room: room,
            role: 'commodityMiner',
            priority: PRIORITIES.roadBuilder,
            numberNeeded: 1,
            destination: remoteName
        });
    }

    function handleRemoteHarvesters(room) {
        if (Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;
        let totalHarvesters = getCreepCount(undefined, 'remoteHarvester', undefined, undefined, room.name);
        if (ROOM_REMOTE_TARGETS[room.name] && totalHarvesters < 9 / CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][room.level]) {
            let remoteSource = ROOM_REMOTE_TARGETS[room.name];
            let acceptedScore = !room.energyState ? REMOTE_DISTANCE_MAX * 2 : REMOTE_DISTANCE_MAX;
            acceptedScore = Math.max(acceptedScore, _.min(remoteSource, 'score').score);
            remoteSource = _.min(_.filter(remoteSource, (s) => remoteRoomTargets[room.name].includes(s.room) && !shouldSkipRemote(room, s.room) && s.score <= acceptedScore
                && !_.find(Game.creeps, (c) => c.my && c.memory.role === 'remoteHarvester' && c.memory.other.source === s.source)
                && (!INTEL[s.room].sk || getCreepCount(undefined, 'SKAttacker', remoteSource.room))), 'score');
            if (remoteSource && remoteSource.room) {
                queueCreep(room, PRIORITIES.remoteHarvester + getCreepCount(undefined, 'remoteHarvester', undefined, room), {
                    role: 'remoteHarvester',
                    destination: remoteSource.room,
                    other: {source: remoteSource.source}
                });
            }
        }
    }

    function handleRemoteHaulers(room) {
        const roomHarvesters = _.filter(Game.creeps, (c) => c.my && c.memory.colony === room.name && c.memory.role === 'remoteHarvester' && c.memory.other && c.memory.other.haulingRequired);
        for (const harvester of roomHarvesters) {
            if (shouldSkipRemote(room, harvester.memory.destination)) continue;
            const assignedHaulers = _.filter(Game.creeps, (c) => c.my && c.memory.role === 'remoteHauler' && c.memory.other && c.memory.other.harvester === harvester.id);
            if (assignedHaulers.length >= CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][room.level] + 1) continue;
            const haulingCapacity = assignedHaulers.reduce((sum, creep) => sum + creep.getActiveBodyparts(CARRY) * 50, 0);
            const harvestAmount = harvester.memory.other.haulingRequired;
            if (harvestAmount && haulingCapacity < harvestAmount) {
                queueCreep(room, PRIORITIES.remoteHauler + getCreepCount(undefined, 'remoteHauler', undefined, room), {
                    role: 'remoteHauler',
                    destination: room.name,
                    other: {
                        harvester: harvester.id,
                        harvestAmount: harvestAmount,
                        source: harvester.memory.other.source
                    }
                });
            }
        }
    }

    function refreshRemoteRoomTargets(room) {
        lastRemoteRefresh[room.name] = Game.time;
        remoteRoomTargets[room.name] = undefined;
        const exits = Game.map.describeExits(room.name);

        // Find usable remotes
        const surroundingRooms = getSurroundingRooms(room.name);
        let remoteTargets = surroundingRooms.filter(function (r) {
            return r.name !== room.name && roomStatus(r) === roomStatus(room.name) && INTEL[r] && INTEL[r].sources && !INTEL[r].owner && !INTEL[r].obstacles &&
                (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME) && Game.map.findRoute(room.name, r).length <= 2;
        });
        for (const rooms of surroundingRooms) {
            if (roomStatus(rooms) === roomStatus(room.name)) {
                const surroundingRoomsTwo = getSurroundingRooms(rooms);
                const remoteRooms = surroundingRoomsTwo.filter(function (r) {
                    return r.name !== room.name && roomStatus(r) === roomStatus(room.name) && INTEL[r] && INTEL[r].sources && !INTEL[r].owner && !INTEL[r].obstacles &&
                        (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME) && Game.map.findRoute(room.name, r).length <= 2;
                });
                remoteTargets = remoteTargets.concat(remoteRooms);
            }
        }
        remoteRoomTargets[room.name] = _.uniq(remoteTargets);

        // Handle finding contested remotes
        const contestedRemote = _.find(exits, function (r) {
            return roomStatus(r) === roomStatus(room.name) && INTEL[r] && !INTEL[r].sk && !INTEL[r].safemode && !INTEL[r].towers
                && INTEL[r].sources && !INTEL[r].obstacles && INTEL[r].user && INTEL[r].user !== 'Invader' && !_.includes(FRIENDLIES, INTEL[r].user)
                && (INTEL[r].lastContest || 0) + (CREEP_LIFE_TIME * 4) < Game.time;
        });
        if (contestedRemote) {
            if (contestedRemotes[room.name] && contestedRemotes[room.name] !== contestedRemote) {
                INTEL[contestedRemote].contestingCount = 0;
                INTEL[contestedRemotes[room.name]].lastContest = Game.time;
                log.a(`${roomLink(room.name)} is now contesting ${roomLink(contestedRemote)}.`, "HIGH COMMAND:");
            }
            contestedRemotes[room.name] = contestedRemote;
        }

        // Handle finding blocked remotes
        const blockedRemote = _.find(exits, function (r) {
            return roomStatus(r) === roomStatus(room.name) && INTEL[r] && !INTEL[r].sk && INTEL[r].sources && !INTEL[r].level && INTEL[r].obstacles
                && !INTEL[r].owner;
        });
        if (blockedRemote) blockedRemotes[room.name] = blockedRemote;
    }
};

module.exports.globalCreepQueue = function () {
    // Explorers
    queueCreepIfNeeded({
        role: 'explorer',
        priority: PRIORITIES.medium + getCreepCount(undefined, 'explorer'),
        numberNeeded: (9 - MAX_LEVEL),
        global: true
    })

    const operations = {...Memory.targetRooms, ...Memory.auxiliaryTargets};

    // Handle harass targets
    if (HARASSMENT_OPERATIONS && THREATS && THREATS.length && _.filter(INTEL, (i) => THREATS.includes(i.user)).length) {
        const amount = _.filter(MY_ROOMS, (r) => Game.rooms[r].level >= MAX_LEVEL - 1 && Game.rooms[r].energyState).length * 0.25 || 1
        queueCreepIfNeeded({
            role: 'longbow',
            priority: PRIORITIES.secondary,
            numberNeeded: Math.min(amount, _.filter(INTEL, (i) => THREATS.includes(i.user)).length),
            operation: 'harass'
        });
    }

    // Skip if no operations
    if (_.isEmpty(operations)) return;

    for (let key in operations) {
        const operation = operations[key];

        // Skip if operation is empty or invalid
        if (!operation) {
            delete Memory.targetRooms[key];
            delete Memory.auxiliaryTargets[key];
            continue;
        }

        const opLevel = Memory.targetRooms[key] ? operation.level : operation.level || 1;
        let priority = operation.priority;

        // Default priority logic
        if (!priority) {
            priority = INTEL[key] ? getPriority(key) : PRIORITIES.medium;
            operation.priority = priority;
        }

        if (operation.builders) {
            queueCreepIfNeeded({role: 'drone', priority: PRIORITIES.drone + 1, numberNeeded: 6, destination: key});
        }

        if ((!INTEL[key] && !operation.manual) || !opLevel) {
            queueCreepIfNeeded({role: 'scout', priority: 1, numberNeeded: 1, destination: key});
            continue;
        }

        switch (operation.type) {
            case 'scout':
                queueCreepIfNeeded({role: 'scout', priority: 1, numberNeeded: 1, destination: key, closestRoom: true});
                break;

            case 'claim':
                queueCreepIfNeeded({role: 'claimer', priority: priority, numberNeeded: 1, destination: key});
                break;

            case 'rebuild':
                if (!INTEL[key] || !INTEL[key].lastPlayerSighting || INTEL[key].lastPlayerSighting + 750 < Game.time || INTEL[key].safemode) {
                    queueCreepIfNeeded({
                        role: 'drone',
                        priority: PRIORITIES.drone + 1,
                        numberNeeded: 6,
                        destination: key,
                        misc: {boosts: [WORK]}
                    });
                    if (Game.rooms[key] && !Game.rooms[key].terminal) {
                        //queueCreepIfNeeded(undefined, 'powerHauler', PRIORITIES.drone + 1, 3, undefined, key, {deliveryRoom: key});
                    }
                }
                if (INTEL[key].threatLevel) {
                    if (INTEL[key].threatLevel > 1) {
                        const maxLevelOfAttacker = userStrength(_.max(INTEL[key].hostileOwners, (o) => userStrength(o)));
                        if ((maxLevelOfAttacker >= 7 && MAX_LEVEL < 7) || (maxLevelOfAttacker > MAX_LEVEL + 1)) continue;
                    }
                    const count = INTEL[key].threatLevel ? 4 : 2;
                    const boosts = INTEL[key].threatLevel > 2 ? [RANGED_ATTACK, HEAL] : undefined;
                    queueCreepIfNeeded({
                        role: 'longbowSquad', priority: priority + 1, numberNeeded: count, destination: key, misc: {
                        waitFor: count,
                        boosts: boosts
                        }, closestRoom: true
                    });
                }
                break;

            case 'commodity': // Commodity Mining
            case 'mineral': // Middle room mineral mining
                queueCreepIfNeeded({
                    role: 'commodityMiner',
                    priority: priority,
                    numberNeeded: 3,
                    destination: key,
                    misc: {boosts: [WORK]},
                    closestRoom: true
                });
                break;

            case 'power': // Power Mining
                if (!operation.complete) {
                    const powerSpace = operation.space || 1;
                    const powerAttacker = getCreepCount(undefined, 'powerAttacker', key);
                    queueCreepIfNeeded({
                        role: 'powerHealer',
                        priority: priority,
                        numberNeeded: powerAttacker * 1.5,
                        destination: key,
                        misc: {boosts: [HEAL]},
                        closestRoom: true
                    });
                    queueCreepIfNeeded({
                        role: 'powerAttacker',
                        priority: priority - 1,
                        numberNeeded: powerSpace,
                        destination: key,
                        misc: {boosts: [ATTACK]},
                        closestRoom: true
                    });
                }
                if (operation.hauler) {
                    queueCreepIfNeeded({
                        role: 'powerHauler',
                        priority: priority,
                        numberNeeded: operation.hauler,
                        destination: key,
                        closestRoom: true
                    });
                }
                break;

            case 'remoteDenial':
                const remotes = _.filter(_.map(Game.map.describeExits(key)), function (r) {
                    return (!INTEL[r] || !INTEL[r].owner) && Object.values(Game.map.describeExits(r)).length > 1;
                });
                if (opLevel < 2) {
                    queueCreepIfNeeded({
                        role: 'longbow',
                        priority: priority,
                        numberNeeded: 1,
                        destination: _.sample(remotes),
                        misc: {remotes: remotes},
                        closestRoom: true,
                        operation: 'remoteDenial',
                        other: {target: key}
                    });
                } else {
                    queueCreepIfNeeded({
                        role: 'longbowSquad',
                        priority: priority,
                        numberNeeded: 2,
                        destination: _.sample(remotes),
                        misc: {
                        remotes: remotes,
                        waitFor: 2,
                        boosts: [RANGED_ATTACK, HEAL]
                        },
                        closestRoom: true,
                        operation: 'remoteDenial',
                        other: {target: key}
                    });
                }
                break;

            case 'roomDenial':
                // If this room doesn't spawn defenders we use dismantlers otherwise blinky
                let count = 1;
                let boost = [RANGED_ATTACK];
                if (INTEL[key] && INTEL[key].towers) {
                    count = INTEL[key].towers * 2;
                    boost.push(HEAL);
                } else {
                    boost = boost.filter((b) => b !== HEAL);
                }
                Memory.targetRooms[key].boost = boost;
                if (INTEL[key] && INTEL[key].noActiveDefenders) {
                    if (INTEL[key].towers) {
                        queueCreepIfNeeded({
                            role: 'siegeDuo',
                            priority: priority,
                            numberNeeded: count,
                            destination: key,
                            closestRoom: true,
                            operation: 'roomDenial'
                        });
                    } else {
                        queueCreepIfNeeded({
                            role: 'cleaner',
                            priority: priority,
                            numberNeeded: opLevel,
                            destination: key,
                            closestRoom: true,
                            operation: 'roomDenial'
                        });
                    }
                } else {
                    if (INTEL[key].towers) {
                        queueCreepIfNeeded({
                            role: 'longbowSquad',
                            priority: priority,
                            numberNeeded: count,
                            destination: key,
                            misc: {waitFor: Math.min(count, 4)},
                            closestRoom: true,
                            operation: 'roomDenial'
                        });
                    } else {
                        queueCreepIfNeeded({
                            role: 'longbow',
                            priority: priority,
                            numberNeeded: opLevel,
                            destination: key,
                            closestRoom: true,
                            operation: 'roomDenial'
                        });
                    }
                }
                if (operation.claimAttacker) {
                    queueCreepIfNeeded({
                        role: 'claimAttacker',
                        priority: priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
                    });
                }
                if (operation.cleaner) {
                    queueCreepIfNeeded({
                        role: 'cleaner',
                        priority: priority,
                        numberNeeded: 2,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
                    });
                }
                break;

            case 'claimClear':
                queueCreepIfNeeded({
                    role: 'claimer',
                    priority: priority,
                    numberNeeded: 1,
                    destination: key,
                    closestRoom: true,
                    operation: 'claimClear'
                });
                break;

            case 'guard':
                if (opLevel === 1) {
                    queueCreepIfNeeded({
                        role: 'longbowSquad',
                        priority: priority,
                        numberNeeded: 2,
                        destination: key,
                        misc: {waitFor: 2},
                        closestRoom: true,
                        operation: 'guard'
                    });
                } else if (opLevel > 1) {
                    queueCreepIfNeeded({
                        role: 'longbowSquad',
                        priority: priority,
                        numberNeeded: 4,
                        destination: key,
                        misc: {waitFor: 4, boosts: [RANGED_ATTACK, HEAL]},
                        closestRoom: true,
                        operation: 'guard'
                    });
                }
                break;
            case 'stronghold':
                Memory.targetRooms[key].boost = [HEAL];
                queueCreepIfNeeded({
                    role: 'siegeDuo',
                    priority: priority,
                    numberNeeded: opLevel * 2,
                    destination: key,
                    closestRoom: true,
                    operation: 'roomDenial'
                });
                if (operation.loot) queueCreepIfNeeded({
                    role: 'remoteHauler',
                    priority: priority,
                    numberNeeded: 2,
                    destination: key,
                    closestRoom: true,
                    operation: 'roomDenial'
                });
        }
    }
};

function queueCreepIfNeeded(spawnInfo) {
    _.defaults(spawnInfo, {
        room: undefined,
        colony: undefined,
        role: undefined,
        priority: PRIORITIES.secondary,
        numberNeeded: 1,
        destination: undefined,
        operation: undefined,
        rebootCondition: undefined,
        misc: {},
        other: {}
    });
    if (spawnInfo.numberNeeded <= 0) return false;
    if (spawnInfo.other.target) destination = spawnInfo.other.target;
    const count = getCreepCount(spawnInfo.room, spawnInfo.role, spawnInfo.destination, spawnInfo.operation, spawnInfo.colony);
    const global = (!spawnInfo.room && spawnInfo.destination) || spawnInfo.global;
    if (count < spawnInfo.numberNeeded || (count <= spawnInfo.numberNeeded && creepExpiringSoon(spawnInfo.room, spawnInfo.role, spawnInfo.destination))) {
        spawnInfo.other.reboot = spawnInfo.rebootCondition;
        return queueCreep(spawnInfo.room, spawnInfo.priority + count, {
            role: spawnInfo.role,
            destination: spawnInfo.destination,
            other: spawnInfo.other,
            misc: spawnInfo.misc,
            operation: spawnInfo.operation,
            military: !!spawnInfo.operation
        }, global, spawnInfo.closestRoom);
    }
}

function queueCreep(room = undefined, priority, options = {}, global = undefined, closestRoom = undefined) {
    let cache = {};
    // Set the cache to local or global
    if (global && CREEP_QUEUES['global']) cache = JSON.parse(CREEP_QUEUES['global']); else if (room && CREEP_QUEUES[room.name]) cache = JSON.parse(CREEP_QUEUES[room.name]);
    // Handle a cache sanity check
    if (typeof cache !== 'object') cache = {};
    const cacheKey = `c_${options.role}_${options.destination}_${options.other.reboot ? 'reboot' : ''}_${options.misc ? 'misc' : ''}_${options.operation ? options.operation : ''}`;
    // Handle overwriting less important creeps
    if (cache[cacheKey] && cache[cacheKey].priority <= priority) return; else if (cache[cacheKey]) delete cache[cacheKey];
    // Set room name if local
    if (!global) options.room = room ? room.name : undefined;
    _.defaults(options, {
        other: {}
    });
    cache[cacheKey] = {
        cached: Game.time,
        priority: priority,
        role: options.role,
        assignedSource: options.assignedSource,
        destination: options.destination,
        other: options.other,
        military: options.military,
        operation: options.operation,
        misc: options.misc,
        global: global,
        closestRoom: closestRoom
    };
    if (global) CREEP_QUEUES['global'] = JSON.stringify(cache); else CREEP_QUEUES[room.name] = JSON.stringify(cache);
    return true;
}

function getQueue(room) {
    let globalQueue = CREEP_QUEUES["global"] ? JSON.parse(CREEP_QUEUES["global"]) : {};
    let roomQueue = CREEP_QUEUES[room.name] ? JSON.parse(CREEP_QUEUES[room.name]) : {};

    // Update global queue
    let operationQueue = {};
    if (_.size(globalQueue) && room.memory.combatReady) {
        operationQueue = JSON.parse(JSON.stringify(globalQueue));
        for (let key in operationQueue) {
            if (operationQueue[key].destination) {
                const destination = operationQueue[key].destination;
                if (destination === room.name) {
                    delete operationQueue[key];
                    continue;
                }
                let creepInfo = operationQueue[key];
                // Handle if this is assigned to a different room
                let assignedRoom = Memory.targetRooms[destination] && Memory.targetRooms[destination].assignedRoom ? Memory.targetRooms[destination].assignedRoom
                    : Memory.auxiliaryTargets[destination] && Memory.auxiliaryTargets[destination].assignedRoom ? Memory.auxiliaryTargets[destination].assignedRoom
                        : undefined;
                if (assignedRoom && assignedRoom !== room.name) {
                    delete operationQueue[key];
                    continue;
                }
                // Handle refreshing the assignment every so often
                const assignedTick = Memory.targetRooms[destination] && Memory.targetRooms[destination].assignedAt ? Memory.targetRooms[destination].assignedAt
                    : Memory.auxiliaryTargets[destination] && Memory.auxiliaryTargets[destination].assignedAt ? Memory.auxiliaryTargets[destination].assignedAt
                        : undefined;
                if (assignedTick && assignedTick + (CREEP_LIFE_TIME * 2) < Game.time) {
                    const waitingCreeps = room.myCreeps.find((c) => c.memory.waitingToAssemble && c.memory.destination === destination);
                    if (!waitingCreeps) {
                        delete operationQueue[key];
                        unassignRoom(room, destination, 'Refreshing assignment.');
                        continue;
                    }
                }
                // Set the level target
                let levelTarget = MAX_LEVEL;
                if (Memory.auxiliaryTargets[destination]) levelTarget = 4;
                else if (findClosestOwnedRoom(destination, true) <= DEFENSIVE_BUBBLE) levelTarget = MAX_LEVEL - 1;
                else if (Memory.targetRooms[destination] && Memory.targetRooms[destination].type === 'roomDenial') {
                    levelTarget = INTEL[destination] && INTEL[destination].towers ? 7 : 4;
                }
                else if (Memory.targetRooms[destination] && INTEL[destination] && INTEL[destination].user) levelTarget = userStrength(INTEL[destination].user) - 1;
                else if (Memory.targetRooms[destination] && INTEL[destination] && !INTEL[destination].user) levelTarget = 4;
                // Scouts are level 1
                if (Memory.targetRooms[destination] && Memory.targetRooms[destination].type === 'scout') levelTarget = 1;
                // If this is anything more than a duo, needs to be level 7+
                if (creepInfo.misc && creepInfo.misc.waitFor > 2) {
                    if (MAX_LEVEL >= 7) levelTarget = 7; else creepInfo.misc.waitFor = 2;
                }
                // Check level
                if (room.level < levelTarget) {
                    delete operationQueue[key];
                    continue;
                }
                // Generate body
                const generatedInfo = new generator(room.level, creepInfo.role, room, creepInfo).generateBody();
                if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) {
                    delete operationQueue[key];
                    unassignRoom(room, destination, 'Unable to generate needed body.');
                    continue;
                }
                const body = generatedInfo.body;
                creepInfo = generatedInfo.info;
                // Handle room assignments
                if (operationQueue[key].closestRoom) {
                    // Sanity check
                    if (!Memory.targetRooms[destination] && !Memory.auxiliaryTargets[destination]) {
                        const assigned = Memory.targetRooms[destination] && Memory.targetRooms[destination].assignedRoom ? Memory.targetRooms[destination].assignedRoom :
                            Memory.auxiliaryTargets[destination] && Memory.auxiliaryTargets[destination].assignedRoom ? Memory.auxiliaryTargets[destination].assignedRoom : undefined;
                        if (assigned) unassignRoom(assigned, destination, 'The mission no longer exists.')
                        delete operationQueue[key];
                        continue;
                    }
                    if (!assignedRoom) {
                        assignedRoom = getAssignedRoom(destination, levelTarget, creepInfo);
                        if (assignedRoom) {
                            const assignment = {assignedRoom: assignedRoom, assignedAt: Game.time};
                            if (Memory.targetRooms[destination]) Memory.targetRooms[destination] = {...Memory.targetRooms[destination], ...assignment};
                            else Memory.auxiliaryTargets[destination] = {...Memory.auxiliaryTargets[destination], ...assignment};
                            log.a(`Assigning the operation in ${roomLink(destination)} to ${roomLink(assignedRoom)}`, 'OPERATIONS:')
                        }
                    }
                    if (assignedRoom !== room.name) {
                        delete operationQueue[key];
                        continue;
                    }
                    // Needs heal boosts
                    const healBoostsRequired = Memory.targetRooms[destination] && Memory.targetRooms[destination].boosts && Memory.targetRooms[destination].boosts.includes(HEAL);
                    if (healBoostsRequired) {
                        let tier = Memory.targetRooms[destination] && Memory.targetRooms[destination].boostTier ? Memory.targetRooms[destination].boostTier : undefined;
                        if (!room.boostCheck(body, undefined, tier)) {
                            delete operationQueue[key];
                            unassignRoom(room, destination, 'Missing required boosts.');
                            continue;
                        }
                    }
                }
                // Adjust priority based on specific conditions
                creepInfo.body = body;
                operationQueue[key] = creepInfo;
            }
        }
    }

    // Adjust and sort queue
    const sortedQueue = _.sortBy(adjustQueuePriority(Object.assign({}, operationQueue, roomQueue), room), 'priority');
    if (!room._sortedQueue || room._sortedQueue.tick !== Game.time) {
        room._sortedQueue = {queue: sortedQueue, tick: Game.time};
    }
    displayQueue(room, room._sortedQueue.queue);
    return room._sortedQueue.queue;

    function adjustQueuePriority(queue, room) {
        const spawns = room.structures.filter((s) => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);
        const spawnCount = spawns.length || 1;
        for (const key in queue) {
            const creep = queue[key];
            let body;
            if (creep.body) {
                body = creep.body;
            } else {
                const generatedInfo = new generator(room.level, creep.role, room, creep).generateBody();
                if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) {
                    delete queue[key];
                    continue;
                }
                body = generatedInfo.body;
            }
            creep.body = body;
            if (!body || !body.length) continue;
            const buildTime = body.length * CREEP_SPAWN_TIME;
            const sizeFactor = Math.max(1, 50 / buildTime);
            if (creep.destination && (Memory.targetRooms[creep.destination] || Memory.auxiliaryTargets[creep.destination])) {
                if (room.energyState && room.storage) {
                    creep.priority *= 0.5;
                } else {
                    creep.priority *= 6;
                }
            }
            //creep.priority /= (sizeFactor * spawnCount);
            creep.priority = Math.max(1, Math.round(creep.priority));
            queue[key] = creep;
        }
        return queue;
    }
}

function displayQueue(room, queue) {
    const activeSpawns = _.filter(room.impassibleStructures, function (s) {
        return s.my && s.structureType === STRUCTURE_SPAWN && s.spawning;
    });
    if (!_.size(queue) && !activeSpawns.length) return;

    let yOffset = 1;
    room.visual.text('Creep Build Queue', 35, yOffset, {align: 'left', opacity: 0.8});
    yOffset++;

    const limit = Math.min(5, queue.length);
    for (let i = 0; i < limit; i++) {
        let item = queue[i];
        let cost = global.UNIT_COST(item.body);
        if (!cost) continue;
        const show = item.operation || item.role;
        room.visual.text(`${item.priority} ${_.capitalize(show)}: ${room.energyAvailable}/${cost} Age: ${Game.time - item.cached}`, 35, yOffset + i, {
            align: 'left',
            opacity: 0.8
        });
    }
    yOffset += limit;

    for (let spawn of activeSpawns) {
        let spawningCreep = Game.creeps[spawn.spawning.name];
        room.visual.text(`Spawning - ${_.capitalize(spawningCreep.name.split("_")[0])} - Ticks: ${spawn.spawning.remainingTime}`, 35, yOffset, {
            align: 'left',
            opacity: 0.8
        });
        yOffset++;
    }
}

function getPriority(room) {
    let range = findClosestOwnedRoom(room, true)
    if (range <= 3) return PRIORITIES.priority; else if (range <= 5) return PRIORITIES.urgent; else if (range <= 7) return PRIORITIES.high; else if (range <= 10) return PRIORITIES.medium; else return PRIORITIES.secondary;
}

function getAssignedRoom(targetRoom, level, creepInfo) {
    let closest = null;
    let closestDistance = Infinity;
    for (let key of MY_ROOMS) {
        // If its the room, continue
        if (key === targetRoom) continue;
        // If not available continue
        const myRoom = Game.rooms[key];
        if (!myRoom.memory.combatReady || myRoom.controller.level !== myRoom.level || myRoom.downgraded) continue
        // If above you spawn count continue
        const currentAssignments = Memory.targetRooms[targetRoom] ? _.filter(Memory.targetRooms, (r) => r && r.assignedRoom === key).length : _.filter(Memory.auxiliaryTargets, (r) => r && r.assignedRoom === key).length;
        if (currentAssignments >= CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level] * 1.5) continue;
        if (myRoom && myRoom.level >= level) {
            // Check body generation
            const generatedInfo = new generator(myRoom.level, creepInfo.role, myRoom, creepInfo).generateBody();
            const body = generatedInfo.body;
            if (!body || !body.length) continue;
            // Check distance
            const distance = Game.map.getRoomLinearDistance(myRoom.name, targetRoom);
            let maxRange = 22;
            if (_.includes(body, CLAIM)) maxRange = 12;
            if (distance > maxRange) continue;
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = key;
                if (distance === 1) break;
            }
        }
    }
    if (closest) {
        return closest;
    }
}

function unassignRoom(assignedRoom, destination, logEntry) {
    let unassigned = false;
    if (Memory.targetRooms[destination] && Memory.targetRooms[destination].assignedRoom) {
        unassigned = true;
        Memory.targetRooms[destination].assignedRoom = undefined;
    }
    if (Memory.auxiliaryTargets[destination] && Memory.auxiliaryTargets[destination].assignedRoom) {
        unassigned = true;
        Memory.auxiliaryTargets[destination].assignedRoom = undefined;
    }
    if (unassigned) log.a(`Unassigning the operation in ${roomLink(destination)} from ${roomLink(assignedRoom)}. ${logEntry}`, 'OPERATIONS:')
}

function determineEnergyOrder(room) {
    storedLevel[room.name] = getLevel(room);
    if (!room.hub.x) {
        const planner = require('module.roomPlanner');
        planner.findHub(room);
        return false;
    }
    if (!energyOrder[room.name] || orderStored[room.name] + 750 < Game.time) {
        let harvester = _.filter(room.myCreeps, (c) => c.memory.role === 'stationaryHarvester' && c.memory.onContainer);
        let energyStructures = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION);
        let rangeArray = [];
        let usedIdArray = [];
        for (let x = 0; x < energyStructures.length; x++) {
            let nextClosest;
            let harvesterExtensions = _.filter(room.impassibleStructures, (s) => !_.includes(usedIdArray, s.id) && (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.pos.findFirstInRange(harvester, 1));
            if (harvesterExtensions.length) {
                nextClosest = harvesterExtensions[0];
            } else {
                nextClosest = room.hub.findClosestByRange(energyStructures, {filter: (s) => !_.includes(usedIdArray, s.id)});
            }
            if (!nextClosest) break;
            usedIdArray.push(nextClosest.id);
            rangeArray.push(nextClosest);
        }
        energyOrder[room.name] = JSON.stringify(rangeArray);
        orderStored[room.name] = Game.time;
    }
    return true;
}

function updateCreepCountCache() {
    const currentTick = Game.time;
    if (!CREEP_COUNT_CACHE.tick || CREEP_COUNT_CACHE.tick !== currentTick) {
        const counts = {};
        for (let creep of Object.values(Game.creeps)) {
            if (!creep.my) continue;
            const role = creep.memory.oldRole || creep.memory.role || '';
            const destination = creep.memory.destination || creep.room.name;
            const room = creep.room.name || creep.memory.colony;
            const colony = creep.memory.colony || creep.room.name;
            const operation = creep.memory.operation || '';

            // 1. Room-based
            if (creep.room.name) {
                const roomKey = `${role}_${room}_noDest_noOp`;
                counts[roomKey] = (counts[roomKey] || 0) + 1;
            }
            // 2. Room and operation
            if (creep.room.name && operation) {
                const roomOpKey = `${role}_${room}_noDest_${operation}`;
                counts[roomOpKey] = (counts[roomOpKey] || 0) + 1;
            }
            // 3. Destination only
            if (destination) {
                const destKey = `${role}_${destination}_noOp`;
                counts[destKey] = (counts[destKey] || 0) + 1;
            }
            // 4. Operation only
            if (operation) {
                const opKey = `${role}_noDest_${operation}`;
                counts[opKey] = (counts[opKey] || 0) + 1;
            }
            // 5. Destination and operation
            if (destination && operation) {
                const destOpKey = `${role}_${destination}_${operation}`;
                counts[destOpKey] = (counts[destOpKey] || 0) + 1;
            }
            // 6. Colony only
            if (colony) {
                const colonyKey = `${role}_noDest_noOp_${colony}`;
                counts[colonyKey] = (counts[colonyKey] || 0) + 1;
            }
            // 7. Role only
            const roleOnlyKey = `${role}_noDest_noOp_noColony`;
            counts[roleOnlyKey] = (counts[roleOnlyKey] || 0) + 1;
        }

        CREEP_COUNT_CACHE.counts = counts;
        CREEP_COUNT_CACHE.tick = currentTick;
    }
}

function getCreepCount(room = undefined, role, destination = undefined, operation = undefined, colony = undefined) {
    // Ensure cache is up-to-date
    updateCreepCountCache();
    const counts = CREEP_COUNT_CACHE.counts;

    if (!destination && !operation && room) {
        const key = `${role}_${room.name}_noDest_noOp`;
        return counts[key] || 0;
    } else if (room && operation && !destination) {
        const key = `${role}_${room.name}_noDest_${operation}`;
        return counts[key] || 0;
    } else if (destination && !operation) {
        const key = `${role}_${destination}_noOp`;
        return counts[key] || 0;
    } else if (!destination && operation) {
        const key = `${role}_noDest_${operation}`;
        return counts[key] || 0;
    } else if (destination && operation) {
        const key = `${role}_${destination}_${operation}`;
        return counts[key] || 0;
    } else if (!destination && !operation && !room && colony) {
        const key = `${role}_noDest_noOp_${colony.name}`;
        return counts[key] || 0;
    } else if (!destination && !operation && !room) {
        const key = `${role}_noDest_noOp_noColony`;
        return counts[key] || 0;
    }
    return 0;
}

function creepExpiringSoon(room = undefined, role, destination = undefined) {
    const count = getCreepCount(room, role, destination);
    if (count === undefined || count <= 0) return false;
    const creeps = _.filter(Game.creeps, (c) => {
        if (!c.my || !c.memory.role || !c.memory.role.includes(role)) return false;
        if (room && c.room.name !== room.name && c.memory.colony !== room.name) return false;
        return !(destination && c.memory.destination !== destination);
    });
    const soonestExpiring = _.min(creeps, 'ticksToLive');
    if (!creeps.length || soonestExpiring === Infinity || !soonestExpiring.ticksToLive || soonestExpiring.spawning) {
        return false;
    }
    let distance = 0;
    if (destination) {
        const originRoom = findClosestOwnedRoom(destination, false, MAX_LEVEL);
        distance = originRoom ? Game.map.getRoomLinearDistance(originRoom, destination) * 50 : 0;
    }
    const spawnTime = 3 * soonestExpiring.body.length; // CREEP_SPAWN_TIME is 3
    return soonestExpiring.ticksToLive <= (spawnTime + distance);
}

function getBodyAbilityPower(room, role) {
    const body = new generator(room.level, role, room).generateBody();
    return abilityPower(body.body);
}

function generateCreepName(role, level, operation) {
    let name = role.slice(0, 3) + '' + level + '' + getRandomInt(100, 999);
    if (operation) {
        name = operation.slice(0, 3) + '' + level + '' + getRandomInt(100, 999);
    }
    return name;
}