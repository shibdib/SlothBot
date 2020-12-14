/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let generator = require('module.bodyGenerator');
let roomQueue = {};
let nextPoke, BORDER_PATROL_NEEDED;
let globalQueue = {};
let energyOrder = {};
let orderStored = {};
let storedLevel = {};
let remoteHives = {};
let lastBuilt = {};
let creepCount = {};
let creepTTL = {};
let lastGlobalSpawn = Game.time;

//Build Creeps From Queue
module.exports.processBuildQueue = function (room) {
    // Display Queues
    displayQueue(room.name);
    let activeSpawns = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.spawning);
    for (let spawn of activeSpawns) {
        let spawningCreep = Game.creeps[spawn.spawning.name];
        spawn.say(ICONS.build + ' ' + _.capitalize(spawningCreep.name.split("_")[0]) + ' - Ticks: ' + spawn.spawning.remainingTime);
    }
    // Clear queue if something is stuck
    if (lastBuilt[room.name] && roomQueue[room.name] && (lastBuilt[room.name] + 2000 < Game.time)) {
        log.a('Queue reset due to timeout.', room.name);
        roomQueue[room.name] = undefined;
        globalQueue = undefined;
        lastBuilt[room.name] = Game.time;
        return;
    }
    // Check for free spawns
    let availableSpawn = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning && s.isActive())[0];
    if (availableSpawn) {
        let body, role, queue, cost, queuedBuild;
        let level = room.level;
        // Filter ops by range
        let range = LOCAL_SPHERE * 2;
        if (room.energyState) range = LOCAL_SPHERE * 4;
        // Global queue, if far away or lacking energy it's low priority
        let combatQueue = globalQueue;
        if (_.size(combatQueue) && !Memory.roomCache[room.name].threatLevel && _.inRange(room.level, Memory.maxLevel - 1, Memory.maxLevel + 1)) {
            Object.keys(combatQueue).forEach(function (q) {
                if (!combatQueue[q].destination || combatQueue[q].operation === 'guard' || Memory.auxiliaryTargets[combatQueue[q].destination] || (Memory.roomCache[combatQueue[q].destination] && Memory.roomCache[combatQueue[q].destination].owner === MY_USERNAME)) return;
                let distance = Game.map.getRoomLinearDistance(combatQueue[q].destination, room.name);
                if (distance > range && room.energyState) combatQueue[q].priority = PRIORITIES.secondary; else if (!room.energyState) delete combatQueue[q];
            })
            queue = _.sortBy(Object.assign({}, combatQueue, roomQueue[room.name]), 'priority');
        } else if (_.size(roomQueue[room.name])) {
            queue = _.sortBy(Object.assign({}, roomQueue[room.name]), 'priority');
        }
        if (!queue) return;
        // Pick build target
        for (let topPriority of queue) {
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
            body = generator.bodyGenerator(level, role, room, topPriority);
            if (!body || !body.length) continue;
            // Add a distance sanity check for claim parts
            if (topPriority.destination && (Game.map.findRoute(topPriority.destination, room.name).length > 23 || (_.includes(body, CLAIM) && Game.map.findRoute(topPriority.destination, room.name).length > 12))) continue;
            // Stop loop if we just can't afford it yet
            cost = global.UNIT_COST(body);
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) return;
            // If it's not something we can afford, continue
            if (cost > room.energyCapacityAvailable) continue;
            queuedBuild = topPriority;
            break;
        }
        if (queuedBuild) {
            determineEnergyOrder(room);
            if (typeof queuedBuild === 'object') {
                _.defaults(queuedBuild, {
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
                if (queuedBuild.operation) name = _.uniqueId(queuedBuild.operation + '_' + availableSpawn.room.name + '_T' + level + '_');
                let energyStructures;
                if (energyOrder[availableSpawn.room.name]) energyStructures = JSON.parse(energyOrder[availableSpawn.room.name]);
                switch (availableSpawn.spawnCreep(body, name, {
                    memory: {
                        born: Game.time,
                        role: role,
                        overlord: availableSpawn.room.name,
                        assignedSource: queuedBuild.assignedSource,
                        destination: queuedBuild.destination,
                        other: queuedBuild.other,
                        military: queuedBuild.military,
                        operation: queuedBuild.operation,
                        misc: queuedBuild.misc
                    },
                    energyStructures: energyStructures
                })) {
                    case OK:
                        lastGlobalSpawn = Game.time;
                        lastBuilt[availableSpawn.room.name] = Game.time;
                        if (!queuedBuild.operation) log.d(availableSpawn.room.name + ' Spawning a ' + role);
                        if (queuedBuild.military && globalQueue[role]) delete globalQueue[role];
                        if (queuedBuild.buildCount && roomQueue[availableSpawn.room.name][role]) return roomQueue[availableSpawn.room.name][role].buildCount = queuedBuild.buildCount - 1;
                        if (roomQueue[availableSpawn.room.name]) delete roomQueue[availableSpawn.room.name][role];
                        return;
                    case ERR_NOT_ENOUGH_ENERGY:
                        energyOrder[availableSpawn.room.name] = undefined;
                        return;
                    default:
                        availableSpawn.say(availableSpawn.spawnCreep(body, name, {
                            memory: {
                                born: Game.time,
                                role: role,
                                overlord: availableSpawn.room.name,
                                assignedSource: queuedBuild.assignedSource,
                                destination: queuedBuild.destination,
                                other: queuedBuild.other,
                                military: queuedBuild.military,
                                operation: queuedBuild.operation,
                                misc: queuedBuild.misc
                            },
                            energyStructures: energyStructures
                        }))
                        return;
                }
            }
        }
    }
};

//First Room Startup
module.exports.roomStartup = function (room) {
    if (getCreepCount(room, 'drone') < 12) {
        queueCreep(room, 1 + getCreepCount(room, 'drone'), {
            role: 'drone',
            other: {reboot: room.friendlyCreeps.length <= 3}
        })
    }
    if (getCreepCount(room, 'stationaryHarvester') < 2) {
        let reboot = !getCreepCount(room, 'stationaryHarvester') || room.friendlyCreeps.length < 5 || undefined;
        queueCreep(room, 3, {
            role: 'stationaryHarvester',
            other: {
                noBump: true,
                reboot: reboot
            }
        })
    }
    if (getCreepCount(room, 'stationaryHarvester') && !getCreepCount(room, 'hauler')) {
        queueCreep(room, 2, {role: 'hauler'})
    }
    if (Memory.roomCache[room.name].threatLevel && !getCreepCount(room, 'defender')) {
        queueCreep(room, 2, {role: 'defender'})
    }
    if (Memory.maxLevel < 8 && getCreepCount(room, 'explorer') < 2) {
        queueCreep(room, 4, {role: 'explorer'})
    }
};

//Essential creeps
module.exports.essentialCreepQueue = function (room) {
    //Static room info
    let level = getLevel(room);
    //Harvesters
    if (getCreepCount(room, 'stationaryHarvester') < room.sources.length || (getCreepTTL(room, 'stationaryHarvester') < 100 && getCreepCount(room, 'stationaryHarvester') === room.sources.length)) {
        let priority = PRIORITIES.stationaryHarvester;
        if (!getCreepCount(room, 'stationaryHarvester')) priority = 1;
        let reboot = !getCreepCount(room, 'stationaryHarvester') || room.friendlyCreeps.length < 5 || undefined;
        queueCreep(room, priority, {
            role: 'stationaryHarvester',
            other: {
                noBump: true,
                reboot: reboot
            }
        });
    }
    //Haulers
    if (getCreepCount(room, 'stationaryHarvester')) {
        let amount = 2;
        if (getCreepCount(room, 'hauler') < amount || (getCreepTTL(room, 'hauler') < 250 && getCreepCount(room, 'hauler') === amount)) {
            queueCreep(room, PRIORITIES.hauler + getCreepCount(room, 'hauler'), {
                role: 'hauler',
                other: {reboot: getCreepCount(room, 'hauler') < 1 || room.friendlyCreeps.length < 5}
            });
        }
    }
    // Local Responder
    if (Memory.roomCache[room.name].threatLevel >= 3) {
        if (getCreepCount(room, 'defender') < Memory.roomCache[room.name].numberOfHostiles || (getCreepTTL(room, 'defender') < 100 && getCreepCount(room, 'defender') === Memory.roomCache[room.name].numberOfHostiles)) {
            queueCreep(room, PRIORITIES.responder, {
                role: 'defender',
                other: {responseTarget: room.name},
                military: true
            })
        }
    }
    // Upgrader
    // Determine amount
    let number = 0;
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    if (level === 8) number = 1;
    else if (controllerContainer) {
        if (room.storage) number += _.floor(room.energy / 10000) || 1; else number += _.floor(room.energy / 250) || 1;
    } else number = (7 - level);
    if (room.memory.controllerLink && number > 2) number = 2; else if (level >= 3 && number > 4) number = 4;
    if (getCreepCount(room, 'upgrader') < number) {
        //If room is about to downgrade get a creep out asap
        let reboot = room.controller.ticksToDowngrade <= CONTROLLER_DOWNGRADE[level] * 0.9 || room.controller.progress > room.controller.progressTotal || Memory.roomCache[room.name].threatLevel >= 3 || room.memory.lowPower;
        let priority = PRIORITIES.upgrader + getCreepCount(room, 'upgrader');
        if (reboot) priority = 2;
        queueCreep(room, priority, {
            role: 'upgrader',
            other: {noBump: true, reboot: reboot}
        })
    }
};

//Non essential creeps
module.exports.miscCreepQueue = function (room) {
    let level = getLevel(room);
    //Drones
    if (_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL)[0]) {
        let number = 0;
        if (room.storage) number += _.floor(room.energy / 5000) || 1; else number += _.floor(room.energy / 250) || 1;
        if (getCreepCount(room, 'drone') < number) {
            queueCreep(room, PRIORITIES.drone + getCreepCount(room, 'drone'), {
                role: 'drone',
                other: {reboot: room.friendlyCreeps.length <= 3}
            })
        }
    }
    // Maintenance
    if (!getCreepCount(room, 'maintenance')) {
        queueCreep(room, PRIORITIES.drone, {role: 'maintenance'})
    }
    // Waller
    if (!getCreepCount(room, 'waller')) {
        queueCreep(room, PRIORITIES.waller, {role: 'waller'})
    }
    // Score delivery
    if (Game.shard.name === 'shardSeason' && room.store(RESOURCE_SCORE) && !getCreepCount(room, 'scoreHauler')) {
        let scoreRoom = _.filter(Memory.roomCache, (r) => r.seasonCollector === 1 && Game.map.getRoomLinearDistance(r.name, room.name) <= 20 && !r.hostile)[0]
        if (scoreRoom) {
            queueCreep(room, PRIORITIES.drone, {role: 'scoreHauler', misc: true})
        }
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
                        other: {noBump: true, assignedMineral: room.mineral.id}
                    })
                }
            }
        }
        //Pre observer spawn explorers
        if (Memory.maxLevel < 8 && _.filter(Game.creeps, (c) => c.my && c.memory.role === 'explorer').length < 8) {
            queueCreep(room, PRIORITIES.explorer, {role: 'explorer'})
        }
        // Portal explorers
        let localPortal = _.filter(Memory.roomCache, (r) => r.portal && Game.map.getRoomLinearDistance(r.name, room.name) <= 5);
        if (localPortal.length) {
            let destination = _.sample(localPortal).name;
            if (!_.filter(Game.creeps, (c) => c.my && c.memory.role === 'explorer' && c.memory.other && c.memory.other.portalForce === destination).length) {
                queueCreep(room, PRIORITIES.explorer, {
                    role: 'explorer',
                    destination: destination,
                    military: true,
                    other: {portalForce: destination}
                })
            }
        }
        // Assist room
        if (level >= 3) {
            let safeToSupport = _.filter(Memory.myRooms, (r) => !Memory.roomCache[r] || !Memory.roomCache[r].lastPlayerSighting || Memory.roomCache[r].lastPlayerSighting + 100 < Game.time);
            let needDrones = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && Game.map.getRoomLinearDistance(r, room.name) < 10 && Game.rooms[r].memory.buildersNeeded)));
            if (needDrones) {
                let amount = ROOM_SOURCE_SPACE[needDrones] + 5 || 7;
                if (amount < 7) amount = 7;
                if (getCreepCount(undefined, 'drone', needDrones) < amount) {
                    queueCreep(room, PRIORITIES.assistPioneer + (getCreepCount(room, 'drone', needDrones) * 0.5), {
                        role: 'drone',
                        destination: needDrones
                    });
                }
                if (Memory.maxLevel === room.level && getCreepCount(undefined, 'longbow', needDrones) < 2) {
                    queueCreep(room, PRIORITIES.assistPioneer + getCreepCount(undefined, 'longbow', needDrones), {
                        role: 'longbow',
                        military: true,
                        other: {responseTarget: needDrones}
                    });
                }
            }
            if (level >= 6 && room.energyState && Memory.maxLevel === room.level) {
                // Energy Supplies
                let needEnergy = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && !Game.rooms[r].energyState && Game.rooms[r].level < 6 && !Game.rooms[r].terminal)));
                if (needEnergy) {
                    if (!getCreepCount(room, 'fuelTruck', needEnergy)) {
                        queueCreep(room, PRIORITIES.fuelTruck, {role: 'fuelTruck', destination: needEnergy});
                    }
                }
                // Power Level
                let upgraderRequested = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && Game.rooms[r].controller.level <= 3)));
                if (upgraderRequested) {
                    if (!getCreepCount(room, 'remoteUpgrader', upgraderRequested)) {
                        queueCreep(room, PRIORITIES.remoteUpgrader, {
                            role: 'remoteUpgrader',
                            destination: upgraderRequested
                        })
                    }
                }
            }
            //Border Patrol
            if (room.memory.borderPatrol) {
                if (!getCreepCount(room, 'longbow', undefined, 'borderPatrol')) {
                    queueCreep(room, PRIORITIES.high, {
                        role: 'longbow',
                        operation: 'borderPatrol',
                        military: true,
                        other: {responseTarget: room.memory.borderPatrol}
                    });
                } else {
                    room.memory.borderPatrol = undefined;
                }
            }
        }
    }
};

//Remote creeps
let centerRoom = {};
module.exports.remoteCreepQueue = function (room) {
    if (room.memory.noRemote && room.memory.noRemote > Game.time) return;
    if (!Memory.roomCache) Memory.roomCache = {};
    room.memory.remoteRange = undefined;
    let level = getLevel(room);
    if (!remoteHives[room.name] || Math.random() > 0.5) {
        // Clean old Remotes
        remoteHives[room.name] = undefined;
        // Find rooms around you using roomCache with remote possibilities
        let sourceCount = 0;
        let adjacent = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && !Memory.roomCache[r].isHighway && Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status &&
            (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME || Memory.roomCache[r].user === 'Source Keeper' || Memory.roomCache[r].user === 'Invader') &&
            (!Memory.roomCache[r].owner || Memory.roomCache[r].invaderCore) && !Memory.roomCache[r].level);
        // Handle SK middle room
        /**
         if (level >= 7 && _.filter(adjacent, (r) => Memory.roomCache[r] && Memory.roomCache[r].sk).length) {
            let skAdjacent = _.filter(adjacent, (r) => Memory.roomCache[r] && Memory.roomCache[r].sk)[0];
            let middleRoom = _.filter(Game.map.describeExits(skAdjacent), (r) => Memory.roomCache[r] && Memory.roomCache[r].sources >= 3 && !Memory.roomCache[r].sk)[0];
            if (middleRoom) adjacent.push(middleRoom);
        }**/
        // Handle highway dead-end
        if (!adjacent.length) {
            let highway = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && !Memory.roomCache[r].owner && Memory.roomCache[r].isHighway);
            if (highway.length) {
                adjacent = _.filter(Game.map.describeExits(highway[0]), (r) => Memory.roomCache[r] && !Memory.roomCache[r].isHighway && (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && !Memory.roomCache[r].owner && (!Memory.roomCache[r].roomHeat || Memory.roomCache[r].roomHeat < 2000));
            }
        }
        if (adjacent.length) adjacent.forEach((r) => sourceCount += Memory.roomCache[r].sources || 1);
        // Handle less than desired
        if (sourceCount < 8) {
            let secondary = [];
            for (let adjacentRoom of adjacent) {
                let secondaryAdjacent = _.filter(Game.map.describeExits(adjacentRoom), (r) => Memory.roomCache[r] && Memory.roomCache[r].sources &&
                    (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status &&
                    !Memory.roomCache[r].owner && !Memory.roomCache[r].sk && Memory.roomCache[r].closestRoom === room.name && _.filter(Memory.roomCache[r].sourceRating, (s) => s <= 150).length);
                if (secondaryAdjacent.length) secondary = secondary.concat(secondaryAdjacent);
            }
            if (secondary.length) {
                secondary.forEach((r) => sourceCount += Memory.roomCache[r].sources || 1);
                adjacent = adjacent.concat(secondary);
            }
            if (sourceCount < 8) {
                for (let adjacentRoom of adjacent) {
                    let secondaryAdjacent = _.filter(Game.map.describeExits(adjacentRoom), (r) => Memory.roomCache[r] &&
                        Memory.roomCache[r].sources && (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status &&
                        !Memory.roomCache[r].owner && !Memory.roomCache[r].sk && Memory.roomCache[r].closestRoom === room.name && _.filter(Memory.roomCache[r].sourceRating, (s) => s <= 150).length);
                    if (secondaryAdjacent.length) secondary = secondary.concat(secondaryAdjacent);
                }
                if (secondary.length) adjacent = adjacent.concat(secondary);
            }
        }
        if (adjacent.length) {
            room.memory.remoteSourceCount = sourceCount;
            remoteHives[room.name] = JSON.stringify(_.uniq(adjacent));
        }
    }
    //Remotes
    let remotes;
    if (remoteHives[room.name] && JSON.parse(remoteHives[room.name]).length) {
        room.memory.spawnBorderPatrol = undefined;
        remotes = JSON.parse(remoteHives[room.name]);
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
            if (!invaderCoreReserved && Memory.roomCache[remoteName] && Memory.roomCache[remoteName].reservation && Memory.roomCache[remoteName].reservation !== MY_USERNAME) continue;
            // Handle invaders  || Memory.roomCache[remoteName].roomHeat > 150
            if ((Memory.roomCache[remoteName].invaderCore || Memory.roomCache[remoteName].threatLevel) && !Memory.roomCache[remoteName].sk) {
                if (Memory.roomCache[remoteName].invaderTTL && Memory.roomCache[remoteName].invaderTTL < Game.time) {
                    if (!getCreepCount(room, 'scout', remoteName)) {
                        queueCreep(room, PRIORITIES.high, {role: 'scout', destination: remoteName})
                    }
                    continue;
                }
                if (Memory.roomCache[remoteName].invaderCore && !getCreepCount(room, 'attacker', remoteName)) {
                    queueCreep(room, PRIORITIES.high, {role: 'attacker', destination: remoteName})
                }
                BORDER_PATROL_NEEDED = true;
                room.memory.borderPatrol = remoteName;
                continue;
            }
            // Handle rooms in between being under attack
            if (!room.routeSafe(remoteName)) continue;
            // Handle obstructed rooms
            /**if (Memory.roomCache[remoteName].obstructions) {
                if (!getCreepCount(room, 'deconstructor', remoteName)) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {role: 'deconstructor', destination: remoteName})
                }
            }**/
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
                if (!invaderCoreReserved) {
                    let sourceCount = _.filter(Memory.roomCache[remoteName].sourceRating, (s) => s <= 125).length || 0;
                    if (getCreepCount(room, 'remoteHarvester', remoteName) < sourceCount) {
                        queueCreep(room, PRIORITIES.remoteHarvester, {
                            role: 'remoteHarvester',
                            destination: remoteName
                        })
                    }
                }
                if (level >= 4 && !Memory.roomCache[remoteName].obstructions && (!Memory.roomCache[remoteName].reservationExpires || Game.time > Memory.roomCache[remoteName].reservationExpires) && Memory.roomCache[remoteName].sources < 3) {
                    let amount = Memory.roomCache[remoteName].reserverCap + 1 || 1;
                    if (Memory.roomCache[remoteName].reservation && amount > 2) amount = 2;
                    if (getCreepCount(room, 'reserver', remoteName) < amount) {
                        queueCreep(room, PRIORITIES.reserver + getCreepCount(room, 'reserver', remoteName), {
                            role: 'reserver',
                            destination: remoteName
                        })
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
        // Haulers
        if (getCreepCount(room, 'remoteHarvester')) {
            // Remote Hauler (determined based on range)
            let harvesters = _.filter(Game.creeps, (c) => c.my && c.memory.overlord === room.name && c.memory.role === 'remoteHarvester' && c.memory.carryAmountNeeded);
            for (let creep of harvesters) {
                let assignedHaulers = _.filter(Game.creeps, (c) => c.my && c.memory.misc === creep.id);
                let current = 0;
                if (assignedHaulers.length) {
                    assignedHaulers.forEach((c) => current += c.store.getCapacity())
                    if (current >= creep.memory.carryAmountNeeded || assignedHaulers.length >= 2) continue;
                }
                queueCreep(room, PRIORITIES.remoteHauler, {
                    role: 'remoteHauler',
                    misc: creep.id
                })
                break;
            }
            // Remote Road Builder
            if (!getCreepCount(room, 'roadBuilder')) {
                queueCreep(room, PRIORITIES.roadBuilder, {
                    role: 'roadBuilder',
                    misc: remoteHives[room.name]
                })
            }
        }
        // Mineral mining center rooms
        if (room.level >= 4) {
            if (!centerRoom[room.name]) {
                if (_.filter(Memory.roomCache, (r) => !r.sk && r.sources >= 3 && Game.map.getRoomLinearDistance(room.name, r.name) <= 4)[0]) {
                    centerRoom[room.name] = _.filter(Memory.roomCache, (r) => !r.sk && r.sources >= 3 && Game.map.getRoomLinearDistance(room.name, r.name) <= 4)[0].name;
                }
            } else {
                if (getCreepCount(room, 'SKMineral', centerRoom[room.name]) < 3 && Memory.roomCache[centerRoom[room.name]] && (!Memory.roomCache[centerRoom[room.name]].user || Memory.roomCache[centerRoom[room.name]].user === MY_USERNAME) && (!Memory.roomCache[centerRoom[room.name]].mineralCooldown || Memory.roomCache[centerRoom[room.name]].mineralCooldown < Game.time)) {
                    queueCreep(room, PRIORITIES.medium, {role: 'SKMineral', destination: centerRoom[room.name]})
                }
            }
        }
        // Border Patrol if enemies exist
        if (Memory._enemies.length && !getCreepCount(room, 'longbow', undefined, 'borderPatrol')) {
            queueCreep(room, PRIORITIES.secondary, {
                role: 'longbow',
                operation: 'borderPatrol',
                military: true,
                other: {}
            });
        }
    }
};

//Military creeps
module.exports.globalCreepQueue = function () {
    if (Math.random() > 0.75) return;
    let blank = {};
    let operations = Object.assign(blank, Memory.targetRooms, Memory.auxiliaryTargets);
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
        //Marauder
        if (OFFENSIVE_OPERATIONS && POKE_ATTACKS) {
            if (getCreepCount(undefined, 'longbow', undefined, 'marauding') < 2) {
                queueGlobalCreep(PRIORITIES.secondary, {
                    role: 'longbow',
                    operation: 'marauding',
                    military: true
                });
                if (POKE_ATTACKS && (!nextPoke || nextPoke < Game.time) && getCreepCount(undefined, 'poke', undefined, 'marauding') < 2) {
                    nextPoke = Game.time + (_.random(1200, 4500));
                    queueGlobalCreep(PRIORITIES.secondary, {
                        role: 'poke',
                        operation: 'marauding',
                        military: true
                    });
                }
            }
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
        // Guard requests
        if (operations[key].guard && (!getCreepCount(undefined, 'longbow', key) || (getCreepTTL(key, 'longbow') < 500 && getCreepCount(undefined, 'longbow', key) === 1))) {
            queueGlobalCreep(priority, {role: 'longbow', destination: key, military: true});
        }
        switch (operations[key].type) {
            // Scoring
            case 'score':
                if (!getCreepCount(undefined, 'scoreHauler', key)) {
                    queueGlobalCreep(priority, {role: 'scoreHauler', destination: key, military: true});
                }
                break;
            case 'scoreCleaner': // Score Cleaning
                if (!getCreepCount(undefined, 'deconstructor', key) || (getCreepTTL(key, 'deconstructor') < 100 && getCreepCount(undefined, 'deconstructor', key) === 1)) {
                    queueGlobalCreep(PRIORITIES.high, {role: 'deconstructor', destination: key, military: true})
                }
                break;
            // Claiming
            case 'claim':
                if (!getCreepCount(undefined, 'claimer', key)) {
                    queueGlobalCreep(PRIORITIES.claimer, {role: 'claimer', destination: key, military: true});
                } else if (getCreepCount(undefined, 'drone', key) < 4) {
                    queueGlobalCreep(PRIORITIES.claimer, {role: 'drone', destination: key, military: true});
                }
                break;
            // Scout ops
            case 'attack':
            case 'scout':
                if (!getCreepCount(undefined, 'scout', key)) {
                    queueGlobalCreep(PRIORITIES.priority, {role: 'scout', destination: key, military: true})
                }
                break;
            case 'commodity': // Commodity Mining
                if (!getCreepCount(undefined, 'commodityMiner', key)) {
                    queueGlobalCreep(PRIORITIES.Power, {role: 'commodityMiner', destination: key, military: true})
                }
                break;
            case 'robbery': // Robbery
                if (getCreepCount(undefined, 'robber', key) < 2) {
                    queueGlobalCreep(PRIORITIES.Power, {role: 'robber', destination: key, military: true})
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
                if (getCreepCount(undefined, 'longbow', key) < 2) {
                    queueGlobalCreep(priority - getCreepCount(undefined, 'longbow', key), {
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
                    if (getCreepCount(undefined, 'deconstructor', key) < 2) {
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
                if (getCreepCount(undefined, 'longbow', key) < 2) {
                    queueGlobalCreep(priority - getCreepCount(undefined, 'longbow', key), {
                        role: 'longbow',
                        destination: key,
                        operation: 'siegeGroup',
                        military: true
                    })
                }
                if (operations[key].cleaner) {
                    if (getCreepCount(undefined, 'deconstructor', key) < 2) {
                        queueGlobalCreep(priority, {
                            role: 'deconstructor',
                            destination: key,
                            operation: 'siegeGroup',
                            military: true
                        })
                    }
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
                if (getCreepCount(undefined, 'drainer', key) < 2) {
                    queueGlobalCreep(priority, {
                        role: 'drainer',
                        destination: key,
                        operation: 'drain',
                        military: true
                    })
                }
                break;
            case 'guard': // Room Guard
                if (getCreepCount(undefined, 'longbow', key) < 2 || (getCreepTTL(key, 'longbow') < 750 && getCreepCount(undefined, 'longbow', key) === 2)) {
                    queueGlobalCreep(PRIORITIES.priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'guard',
                        military: true
                    })
                }
                break;
            case 'swarm': // Swarm
                if (getCreepCount(undefined, 'poke', key)) {
                    queueGlobalCreep(PRIORITIES.priority, {
                        role: 'poke',
                        destination: key,
                        operation: 'swarm',
                        military: true,
                        other: {waitFor: 75}
                    })
                }
                break;
        }
    }
};

/**
 *
 * @param room - Room object for room creeps
 * @param priority - Spawn Priority
 * @param options - Creep spawn options object
 * @param military - If military creep
 * @returns {*|number}
 */
function queueCreep(room, priority, options = {}, military = false) {
    let cache;
    if (!military) {
        cache = roomQueue[room.name] || {};
        if (cache[options.role] && cache[options.role].priority <= priority && (!options.other || !options.other.reboot)) return;
    } else {
        cache = globalQueue || {};
        if (cache[options.role] && cache[options.role].priority <= priority) return;
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
        if (cache[key]) delete cache[key];
        cache[key] = {
            cached: Game.time,
            room: room.name,
            priority: priority,
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
    let level = room.level;
    // Filter ops by range
    let range = LOCAL_SPHERE * 2;
    if (room.energyState) range = LOCAL_SPHERE * 4;
    // Global queue, if far away or lacking energy it's low priority
    let combatQueue = globalQueue;
    if (_.size(combatQueue) && !Memory.roomCache[room.name].threatLevel && _.inRange(room.level, Memory.maxLevel - 1, Memory.maxLevel)) {
        Object.keys(combatQueue).forEach(function (q) {
            if (!combatQueue[q].destination || combatQueue[q].type === 'guard' || Memory.auxiliaryTargets[combatQueue[q].destination] || (Memory.roomCache[combatQueue[q].destination] && Memory.roomCache[combatQueue[q].destination].owner === MY_USERNAME)) return;
            let distance = Game.map.getRoomLinearDistance(combatQueue[q].destination, room.name);
            if (distance > range && room.energyState) combatQueue[q].priority = PRIORITIES.secondary; else if (!room.energyState) delete combatQueue[q];
        })
        queue = _.sortBy(Object.assign({}, combatQueue, roomQueue[room.name]), 'priority');
    } else if (_.size(roomQueue[room.name])) {
        queue = _.sortBy(Object.assign({}, roomQueue[room.name]), 'priority');
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
        let cost = global.UNIT_COST(generator.bodyGenerator(level, roles[i], room, queue[i]));
        displayText(room, 35, 2 + i, _.capitalize(roles[i]) + mil + ': Cost - ' + room.energyAvailable + '/' + cost + ' Age - ' + (Game.time - tickQueued[i]));
    }
}

function cacheCounts() {
    if (!creepCount || creepCount.tick !== Game.time) {
        creepCount = {};
        let creeps = _.filter(Game.creeps, (r) => r.my && r.memory.role);
        for (let creep of creeps) {
            // Set role object
            if (!creepCount[creep.memory.role]) creepCount[creep.memory.role] = {};
            if (!creepCount[creep.memory.role][creep.memory.overlord]) creepCount[creep.memory.role][creep.memory.overlord] = 0;
            // Overlord Counts
            if (!creepCount[creep.memory.role][creep.memory.overlord]) creepCount[creep.memory.role][creep.memory.overlord] = 0;
            creepCount[creep.memory.role][creep.memory.overlord]++;
            // Handle destination
            if (creep.memory.destination || creep.memory.other.responseTarget) {
                let destination = creep.memory.destination || creep.memory.other.responseTarget;
                if (!creepCount[creep.memory.role][destination]) creepCount[creep.memory.role][destination] = 0;
                creepCount[creep.memory.role][destination]++;
            }
            // Handle operation
            if (creep.memory.operation) {
                if (!creepCount[creep.memory.role][creep.memory.operation]) {
                    creepCount[creep.memory.role][creep.memory.operation] = {};
                    creepCount[creep.memory.role][creep.memory.operation].total = 0;
                }
                creepCount[creep.memory.role][creep.memory.operation].total++;
                if (!creepCount[creep.memory.role][creep.memory.operation][creep.memory.overlord]) creepCount[creep.memory.role][creep.memory.operation][creep.memory.overlord] = 0;
                creepCount[creep.memory.role][creep.memory.operation][creep.memory.overlord]++;
                if (creep.memory.destination || creep.memory.other.responseTarget) {
                    let destination = creep.memory.destination || creep.memory.other.responseTarget;
                    if (!creepCount[creep.memory.role][creep.memory.operation][destination]) creepCount[creep.memory.role][creep.memory.operation][destination] = 0;
                    creepCount[creep.memory.role][creep.memory.operation][destination]++;
                }
            }
        }
        creepCount.tick = Game.time;
        return creepCount;
    } else {
        return creepCount;
    }
}

function cacheTTL() {
    if (!creepTTL || creepTTL.tick !== Game.time) {
        creepTTL = {};
        let creeps = _.filter(Game.creeps, (r) => r.my && r.memory.role);
        for (let creep of creeps) {
            // Handle TTL
            if (!creepTTL[creep.room.name]) creepTTL[creep.room.name] = {};
            if (!creepTTL[creep.room.name][creep.memory.role] || creepTTL[creep.room.name][creep.memory.role] > creep.ticksToLive) creepTTL[creep.room.name][creep.memory.role] = creep.ticksToLive;
        }
        creepTTL.tick = Game.time;
    }
    return creepTTL;
}

/**
 *
 * @param {object} room - Room object for room creeps
 * @param {string} role - Role
 * @param {string} destination - If filtering by destination room name
 * @param {string} operation - If filtering by operation type
 * @returns {*|number}
 */
function getCreepCount(room = undefined, role, destination, operation = undefined) {
    let creepData = cacheCounts();
    if (!creepData[role]) return 0;
    if (!destination && !operation && room) return creepData[role][room.name] || 0;
    else if (room && operation) {
        if (!creepData[role][operation]) return 0;
        return creepData[role][operation][room.name] || 0;
    } else if (destination && !operation) return creepData[role][destination] || 0;
    else if (!destination && operation) {
        if (!creepData[role][operation]) return 0;
        return creepData[role][operation].total || 0;
    } else if (destination && operation) return creepData[role][operation][destination] || 0;
}

/**
 *
 * @param {object} room - Room object for room creeps
 * @param {string} role - Role
 * @returns {*|number}
 */
function getCreepTTL(room, role) {
    let creepTTL = cacheTTL();
    if (!creepTTL[room.name] || !creepTTL[room.name][role]) return 9999;
    return creepTTL[room.name][role];
}