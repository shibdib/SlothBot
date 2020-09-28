/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let generator = require('module.bodyGenerator');
let roomQueue = {};
let globalQueue = {};
let energyOrder = {};
let orderStored = {};
let storedLevel = {};
let remoteHives = {};
let lastBuilt = {};
let creepCount = {};
let creepTTL = {};
let borderPatrolNeeded;
let lastGlobalSpawn = Game.time;

//Build Creeps From Queue
let lastQueueRun;
module.exports.processBuildQueue = function (room) {
    // Display Queues
    displayQueue(room.name);
    let activeSpawns = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.spawning);
    for (let spawn of activeSpawns) {
        let spawningCreep = Game.creeps[spawn.spawning.name];
        spawn.say(ICONS.build + ' ' + _.capitalize(spawningCreep.name.split("_")[0]) + ' - Ticks: ' + spawn.spawning.remainingTime);
    }
    if (lastQueueRun + 3 > Game.time) return;
    // Clear queue if something is stuck
    if (lastBuilt[room.name] && roomQueue[room.name] && (lastBuilt[room.name] + 2000 < Game.time)) {
        log.a('Queue reset due to timeout.', room.name);
        roomQueue[room.name] = undefined;
        globalQueue = undefined;
        lastBuilt[room.name] = Game.time;
        return;
    }
    // Check for free spawns
    let availableSpawn = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning)[0];
    if (availableSpawn) {
        let topPriority, body, role, queue, cost, queuedBuild;
        let level = getLevel(room);
        if (level > room.controller.level) level = room.controller.level;
        let maxLevel = Memory.maxLevel;
        // Filter ops by range
        let range = LOCAL_SPHERE * 2;
        if (room.energyState) range = LOCAL_SPHERE * 4;
        // Only build global queue if you have energy or if there's no rooms queue
        if (_.size(globalQueue) && (room.energyState || !_.size(roomQueue[room.name])) && !Memory.roomCache[room.name].responseNeeded && _.inRange(level, maxLevel - 1, maxLevel + 1)) {
            let distanceFilteredGlobal = _.filter(globalQueue, (q) => q.role === 'scout' || !q.destination || Memory.auxiliaryTargets[q.destination] ||
                Game.map.getRoomLinearDistance(q.destination, room.name) < range || (Memory.roomCache[q.destination] && Memory.roomCache[q.destination].owner === MY_USERNAME));
            queue = _.sortBy(Object.assign({}, distanceFilteredGlobal, roomQueue[room.name]), 'priority');
        } else if (_.size(roomQueue[room.name])) {
            let auxiliaryTargets = _.filter(globalQueue, (q) => q.role === 'scout' || Memory.auxiliaryTargets[q.destination] ||
                (Memory.roomCache[q.destination] && Memory.roomCache[q.destination].owner === MY_USERNAME));
            queue = _.sortBy(Object.assign({}, auxiliaryTargets, roomQueue[room.name]), 'priority');
        }
        // Pick build target
        for (let key in queue) {
            topPriority = queue[key];
            role = topPriority.role;
            if (!role) continue;
            // If boosts are required to spawn check that a room has them
            if (topPriority.other.boostCheck) {
                let hasBoost;
                for (let boost of BOOST_USE[topPriority.other.boostCheck]) {
                    hasBoost = room.store(boost) >= 500;
                }
                if (!hasBoost) continue;
            }
            body = generator.bodyGenerator(level, role, room, topPriority.other.reboot);
            if (!body || !body.length) continue;
            // Add a distance sanity check for claim parts
            if (topPriority.destination && (Game.map.findRoute(topPriority.destination, room.name).length > 20 || (_.includes(body, CLAIM) && Game.map.findRoute(topPriority.destination, room.name).length > 12))) continue;
            // Stop loop if we just can't afford it yet
            cost = global.UNIT_COST(body);
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) return;
            // If it's not something we can afford, continue
            if (cost > room.energyCapacityAvailable) continue;
            queuedBuild = topPriority;
            break;
        }
        if (queuedBuild) {
            lastQueueRun = Game.time;
            determineEnergyOrder(room);
            if (topPriority && typeof topPriority === 'object') {
                _.defaults(topPriority, {
                    role: undefined,
                    overlord: undefined,
                    assignedSource: undefined,
                    destination: undefined,
                    other: {},
                    military: undefined,
                    operation: undefined,
                    misc: undefined
                });
                let name = _.uniqueId(role + '_' + availableSpawn.room.name + '_T' + level + '_');
                if (topPriority.operation) name = _.uniqueId(topPriority.operation + '_' + availableSpawn.room.name + '_T' + level + '_');
                let energyStructures;
                if (energyOrder[availableSpawn.room.name]) energyStructures = JSON.parse(energyOrder[availableSpawn.room.name]);
                switch (availableSpawn.spawnCreep(body, name, {
                    memory: {
                        born: Game.time,
                        role: role,
                        overlord: availableSpawn.room.name,
                        assignedSource: topPriority.assignedSource,
                        destination: topPriority.destination,
                        other: topPriority.other,
                        military: topPriority.military,
                        operation: topPriority.operation,
                        misc: topPriority.misc
                    },
                    energyStructures: energyStructures
                })) {
                    case OK:
                        lastGlobalSpawn = Game.time;
                        lastBuilt[availableSpawn.room.name] = Game.time;
                        if (!topPriority.operation) log.d(availableSpawn.room.name + ' Spawning a ' + role);
                        if (topPriority.military && globalQueue[role]) delete globalQueue[role];
                        if (topPriority.buildCount && roomQueue[availableSpawn.room.name][role]) return roomQueue[availableSpawn.room.name][role].buildCount = topPriority.buildCount - 1;
                        if (roomQueue[availableSpawn.room.name]) delete roomQueue[availableSpawn.room.name][role];
                        return;
                    case ERR_NOT_ENOUGH_ENERGY:
                        energyOrder[availableSpawn.room.name] = undefined;
                        return;
                    default:
                        return;
                }
            }
        }
    }
};

//First Room Startup
module.exports.roomStartup = function (room) {
    if (getCreepCount(room, 'drone') < ROOM_SOURCE_SPACE[room.name] + 3) {
        queueCreep(room, 1 + getCreepCount(room, 'drone'), {role: 'drone'})
    }
    if (getCreepCount(room, 'stationaryHarvester') < 2) {
        queueCreep(room, 1, {role: 'stationaryHarvester'})
    }
    if (getCreepCount(room, 'hauler') < 2) {
        queueCreep(room, 2, {role: 'hauler'})
    }
    if (getCreepCount(room, 'explorer') < 2) {
        queueCreep(room, 4, {role: 'explorer'})
    }
};

//Essential creeps
module.exports.essentialCreepQueue = function (room) {
    //Static room info
    let level = getLevel(room);
    let roomCreepTTL = {};
    if (creepTTL[room.name]) roomCreepTTL = creepTTL[room.name];
    //Harvesters
    if (!getCreepCount(room, 'stationaryHarvester')) {
        queueCreep(room, 1, {role: 'stationaryHarvester', other: {reboot: true}});
    } else if (getCreepCount(room, 'stationaryHarvester') < 2 || (roomCreepTTL['stationaryHarvester'] < 100 && getCreepCount(room, 'stationaryHarvester') === 2)) {
        queueCreep(room, 1, {role: 'stationaryHarvester'});
    }
    //Haulers
    let count = 1;
    if (level >= 6) count = 2;
    if (getCreepCount(room, 'hauler') < count) {
        queueCreep(room, -1, {role: 'hauler', other: {reboot: true}});
    } else if (roomCreepTTL['hauler'] < 100 && getCreepCount(room, 'hauler') === count) {
        queueCreep(room, 1, {role: 'hauler'});
    }
    //Filler
    if (getCreepCount(room, 'filler') < 1 && _.filter(room.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester' && c.memory.linkAttempt && !c.memory.linkID)[0]) {
        queueCreep(room, PRIORITIES.hauler - 1, {role: 'filler'})
    }
    // Local Responder
    if (Memory.roomCache[room.name].threatLevel >= 2) {
        if (getCreepCount(room, 'defender') < Memory.roomCache[room.name].numberOfHostiles || (roomCreepTTL['defender'] < 100 && getCreepCount(room, 'defender') === Memory.roomCache[room.name].numberOfHostiles)) {
            queueCreep(room, PRIORITIES.responder, {
                role: 'defender',
                other: {responseTarget: room.name},
                military: true
            })
        }
    }
    // Upgrader
    // Determine amount
    let number = 1;
    if (level < 7) {
        if (level >= 5) number = 2;
        else if (room.memory.controllerContainer) number = Game.getObjectById(room.memory.controllerContainer).pos.countOpenTerrainAround();
        else number = (8 - level);
    }
    if (getCreepCount(room, 'upgrader') < number) {
        //If room is about to downgrade get a creep out asap
        let reboot = room.controller.ticksToDowngrade <= CONTROLLER_DOWNGRADE[level] * 0.9 || room.controller.progress > room.controller.progressTotal || Memory.roomCache[room.name].threatLevel >= 3 || room.memory.lowPower;
        queueCreep(room, PRIORITIES.upgrader, {
            role: 'upgrader',
            other: {reboot: reboot}
        })
    }
};

//Non essential creeps
module.exports.miscCreepQueue = function (room) {
    let level = getLevel(room);
    //Drones
    if (room.constructionSites.length) {
        let number = 1;
        let nonRoads = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL)[0];
        if (nonRoads && (level < 6 || room.energyState)) number = 10 - level;
        if (getCreepCount(room, 'drone') < number) {
            queueCreep(room, PRIORITIES.drone + getCreepCount(room, 'drone'), {role: 'drone'})
        }
    }
    // Maintenance
    if (!getCreepCount(room, 'maintenance')) {
        queueCreep(room, PRIORITIES.drone, {role: 'maintenance'})
    }
    //Waller
    if (level >= 3 && !getCreepCount(room, 'waller')) {
        queueCreep(room, PRIORITIES.waller, {role: 'waller'})
    }
    // If no conflict detected
    if (!room.nukes.length && !Memory.roomCache[room.name].threatLevel) {
        if (level >= 6) {
            //LabTech
            if (room.terminal && !getCreepCount(room, 'labTech')) {
                queueCreep(room, PRIORITIES.miscHauler, {role: 'labTech'})
            }
            //Power
            if (room.energyState && level === 8 && room.store(RESOURCE_POWER) && _.filter(room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0]) {
                if (!getCreepCount(room, 'powerManager')) {
                    queueCreep(room, PRIORITIES.miscHauler, {role: 'powerManager'})
                }
            }
            //Mineral Harvester
            if (room.mineral.mineralAmount) {
                let extractor = room.structures.filter((s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
                if (extractor && !getCreepCount(room, 'mineralHarvester')) {
                    queueCreep(room, PRIORITIES.mineralHarvester, {
                        role: 'mineralHarvester',
                        other: {assignedMineral: room.mineral.id}
                    })
                }
            }
        }
        //Pre observer spawn explorers
        if (level < 8 && getCreepCount(room, 'explorer') < 3) {
            queueCreep(room, PRIORITIES.explorer, {role: 'explorer', military: true})
        }
        // Assist room
        if (level >= 3) {
            let safeToSupport = _.filter(Memory.myRooms, (r) => !Memory.roomCache[r] || !Memory.roomCache[r].lastPlayerSighting || Memory.roomCache[r].lastPlayerSighting + 100 < Game.time);
            let needDrones = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && Game.map.getRoomLinearDistance(r, room.name) < 10 && Game.rooms[r].memory.buildersNeeded)));
            if (needDrones) {
                let amount = ROOM_SOURCE_SPACE[needDrones] || 5;
                if (amount < 5) amount = 5;
                if (getCreepCount(room, 'drone', needDrones) < amount) {
                    queueCreep(room, PRIORITIES.assistPioneer, {role: 'drone', destination: needDrones});
                }
            }
            if (level >= 6 && room.energyState) {
                // Energy Supplies
                let needEnergy = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && !Game.rooms[r].energyState && !Game.rooms[r].memory.praiseRoom && Game.map.getRoomLinearDistance(r, room.name) < 6 && !Game.rooms[r].terminal)));
                if (needEnergy) {
                    if (!getCreepCount(room, 'fuelTruck', needEnergy)) {
                        queueCreep(room, PRIORITIES.fuelTruck, {role: 'fuelTruck', destination: needEnergy});
                    }
                }
                // Power Level
                let upgraderRequested = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && !Game.rooms[r].memory.praiseRoom && Game.rooms[r].controller.level + 1 < level && Game.map.getRoomLinearDistance(r, room.name) < 6)));
                if (upgraderRequested) {
                    if (!getCreepCount(room, 'remoteUpgrader', upgraderRequested)) {
                        queueCreep(room, PRIORITIES.remoteUpgrader, {
                            role: 'remoteUpgrader',
                            destination: upgraderRequested
                        })
                    }
                }
            }
        }
    } // Border Patrol
    if (room.memory.spawnBorderPatrol || borderPatrolNeeded) {
        if (room.level === Memory.maxLevel) {
            let count = 2;
            let destination = room.memory.spawnBorderPatrol || borderPatrolNeeded;
            borderPatrolNeeded = undefined;
            if (getCreepCount(room, 'longbow', undefined, 'borderPatrol') < count) {
                queueCreep(room, PRIORITIES.borderPatrol, {
                    role: 'longbow',
                    operation: 'borderPatrol',
                    military: true,
                    other: {responseTarget: destination}
                });
            }
            if (!getCreepCount(room, 'attacker', undefined, 'borderPatrol')) {
                queueCreep(room, PRIORITIES.borderPatrol, {
                    role: 'attacker',
                    operation: 'borderPatrol',
                    military: true,
                    other: {responseTarget: destination}
                });
            }
        } else if (room.memory.spawnBorderPatrol) {
            borderPatrolNeeded = room.memory.spawnBorderPatrol;
        }
    }
};

//Remote creeps
module.exports.remoteCreepQueue = function (room) {
    if (!Memory.roomCache) Memory.roomCache = {};
    room.memory.remoteRange = undefined;
    let level = getLevel(room);
    if (!remoteHives[room.name] || Math.random() > 0.95) {
        room.memory.remoteRooms = undefined;
        let adjacent = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && !Memory.roomCache[r].isHighway && Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status &&
            (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && !Memory.roomCache[r].owner && !Memory.roomCache[r].level);
        // Handle SK middle room
        /**
         if (level >= 7 && _.filter(adjacent, (r) => Memory.roomCache[r] && Memory.roomCache[r].sk).length) {
            let skAdjacent = _.filter(adjacent, (r) => Memory.roomCache[r] && Memory.roomCache[r].sk)[0];
            let middleRoom = _.filter(Game.map.describeExits(skAdjacent), (r) => Memory.roomCache[r] && Memory.roomCache[r].sources >= 3 && !Memory.roomCache[r].sk)[0];
            if (middleRoom) adjacent.push(middleRoom);
        }**/
        // Handle highway deadends
        if (!adjacent.length) {
            let highway = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && !Memory.roomCache[r].owner && Memory.roomCache[r].isHighway);
            if (highway.length) {
                adjacent = _.filter(Game.map.describeExits(highway[0]), (r) => Memory.roomCache[r] && !Memory.roomCache[r].isHighway && (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && !Memory.roomCache[r].owner);
            }
        }
        // Handle less than desired
        if (adjacent.length < 3 - room.energyState) {
            let secondary = [];
            for (let adjacentRoom of adjacent) {
                let secondaryAdjacent = _.filter(Game.map.describeExits(adjacentRoom), (r) => Memory.roomCache[r] && Memory.roomCache[r].sources && (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status &&
                    !Memory.roomCache[r].owner && !Memory.roomCache[r].sk && Game.map.getRoomLinearDistance(room.name, r) <= 1);
                if (secondaryAdjacent.length) secondary = secondary.concat(secondaryAdjacent);
            }
            if (secondary.length) adjacent = adjacent.concat(secondary);
            if (adjacent.length < 2 - room.energyState) {
                for (let adjacentRoom of adjacent) {
                    let secondaryAdjacent = _.filter(Game.map.describeExits(adjacentRoom), (r) => Memory.roomCache[r] && Memory.roomCache[r].sources && (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status &&
                        !Memory.roomCache[r].owner && !Memory.roomCache[r].sk && Game.map.getRoomLinearDistance(room.name, r) <= 2);
                    if (secondaryAdjacent.length) secondary = secondary.concat(secondaryAdjacent);
                }
                if (secondary.length) adjacent = adjacent.concat(secondary);
            }
        }
        remoteHives[room.name] = JSON.stringify(_.uniq(adjacent));
    }
    // Handle turtle mode
    if (room.memory.turtleMode && room.memory.turtleMode + 5000 < Game.time) {
        remoteHives[room.name] = undefined;
        return room.memory.turtleMode = undefined;
    } else if (!room.memory.turtleMode && !_.size(JSON.parse(remoteHives[room.name]))) {
        room.memory.spawnBorderPatrol = undefined;
        return room.memory.turtleMode = Game.time;
    }
    //Remotes
    if (!room.memory.turtleMode && remoteHives[room.name] && !Memory.roomCache[room.name].responseNeeded) {
        room.memory.spawnBorderPatrol = undefined;
        let remotes = JSON.parse(remoteHives[room.name]);
        let skMining;
        for (let keys in shuffle(remotes)) {
            let remoteName = remotes[keys];
            // If avoid is set continue
            if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) continue;
            // If owned or a highway continue
            if (Memory.roomCache[remoteName] && (Memory.roomCache[remoteName].level || !Memory.roomCache[remoteName].sources)) continue;
            // If it's reserved by someone else continue
            let invaderCoreReserved;
            if (Memory.roomCache[remoteName] && Memory.roomCache[remoteName].reservation === 'Invader') invaderCoreReserved = true;
            if (!invaderCoreReserved && Memory.roomCache[remoteName] && Memory.roomCache[remoteName].reservation && Memory.roomCache[remoteName].reservation !== MY_USERNAME) continue
            // Scout
            if (!Memory.roomCache[remoteName]) {
                if (!getCreepCount(room, 'scout', remoteName)) {
                    queueCreep(room, PRIORITIES.priority, {role: 'scout', destination: remoteName})
                }
                continue;
            }
            // Handle invaders
            if ((Memory.roomCache[remoteName].invaderCore || Memory.roomCache[remoteName].responseNeeded) && !Memory.roomCache[remoteName].sk) {
                if (Memory.roomCache[remoteName].invaderTTL && Memory.roomCache[remoteName].invaderTTL < Game.time) {
                    if (!getCreepCount(room, 'scout', remoteName)) {
                        queueCreep(room, PRIORITIES.priority, {role: 'scout', destination: remoteName})
                    }
                    continue;
                }
                room.memory.spawnBorderPatrol = remoteName;
                continue;
            }
            // Handle obstructed rooms
            if (Memory.roomCache[remoteName].obstructions) {
                if (getCreepCount(room, 'deconstructor', remoteName) < 2) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {role: 'deconstructor', destination: remoteName})
                }
            }
            // Handle SK
            if (Memory.roomCache[remoteName] && Memory.roomCache[remoteName].sk && level >= 7 && !Memory.roomCache[remoteName].invaderCore && !room.memory.lowPower) {
                skMining = true;
                if (!getCreepCount(room, 'SKAttacker', remoteName)) {
                    queueCreep(room, PRIORITIES.SKWorker + 1, {role: 'SKAttacker', destination: remoteName})
                }
                let sourceCount = Memory.roomCache[remoteName].sources || 1;
                if (getCreepCount(room, 'SKAttacker', remoteName) && room.energyState < 2 && getCreepCount(room, 'remoteHarvester', remoteName) < sourceCount) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {role: 'remoteHarvester', destination: remoteName})
                }
                if (getCreepCount(room, 'SKAttacker', remoteName) && !getCreepCount(room, 'SKMineral', remoteName) && (!Memory.roomCache[remoteName].mineralCooldown || Memory.roomCache[remoteName].mineralCooldown < Game.time)) {
                    queueCreep(room, PRIORITIES.SKWorker, {role: 'SKMineral', destination: remoteName})
                }
            } else if (!Memory.roomCache[remoteName] || !Memory.roomCache[remoteName].sk) {
                if (!invaderCoreReserved && !room.memory.lowPower && room.energyState < 2) {
                    let sourceCount = Memory.roomCache[remoteName].sources || 1;
                    if (getCreepCount(room, 'remoteHarvester', remoteName) < sourceCount) {
                        queueCreep(room, PRIORITIES.remoteHarvester, {role: 'remoteHarvester', destination: remoteName})
                    }
                }
                if (level >= 4 && !Memory.roomCache[remoteName].obstructions && (!Memory.roomCache[remoteName].reservationExpires || Game.time > Memory.roomCache[remoteName].reservationExpires) && Memory.roomCache[remoteName].sources < 3) {
                    let amount = Memory.roomCache[remoteName].reserverCap || 1;
                    if (getCreepCount(room, 'reserver', remoteName) < amount) {
                        queueCreep(room, PRIORITIES.reserver, {role: 'reserver', destination: remoteName})
                    }
                }
                // Handle middle room case with mineral
                if (!invaderCoreReserved && Memory.roomCache[remoteName] && Memory.roomCache[remoteName].sources >= 3 && !room.memory.lowPower) {
                    if (!getCreepCount(room, 'SKMineral', remoteName) && (!Memory.roomCache[remoteName].mineralCooldown || Memory.roomCache[remoteName].mineralCooldown < Game.time)) {
                        queueCreep(room, PRIORITIES.SKWorker, {role: 'SKMineral', destination: remoteName})
                    }
                }
            }
        }
        // Remote Hauler
        if (getCreepCount(room, 'remoteHarvester') && !room.memory.lowPower) {
            if (getCreepCount(room, 'remoteHauler') < getCreepCount(room, 'remoteHarvester')) {
                let misc = remoteHives[room.name];
                queueCreep(room, PRIORITIES.remoteHauler, {role: 'remoteHauler', misc: misc})
            }
        }
        // Remote Road Builder
        if (!room.memory.turtleMode && getCreepCount(room, 'roadBuilder') < 2) {
            let misc = remoteHives[room.name];
            queueCreep(room, PRIORITIES.roadBuilder, {role: 'roadBuilder', misc: misc})
        }
    }
};

//Military creeps
let lastRun;
module.exports.globalCreepQueue = function () {
    if (lastRun + 10 > Game.time) return;
    lastRun = Game.time;
    let targetRooms = Memory.targetRooms;
    let auxiliaryTargets = Memory.auxiliaryTargets;
    let operations = Object.assign(targetRooms, auxiliaryTargets);
    //Marauder
    if (POKE_ATTACKS && getCreepCount(undefined, 'longbow', undefined, 'marauding') < 2) {
        queueGlobalCreep(PRIORITIES.secondary, {
            role: 'longbow',
            operation: 'marauding',
            military: true
        });
    }
    // Targets
    if (!_.size(operations)) return;
    for (let key in shuffle(operations)) {
        if (!operations[key]) continue;
        let opLevel = operations[key].level;
        let priority = operations[key].priority || 4;
        //Observers
        if (opLevel === 0 && !operations[key].observerCheck) {
            if (!getCreepCount(undefined, 'scout', key)) {
                queueGlobalCreep(PRIORITIES.priority, {role: 'scout', destination: key, military: true})
            }
            continue;
        }
        // Set priority
        switch (priority) {
            case 4:
                priority = PRIORITIES.secondary;
                break;
            case 3:
                priority = PRIORITIES.medium;
                break;
            case 2:
                priority = PRIORITIES.high;
                break;
            case 1:
                priority = PRIORITIES.urgent;
                break;
            case 99:
                priority = PRIORITIES.priority;
                break;
        }
        // Some backwards checking
        if (operations[key].targetRoom) return operations[key] = undefined;
        switch (operations[key].type) {
            // Claiming
            case 'claim':
                if (!getCreepCount(undefined, 'claimer', key)) {
                    queueGlobalCreep(PRIORITIES.claimer, {role: 'claimer', destination: key, military: true});
                } else if (getCreepCount(undefined, 'drone', key) < 4) {
                    queueGlobalCreep(PRIORITIES.claimer, {role: 'drone', destination: key, military: true});
                }
                break;
            // Scout ops
            case 'claimScout':
            case 'attack':
            case 'scout':
                if (!getCreepCount(undefined, 'scout', key)) {
                    queueGlobalCreep(PRIORITIES.priority, {role: 'scout', destination: key, military: true})
                }
                break;
            case 'commodity': // Commodity Mining
                let commodityMiner = _.filter(Game.creeps, (creep) => creep.memory.role === 'commodityMiner' && creep.memory.destination === key);
                if (!getCreepCount(undefined, 'commodityMiner', key)) {
                    queueGlobalCreep(PRIORITIES.Power, {role: 'commodityMiner', destination: key, military: true})
                }
                break;
            case 'power': // Power Mining
                let powerSpace = operations[key].space || 2;
                let powerHealer = getCreepCount(undefined, 'powerHealer', key);
                let powerAttacker = getCreepCount(undefined, 'powerAttacker', key);
                let powerHealerTTL, powerAttackerTTL;
                if (creepTTL[key]) {
                    powerHealerTTL = creepTTL[key]['powerHealer'] || undefined;
                    powerAttackerTTL = creepTTL[key]['powerAttacker'] || undefined;
                }
                if (!operations[key].complete && (powerHealer < powerAttacker + 1 || (powerHealerTTL && powerHealerTTL < 450 && powerHealer < (powerAttacker + 1) + 1))) {
                    queueGlobalCreep(PRIORITIES.Power, {role: 'powerHealer', destination: key, military: true})
                }
                if (!operations[key].complete && (powerAttacker < powerSpace || (powerAttackerTTL && powerAttackerTTL < 450 && powerAttacker < powerSpace + 1))) {
                    queueGlobalCreep(PRIORITIES.Power - 1, {role: 'powerAttacker', destination: key, military: true})
                }
                if (operations[key].hauler && getCreepCount(undefined, 'powerHauler', key) < operations[key].hauler) {
                    queueGlobalCreep(PRIORITIES.Power - 1, {role: 'powerHauler', destination: key, military: true})
                }
                break;
            case 'hold': // Hold Room
                let longbow = getCreepCount(undefined, 'longbow', key);
                let holdLongbowTTL;
                if (creepTTL[key]) {
                    holdLongbowTTL = creepTTL[key]['longbow'] || undefined;
                }
                if ((longbow < opLevel + 1 || (holdLongbowTTL && holdLongbowTTL < 300 && longbow < opLevel + 2))) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'hold',
                        military: true
                    })
                }
                if (operations[key].claimAttacker) {
                    if (!getCreepCount(undefined, 'claimAttacker', key)) {
                        queueGlobalCreep(priority, {
                            role: 'claimAttacker',
                            destination: key,
                            operation: 'hold',
                            military: true
                        })
                    }
                }
                if (operations[key].cleaner) {
                    if (!getCreepCount(undefined, 'deconstructor', key)) {
                        queueGlobalCreep(priority, {
                            role: 'deconstructor',
                            destination: key,
                            operation: 'hold',
                            military: true
                        })
                    }
                }
                break;
            case 'siegeGroup': //Siege Group
                if (getCreepCount(undefined, 'healer', key) && !getCreepCount(undefined, 'siegeEngine', key)) {
                    queueGlobalCreep(priority - 1, {
                        role: 'siegeEngine',
                        destination: key,
                        operation: 'siegeGroup',
                        military: true
                    })
                }
                if (!getCreepCount(undefined, 'healer', key)) {
                    queueGlobalCreep(priority, {
                        role: 'healer',
                        destination: key,
                        operation: 'siegeGroup',
                        military: true,
                        other: {boostCheck: 'heal'}
                    })
                }
                break;
            case 'claimClear': //Claim Clearing
                if (!getCreepCount(undefined, 'claimer', key)) {
                    queueGlobalCreep(priority, {
                        role: 'claimer',
                        destination: key,
                        operation: 'claimClear',
                        military: true
                    })
                }
                break;
            case 'drain': // Drain
                if (getCreepCount(undefined, 'drainer', key) < opLevel) {
                    queueGlobalCreep(priority, {
                        role: 'drainer',
                        destination: key,
                        operation: 'drain',
                        military: true,
                        other: {boostCheck: 'heal'}
                    })
                }
                break;
            case 'rangers': // Rangers
                if (getCreepCount(undefined, 'longbow', key) < 2) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'rangers',
                        military: true
                    })
                }
                if (operations[key].claimAttacker && getCreepCount(undefined, 'claimAttacker', operations[key].claimAttacker)) {
                    queueGlobalCreep(priority, {
                        role: 'claimAttacker',
                        destination: operations[key].claimAttacker,
                        operation: 'rangers',
                        military: true
                    })
                }
                break;
            case 'guard': // Room Guard
                if (getCreepCount(undefined, 'longbow', key) < opLevel) {
                    queueGlobalCreep(PRIORITIES.priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'guard',
                        military: true
                    })
                }
                break;
        }
    }
};

//Praise room creeps
module.exports.praiseCreepQueue = function (room) {
    let level = getLevel(room);
    //Drones
    let inBuild = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD)[0];
    if (inBuild || room.controller.level === 1) {
        let amount = 3;
        if (getCreepCount(room, 'drone') < amount) {
            queueCreep(room, 1 + getCreepCount(room, 'drone'), {role: 'drone'})
        }
    }
    //Harvesters
    if (!getCreepCount(room, 'stationaryHarvester')) {
        return queueCreep(room, 1, {role: 'stationaryHarvester', misc: true, other: {reboot: true}});
    } else {
        if (getCreepCount(room, 'stationaryHarvester') < 2) {
            queueCreep(room, PRIORITIES.stationaryHarvester, {role: 'stationaryHarvester', misc: true})
        }
    }
    //Filler
    if (getCreepCount(room, 'filler') < getCreepCount(room, 'stationaryHarvester')) {
        queueCreep(room, PRIORITIES.hauler - 1, {role: 'filler', other: {reboot: true}})
    }
    // Local Responder
    if (getCreepCount(room, 'defender') < Memory.roomCache[room.name].threatLevel) {
        queueCreep(room, PRIORITIES.responder, {role: 'defender', other: {responseTarget: room.name}, military: true})
    }
    //Waller
    if (level >= 3 && !getCreepCount(room, 'waller')) {
        queueCreep(room, PRIORITIES.waller, {role: 'waller'})
    }
    //Mineral Harvester
    if (level >= 6) {
        let extractor = room.structures.filter((s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
        if (extractor && room.mineral.mineralAmount && !getCreepCount(room, 'praiseMineral')) {
            queueCreep(room, PRIORITIES.mineralHarvester, {role: 'praiseMineral'})
        }
    }
    //Upgrader
    let upgraders = _.filter(room.creeps, (creep) => creep.memory.role === 'praiseUpgrader');
    let upgradePower = 0;
    let number = 1;
    upgraders.forEach((h) => upgradePower += h.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER);
    if (upgradePower < ROOM_ENERGY_PER_TICK[room.name] * 0.75) number = upgraders.length + 1;
    if (getCreepCount(room, 'praiseUpgrader') < number) {
        queueCreep(room, PRIORITIES.upgrader + upgraders.length, {role: 'praiseUpgrader'})
    }
    // Food
    if (!_.size(roomQueue[room.name])) {
        let needFood = _.filter(room.creeps, (creep) => creep.memory.role === 'praiseUpgrader' && _.sum(creep.store) < creep.store.getCapacity() * 0.15).length > 0 && !_.filter(room.creeps, (creep) => creep.memory.role === 'food').length;
        if (needFood) {
            let praisePower = 0;
            upgraders.forEach((h) => praisePower += h.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER);
            praisePower *= 4;
            let body;
            if (praisePower >= 175) body = [HEAL]; else if (praisePower >= 110) body = [RANGED_ATTACK]; else if (praisePower >= 80) body = [WORK]; else if (praisePower >= 50) body = [ATTACK]; else body = [CARRY];
            let spawn = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
            let spawnDirection = room.controller.pos.getDirectionTo(spawn);
            spawn.spawnCreep(body, 'feedMe' + Math.random(), {
                memory: {
                    born: Game.time,
                    role: 'food',
                    overlord: room.name
                },
                directions: [spawnDirection]
            })
        }
    }
};

function queueCreep(room, importance, options = {}, military = false) {
    let cache;
    if (!military) {
        cache = roomQueue[room.name] || {};
        if (cache[options.role] && cache[options.role].priority <= importance) return;
    } else {
        cache = globalQueue || {};
        if (cache[options.role] && cache[options.role].priority <= importance) return;
    }
    _.defaults(options, {
        role: undefined,
        assignedSource: undefined,
        destination: undefined,
        other: {},
        military: undefined,
        operation: undefined,
        misc: undefined
    });
    if (room) {
        let key = options.role;
        cache[key] = {
            cached: Game.time,
            room: room.name,
            priority: importance,
            role: options.role,
            assignedSource: options.assignedSource,
            destination: options.destination,
            other: options.other,
            military: options.military,
            operation: options.operation,
            misc: options.misc
        };
        if (!military) {
            roomQueue[room.name] = cache;
        } else {
            globalQueue = cache;
        }
    }
}

function queueGlobalCreep(priority, options = {}) {
    let cache;
    cache = globalQueue || {};
    if (cache[options.role] && cache[options.role].priority <= priority) return;
    _.defaults(options, {
        role: undefined,
        assignedSource: undefined,
        destination: undefined,
        military: undefined,
        other: {},
        operation: undefined,
        misc: undefined
    });
    let key = options.role;
    cache[key] = {
        cached: Game.time,
        priority: priority,
        role: options.role,
        assignedSource: options.assignedSource,
        destination: options.destination,
        military: options.military,
        other: options.other,
        operation: options.operation,
        misc: options.misc
    };
    globalQueue = cache;
}

function determineEnergyOrder(room) {
    storedLevel[room.name] = getLevel(room);
    if (!room.memory.bunkerHub) return;
    if (!energyOrder[room.name] || orderStored[room.name] + 750 < Game.time) {
        let harvester = _.filter(room.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester' && c.memory.onContainer);
        let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
        let energyStructures = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION);
        let rangeArray = [];
        let usedIdArray = [];
        for (let x = 0; x < energyStructures.length; x++) {
            let nextClosest;
            let harvesterExtensions = _.filter(room.structures, (s) => !_.includes(usedIdArray, s.id) && (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.pos.findInRange(harvester, 1).length);
            if (harvesterExtensions.length) {
                nextClosest = harvesterExtensions[0];
            } else {
                nextClosest = hub.findClosestByRange(energyStructures, {filter: (s) => !_.includes(usedIdArray, s.id)});
            }
            if (!nextClosest) break;
            usedIdArray.push(nextClosest.id);
            rangeArray.push(nextClosest);
        }
        energyOrder[room.name] = JSON.stringify(rangeArray);
        orderStored[room.name] = Game.time;
    }
}

function displayQueue(room) {
    let queue;
    room = Game.rooms[room];
    if (!room) return;
    let level = getLevel(room);
    if (level > room.controller.level) level = room.controller.level;
    let maxLevel = Memory.maxLevel;
    // Filter ops by range
    let range = LOCAL_SPHERE * 2;
    if (room.energyState) range = LOCAL_SPHERE * 4;
    // Only build global queue if you have energy or if there's no rooms queue
    if (_.size(globalQueue) && (room.energyState || !_.size(roomQueue[room.name])) && !Memory.roomCache[room.name].responseNeeded && _.inRange(level, maxLevel - 1, maxLevel + 1)) {
        let distanceFilteredGlobal = _.filter(globalQueue, (q) => !q.destination || Memory.auxiliaryTargets[q.destination] || Game.map.getRoomLinearDistance(q.destination, room.name) < range || (Memory.roomCache[q.destination] && Memory.roomCache[q.destination].owner === MY_USERNAME));
        queue = _.sortBy(Object.assign({}, distanceFilteredGlobal, roomQueue[room.name]), 'priority');
    } else if (_.size(roomQueue[room.name])) {
        let auxiliaryTargets = _.filter(globalQueue, (q) => Memory.auxiliaryTargets[q.destination] ||
            (Memory.roomCache[q.destination] && Memory.roomCache[q.destination].owner === MY_USERNAME));
        queue = _.sortBy(Object.assign({}, auxiliaryTargets, roomQueue[room.name]), 'priority');
    }
    let roles = _.pluck(queue, 'role');
    let tickQueued = _.pluck(queue, 'cached');
    let military = _.pluck(queue, 'military');
    let lower = _.size(queue) + 2;
    if (lower > 7) lower = 7;
    room.visual.rect(34, 0, 49, lower, {
        fill: '#ffffff',
        opacity: '0.55',
        stroke: 'black'
    });
    displayText(room, 35, 1, 'Creep Build Queue');
    if (!_.size(queue)) return;
    for (let i = 0; i < 5; i++) {
        if (!roles[i]) break;
        let mil = '';
        if (military[i]) mil = '*';
        let cost = global.UNIT_COST(generator.bodyGenerator(level - 1, roles[i], room));
        displayText(room, 35, 2 + i, _.capitalize(roles[i]) + mil + ': Cost - ' + room.energyAvailable + '/' + cost + ' Age - ' + (Game.time - tickQueued[i]));
    }
}

function cacheCounts() {
    if (!creepCount || creepCount.tick !== Game.time) {
        creepCount = {};
        creepTTL = {};
        let creeps = _.filter(Game.creeps, (r) => r.my && r.memory.role);
        for (let creep of creeps) {
            // Set role object
            if (!creepCount[creep.memory.role]) creepCount[creep.memory.role] = {};
            if (!creepCount[creep.memory.role][creep.memory.overlord]) creepCount[creep.memory.role][creep.memory.overlord] = 0;
            // Overlord Counts
            if (!creepCount[creep.memory.role][creep.memory.overlord]) creepCount[creep.memory.role][creep.memory.overlord] = 0;
            creepCount[creep.memory.role][creep.memory.overlord]++;
            // Handle destination
            if (creep.memory.destination) {
                if (!creepCount[creep.memory.role][creep.memory.destination]) creepCount[creep.memory.role][creep.memory.destination] = 0;
                creepCount[creep.memory.role][creep.memory.destination]++;
            }
            if (creep.memory.operation) {
                if (!creepCount[creep.memory.role][creep.memory.operation]) creepCount[creep.memory.role][creep.memory.operation] = 0;
                creepCount[creep.memory.role][creep.memory.operation]++;
                if (creep.memory.destination) {
                    if (!creepCount[creep.memory.role][creep.memory.operation][creep.memory.destination]) creepCount[creep.memory.role][creep.memory.operation][creep.memory.destination] = 0;
                    creepCount[creep.memory.role][creep.memory.operation][creep.memory.destination]++;
                }
            }
            // Handle TTL
            if (!creepTTL[creep.room.name]) creepTTL[creep.room.name] = {};
            if (!creepTTL[creep.room.name][creep.memory.role] || creepTTL[creep.room.name][creep.memory.role] > creep.ticksToLive) creepTTL[creep.room.name][creep.memory.role] = creep.ticksToLive;
        }
        creepCount.tick = Game.time;
        return creepCount;
    } else {
        return creepCount;
    }
}

/**
 *
 * @param room - Room object for room creeps
 * @param role - Role
 * @param destination - If filtering by destination room name
 * @param operation - If filtering by operation type
 * @returns {*|number}
 */
function getCreepCount(room = undefined, role, destination, operation = undefined) {
    let creepData = cacheCounts();
    if (!creepData[role]) return 0;
    if (!destination && !operation && room) return creepData[role][room.name] || 0;
    else if (destination && !operation) return creepData[role][destination] || 0;
    else if (!destination && operation) return creepData[role][operation] || 0;
    else if (destination && operation) return creepData[role][operation][destination] || 0;
}