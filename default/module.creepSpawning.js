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
    const availableSpawns = _.filter(room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning && s.isActive());

    for (let availableSpawn of availableSpawns) {
        let queuedBuild;
        let body = [];  // Ensure body is always defined before use

        // Try to pick a build target from the queue
        for (let topPriority of queue) {
            // Skip if no role is defined
            const {role, other} = topPriority;
            if (!role) continue;

            // Boost check
            if (other.boostCheck && !hasRequiredBoosts(room, other.boostCheck)) continue;

            // Generate body and check if we can afford it
            body = new generator(room.level, role, room, topPriority).generateBody();
            if (!body || !body.length) continue;

            const cost = global.UNIT_COST(body);
            if (cost > room.energyCapacityAvailable) continue;  // Can't afford the creep
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) return;  // Can't afford yet, exit early

            queuedBuild = topPriority;  // We found a build target
            break;
        }

        // If a build target was found, try to spawn it
        if (queuedBuild) {
            if (!determineEnergyOrder(room)) return;

            const {role, operation, assignedSource, destination, other, military, misc} = queuedBuild;
            const name = generateCreepName(role, room.level, operation);

            // Try to spawn the creep
            const energyStructures = energyOrder[availableSpawn.room.name] ? JSON.parse(energyOrder[availableSpawn.room.name]) : undefined;
            const spawnResult = availableSpawn.spawnCreep(body, name, {
                memory: {
                    role,
                    overlord: availableSpawn.room.name,
                    assignedSource,
                    destination,
                    other,
                    military,
                    operation,
                    misc
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
                log.e(`Spawn error in ${availableSpawn.room.name} code ${spawnResult}. Name - ${name}. Body - ${body}`);
                return;
            }
        } else {
            // Try to renew a nearby creep if no build is queued
            renewNearbyCreepIfNeeded(room, availableSpawn);
        }
    }

// Helper function to check if the required boosts are available in the room
    function hasRequiredBoosts(room, boostCheck) {
        for (let boost of BOOST_USE[boostCheck]) {
            if (room.store(boost) < 500) {
                return false;
            }
        }
        return true;
    }

    // Helper function to generate a unique creep name
    function generateCreepName(role, level, operation) {
        let name = role.slice(0, 3) + '' + level + '' + getRandomInt(100, 999);
        if (operation) {
            name = operation.slice(0, 3) + '' + level + '' + getRandomInt(100, 999);
        }
        return name;
    }

    // Helper function to handle successful spawn
    function handleSuccessfulSpawn(room, role, queuedBuild, availableSpawn) {
        lastGlobalSpawn = Game.time;
        lastBuilt[availableSpawn.room.name] = Game.time;

        if (!queuedBuild.operation) log.d(`${availableSpawn.room.name} Spawning a ${role}`);

        // Remove the spawned role from the queue
        updateRoomAndGlobalQueue(room, role, queuedBuild.global);
    }

    // Helper function to update room and global queues after spawning a creep
    function updateRoomAndGlobalQueue(room, role, global) {
        let roomQueue = CREEP_QUEUES[room.name] ? JSON.parse(CREEP_QUEUES[room.name]) : {};
        let globalQueue = CREEP_QUEUES["global"] ? JSON.parse(CREEP_QUEUES["global"]) : {};

        if (globalQueue[role] && global) {
            delete globalQueue[role];
            CREEP_QUEUES["global"] = JSON.stringify(globalQueue);
        }

        if (roomQueue[role]) {
            delete roomQueue[role];
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

    // Static room info
    let level = getLevel(room);
    let harvesterCount = getCreepCount(room, 'stationaryHarvester');
    let haulerCount = getCreepCount(room, 'hauler');
    let shuttleCount = getCreepCount(room, 'shuttle');
    let storageOrTerminal = room.storage || room.terminal || room.memory.hubLink;

    // Harvesters
    queueCreepIfNeeded(room, 'stationaryHarvester', PRIORITIES.stationaryHarvester + harvesterCount, room.sources.length, !harvesterCount)

    // Haulers
    if (harvesterCount) {
        let haulerPriority = PRIORITIES.hauler;
        let haulerReboot = false;
        if (storageOrTerminal) {
            let haulerAmount = room.memory.needsHaulers ? 2 : 1;
            if (!haulerCount) {
                haulerAmount = 1;
                haulerPriority = 1;
                haulerReboot = true;
            }
            queueCreepIfNeeded(room, 'hauler', haulerPriority, haulerAmount, haulerReboot);
        }

        // Spawn shuttles for harvesters with no link
        let linkCount = _.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_LINK && s.id !== room.memory.hubLink && s.id !== room.memory.controllerLink).length;
        let shuttleAmount = 2 - linkCount;
        if (!room.memory.hubLink) shuttleAmount = 2;
        // If there's a full container at a source we spawn another shuttle regardless of links
        const fullContainer = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_CONTAINER
                && s.id !== s.room.memory.controllerContainer && s.store[RESOURCE_ENERGY] >= CONTAINER_CAPACITY * 0.9
        })[0];
        if (fullContainer) shuttleAmount += 1;
        if (shuttleAmount > 0) {
            let shuttleReboot = !shuttleCount;
            queueCreepIfNeeded(room, 'shuttle', PRIORITIES.hauler + shuttleCount, shuttleAmount, shuttleReboot);
        }
    }

    // Local Responder (Defenders)
    if (room.memory.spawnDefenders || room.memory.defenseCooldown > Game.time) {
        let targetAmount = room.hostileCreeps.length ? room.hostileCreeps.length : 2;
        if (targetAmount > 6) targetAmount = 6;
        queueCreepIfNeeded(room, 'defender', PRIORITIES.defender, targetAmount);
    }

    // Upgrader
    let upgraderReboot = room.controller.ticksToDowngrade <= CONTROLLER_DOWNGRADE[level] * 0.9 || room.controller.level !== room.level;
    let upgraderAmount = 1;

    if (!upgraderReboot && room.level < 8) {
        let container = Game.getObjectById(room.memory.controllerContainer);
        if (container && room.energyState && container.store[RESOURCE_ENERGY] > CONTAINER_CAPACITY * 0.7) {
            upgraderAmount = Math.min(
                (container.store[RESOURCE_ENERGY] - (CONTAINER_CAPACITY * (0.1 * room.level))) / (50 * room.level),
                container.pos.countOpenTerrainAround()
            );
        } else if (!container) {
            upgraderAmount = 3;
        }
        if (upgraderAmount > 5) upgraderAmount = 5;
    }

    queueCreepIfNeeded(room, 'upgrader', PRIORITIES.upgrader - (room.energyState * 0.5), upgraderAmount, upgraderReboot);
};

let miscTick = {};

module.exports.miscCreepQueue = function (room) {
    if (miscTick[room.name] + 12 > Game.time) return;
    miscTick[room.name] = Game.time;

    // Static room info
    let level = getLevel(room);
    let hasConstructionSites = _.find(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL
        && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER);

    // Drone Queueing
    let dronePriority = PRIORITIES.drone;
    let droneNumber = !room.memory.controllerContainer || hasConstructionSites ? 10 - room.level : room.energyState && room.level >= 6 ? 2 : 1;
    queueCreepIfNeeded(room, 'drone', dronePriority, droneNumber, room.friendlyCreeps.length <= 3);

    // LabTech
    if (room.terminal && room.storage && level >= 6) {
        if (!getCreepCount(room, 'labTech')) {
            queueCreep(room, PRIORITIES.hauler, {role: 'labTech'});
        }
    }

    // If no conflict detected and room level >= 6
    if (!room.nukes.length && !INTEL[room.name].threatLevel) {
        // Mineral Harvester
        if (room.level >= 6 && room.memory.extractorContainer && room.mineral.mineralAmount && !getCreepCount(room, 'mineralHarvester')) {
            queueCreep(room, PRIORITIES.mineralHarvester, {
                role: 'mineralHarvester',
                other: {assignedMineral: room.mineral.id}
            });
        }

        // High Level Assist & Defense
        if (level >= MAX_LEVEL - 1 && level >= 4) {
            let priority = room.energyState ? PRIORITIES.priority : PRIORITIES.secondary;

            // Assist with Defense (Longbow for Guard)
            let needsDefense = _.find(MY_ROOMS, (r) => r !== room.name && (Game.rooms[r].memory.dangerousAttack || Game.rooms[r].memory.defenseCooldown > Game.time) && room.routeSafe(r, 3, 999, 15));
            if (needsDefense && getCreepCount(undefined, 'longbow', needsDefense) < 2) {
                queueCreep(room, priority, {
                    role: 'longbow',
                    destination: needsDefense,
                    operation: 'guard',
                    military: true
                });
            }
        }
        // Border Patrol
        if (room.memory.borderPatrol && !getCreepCount(room, 'longbow', undefined, 'borderPatrol')) {
            let power = INTEL[room.memory.borderPatrol] ? INTEL[room.memory.borderPatrol].hostilePower : 1;
            queueCreep(room, PRIORITIES.high, {
                role: 'longbow',
                operation: 'borderPatrol',
                military: true,
                destination: room.memory.borderPatrol,
                other: {power: power}
            });
        }
    }
};

let remoteTick = {};
let lastRemoteRefresh = {};

module.exports.remoteCreepQueue = function (room) {
    if (remoteTick[room.name] + 10 > Game.time) return;
    remoteTick[room.name] = Game.time;

    room.memory.borderPatrol = undefined;

    // Refresh remote room data every 5000 ticks or when room under attack
    if (!remoteRoomTargets[room.name] || lastRemoteRefresh[room.name] + 5000 > Game.time || INTEL[room.name].threatLevel > 2) {
        refreshRemoteRoomTargets(room);
    }

    // Process remote rooms
    if (remoteRoomTargets[room.name]) {
        let remoteRooms = JSON.parse(remoteRoomTargets[room.name]);
        remoteRooms.forEach(remoteName => processRemoteRoom(room, remoteName));
    }

    // Handle remote harvesters if remote sources are available
    if (!room.memory.noRemote) {
        handleRemoteHarvesters(room);
    }

    // Handle remote haulers if needed
    handleRemoteHaulers(room);

    function refreshRemoteRoomTargets(room) {
        lastRemoteRefresh[room.name] = Game.time;
        remoteRoomTargets[room.name] = undefined;

        // Find and filter remote rooms with valid sources and no reservation
        let remoteRooms = _.filter(Game.map.describeExits(room.name), function (r) {
            return roomStatus(r) === roomStatus(room.name) &&
                INTEL[r] && INTEL[r].sources && !INTEL[r].level &&
                (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || !_.includes(FRIENDLIES, INTEL[r].reservation));
        });

        remoteRoomTargets[room.name] = JSON.stringify(remoteRooms);
    }

    function processRemoteRoom(room, remoteName) {
        if (INTEL[remoteName].threatLevel > 1) {
            handleThreatLevel(room, remoteName);
        }

        if (shouldSkipRemote(room, remoteName)) return;

        // Add room to intel tracker
        trackRemoteRoom(remoteName, room);

        // Check if the remote room is highest level and handle invader cores or invaders
        let highestLevel = checkHighestLevel(room, remoteName);
        if (highestLevel) {
            if (INTEL[remoteName].invaderCore) {
                handleInvaderCore(room, remoteName);
                handleReservation(room, remoteName);
            } else if (SK_MINING && room.level >= SK_MINING_LEVEL && INTEL[remoteName].sk) {
                activeSkMining[room.name] = Game.time;
                handleSkAttacker(room, remoteName);
                handleSkMineral(room, remoteName);
            } else {
                handleReservation(room, remoteName);
            }
        }

        // Handle road builder for remotes
        handleRoadBuilder(room);
    }

    function shouldSkipRemote(room, remoteName) {
        if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) return true;
        if (INTEL[remoteName].level || !INTEL[remoteName].sources) return true;
        if (INTEL[remoteName].reservation && ![MY_USERNAME, "Invader"].includes(INTEL[remoteName].reservation)) return true;
        if (INTEL[remoteName].roomHeat > 250) return true;
        if (INTEL[remoteName].threatLevel > 1) return true;
        return false;
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

    function handleInvaderCore(room, remoteName) {
        if (Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;
        if (INTEL[remoteName].sk) return;
        if (!getCreepCount(undefined, 'attacker', remoteName)) {
            queueCreep(room, PRIORITIES.remoteHarvester - 1, {
                role: 'attacker', military: true, destination: remoteName
            });
        }
    }

    function handleThreatLevel(room, remoteName) {
        if (Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;
        if (INTEL[remoteName].tickDetected + CREEP_LIFE_TIME < Game.time) {
            queueCreepIfNeeded(room, 'explorer', PRIORITIES.secondary, 1, undefined, remoteName);
        } else if (!INTEL[remoteName].sk) {
            room.memory.borderPatrol = remoteName;
        }
    }

    function handleReservation(room, remoteName) {
        if (room.level >= 4 && (!INTEL[remoteName].reservationExpires || (INTEL[remoteName].reservationExpires - CREEP_LIFE_TIME) < Game.time) && !INTEL[remoteName].sk) {
            queueCreepIfNeeded(room, 'reserver', PRIORITIES.reserver, INTEL[remoteName].reserverCap || 1, undefined, remoteName);
        }
    }

    function handleRoadBuilder(room) {
        queueCreepIfNeeded(room, 'roadBuilder', PRIORITIES.roadBuilder, 1, undefined, undefined, JSON.parse(remoteRoomTargets[room.name]));
    }

    function handleSkAttacker(room, remoteName) {
        if (Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;
        queueCreepIfNeeded(room, 'SKAttacker', PRIORITIES.remoteHarvester, 1, undefined, remoteName);
    }

    function handleSkMineral(room, remoteName) {
        if (Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;
        queueCreepIfNeeded(room, 'commodityMiner', PRIORITIES.roadBuilder, 1, undefined, remoteName);
    }

    function handleRemoteHarvesters(room) {
        if (Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;

        // Determine the target score based on room level
        const targetScore = room.level < 8 ? REMOTE_DISTANCE_MAX : REMOTE_DISTANCE_MAX * 0.5;
        const totalHarvesters = getCreepCount(undefined, 'remoteHarvester', undefined, undefined, room.name);

        // Check if we need more harvesters
        if (room.memory.remoteSources && totalHarvesters < CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][room.level] * 2) {
            let remoteSources = JSON.parse(room.memory.remoteSources);
            const activeSk = activeSkMining[room.name] + CREEP_LIFE_TIME > Game.time;
            remoteSources = remoteSources.filter(source => {
                const sourceIntel = INTEL[source.room];
                return (sourceIntel.sk || (!activeSk && source.score <= targetScore)) &&
                    !Game.creeps.some(creep => creep.my && creep.memory.role === 'remoteHarvester' && creep.memory.other && creep.memory.other.source === source.source);
            });
            for (let source of remoteSources) {
                if (shouldSkipRemote(room, source.room)) continue;
                // Check if it's an SK room and if we have attackers for it
                if (!INTEL[source.room].sk || getCreepCount(undefined, 'SKAttacker', source.room)) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: source.room,
                        other: {source: source.source}
                    });
                }
            }
        }
    }

    function handleRemoteHaulers(room) {
        if (Memory.cpuTracking.remotePenalty && Memory.cpuTracking.remotePenalty + 10000 > Game.time) return;
        if (!room.memory.remoteSources) return;
        // Find active sources with harvesters
        const activeSources = _.filter(JSON.parse(room.memory.remoteSources), (s) =>
            _.some(Game.creeps, (c) => c.my && c.memory.other && c.memory.other.source === s.source && c.memory.other.harvestPower));
        for (const source of activeSources) {
            if (shouldSkipRemote(room, source.room)) continue;
            const assignedHarvester = _.find(Game.creeps, (c) => c.my && c.memory.role === 'remoteHarvester' && c.memory.other.source === source.source);
            if (!assignedHarvester) continue;
            // Count and sum capacity of existing haulers
            const assignedHaulers = _.filter(Game.creeps, (c) => c.my && c.memory.role === 'remoteHauler' && c.memory.other &&
                c.memory.other.source === source.source);
            if (assignedHaulers.length >= 2) continue;
            const haulingCapacity = assignedHaulers.reduce((sum, creep) =>
                sum + creep.getActiveBodyparts(CARRY) * 50, 0
            );
            const harvestAmount = assignedHarvester.memory.other.harvestPower * (source.score * 2);
            // Queue a new hauler if capacity is insufficient
            if (harvestAmount && haulingCapacity < harvestAmount) {
                queueCreep(room, PRIORITIES.remoteHauler, {
                    role: 'remoteHauler',
                    destination: room.name,
                    other: {
                        harvester: assignedHarvester.id,
                        harvestAmount: harvestAmount,
                        source: source.source
                    }
                });
            }
        }
    }
};


module.exports.globalCreepQueue = function () {
    const operations = {...Memory.targetRooms, ...Memory.auxiliaryTargets};

    // Explorers
    if (getCreepCount(undefined, 'explorer') < 9 - MAX_LEVEL) {
        queueCreep(undefined, PRIORITIES.extreme + (getCreepCount(undefined, 'explorer') * 0.25), {role: 'explorer'}, true);
    }

    // Skip if no operations
    if (_.isEmpty(operations)) return;

    for (let key in operations) {
        const operation = operations[key];
        if (!operation) continue;
        const opLevel = operation.level;
        let priority = operation.priority;

        // Skip if operation is empty or invalid
        if (!operation) {
            delete Memory.targetRooms[key];
            delete Memory.auxiliaryTargets[key];
            continue;
        }

        // Default priority logic
        if (!priority) {
            priority = INTEL[key] ? getPriority(key) : PRIORITIES.medium;
            operation.priority = priority;
        }

        // Handle scout if needed (if observer check is missing)
        if (!operation.observerCheck && !opLevel && operation.type !== 'harass' && operation.type !== 'pending') {
            if (!getCreepCount(undefined, 'scout', key)) {
                queueCreep(undefined, PRIORITIES.priority, {role: 'scout', destination: key, military: true}, true);
            }
        }

        // Special Guard request
        if (operation.guard && (!getCreepCount(undefined, 'longbow', key) || (creepExpiringSoon(key, 'longbow') && getCreepCount(undefined, 'longbow', key) === 1))) {
            queueCreep(undefined, priority, {role: 'longbow', destination: key, military: true}, true);
        }

        // Handle harass targets
        if (HARASSMENT_OPERATIONS && Memory.harassTargets && Memory.harassTargets.length) {
            const targetAmount = Math.min(Memory.harassTargets.length, MY_ROOMS.length);
            if (getCreepCount(undefined, 'longbow', undefined, 'harass') < targetAmount) {
                const harassTarget = _.sample(_.filter(INTEL, function (r) {
                    return (!r.owner || r.level < 3) && Memory.harassTargets.includes(r.user);
                }));
                if (harassTarget) {
                    queueCreep(undefined, PRIORITIES.secondary, {
                        role: 'longbow',
                        destination: harassTarget.name,
                        operation: 'harass',
                        military: true
                    }, true);
                }
            }
        }

        switch (operation.type) {
            case 'test':
                if (getCreepCount(undefined, 'tester', key) < 4) {
                    queueCreep(undefined, priority, {role: 'tester', destination: key, military: true}, true);
                }
                break;

            case 'scout':
                queueCreepIfNeeded(undefined, 'scout', priority, 1, undefined, key, undefined, true);
                break;

            case 'claim':
                queueCreepIfNeeded(undefined, 'claimer', priority, 1, undefined, key, undefined, true);
                break;

            case 'rebuild':
                if (!INTEL[key] || !INTEL[key].threatLevel) {
                    queueCreepIfNeeded(undefined, 'drone', PRIORITIES.drone + getCreepCount(undefined, 'drone', key), 6, undefined, key);
                } else if (INTEL[key].threatLevel) {
                    queueCreepIfNeeded(undefined, 'longbow', PRIORITIES.priority, INTEL[key].threatLevel, undefined, key, undefined, true, 'guard');
                }
                break;

            case 'commodity': // Commodity Mining
            case 'mineral': // Middle room mineral mining
                queueCreepIfNeeded(undefined, 'commodityMiner', priority, 2, undefined, key, undefined, true);
                break;

            case 'power': // Power Mining
                if (!operation.complete) {
                    const powerSpace = operation.space || 1;
                    const powerAttacker = getCreepCount(undefined, 'powerAttacker', key);
                    const powerHealerTTL = creepTTL[key] && creepTTL[key]['powerHealer'];
                    const powerAttackerTTL = creepTTL[key] && creepTTL[key]['powerAttacker'];
                    queueCreepIfNeeded(undefined, 'powerHealer', priority, powerAttacker * 1.5, powerHealerTTL && powerHealerTTL < 450, key, undefined, true);
                    queueCreepIfNeeded(undefined, 'powerAttacker', priority - 1, powerSpace, powerAttackerTTL && powerAttackerTTL < 450, key, undefined, true);
                }
                if (operation.hauler) {
                    queueCreepIfNeeded(undefined, 'powerHauler', priority, operation.hauler, undefined, key, undefined, true);
                }
                break;

            case 'denial':
                const remotes = _.filter(_.map(Game.map.describeExits(key)), function (r) {
                    return !INTEL[r] || !INTEL[r].owner;
                });
                queueCreepIfNeeded(undefined, 'longbow', priority, remotes.length * 1.25, undefined, _.sample(remotes), {target: key}, true, 'denial');
                break;

            case 'hold':
                queueCreepIfNeeded(undefined, 'longbow', priority, opLevel, undefined, key, undefined, true, 'hold');
                queueCreepIfNeeded(undefined, 'attacker', priority, opLevel, undefined, key, undefined, true, 'hold');
                if (operation.claimAttacker) {
                    queueCreepIfNeeded(undefined, 'claimAttacker', priority, 1, undefined, key, undefined, true, 'hold');
                }
                if (operation.cleaner) {
                    queueCreepIfNeeded(undefined, 'cleaner', priority, 2, undefined, key, undefined, true, 'hold');
                }
                break;

            case 'claimClear':
                queueCreepIfNeeded(undefined, 'claimer', priority, 1, undefined, key, undefined, true, 'claimClear');
                break;

            case 'guard':
                queueCreepIfNeeded(undefined, 'longbow', priority, opLevel, undefined, key, undefined, true, 'guard');
                break;
        }
    }
};

/**
 * Helper function for queuing creeps
 * @param room - Room object for room creeps
 * @param role - Creep Role
 * @param priority - Spawn Priority
 * @param numberNeeded - How many creeps are needed
 * @param rebootCondition - Whether this gets flagged for reboot
 * @param destination - Destination for the creep
 * @param misc - Misc data for the creep
 * @param closestRoom - Should only the closest room build for this
 * @param operation - Operation name
 * @param other - Other memory entry
 * @returns {*|number}
 */
function queueCreepIfNeeded(room = undefined, role, priority, numberNeeded, rebootCondition = undefined, destination = undefined, misc = undefined, closestRoom = undefined, operation = undefined, other = {}) {
    let count = getCreepCount(room, role, destination);
    const global = !room
    if (count < numberNeeded || (creepExpiringSoon(room, role, destination) && count === numberNeeded)) {
        other.reboot = rebootCondition;
        queueCreep(room, priority + count, {
            role: role,
            destination: destination,
            other: other,
            misc: misc,
            operation: operation,
            military: !!operation
        }, global);
    }
}

/**
 * Queue a creep for spawning
 * @param room - Room object for room creeps
 * @param priority - Spawn Priority
 * @param options - Creep spawn options object
 * @param global - Does this creep go into the global queue
 * @param closestRoom - Only spawn from the closest room
 * @returns {*|number}
 */
function queueCreep(room = undefined, priority, options = {}, global = undefined, closestRoom = undefined) {
    let cache = {};
    // Set the cache to local or global
    if (global && CREEP_QUEUES['global']) cache = JSON.parse(CREEP_QUEUES['global']); else if (room && CREEP_QUEUES[room.name]) cache = JSON.parse(CREEP_QUEUES[room.name]);
    // Handle a cache sanity check
    if (typeof cache !== 'object') cache = {};
    // Handle overwriting less important creeps
    if (cache[options.role] && cache[options.role].priority <= priority) return; else if (cache[options.role]) delete cache[options.role];
    // Set room name if local
    if (!global) options.room = room.name;
    _.defaults(options, {
        other: {}
    });
    cache[options.role] = {
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
}

/**
 * Determine what order energy is used in a room
 * @param room
 */
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

/**
 * Display the creep build queue
 * @param room
 * @returns {*}
 */
function getQueue(room) {
    let queue;
    let importantBuilds = _.find(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    let globalQueue = CREEP_QUEUES["global"] ? JSON.parse(CREEP_QUEUES["global"]) : {};
    let roomQueue = CREEP_QUEUES[room.name] ? JSON.parse(CREEP_QUEUES[room.name]) : {};

    // Update global queue only if conditions are right
    if (_.size(globalQueue) && room.level >= 3 && room.energyState && !INTEL[room.name].threatLevel && !importantBuilds) {
        let operationQueue = JSON.parse(JSON.stringify(globalQueue));

        for (let key in operationQueue) {
            if (operationQueue[key].destination) {
                // If it requires the closest room, ensure it's the closest room
                let levelTarget = MAX_LEVEL;
                if (Memory.targetRooms[key] && INTEL[operationQueue[key].destination] && INTEL[operationQueue[key].destination].user) levelTarget = userStrength(INTEL[operationQueue[key].destination].user);
                // Check level
                if (room.level < levelTarget) {
                    delete operationQueue[key];
                    continue;
                }
                // Check closest room
                if (operationQueue[key].closestRoom && findClosestOwnedRoom(operationQueue[key].destination, undefined, levelTarget) !== room.name) {
                    delete operationQueue[key];
                    continue;
                }
                // Generate body
                let body = new generator(room.level, operationQueue[key].role, room, operationQueue[key]).generateBody();
                if (!body || !body.length) continue;
                // Check for military ops and ensure range sanity
                let maxRange = 22;
                if (_.includes(body, CLAIM)) maxRange = 12;
                let range = Game.map.getRoomLinearDistance(room.name, operationQueue[key].destination);
                if (range > maxRange) {
                    delete operationQueue[key];
                    continue;
                }

                // Adjust priority based on specific conditions
                adjustQueuePriority(operationQueue, key, room, operationQueue[key], body);
            }
        }

        queue = _.sortBy(Object.assign({}, operationQueue, roomQueue), 'priority');
    } else if (_.size(roomQueue)) {
        queue = _.sortBy(Object.assign({}, roomQueue), 'priority');
    }

    displayQueue(room, queue);

    return queue;

    // Helper function to adjust queue priority based on various conditions
    function adjustQueuePriority(operationQueue, key, room, operation, body) {
        let range = Game.map.getRoomLinearDistance(room.name, operation.destination);

        if (Memory.targetRooms[operation.destination] && Memory.targetRooms[operation.destination].maxLevel > room.level) {
            delete operationQueue[key];
            return;
        }

        // Tweak priority based on distance and energy state
        let maxRange = _.includes(body, CLAIM) ? 14 : 22;
        if (range > maxRange) {
            delete operationQueue[key];
            return;
        }

        // Adjust priority based on energy state and other conditions
        if (room.energyState && room.storage && INTEL[operation.destination] && findClosestOwnedRoom(operation.destination, undefined, room.level) === room.name) {
            operation.priority *= 0.5;
        } else if (!room.energyState) {
            operation.priority *= 6;
        } else {
            operation.priority += 1;
        }

        // Ensure minimum priority is 2
        if (operation.priority < 2) operation.priority = 2;

        // Remove room queue entries with higher priority in the global queue
        if (roomQueue[operation.role] && roomQueue[operation.role].priority <= operation.priority) {
            delete operationQueue[key];
        } else {
            delete roomQueue[operation.role];
        }
    }
}

function displayQueue(room, queue) {
    let activeSpawns = _.filter(room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.spawning);
    if (!_.size(queue) && !activeSpawns.length) return;

    let yOffset = 1;

    // Display Queue Heading
    room.visual.text('Creep Build Queue', 35, yOffset, {align: 'left', opacity: 0.8});
    yOffset++;

    // Display Queue Information
    if (_.size(queue)) {
        for (let i = 0; i < 5 && i < queue.length; i++) {
            let item = queue[i];
            let cost = global.UNIT_COST(new generator(room.level, item.role, room, item).generateBody());
            if (!cost) continue;
            room.visual.text(`${item.priority} ${_.capitalize(item.role)}: ${room.energyAvailable}/${cost} Age: ${Game.time - item.cached}`, 35, yOffset + i, {
                align: 'left',
                opacity: 0.8
            });
        }
        yOffset += _.size(queue.slice(0, 5));
    }

    // Display Spawning Information
    activeSpawns.forEach(spawn => {
        let spawningCreep = Game.creeps[spawn.spawning.name];
        room.visual.text(`Spawning - ${_.capitalize(spawningCreep.name.split("_")[0])} - Ticks: ${spawn.spawning.remainingTime}`, 35, yOffset, {
            align: 'left',
            opacity: 0.8
        });
        yOffset++;
    })
}

/**
 *
 * @param {object} room - Room object for room creeps
 * @param {string} role - Role
 * @param {string} destination - If filtering by destination room name
 * @param {string} operation - If filtering by operation type
 * @param {string} overlord - If filtering by overlord
 * @returns {*|number}
 */
function getCreepCount(room = undefined, role, destination = undefined, operation = undefined, overlord = undefined) {
    if (!destination && !operation && room) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && (c.memory.destination === room.name || c.room.name === room.name || c.memory.overlord === room.name)).length;
    else if (room && operation && !destination) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && (c.memory.destination === room.name || c.memory.overlord === room.name) && c.memory.operation === operation).length;
    else if (destination && !operation) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && (c.memory.destination === destination || c.memory.overlord === destination)).length;
    else if (!destination && operation) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && c.memory.operation === operation).length;
    else if (destination && operation) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && (c.memory.destination === destination || c.memory.overlord === destination) && c.memory.operation === operation).length
    else if (!destination && !operation && !room && overlord) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && c.memory.overlord === overlord).length;
    else if (!destination && !operation && !room) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role).length;
}

/**
 *
 * @param {object} room - Room object for room creeps
 * @param {string} role - Role
 * @param {string} destination - If filtering by destination room name
 * @returns {*|number}
 */
function creepExpiringSoon(room = undefined, role, destination = undefined) {
    if (room instanceof Room) room = room.name;
    let creeps = _.filter(Game.creeps, (r) => r.my && r.memory.role === role && (r.room.name === room || r.memory.destination === destination || r.memory.overlord === room));
    let distance = 15;
    if (destination) distance = Game.map.getRoomLinearDistance(findClosestOwnedRoom(destination, false, MAX_LEVEL), destination) * 50;
    if (creeps.length) return _.min(creeps, '.ticksToLive').ticksToLive <= (CREEP_SPAWN_TIME * _.size(_.min(creeps, '.ticksToLive').body)) + distance; else return false;
}

/**
 * Get priority for a room based on distance
 * @param room
 * @returns {number}
 */
function getPriority(room) {
    let range = findClosestOwnedRoom(room, true)
    if (range <= 1) return PRIORITIES.priority; else if (range <= 3) return PRIORITIES.urgent; else if (range <= 5) return PRIORITIES.high; else if (range <= 10) return PRIORITIES.medium; else return PRIORITIES.secondary;
}