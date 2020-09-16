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
let roomCreepCount = {};
let roomCreepTTL = {};
let borderPatrolNeeded;

//Build Creeps From Queue
module.exports.processBuildQueue = function () {
    Memory.myRooms.forEach((r) => displayQueue(r));
    let activeSpawns = _.filter(Game.spawns, (s) => s.spawning);
    for (let spawn of activeSpawns) {
        let spawningCreep = Game.creeps[spawn.spawning.name];
        spawn.say(ICONS.build + ' ' + _.capitalize(spawningCreep.name.split("_")[0]) + ' - Ticks: ' + spawn.spawning.remainingTime);
    }
    roomLoop:
        for (let roomName of Memory.myRooms) {
            let topPriority, body, role, queue, cost;
            let room = Game.rooms[roomName];
            let level = getLevel(room);
            if (level > room.controller.level) level = room.controller.level;
            let maxLevel = Memory.maxLevel;
            // Clear queue if something is stuck
            if (lastBuilt[roomName] && roomQueue[roomName] && (lastBuilt[roomName] + 2000 < Game.time)) {
                log.a('Queue reset due to timeout.', roomName);
                roomQueue[roomName] = undefined;
                globalQueue = undefined;
                lastBuilt[roomName] = Game.time;
                continue;
            }
            if (room.energyState && !room.memory.nuke && _.size(globalQueue) && !Memory.roomCache[roomName].responseNeeded && _.inRange(level, maxLevel - 1, maxLevel + 1) && !room.memory.lowPower) {
                // Filter ops by range
                let range = LOCAL_SPHERE * 2;
                if (room.energyState) range = LOCAL_SPHERE * 4;
                let distanceFilteredGlobal = _.filter(globalQueue, (q) => !q.destination || Memory.auxiliaryTargets[q.destination] || Game.map.getRoomLinearDistance(q.destination, roomName) < range || Memory.roomCache[q.destination].owner === MY_USERNAME);
                queue = _.sortBy(Object.assign({}, distanceFilteredGlobal, roomQueue[roomName]), 'priority');
            } else if (_.size(roomQueue[roomName])) {
                queue = _.sortBy(roomQueue[roomName], 'priority')
            } else {
                // If queue is empty go to next room
                continue;
            }
            determineEnergyOrder(room);
            let availableSpawns = _.filter(Game.spawns, (s) => s.room.name === roomName && !s.spawning);
            for (let spawn of availableSpawns) {
                // Pick build target
                for (let key in queue) {
                    topPriority = queue[key];
                    role = topPriority.role;
                    if (!role) continue roomLoop;
                    if (role === 'defender' && !Memory.roomCache[spawn.room.name].threatLevel) {
                        if (roomQueue[spawn.room.name]) delete roomQueue[spawn.room.name][role];
                        continue;
                    }
                    if (topPriority.other.reboot || level === 1) {
                        body = _.get(SPAWN[0], role);
                    } else {
                        body = generator.bodyGenerator(level, role, spawn.room, topPriority.misc);
                    }
                    if (!body || !body.length) continue;
                    // If boosts are required to spawn check that a room has them
                    if (topPriority.other.boostCheck) {
                        let hasBoost;
                        for (let boost of BOOST_USE[topPriority.other.boostCheck]) {
                            hasBoost = spawn.room.store(boost) >= 500;
                        }
                        if (!hasBoost) continue;
                    }
                    // If cant afford try the previous level
                    cost = global.UNIT_COST(body);
                    if (cost > spawn.room.energyCapacityAvailable && level >= 2) {
                        body = generator.bodyGenerator(level - 1, role, spawn.room, topPriority.misc);
                        cost = global.UNIT_COST(body);
                    }
                    if (!body || !body.length) continue;
                    // Add a distance sanity check for claim parts
                    if (topPriority.destination && (Game.map.findRoute(topPriority.destination, spawn.room.name).length > 20 || (_.includes(body, CLAIM) && Game.map.findRoute(topPriority.destination, spawn.room.name).length > 7))) continue;
                    if (cost <= spawn.room.energyCapacityAvailable) break;
                }
                if (cost > spawn.room.energyAvailable || !body || !body.length) {
                    continue;
                }
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
                    let name = _.uniqueId(role + '_' + spawn.room.name + '_T' + level + '_');
                    if (topPriority.operation) name = _.uniqueId(topPriority.operation + '_' + spawn.room.name + '_T' + level + '_');
                    let energyStructures;
                    if (energyOrder[spawn.pos.roomName]) energyStructures = JSON.parse(energyOrder[spawn.pos.roomName]);
                    switch (spawn.spawnCreep(body, name, {
                        memory: {
                            born: Game.time,
                            role: role,
                            overlord: spawn.room.name,
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
                            lastBuilt[spawn.room.name] = Game.time;
                            cacheCounts(spawn.room, true);
                            if (!topPriority.operation) log.d(spawn.room.name + ' Spawning a ' + role);
                            if (topPriority.military && globalQueue[role]) delete globalQueue[role];
                            if (topPriority.buildCount && roomQueue[spawn.room.name][role]) return roomQueue[spawn.room.name][role].buildCount = topPriority.buildCount - 1;
                            if (roomQueue[spawn.room.name]) delete roomQueue[spawn.room.name][role];
                            continue roomLoop;
                        case ERR_NOT_ENOUGH_ENERGY:
                            energyOrder[spawn.room.name] = undefined;
                            continue roomLoop;
                    }
                }
            }
        }
};

//First Room Startup
module.exports.roomStartup = function (room) {
    if (getCreepCount(room, 'drone') < ROOM_SOURCE_SPACE[room.name] + 3) {
        queueCreep(room, 1, {role: 'drone'})
    }
    if (getCreepCount(room, 'stationaryHarvester') < 2) {
        queueCreep(room, 3, {role: 'stationaryHarvester'})
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
    cacheCounts(room);
    let level = getLevel(room);
    let creepTTL = roomCreepTTL[room.name];
    //Harvesters
    if (!getCreepCount(room, 'stationaryHarvester')) {
        queueCreep(room, 1, {role: 'stationaryHarvester', other: {reboot: true}});
    } else if (getCreepCount(room, 'stationaryHarvester') < 2 || (creepTTL['stationaryHarvester'] < 100 && getCreepCount(room, 'stationaryHarvester') === 2)) {
        queueCreep(room, 1, {role: 'stationaryHarvester'});
    }
    //Haulers
    if (!getCreepCount(room, 'hauler')) {
        queueCreep(room, -1, {role: 'hauler', other: {reboot: true, localCache: false}});
    } else if (creepTTL['hauler'] < 100 && getCreepCount(room, 'hauler') === 1) {
        queueCreep(room, 1, {role: 'hauler'});
    }
    //Filler

    if (getCreepCount(room, 'filler') < 1 && _.filter(room.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester' && c.memory.linkAttempt && !c.memory.linkID)[0]) {
        queueCreep(room, PRIORITIES.hauler - 1, {role: 'filler', other: {localCache: false}})
    }
    // Local Responder
    if (Memory.roomCache[room.name].threatLevel >= 2) {
        if (getCreepCount(room, 'defender') < Memory.roomCache[room.name].numberOfHostiles || (creepTTL['defender'] < 100 && getCreepCount(room, 'defender') === Memory.roomCache[room.name].numberOfHostiles)) {
            queueCreep(room, PRIORITIES.responder, {
                role: 'defender',
                other: {responseTarget: room.name},
                military: true
            })
        }
    }
    //Upgrader
    let number = 1;
    // Determine amount based off if upgraders are reaching the cap. Apply deficit if room is operating near a net loss
    if (level < 6) {
        let upgraders = _.filter(room.creeps, (creep) => creep.my && creep.memory.role === 'upgrader');
        let upgradePower = 0;
        let deficit = room.energy / (ENERGY_AMOUNT * 1.5);
        if (deficit > 1 || !room.storage) deficit = 1;
        upgraders.forEach((h) => upgradePower += h.getActiveBodyparts(WORK) * UPGRADE_CONTROLLER_POWER);
        let inBuild = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER)[0];
        if (!inBuild && upgradePower < (ROOM_ENERGY_PER_TICK[room.name]) * ROOM_ENERGY_ALLOTMENT['upgrade'] && upgraders.length < (8 - room.level)) number = upgraders.length + 1;
        if (room.storage && ROOM_ENERGY_INCOME_ARRAY[room.name] && average(JSON.parse(ROOM_ENERGY_INCOME_ARRAY[room.name])) <= 5) number *= deficit;
        if (level >= 4 && number > 2) number = 2;
        if (level < 3) number += 3;
    }
    if (getCreepCount(room, 'upgrader') < number) {
        //If room is about to downgrade get a creep out asap
        let reboot = room.controller.ticksToDowngrade <= CONTROLLER_DOWNGRADE[level] * 0.9 || room.controller.progress > room.controller.progressTotal || Memory.roomCache[room.name].threatLevel >= 3 || room.memory.lowPower;
        queueCreep(room, PRIORITIES.upgrader + getCreepCount(room, 'upgrader') * 0.2, {
            role: 'upgrader',
            other: {reboot: reboot}
        })
    }
};

//Praise room creeps
module.exports.praiseCreepQueue = function (room) {
    let level = getLevel(room);
    cacheCounts(room);
    //Drones
    let inBuild = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD)[0];
    if (inBuild || room.controller.level === 1) {
        let amount = 3;
        if (getCreepCount(room, 'drone') < amount) {
            queueCreep(room, 1 + getCreepCount(room, 'drone'), {role: 'drone', other: {localCache: false}})
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
        queueCreep(room, PRIORITIES.hauler - 1, {role: 'filler', other: {reboot: true, localCache: false}})
    }
    // Local Responder
    if (getCreepCount(room, 'defender') < Memory.roomCache[room.name].threatLevel) {
        queueCreep(room, PRIORITIES.responder, {role: 'defender', other: {responseTarget: room.name}, military: true})
    }
    //Waller
    if (level >= 3 && !getCreepCount(room, 'waller')) {
        queueCreep(room, PRIORITIES.waller, {role: 'waller', other: {localCache: false}})
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

//Non essential creeps
module.exports.miscCreepQueue = function (room) {
    let level = getLevel(room);
    cacheCounts(room);
    //Drones
    if (room.constructionSites.length) {
        let number = 1;
        let nonRoads = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL)[0];
        if (nonRoads && (level < 6 || room.energyState)) number = 10 - level;
        if (getCreepCount(room, 'drone') < number) {
            queueCreep(room, PRIORITIES.drone + (getCreepCount(room, 'drone') * 0.2), {role: 'drone'})
        }
    }
    // Maintenance
    if (!getCreepCount(room, 'maintenance')) {
        queueCreep(room, PRIORITIES.drone, {role: 'maintenance'})
    }
    //Waller
    if (level >= 3 && !getCreepCount(room, 'waller')) {
        queueCreep(room, PRIORITIES.waller, {role: 'waller', other: {localCache: false}})
    }
    // If no conflict detected
    if (!room.nukes.length && !Memory.roomCache[room.name].threatLevel) {
        if (level >= 6) {
            //LabTech
            if (room.terminal && !getCreepCount(room, 'labTech')) {
                queueCreep(room, PRIORITIES.miscHauler, {role: 'labTech', other: {localCache: false}})
            }
            //Power
            if (room.energyState && level === 8 && room.store(RESOURCE_POWER) && _.filter(room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0]) {
                if (!getCreepCount(room, 'powerManager')) {
                    queueCreep(room, PRIORITIES.miscHauler, {role: 'powerManager', other: {localCache: false}})
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
        if (level < 8 && !getCreepCount(room, 'explorer')) {
            queueCreep(room, PRIORITIES.explorer, {role: 'explorer', military: true})
        }
        // Assist room
        if (level >= 3) {
            let safeToSupport = _.filter(Memory.myRooms, (r) => !Memory.roomCache[r] || !Memory.roomCache[r].lastPlayerSighting || Memory.roomCache[r].lastPlayerSighting + 100 < Game.time);
            let needDrones = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && Game.map.getRoomLinearDistance(r, room.name) < 10 && Game.rooms[r].memory.buildersNeeded)));
            if (needDrones) {
                let amount = ROOM_SOURCE_SPACE[needDrones] || 5;
                if (amount < 5) amount = 5;
                if (getCreepCount(room, 'drone', needDrones, true) < amount) {
                    queueCreep(room, PRIORITIES.assistPioneer, {role: 'drone', destination: needDrones});
                }
            }
            if (level >= 6 && room.energyState) {
                // Energy Supplies
                let needEnergy = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && !Game.rooms[r].energyState && !Game.rooms[r].memory.praiseRoom && Game.map.getRoomLinearDistance(r, room.name) < 6 && !Game.rooms[r].terminal)));
                if (needEnergy) {
                    if (!getCreepCount(room, 'fuelTruck', needEnergy, true)) {
                        queueCreep(room, PRIORITIES.fuelTruck, {role: 'fuelTruck', destination: needEnergy});
                    }
                }
                // Power Level
                let upgraderRequested = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && !Game.rooms[r].memory.praiseRoom && Game.rooms[r].controller.level + 1 < level && Game.map.getRoomLinearDistance(r, room.name) < 6)));
                if (upgraderRequested) {
                    if (!getCreepCount(room, 'remoteUpgrader', upgraderRequested, true)) {
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
            if (getCreepCount(room, 'longbow') < count) {
                queueCreep(room, PRIORITIES.borderPatrol + getCreepCount(room, 'borderPatrol'), {
                    role: 'longbow',
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
    if (!room.memory.lastRemoteAttempt) room.memory.lastRemoteAttempt = Game.time;
    if (room.memory.turtleMode && room.memory.turtleMode + 5000 < Game.time) {
        remoteHives[room.name] = undefined;
        return room.memory.turtleMode = undefined;
    } else if (!room.memory.turtleMode && !_.size(remoteHives[room.name])) {
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
            // Handle invaders
            if (Memory.roomCache[remoteName] && (Memory.roomCache[remoteName].invaderCore || Memory.roomCache[remoteName].responseNeeded)) {
                if (Memory.roomCache[remoteName].invaderTTL && Memory.roomCache[remoteName].invaderTTL < Game.time) {
                    if (!getCreepCount(room, 'scout', remoteName)) {
                        queueGlobalCreep(PRIORITIES.priority, {role: 'scout', destination: remoteName, military: true})
                    }
                    continue;
                }
                room.memory.spawnBorderPatrol = remoteName;
                continue;
            }
            // Handle SK
            if (Memory.roomCache[remoteName] && Memory.roomCache[remoteName].sk && level >= 7 && !Memory.roomCache[remoteName].invaderCore && !room.memory.lowPower) {
                skMining = true;
                if (!getCreepCount(room, 'SKAttacker', remoteName)) {
                    queueCreep(room, PRIORITIES.SKWorker + 1, {role: 'SKAttacker', destination: remoteName})
                }
                let sourceCount = Memory.roomCache[remoteName].sources || 1;
                if (getCreepCount(room, 'SKAttacker', remoteName) && room.energyState !== 2 && getCreepCount(room, 'remoteHarvester', remoteName) < sourceCount) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {role: 'remoteHarvester', destination: remoteName})
                }
                if (getCreepCount(room, 'SKAttacker', remoteName) && !getCreepCount(room, 'SKMineral', remoteName) && (!Memory.roomCache[remoteName].mineralCooldown || Memory.roomCache[remoteName].mineralCooldown < Game.time)) {
                    queueCreep(room, PRIORITIES.SKWorker, {role: 'SKMineral', destination: remoteName})
                }
            } else if (!Memory.roomCache[remoteName] || !Memory.roomCache[remoteName].sk) {
                if (!invaderCoreReserved && !room.memory.lowPower) {
                    let sourceCount = Memory.roomCache[remoteName].sources || 1;
                    if (getCreepCount(room, 'remoteHarvester', remoteName, true) < sourceCount) {
                        queueCreep(room, PRIORITIES.remoteHarvester, {role: 'remoteHarvester', destination: remoteName})
                    }
                }
                if (level >= 4 && Memory.roomCache[remoteName] && (!Memory.roomCache[remoteName].reservationExpires || Game.time > Memory.roomCache[remoteName].reservationExpires) && Memory.roomCache[remoteName].sources < 3) {
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
            if (getCreepCount(room, 'remoteHauler') < getCreepCount(room, 'remoteHarvester') * 0.7) {
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
module.exports.globalCreepQueue = function () {
    let targetRooms = Memory.targetRooms;
    let auxiliaryTargets = Memory.auxiliaryTargets;
    let operations = Object.assign(targetRooms, auxiliaryTargets);
    let queue = globalQueue;
    //Marauder
    let marauder = _.filter(Game.creeps, (creep) => creep.memory.operation === 'marauding' && creep.memory.role === 'longbow');
    if (POKE_ATTACKS && marauder.length < 3) {
        queueGlobalCreep(PRIORITIES.secondary, {
            role: 'longbow',
            operation: 'marauding',
            military: true,
            other: {localCache: false}
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
            let scout = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'scout');
            if ((scout.length < 1 || (scout[0] && scout[0].ticksToLive < (scout[0].body.length * 3 + 10) && scout.length < 2))) {
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
                if (!_.filter(Game.creeps, (c) => c.memory.role === 'claimer' && c.memory.destination === key).length) {
                    queueGlobalCreep(PRIORITIES.claimer, {role: 'claimer', destination: key, military: true});
                }
                if (_.filter(Game.creeps, (c) => c.memory.role === 'drone' && c.memory.destination === key).length < 4) {
                    queueGlobalCreep(PRIORITIES.claimer, {role: 'drone', destination: key, military: true});
                }
                break;
            // Scout ops
            case 'claimScout':
            case 'attack':
            case 'scout':
                let scout = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'scout');
                if (!scout.length) {
                    queueGlobalCreep(PRIORITIES.priority, {role: 'scout', destination: key, military: true})
                }
                break;
            case 'commodity': //commodity Mining
                let commodityMiner = _.filter(Game.creeps, (creep) => creep.memory.role === 'commodityMiner' && creep.memory.destination === key);
                let amount = 2;
                if ((commodityMiner.length < amount || (commodityMiner[0] && commodityMiner[0].ticksToLive < (commodityMiner[0].body.length * 3 + 100) && commodityMiner.length < amount + 1))) {
                    queueGlobalCreep(PRIORITIES.Power, {role: 'commodityMiner', destination: key, military: true})
                }
                let commodityHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'commodityHauler' && creep.memory.destination === key);
                if (!commodityHauler.length) {
                    queueGlobalCreep(PRIORITIES.Power - 1, {role: 'commodityHauler', destination: key, military: true})
                }
                break;
            case 'power': //Power Mining
                let powerSpace = operations[key].space || 2;
                let powerHealer = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerHealer' && creep.memory.destination === key);
                let powerAttacker = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerAttacker' && creep.memory.destination === key);
                if (!operations[key].complete && !_.includes(queue, 'powerHealer') && (powerHealer.length < powerAttacker.length + 1 || (powerHealer[0] && powerHealer[0].ticksToLive < (powerHealer[0].body.length * 3 + 250) && powerHealer.length < (powerAttacker.length + 1) + 1))) {
                    queueGlobalCreep(PRIORITIES.Power, {role: 'powerHealer', destination: key, military: true})
                }
                if (!operations[key].complete && !_.includes(queue, 'powerAttacker') && (powerAttacker.length < powerSpace || (powerAttacker[0] && powerAttacker[0].ticksToLive < (powerAttacker[0].body.length * 3 + 250) && powerAttacker.length < powerSpace + 1))) {
                    queueGlobalCreep(PRIORITIES.Power - 1, {role: 'powerAttacker', destination: key, military: true})
                }
                let powerHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerHauler' && creep.memory.destination === key);
                if (operations[key].hauler && !_.includes(queue, 'powerHauler') && powerHauler.length < operations[key].hauler) {
                    queueGlobalCreep(PRIORITIES.Power - 1, {role: 'powerHauler', destination: key, military: true})
                }
                break;
            case 'hold': //Hold Room
                let unClaimerNeeded = operations[key].claimAttacker;
                let cleanerNeeded = operations[key].cleaner;
                let longbows = 1;
                if (opLevel > 1) longbows = opLevel;
                let longbow = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'longbow' && creep.memory.operation === 'hold');
                if ((longbow.length < longbows || (longbow[0] && longbow[0].ticksToLive < (longbow[0].body.length * 3 + 50) && longbow.length < longbows + 1))) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'hold',
                        military: true
                    })
                }
                let claimAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'claimAttacker' && creep.memory.operation === 'hold');
                if (unClaimerNeeded && (claimAttacker.length < 1 || (claimAttacker[0] && claimAttacker[0].ticksToLive < (claimAttacker[0].body.length * 3 + 10) && claimAttacker.length < 2)) && longbow.length) {
                    queueGlobalCreep(priority, {
                        role: 'claimAttacker',
                        destination: key,
                        operation: 'hold',
                        military: true
                    })
                }
                let holdCleaner = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'deconstructor');
                if (cleanerNeeded && holdCleaner.length < 1) {
                    queueGlobalCreep(priority, {
                        role: 'deconstructor',
                        destination: key,
                        operation: 'hold',
                        military: true
                    })
                }
                break;
            case 'siegeGroup': //Siege Group
                let siegeEngines = 1;
                let healers = 2;
                let siegeEngine = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'siegeEngine' && creep.memory.operation === 'siegeGroup');
                let healer = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'healer' && creep.memory.operation === 'siegeGroup');
                if (healer.length && (siegeEngine.length < siegeEngines || (siegeEngine[0] && siegeEngine[0].ticksToLive < (siegeEngine[0].body.length * 3 + 50) && siegeEngine.length < siegeEngines + 1))) {
                    queueGlobalCreep(priority - 1, {
                        role: 'siegeEngine',
                        destination: key,
                        operation: 'siegeGroup',
                        military: true
                    })
                }
                if ((healer.length < healers || (healer[0] && healer[0].ticksToLive < (healer[0].body.length * 3 + 50) && healer.length < healers + 1))) {
                    queueGlobalCreep(priority, {
                        role: 'healer',
                        destination: key,
                        operation: 'siegeGroup',
                        military: true,
                        other: {boostCheck: 'heal'}
                    })
                }
                break;
            case 'clean': //Room Cleaning
                let deconstructors = 1;
                if (opLevel === 1 || TEN_CPU) {
                    deconstructors = 1;
                } else if (opLevel === 2) {
                    deconstructors = 2;
                } else if (opLevel === 3) {
                    deconstructors = 3;
                }
                let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'deconstructor');
                if (deconstructor.length < deconstructors) {
                    queueGlobalCreep(priority, {
                        role: 'deconstructor',
                        destination: key,
                        operation: 'clean',
                        military: true
                    })
                }
                break;
            case 'claimClear': //Claim Clearing
                let claimClear = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'claimer');
                if (!claimClear.length && !_.includes(queue, 'claimer')) {
                    queueGlobalCreep(priority, {
                        role: 'claimer',
                        destination: key,
                        operation: 'claimClear',
                        military: true
                    })
                }
                break;
            case 'drain': // Drain
                let drainers = 0;
                if (opLevel === 1) {
                    drainers = 1;
                } else if (opLevel === 2) {
                    drainers = 2;
                } else if (opLevel >= 3) {
                    drainers = 3;
                }
                let drainer = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'drainer');
                if ((drainer.length < drainers || (drainer[0] && drainer[0].ticksToLive < (drainer[0].body.length * 3 + 50) && drainer.length < drainers + 1))) {
                    queueGlobalCreep(priority, {
                        role: 'drainer',
                        destination: key,
                        operation: 'drain',
                        military: true,
                        other: {boostCheck: 'heal'}
                    })
                }
                break;
            case 'siege': // Siege
                let siegeCreep = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'siegeEngine');
                let siegeHealer = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'siegeHealer');
                if (opLevel > 2) opLevel = 2;
                if (siegeCreep.length < siegeHealer.length) {
                    queueGlobalCreep(priority - 1, {
                        role: 'siegeEngine',
                        destination: key,
                        operation: 'siege',
                        military: true,
                        other: {
                            waitFor: opLevel * 2
                        }
                    })
                }
                if (siegeHealer.length < opLevel) {
                    queueGlobalCreep(priority, {
                        role: 'siegeHealer',
                        destination: key,
                        operation: 'siege',
                        military: true,
                        other: {
                            waitFor: opLevel * 2,
                            boostCheck: 'heal'
                        },
                    })
                }
                break;
            case 'rangers': // Rangers
                let number = 2;
                if (opLevel > 1) number = 3;
                let rangers = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'longbow' && creep.memory.operation === 'rangers');
                if (rangers.length < number || (rangers[0] && rangers[0].ticksToLive < (rangers[0].body.length * 3 + 10) && rangers.length < number + 1)) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'rangers',
                        military: true,
                        other: {
                            waitFor: 2
                        },
                    })
                }
                let rangerUnClaimer = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'claimAttacker' && creep.memory.operation === 'rangers');
                if (operations[key].claimAttacker && rangerUnClaimer.length < 1 || (rangerUnClaimer[0] && rangerUnClaimer[0].ticksToLive < (rangerUnClaimer[0].body.length * 3 + 10) && rangerUnClaimer.length < 2)) {
                    queueGlobalCreep(priority, {
                        role: 'claimAttacker',
                        destination: key,
                        operation: 'rangers',
                        military: true
                    })
                }
                break;
            case 'guard': // Room Guard
                let guards = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'longbow' && creep.memory.operation === 'guard');
                if (guards.length < opLevel) {
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
    let roomName = room.name;
    if (room.energyState && !room.memory.nuke && _.size(globalQueue) && !Memory.roomCache[roomName].responseNeeded && _.inRange(level, maxLevel - 1, maxLevel + 1) && !room.memory.lowPower) {
        // Filter ops by range
        let range = LOCAL_SPHERE * 2;
        if (room.energyState) range = LOCAL_SPHERE * 4;
        let distanceFilteredGlobal = _.filter(globalQueue, (q) => !q.destination || Memory.auxiliaryTargets[q.destination] || Game.map.getRoomLinearDistance(q.destination, roomName) < range || Memory.roomCache[q.destination].owner === MY_USERNAME);
        queue = _.sortBy(Object.assign({}, distanceFilteredGlobal, roomQueue[roomName]), 'priority');
    } else if (_.size(roomQueue[roomName])) {
        queue = _.sortBy(roomQueue[roomName], 'priority')
    } else {
        // If queue is empty go to next room
        return;
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

function cacheCounts(room, force = undefined) {
    if (!roomCreepCount[room.name] || roomCreepCount[room.name].tick + 50 < Game.time || force) {
        roomCreepCount[room.name] = {};
        roomCreepTTL[room.name] = {};
        let roomCreeps = _.filter(Game.creeps, (r) => r.my && (r.memory.overlord === room.name || r.memory.destination === room.name) && r.memory.role);
        for (let creep of roomCreeps) {
            let destination = creep.memory.destination || 'none';
            if (!roomCreepCount[room.name][creep.memory.role]) roomCreepCount[room.name][creep.memory.role] = {};
            if (!roomCreepCount[room.name][creep.memory.role][destination]) roomCreepCount[room.name][creep.memory.role][destination] = 0;
            roomCreepCount[room.name][creep.memory.role][destination]++;
            if (!roomCreepTTL[room.name][creep.memory.role] || roomCreepTTL[room.name][creep.memory.role] > creep.ticksToLive) roomCreepTTL[room.name][creep.memory.role] = creep.ticksToLive;
        }
        roomCreepCount[room.name].tick = Game.time;
        return roomCreepCount[room.name];
    } else {
        return roomCreepCount[room.name];
    }
}

function getCreepCount(room, role, destination, all = false) {
    if (!all) {
        let creepData = cacheCounts(room);
        if (!creepData[role]) return 0;
        if (!destination) return _.sum(creepData[role]) || 0;
        return creepData[role][destination] || 0;
    } else {
        let count = 0;
        for (let room of Memory.myRooms) {
            let activeRoom = Game.rooms[room];
            let creepData = cacheCounts(activeRoom);
            if (!creepData[role]) continue;
            count += creepData[role][destination] || 0;
        }
        return count;
    }
}