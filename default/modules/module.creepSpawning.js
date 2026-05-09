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

    // If the room has energy but nothing has spawned in 500 ticks, the queue is stuck —
    // clear it so fresh entries are generated next cycle.
    const lastSpawn = lastBuilt[room.name];
    if (lastSpawn && lastSpawn + 500 < currentTick && room.energyAvailable >= 300) {
        CREEP_QUEUES[room.name] = {};
        lastBuilt[room.name] = currentTick;
        return;
    }

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
            if (!determineEnergyOrder(room)) {
                log.d(`Spawning blocked for ${room.name} because determineEnergyOrder returned false.`);
                return;
            }

            const {
                role,
                operation,
                assignedSource,
                destination,
                other,
                military,
                misc,
                neededBoosts,
                assignment
            } = queuedBuild;
            const name = generateCreepName(role, room ? room.level : 0, operation);

            // Map cached IDs back to actual game objects for the spawnCreep API
            let energyStructures;
            if (energyOrder[availableSpawn.room.name]) {
                try {
                    const parsed = JSON.parse(energyOrder[availableSpawn.room.name]);
                    energyStructures = parsed.map(s => Game.getObjectById(s.id)).filter(s => s);
                    if (!energyStructures.length) energyStructures = undefined;
                } catch (e) {
                    energyStructures = undefined;
                }
            }

            const moveParts = _.filter(body, (b) => b === MOVE).length;
            const attackParts = _.filter(body, (b) => b === ATTACK).length;
            const healParts = _.filter(body, (b) => b === HEAL).length;

            const spawnOpts = {
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
                    canTow: moveParts >= 2 && !attackParts && !healParts,
                    assignment
                }
            };
            if (energyStructures) spawnOpts.energyStructures = energyStructures;

            let spawnResult = availableSpawn.spawnCreep(body, name, spawnOpts);

            // Fallback if the energyStructures array was flawed and didn't provide enough capacity
            if (spawnResult === ERR_NOT_ENOUGH_ENERGY && energyStructures) {
                log.d(`Spawning ${role} in ${room.name} failed with structured order. Retrying with default order.`);
                energyOrder[availableSpawn.room.name] = undefined;
                delete spawnOpts.energyStructures;
                spawnResult = availableSpawn.spawnCreep(body, name, spawnOpts);
            }

            // Handle spawn result
            if (spawnResult === OK) {
                handleSuccessfulSpawn(room, role, queuedBuild, availableSpawn);
                return;
            } else if (spawnResult === ERR_NOT_ENOUGH_ENERGY) {
                log.d(`Spawning ${role} in ${room.name} failed with ERR_NOT_ENOUGH_ENERGY despite having enough energy in the room. Resetting energy order.`);
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
        if (!CREEP_QUEUES[room.name]) CREEP_QUEUES[room.name] = {};
        if (!CREEP_QUEUES["global"]) CREEP_QUEUES["global"] = {};

        let roomQueue = CREEP_QUEUES[room.name];
        let globalQueue = CREEP_QUEUES["global"];
        const cacheKey = `c_${building.role}_${building.destination}_${building.other.reboot ? 'reboot' : ''}_${building.misc ? 'misc' : ''}_${building.operation ? building.operation : ''}`;

        if (globalQueue[cacheKey] && building.global) {
            delete globalQueue[cacheKey];
        }

        if (roomQueue[cacheKey]) {
            delete roomQueue[cacheKey];
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
        droneCount = importantBuilds ? Math.min(10 - room.level, room.energyState > 1 ? 4 : 2) :
            !room.storage ? Math.max(8 - room.level, 1) :
                room.memory.spawnDefenders ? 3 :
                    room.energyState ? 2 : 1;
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
            let haulerAmount = room.level >= 6 ? 2 : 1;
            queueCreepIfNeeded({
                room: room,
                role: 'hauler',
                priority: PRIORITIES.hauler,
                numberNeeded: haulerAmount,
                rebootCondition: !getCreepCount(room, 'hauler') || !room.energyState,
            });
        }
        if (room.level < 7) {
            for (const source of room.sources) {
                if (source.memory.link && room.memory.hubLink) continue;
                queueCreepIfNeeded({
                    room: room,
                    role: 'shuttle',
                    priority: PRIORITIES.hauler,
                    numberNeeded: 1,
                    rebootCondition: room.myCreeps.length < 4 || !getCreepCount(room, 'shuttle') || !room.energyState,
                    other: {distanceToHub: source.memory.distanceToHub || 25},
                    assignment: source.id
                });
            }
        }
    }

    // Upgrader
    if (!room.memory.spawnDefenders && room.level === room.controller.level) {
        let upgraderAmount = 1;
        if (room.memory.energyPositive && room.energyState && (room.energyState > 2 || !room.terminal)) {
            if (!room.storage) {
                let container = Game.getObjectById(room.memory.controllerContainer);
                if (container) {
                    upgraderAmount = Math.min(Math.floor(container.store.getUsedCapacity(RESOURCE_ENERGY) / 650), container.pos.countOpenTerrainAround()) || 1;
                    if (upgraderAmount > 5) upgraderAmount = 5;
                } else {
                    upgraderAmount = 1;
                }
            }
        }
        const priority = room.energyState > 1 && room.storage ? PRIORITIES.upgrader * 0.5 : PRIORITIES.upgrader;
        queueCreepIfNeeded({
            room: room,
            role: 'upgrader',
            priority: priority,
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

    // Explorers
    queueCreepIfNeeded({colony: room, role: 'explorer', priority: PRIORITIES.high, numberNeeded: 8 - MAX_LEVEL})

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
                priority: room.energyState > 1 && room.storage ? PRIORITIES.priority : PRIORITIES.secondary,
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
    const ap = getBodyAbilityPower(room, 'longbow');
    const longbowPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);
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

    // If under attack, no spawning remotes
    if (room.memory.dangerousAttack || INTEL[room.name].threatLevel > 2) {
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
            log.a(`${roomLink(room.name)} is no longer contesting ${roomLink(contestedRemotes[room.name])} due to casualties.`, "HIGH COMMAND:")
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
                priority: PRIORITIES.reserver + getCreepCount(room, 'reserver'),
                numberNeeded: count,
                destination: remoteName
            });
        }
    }

    function handleRoadBuilder(room) {
        if (getCreepCount(room, 'remoteHarvester')) {
            queueCreepIfNeeded({
                colony: room,
                role: 'roadBuilder',
                priority: PRIORITIES.roadBuilder + (getCreepCount(room, 'roadBuilder') * 1.5),
                numberNeeded: getCreepCount(room, 'remoteHarvester') * 0.2
            });
        }
    }

    function handleSkCreeps(room, remoteName) {
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
        let totalHarvesters = getCreepCount(undefined, 'remoteHarvester', undefined, undefined, room.name);
        const multiplier = room.memory.remotePenalty ? 0.5 : 1;
        if (ROOM_REMOTE_TARGETS[room.name] && totalHarvesters < 10 * multiplier) {
            let remoteSource = ROOM_REMOTE_TARGETS[room.name];
            // Contract range when energy is low (distant sources cost more to service)
            let acceptedScore = room.level >= 7 ? REMOTE_DISTANCE_MAX * 1.5 : REMOTE_DISTANCE_MAX;
            acceptedScore = Math.max(acceptedScore, _.min(remoteSource, 'score').score);

            const occupiedSources = new Set();
            if (global.world && global.world.colonyCreeps) {
                for (const colony in global.world.colonyCreeps) {
                    for (const c of global.world.colonyCreeps[colony]) {
                        if (c.memory.role === 'remoteHarvester' && c.memory.other && c.memory.other.source) {
                            occupiedSources.add(c.memory.other.source);
                        }
                    }
                }
            } else {
                for (const name in Game.creeps) {
                    const c = Game.creeps[name];
                    if (c.my && c.memory.role === 'remoteHarvester' && c.memory.other && c.memory.other.source) {
                        occupiedSources.add(c.memory.other.source);
                    }
                }
            }

            remoteSource = _.min(_.filter(remoteSource, (s) => {
                if (!remoteRoomTargets[room.name].includes(s.room) || shouldSkipRemote(room, s.room) || s.score > acceptedScore) return false;
                if (INTEL[s.room].sk && !getCreepCount(undefined, 'SKAttacker', s.room)) return false;
                return !occupiedSources.has(s.source);
            }), 'score');

            if (remoteSource && remoteSource.room) {
                const priority = room.energyState > 1 && room.storage ? PRIORITIES.remoteHarvester * 2 : PRIORITIES.remoteHarvester;
                queueCreep(room, priority + getCreepCount(undefined, 'remoteHauler', undefined, room), {
                    role: 'remoteHarvester',
                    destination: remoteSource.room,
                    other: {source: remoteSource.source}
                });
            }
        }
    }

    function handleRemoteHaulers(room) {
        // Single pass to build harvester list and hauler-by-harvester map
        const roomHarvesters = [];
        const haulersByHarvester = {};
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (!c.my) continue;
            if (c.memory.role === 'remoteHarvester' && c.memory.colony === room.name && c.memory.other && c.memory.other.haulingRequired) {
                roomHarvesters.push(c);
            } else if (c.memory.role === 'remoteHauler' && c.memory.other && c.memory.other.harvester) {
                const hid = c.memory.other.harvester;
                if (!haulersByHarvester[hid]) haulersByHarvester[hid] = [];
                haulersByHarvester[hid].push(c);
            }
        }
        for (const harvester of roomHarvesters) {
            if (shouldSkipRemote(room, harvester.memory.destination)) continue;
            const assignedHaulers = haulersByHarvester[harvester.id] || [];
            const count = room.memory.remotePenalty ? 1 : !room.storage ? 1 : 3;
            if (assignedHaulers.length >= count) continue;
            const haulingCapacity = assignedHaulers.reduce((sum, creep) => sum + creep.getActiveBodyparts(CARRY) * 50, 0);
            const harvestAmount = harvester.memory.other.haulingRequired;
            if (harvestAmount && haulingCapacity < harvestAmount) {
                const priority = room.energyState > 1 && room.storage ? PRIORITIES.remoteHauler * 2 : PRIORITIES.remoteHauler;
                queueCreep(room, priority + getCreepCount(undefined, 'remoteHauler', undefined, room), {
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
                (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || INTEL[r].reservation === 'Invader') && Game.map.findRoute(room.name, r).length <= 2;
        });
        for (const rooms of surroundingRooms) {
            if (roomStatus(rooms) === roomStatus(room.name)) {
                const surroundingRoomsTwo = getSurroundingRooms(rooms);
                const remoteRooms = surroundingRoomsTwo.filter(function (r) {
                    return r.name !== room.name && roomStatus(r) === roomStatus(room.name) && INTEL[r] && INTEL[r].sources && !INTEL[r].owner && !INTEL[r].obstacles &&
                        (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || INTEL[r].reservation === 'Invader') && Game.map.findRoute(room.name, r).length <= 2;
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

        if (!INTEL[key] || !opLevel || INTEL[key].cached + (CREEP_LIFE_TIME * 5) < Game.time) {
            queueCreepIfNeeded({role: 'scout', priority: 1, numberNeeded: 1, destination: key});
            continue;
        }

        switch (operation.type) {
            case 'scout':
                queueCreepIfNeeded({role: 'scout', priority: 1, numberNeeded: 1, destination: key, closestRoom: true});
                break;

            case 'claim':
                queueCreepIfNeeded({
                    role: 'claimer',
                    priority: priority,
                    numberNeeded: 1,
                    destination: key,
                    closestRoom: true
                });
                break;

            case 'rebuild':
                if (!INTEL[key] || !INTEL[key].lastPlayerSighting || INTEL[key].lastPlayerSighting + 750 < Game.time || INTEL[key].safemode) {
                    queueCreepIfNeeded({
                        role: 'drone',
                        priority: 1,
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

            case 'roomDenial': {
                const rdIntel = INTEL[key];
                const rdTowers = rdIntel && rdIntel.towers || 0;
                const rdWaves = operation.waves || 0;
                if (rdTowers) {
                    Memory.targetRooms[key].boosts = [HEAL];
                    const p75Damage = rdIntel.towerData ? rdIntel.towerData.average : rdTowers * 300;
                    // Solo viable at RCL7+ when damage is within T3 single-creep cap,
                    // no active defenders detected, and no prior failed waves.
                    const useSolo = MAX_LEVEL >= 7 && rdTowers <= 1 && p75Damage <= 960 && !rdIntel.activeDefenders && rdWaves < 2;
                    if (useSolo) {
                        queueCreepIfNeeded({
                            role: 'longbow',
                            priority: priority,
                            numberNeeded: 1,
                            destination: key,
                            closestRoom: true,
                            operation: 'roomDenial'
                        });
                    } else {
                        // Escalate to 2 squads if prior waves failed or damage exceeds 1-squad cap.
                        const waitFor = (rdWaves >= 2 || p75Damage > 960) ? 4 : 2;
                        queueCreepIfNeeded({
                            role: 'longbowSquad',
                            priority: priority,
                            numberNeeded: waitFor,
                            destination: key,
                            misc: {waitFor: waitFor},
                            closestRoom: true,
                            operation: 'roomDenial'
                        });
                    }
                } else {
                    Memory.targetRooms[key].boosts = undefined;
                    queueCreepIfNeeded({
                        role: 'longbow',
                        priority: priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
                    });
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
            }

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
                Memory.targetRooms[key].boosts = [HEAL];
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
        priority: PRIORITIES.secondary,
        numberNeeded: 1,
        misc: {},
        other: {}
    });
    if (spawnInfo.numberNeeded <= 0) return false;
    if (spawnInfo.other.target) spawnInfo.destination = spawnInfo.other.target;
    const count = getCreepCount(spawnInfo.room, spawnInfo.role, spawnInfo.destination, spawnInfo.operation, spawnInfo.colony, spawnInfo.assignment);
    const global = (!spawnInfo.room && spawnInfo.destination) || spawnInfo.global;
    if (count < spawnInfo.numberNeeded || (count <= spawnInfo.numberNeeded && creepExpiringSoon(spawnInfo.room, spawnInfo.role, spawnInfo.destination, spawnInfo.operation, spawnInfo.colony, spawnInfo.assignment))) {
        spawnInfo.other.reboot = spawnInfo.rebootCondition;
        return queueCreep(spawnInfo.room || spawnInfo.colony, spawnInfo.priority + count, {
            role: spawnInfo.role,
            destination: spawnInfo.destination,
            other: spawnInfo.other,
            misc: spawnInfo.misc,
            operation: spawnInfo.operation,
            military: !!spawnInfo.operation,
            assignment: spawnInfo.assignment
        }, global, spawnInfo.closestRoom);
    }
}

function queueCreep(room = undefined, priority, options = {}, global = undefined, closestRoom = undefined) {
    if (global && !CREEP_QUEUES['global']) CREEP_QUEUES['global'] = {};
    if (room && !CREEP_QUEUES[room.name]) CREEP_QUEUES[room.name] = {};

    let cache = {};
    // Set the cache to local or global
    if (global) cache = CREEP_QUEUES['global']; else if (room) cache = CREEP_QUEUES[room.name];

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
        military: COMBAT_ROLES.includes(options.role),
        operation: options.operation,
        misc: options.misc,
        global: global,
        closestRoom: closestRoom,
        assignment: options.assignment
    };
    if (global) CREEP_QUEUES['global'] = cache; else CREEP_QUEUES[room.name] = cache;
    return true;
}

function adjustQueuePriority(queue, room) {
    for (const key in queue) {
        const creep = queue[key];
        // Clear any previously cached body so setEnergyAmount() re-evaluates current conditions
        // (energy capacity can change between ticks if extensions are built/destroyed)
        creep.body = undefined;
        const generatedInfo = new generator(room.level, creep.role, room, creep).generateBody();
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) {
            delete queue[key];
            continue;
        }
        const body = generatedInfo.body;
        creep.body = body;
        if (!body.length) continue;
        if (creep.destination && (Memory.targetRooms[creep.destination] || Memory.auxiliaryTargets[creep.destination])) {
            if (room.energyState && room.storage) {
                creep.priority *= 0.5;
            } else if (creep.military) {
                creep.priority *= 6;
            }
        }
        creep.priority = Math.max(1, Math.round(creep.priority));
    }
    return queue;
}

function getQueue(room) {
    const globalQueue = CREEP_QUEUES["global"] || {};
    const roomQueue = CREEP_QUEUES[room.name] || {};
    const operationQueue = {};

    if (_.size(globalQueue) && room.memory.combatReady) {
        for (const key in globalQueue) {
            const entry = globalQueue[key];
            const destination = entry.destination;

            if (!destination) {
                operationQueue[key] = {...entry};
                continue;
            }
            if (destination === room.name) continue;

            const opMemory = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
            const assignedRoom = opMemory && opMemory.assignedRoom;

            if (assignedRoom && assignedRoom !== room.name) continue;

            const assignedAt = opMemory && opMemory.assignedAt;
            if (assignedAt && assignedAt + (CREEP_LIFE_TIME * 2) < Game.time && assignedRoom) {
                if (!room.myCreeps.find(c => c.memory.waitingToAssemble && c.memory.destination === destination)) {
                    unassignRoom(destination, 'Refreshing assignment.');
                    continue;
                }
            }

            const intel = INTEL[destination];
            let levelTarget = MAX_LEVEL;
            if (Memory.auxiliaryTargets[destination]) {
                levelTarget = MAX_LEVEL - 1;
            } else if (opMemory && opMemory.type === 'scout') {
                levelTarget = 1;
            } else if (opMemory && opMemory.type === 'roomDenial') {
                const towers = intel && intel.towers || 0;
                levelTarget = towers >= 3 ? 8 : towers === 2 ? 7 : towers === 1 ? 6 : 4;
            } else if (findClosestOwnedRoom(destination, true) <= DEFENSIVE_BUBBLE) {
                levelTarget = MAX_LEVEL - 1;
            } else if (opMemory && intel && intel.user) {
                levelTarget = userStrength(intel.user) - 1;
            } else if (opMemory && intel && !intel.user) {
                levelTarget = 4;
            }

            let creepInfo = {...entry};
            if (creepInfo.misc && creepInfo.misc.waitFor > 2) {
                if (MAX_LEVEL >= 7) levelTarget = 7;
                else {
                    creepInfo.misc = {...creepInfo.misc, waitFor: 2};
                    levelTarget = 6;
                }
            }

            if (room.level < levelTarget) continue;

            const generatedInfo = new generator(room.level, creepInfo.role, room, creepInfo).generateBody();
            if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) {
                unassignRoom(destination, 'Unable to generate needed body.');
                continue;
            }
            creepInfo = generatedInfo.info;
            creepInfo.body = generatedInfo.body;

            if (entry.closestRoom) {

                if (!opMemory) continue;

                let resolvedRoom = assignedRoom;
                if (!resolvedRoom) {
                    if (!intel) continue;
                    resolvedRoom = getAssignedRoom(destination, levelTarget, creepInfo);
                    if (resolvedRoom) {
                        const patch = {assignedRoom: resolvedRoom, assignedAt: Game.time};
                        if (Memory.targetRooms[destination]) Object.assign(Memory.targetRooms[destination], patch);
                        else Object.assign(Memory.auxiliaryTargets[destination], patch);
                        log.a(`Assigning the operation in ${roomLink(destination)} to ${roomLink(resolvedRoom)}`, 'OPERATIONS:');
                    }
                }
                if (resolvedRoom !== room.name) continue;

                const healBoosts = opMemory.boosts && opMemory.boosts.includes(HEAL);
                if (healBoosts && !room.boostCheck(creepInfo.body, undefined, opMemory.boostTier)) {
                    unassignRoom(destination, 'Missing required boosts.');
                    continue;
                }
            }

            // Pre RCL7 (2 Spawns) out of room creeps are less important
            if (room.level < 7) {
                creepInfo.priority *= 2;
            }

            operationQueue[key] = creepInfo;
        }
    }

    const sortedQueue = _.sortBy(adjustQueuePriority(Object.assign({}, operationQueue, roomQueue), room), 'priority');
    if (!room._sortedQueue || room._sortedQueue.tick !== Game.time) {
        room._sortedQueue = {queue: sortedQueue, tick: Game.time};
    }
    displayQueue(room, room._sortedQueue.queue);
    return room._sortedQueue.queue;
}

function displayQueue(room, queue) {
    try {
        const activeSpawns = _.filter(room.impassibleStructures, function (s) {
            return s.my && s.structureType === STRUCTURE_SPAWN && s.spawning;
        });
        if (!_.size(queue) && !activeSpawns.length) return;

        let yOffset = 1;
        const x = 35;
        const width = 14;
        const limit = Math.min(5, queue.length);
        let rows = 1 + limit + activeSpawns.length; // Header + Queue + Spawning

        // Draw semi-transparent background box
        room.visual.rect(x - 0.25, yOffset - 0.75, width + 0.5, (rows * 1.1) + 0.2, {
            fill: '#111111',
            opacity: 0.75,
            stroke: '#333333',
            strokeWidth: 0.05
        });

        // Header
        room.visual.text('🛠️ Build Queue', x + 0.2, yOffset, {
            color: '#ffffff',
            align: 'left',
            font: 'bold 0.6 Tahoma'
        });
        yOffset += 1.2;

        // Active Spawns (Progress Bars)
        for (let spawn of activeSpawns) {
            const spawningName = spawn.spawning.name || "";
            const roleName = _.capitalize(spawningName.split("_")[0]);
            const progress = ((spawn.spawning.needTime - spawn.spawning.remainingTime) / spawn.spawning.needTime) * 100;

            // Background track
            room.visual.rect(x, yOffset - 0.4, width, 0.8, {fill: '#222222', opacity: 0.8});
            // Progress fill
            const fillWidth = Math.max(0, Math.min(width, width * (progress / 100)));
            if (fillWidth > 0) {
                room.visual.rect(x, yOffset - 0.4, fillWidth, 0.8, {fill: '#4CAF50', opacity: 0.6}); // Greenish for active building
            }

            room.visual.text(`Spawning: ${roleName}`, x + 0.2, yOffset + 0.15, {
                color: '#ffffff',
                align: 'left',
                font: 'bold 0.45 Tahoma'
            });
            room.visual.text(`${spawn.spawning.remainingTime}t`, x + width - 0.2, yOffset + 0.15, {
                color: '#dddddd',
                align: 'right',
                font: '0.45 Tahoma'
            });
            yOffset += 1.1;
        }

        // Queued Items
        for (let i = 0; i < limit; i++) {
            let item = queue[i];
            let cost = global.UNIT_COST(item.body);
            if (!cost) continue;

            const show = item.operation || item.role;
            const color = room.energyAvailable >= cost ? '#00B7EB' : '#FF4500'; // Blue if we have energy, Red/Orange if waiting

            room.visual.text(`${i + 1}. ${_.capitalize(show)}`, x + 0.2, yOffset, {
                color: color,
                align: 'left',
                font: '0.5 Tahoma'
            });
            room.visual.text(`${cost}⚡ P:${item.priority}`, x + width - 0.2, yOffset, {
                color: '#dddddd',
                align: 'right',
                font: '0.5 Tahoma'
            });
            yOffset += 1.1;
        }
    } catch (e) {
        log.d(`Error in displayQueue: ${e.stack}`);
    }
}

function getPriority(room) {
    let range = findClosestOwnedRoom(room, true)
    if (range <= 3) return PRIORITIES.priority; else if (range <= 5) return PRIORITIES.urgent; else if (range <= 7) return PRIORITIES.high; else if (range <= 10) return PRIORITIES.medium; else return PRIORITIES.secondary;
}

function getAssignedRoom(targetRoom, level, creepInfo) {
    // Pre-compute assignment counts so the inner loop is O(1) instead of O(M) per room
    const allOps = Memory.targetRooms[targetRoom] ? Memory.targetRooms : Memory.auxiliaryTargets;
    const assignmentCounts = {};
    for (const op of Object.values(allOps)) {
        if (op && op.assignedRoom) assignmentCounts[op.assignedRoom] = (assignmentCounts[op.assignedRoom] || 0) + 1;
    }

    let closest = null;
    let closestDistance = Infinity;

    for (const key of MY_ROOMS) {
        if (key === targetRoom) continue;
        const myRoom = Game.rooms[key];
        if (!myRoom.memory.combatReady || myRoom.controller.level !== myRoom.level || myRoom.downgraded) continue;
        if (myRoom.level < level) continue;

        // Distance check before body generation — pure math, cheap early exit
        const distance = Game.map.getRoomLinearDistance(key, targetRoom);
        if (distance >= closestDistance || distance > 22) continue;

        if ((assignmentCounts[key] || 0) >= CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level] * 1.5) continue;

        const generatedInfo = new generator(myRoom.level, creepInfo.role, myRoom, creepInfo).generateBody();
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) continue;
        const body = generatedInfo.body;

        if (distance > (body.includes(CLAIM) ? 12 : 22)) continue;

        closestDistance = distance;
        closest = key;
        if (distance === 1) break;
    }

    return closest;
}

function unassignRoom(destination, logEntry) {
    const opMemory = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
    if (!opMemory || !opMemory.assignedRoom) return;
    const fromRoom = opMemory.assignedRoom;
    delete opMemory.assignedRoom;
    delete opMemory.assignedAt;
    log.a(`Unassigning the operation in ${roomLink(destination)} from ${roomLink(fromRoom)}. ${logEntry}`, 'OPERATIONS:');
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
        let energyStructures = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION);
        let rangeArray = [];
        let usedIdArray = [];
        for (let x = 0; x < energyStructures.length; x++) {
            let nextClosest;
            let harvesterExtensions = _.filter(energyStructures, (s) => !_.includes(usedIdArray, s.id) && s.pos.findFirstInRange(harvester, 1));
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

function incrementCreepCount(counts, key, creep) {
    if (!counts[key]) counts[key] = {count: 0, minTTL: Infinity, bodyLen: 0};
    counts[key].count++;
    const ttl = creep.spawning ? Infinity : (creep.ticksToLive || Infinity);
    if (ttl < counts[key].minTTL) {
        counts[key].minTTL = ttl;
        counts[key].bodyLen = creep.body.length;
    }
}

function processCreepForCache(counts, creep) {
    if (!creep.my) return;
    const role = creep.memory.oldRole || creep.memory.role || '';
    const destination = creep.memory.destination || creep.room.name;
    const room = creep.room.name || creep.memory.colony;
    const colony = creep.memory.colony || creep.room.name;
    const operation = creep.memory.operation || '';
    const assignment = creep.memory.assignment || '';

    if (creep.room.name) incrementCreepCount(counts, `${role}_${room}_noDest_noOp`, creep);
    if (creep.room.name && operation) incrementCreepCount(counts, `${role}_${room}_noDest_${operation}`, creep);
    if (assignment) incrementCreepCount(counts, `${role}_${assignment}`, creep);
    if (destination) incrementCreepCount(counts, `${role}_${destination}_noOp`, creep);
    if (operation) incrementCreepCount(counts, `${role}_noDest_${operation}`, creep);
    if (destination && operation) incrementCreepCount(counts, `${role}_${destination}_${operation}`, creep);
    if (colony) incrementCreepCount(counts, `${role}_noDest_noOp_${colony}`, creep);
    incrementCreepCount(counts, `${role}_noDest_noOp_noColony`, creep);
}

function updateCreepCountCache() {
    const currentTick = Game.time;
    if (!CREEP_COUNT_CACHE.tick || CREEP_COUNT_CACHE.tick !== currentTick) {
        const counts = {};

        if (global.world && global.world.militaryCreeps && global.world.colonyCreeps) {
            for (const creep of global.world.militaryCreeps) processCreepForCache(counts, creep);
            for (const colony in global.world.colonyCreeps) {
                for (const creep of global.world.colonyCreeps[colony]) processCreepForCache(counts, creep);
            }
        } else {
            for (const name in Game.creeps) processCreepForCache(counts, Game.creeps[name]);
        }

        CREEP_COUNT_CACHE.counts = counts;
        CREEP_COUNT_CACHE.tick = currentTick;
    }
}

function getCreepCacheData(room = undefined, role, destination = undefined, operation = undefined, colony = undefined, assignment = undefined) {
    updateCreepCountCache();
    const counts = CREEP_COUNT_CACHE.counts;

    if (assignment) {
        return counts[`${role}_${assignment}`];
    } else if (!destination && !operation && !assignment && room) {
        return counts[`${role}_${room.name}_noDest_noOp`];
    } else if (room && operation && !destination && !assignment) {
        return counts[`${role}_${room.name}_noDest_${operation}`];
    } else if (destination && !operation) {
        return counts[`${role}_${destination}_noOp`];
    } else if (!destination && operation) {
        return counts[`${role}_noDest_${operation}`];
    } else if (destination && operation) {
        return counts[`${role}_${destination}_${operation}`];
    } else if (!destination && !operation && !room && colony) {
        return counts[`${role}_noDest_noOp_${colony.name}`];
    } else if (!destination && !operation && !room) {
        return counts[`${role}_noDest_noOp_noColony`];
    }
    return undefined;
}

function getCreepCount(room = undefined, role, destination = undefined, operation = undefined, colony = undefined, assignment = undefined) {
    const data = getCreepCacheData(room, role, destination, operation, colony, assignment);
    return data ? data.count : 0;
}

function creepExpiringSoon(room = undefined, role, destination = undefined, operation = undefined, colony = undefined, assignment = undefined) {
    const data = getCreepCacheData(room, role, destination, operation, colony, assignment);
    if (!data || data.count <= 0 || data.minTTL === Infinity) return false;

    let distance = 0;
    if (destination) {
        const originRoom = findClosestOwnedRoom(destination, false, MAX_LEVEL);
        distance = originRoom ? Game.map.getRoomLinearDistance(originRoom, destination) * 50 : 0;
    }
    const spawnTime = 3 * data.bodyLen; // CREEP_SPAWN_TIME is 3
    return data.minTTL <= (spawnTime + distance);
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