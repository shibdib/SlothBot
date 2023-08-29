/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
const generator = require('module.bodyGenerator');
let roomQueue = {};
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
let buildTick = {};
module.exports.processBuildQueue = function (room) {
    // Display/Retrieve Queue
    let queue = displayQueue(room.name);
    if (!queue || !_.size(queue)) return;
    if (buildTick[room.name] + 5 > Game.time) return;
    buildTick[room.name] = Game.time;
    // Check for free spawns
    let availableSpawns = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning && s.isActive());
    for (let availableSpawn of availableSpawns) {
        let body, role, cost, queuedBuild;
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
            body = generator.bodyGenerator(room.level, role, room, topPriority);
            if (!body || !body.length) continue;
            // Stop loop if we just can't afford it yet
            cost = global.UNIT_COST(body);
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) return;
            // If it's not something we can afford, continue
            if (cost > room.energyCapacityAvailable) continue;
            queuedBuild = topPriority;
            break;
        }
        // If we have a queue try to build it, otherwise opportunistically renew
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
                let name = role.slice(0, 3) + '' + room.level + '' + getRandomInt(100, 999);
                if (queuedBuild.operation) name = queuedBuild.operation.slice(0, 3) + '' + room.level + '' + getRandomInt(100, 999);
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
                        if (creepCount) creepCount.tick--;
                        return;
                    case ERR_NOT_ENOUGH_ENERGY:
                        energyOrder[availableSpawn.room.name] = undefined;
                        return;
                    default:
                        let error = availableSpawn.spawnCreep(body, name, {
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
                        });
                        log.e('Spawn error in ' + availableSpawn.room.name + ' code ' + error + '. Name - ' + name + '. Body - ' + body);
                        return;
                }
            }
        } else {
            let nearbyCreeps = _.filter(room.myCreeps, (c) => !_.find(c.body, (b) => b.boost) && c.pos.isNearTo(availableSpawn) && c.ticksToLive < CREEP_LIFE_TIME);
            if (nearbyCreeps.length) {
                availableSpawn.renewCreep(_.min(nearbyCreeps, function (c) {
                    return c.ticksToLive;
                }));
                return;
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
        queueCreep(room, 2 + getCreepCount(room, 'stationaryHarvester'), {
            role: 'stationaryHarvester',
            other: {
                reboot: reboot
            }
        })
    }
    if (getCreepCount(room, 'stationaryHarvester') && !getCreepCount(room, 'hauler')) {
        queueCreep(room, 1, {role: 'hauler'})
    }
    if (!getCreepCount(room, 'upgrader') || (getCreepCount(room, 'upgrader') < 5 && room.level === room.controller.level)) {
        queueCreep(room, 4 + getCreepCount(room, 'upgrader'), {role: 'upgrader'})
    }
    if (!room.controller.safeMode && (room.memory.spawnDefenders || room.memory.defenseCooldown > Game.time) && !getCreepCount(room, 'defender')) {
        queueCreep(room, PRIORITIES.defender, {role: 'defender'})
    }
    if (getCreepCount(room, 'explorer') < 2) {
        queueCreep(room, 9, {role: 'explorer'})
    }
};

//Essential creeps
let essentialTick = {};
module.exports.essentialCreepQueue = function (room) {
    if (essentialTick[room.name] + 10 > Game.time) return;
    essentialTick[room.name] = Game.time;
    //Static room info
    let level = getLevel(room);
    //Harvesters
    if (getCreepCount(room, 'stationaryHarvester') < room.sources.length || (creepExpiringSoon(room.name, 'stationaryHarvester') && getCreepCount(room, 'stationaryHarvester') === room.sources.length)) {
        queueCreep(room, PRIORITIES.stationaryHarvester, {
            role: 'stationaryHarvester',
            other: {
                reboot: !getCreepCount(room, 'stationaryHarvester')
            }
        });
    }
    //Haulers
    if (getCreepCount(room, 'stationaryHarvester')) {
        let priority = PRIORITIES.hauler;
        let reboot;
        if (!getCreepCount(room, 'hauler') || room.friendlyCreeps.length < 5) {
            priority = 1;
            reboot = true;
        }
        if (!getCreepCount(room, 'hauler') || (creepExpiringSoon(room.name, 'hauler') && getCreepCount(room, 'hauler') === 1)) {
            queueCreep(room, priority + getCreepCount(room, 'hauler') * 1.2, {
                role: 'hauler',
                other: {reboot: reboot}
            });
        }
        // Spawn shuttles for harvesters with no link
        if (room.level < 6) {
            let amount = 2;
            if (room.memory.hubLink) amount = 1;
            if (getCreepCount(room, 'shuttle') < amount || (creepExpiringSoon(room.name, 'shuttle') && getCreepCount(room, 'shuttle') === amount)) {
                queueCreep(room, PRIORITIES.hauler, {
                    role: 'shuttle'
                });
            }
        }
    }
    // Local Responder
    if (room.memory.spawnDefenders || room.memory.defenseCooldown > Game.time) {
        if (getCreepCount(room, 'defender') < 2 || (creepExpiringSoon(room.name, 'defender') && getCreepCount(room, 'defender') === 2)) {
            queueCreep(room, PRIORITIES.defender, {
                role: 'defender',
                destination: room.name,
                military: true
            })
        }
    }
    // Upgrader
    // Determine amount
    let number = 1;
    let importantBuilds = _.find(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    let reboot = room.controller.ticksToDowngrade <= CONTROLLER_DOWNGRADE[level] * 0.9 || room.memory.struggling || importantBuilds || room.controller.progress > room.controller.progressTotal || INTEL[room.name].threatLevel >= 3 || room.memory.spawnDefenders;
    if (room.level < 7 && room.level === room.controller.level && !reboot && room.energyState) {
        let container = Game.getObjectById(room.memory.controllerContainer);
        if (container) {
            if (container.store[RESOURCE_ENERGY] > CONTAINER_CAPACITY * 0.7) {
                number = ((container.store[RESOURCE_ENERGY] - (CONTAINER_CAPACITY * (0.1 * room.level))) / (75 * room.level));
                if (number > room.energyState + 1) number = room.energyState + 1;
            }
        } else number = 10 - room.level;
    }
    if (getCreepCount(room, 'upgrader') < number) {
        queueCreep(room, PRIORITIES.upgrader + getCreepCount(room, 'upgrader'), {
            role: 'upgrader',
            other: {reboot: reboot}
        })
    }
};

//Non essential creeps
let miscTick = {};
module.exports.miscCreepQueue = function (room) {
    if (miscTick[room.name] + 12 > Game.time) return;
    miscTick[room.name] = Game.time;
    let level = getLevel(room);
    //Drones
    // 2 at all times below 7, 12 - level if there's an important build or below level 4
    let number = 2;
    if (room.level >= 7) number = 1;
    let importantBuilds = _.find(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    if (importantBuilds || room.level < 4) number = 12 - room.controller.level;
    if (getCreepCount(room, 'drone') < number) {
        // Bump priority if under attack
        let priority = PRIORITIES.high;
        if (room.memory.spawnDefenders || room.memory.defenseCooldown > Game.time) priority = PRIORITIES.defender;
        if (getCreepCount(room, 'drone') < number) {
            queueCreep(room, priority + getCreepCount(room, 'drone'), {
                role: 'drone',
                other: {reboot: room.friendlyCreeps.length <= 3}
            })
        }
    }
    if (room.terminal && level >= 6) {
        //LabTech
        if (!getCreepCount(room, 'labTech')) {
            queueCreep(room, PRIORITIES.hauler, {role: 'labTech'})
        }
        //Power
        if (room.energyState && level === 8 && room.store(RESOURCE_POWER)) {
            if (!getCreepCount(room, 'powerManager')) {
                queueCreep(room, PRIORITIES.hauler, {role: 'powerManager'})
            }
        }
    }
    // If no conflict detected
    if (!room.nukes.length && !INTEL[room.name].threatLevel) {
        //Mineral Harvester
        if (room.mineral.mineralAmount && !getCreepCount(room, 'mineralHarvester') && room.store(room.mineral.mineralType) < 100000) {
            if (_.find(room.structures, (s) => s.structureType === STRUCTURE_EXTRACTOR)) {
                queueCreep(room, PRIORITIES.mineralHarvester, {
                    role: 'mineralHarvester',
                    other: {assignedMineral: room.mineral.id}
                })
            }
        }
        //Pre observer spawn explorers
        if (getCreepCount(undefined, 'explorer') < (9 - MAX_LEVEL) * 2) {
            queueCreep(room, PRIORITIES.priority, {role: 'explorer'})
        }
        // If room is near the highest level
        if (level >= MAX_LEVEL - 1 && level >= 4) {
            let priority = PRIORITIES.secondary;
            if (room.energyState) priority = PRIORITIES.priority;
            // Assist with Defense
            let needsDefense = _.find(MY_ROOMS, (r) => r !== room.name && (Game.rooms[r].memory.dangerousAttack || Game.rooms[r].memory.defenseCooldown > Game.time) && room.routeSafe(r, 3, 999, 15));
            if (needsDefense) {
                if (getCreepCount(undefined, 'longbow', needsDefense) < 2) {
                    queueCreep(room, priority, {
                        role: 'longbow',
                        destination: needsDefense,
                        operation: 'guard',
                        military: true
                    });
                }
            }
            //Border Patrol
            if (room.memory.borderPatrol && getCreepCount(room, 'longbow', undefined, 'borderPatrol') < room.energyState + 1) {
                let power = 100;
                if (room.memory.borderPatrol) power = INTEL[room.memory.borderPatrol].hostilePower;
                queueCreep(room, priority, {
                    role: 'longbow',
                    operation: 'borderPatrol',
                    military: true,
                    destination: room.memory.borderPatrol,
                    other: {power: power}
                });
            }
            if (room.energyState > 1 && level >= 6) {
                // Assist with Energy if not struggling
                let needsEnergy = _.find(MY_ROOMS, (r) => Game.rooms[r].memory.struggling && !Game.rooms[r].terminal && INTEL[r] && !INTEL[r].threatLevel && room.routeSafe(r, 3, 999, 15));
                if (needsEnergy) {
                    if (getCreepCount(undefined, 'fuelTruck', needsEnergy) < 2) {
                        queueCreep(room, PRIORITIES.urgent, {
                            role: 'fuelTruck',
                            destination: needsEnergy
                        });
                    }
                }
            }
        }
    }
};

//Remote creeps
let remoteTick = {};
let robberyTargets = {};
module.exports.remoteCreepQueue = function (room) {
    if (remoteTick[room.name] + 10 > Game.time) return;
    remoteTick[room.name] = Game.time;
    room.memory.borderPatrol = undefined;
    if (!remoteHives[room.name] || Math.random() > 0.75) {
        // Clean old Remotes
        remoteHives[room.name] = undefined;
        // Find rooms around you using INTEL with remote possibilities
        let sourceCount = 0;
        let remoteRooms = _.filter(Game.map.describeExits(room.name), (r) => INTEL[r] && INTEL[r].sources && !INTEL[r].level && (!ROOM_STATUS || Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status) &&
            (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || !_.includes(FRIENDLIES, INTEL[r].reservation)));
        if (remoteRooms.length) remoteRooms.forEach((r) => sourceCount += INTEL[r].sources || 1);
        // Handle less than desired
        let targetAmount = REMOTE_SOURCE_TARGET;
        if (!room.energyState && room.level >= 7) targetAmount *= 2;
        if (sourceCount < targetAmount) {
            for (let adjacentRoom of remoteRooms) {
                let secondaryAdjacent = _.filter(Game.map.describeExits(adjacentRoom), (r) => INTEL[r] && INTEL[r].sources && !INTEL[r].level && (!ROOM_STATUS || Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status) &&
                    (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || !_.includes(FRIENDLIES, INTEL[r].reservation)));
                if (secondaryAdjacent.length) {
                    secondaryAdjacent.forEach((r) => sourceCount += INTEL[r].sources || 1);
                    remoteRooms = _.union(remoteRooms, secondaryAdjacent);
                }
                if (sourceCount >= targetAmount) break;
            }
        }
        remoteHives[room.name] = JSON.stringify(remoteRooms);
        // Check for robbery targets
        robberyTargets[room.name] = JSON.stringify(_.filter(Game.map.describeExits(room.name), (r) => INTEL[r] && !INTEL[r].sk && !INTEL[r].owner && INTEL[r].sources && INTEL[r].user && INTEL[r].user !== MY_USERNAME && !_.includes(FRIENDLIES, INTEL[r].reservation)));
    }
    // Remotes
    if (remoteHives[room.name] && JSON.parse(remoteHives[room.name]).length) {
        for (let remoteName of JSON.parse(remoteHives[room.name])) {
            // If we don't have intel on the room skip it
            if (!INTEL[remoteName]) continue;
            // If avoid is set continue
            if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) continue;
            // If owned or a highway redo the search
            if (INTEL[remoteName].level || !INTEL[remoteName].sources) return remoteHives[room.name] = undefined;
            // If reserved by others continue (robbery covers this)
            if (INTEL[remoteName].reservation && ![MY_USERNAME, "Invader"].includes(INTEL[remoteName].reservation)) continue;
            // If heat is high skip
            if (INTEL[remoteName].roomHeat > 250) {
                continue;
            }
            // Handle invaders
            if ((INTEL[remoteName].invaderCore || INTEL[remoteName].threatLevel || (INTEL[remoteName].user && !_.includes(FRIENDLIES, INTEL[remoteName].user))) && !INTEL[remoteName].sk) {
                // Handle invader core
                if (INTEL[remoteName].invaderCore || (INTEL[remoteName].reservation && ![MY_USERNAME, "Invader"].includes(INTEL[remoteName].reservation))) {
                    if (!getCreepCount(undefined, 'attacker', remoteName)) {
                        queueCreep(room, PRIORITIES.priority, {
                            role: 'attacker',
                            military: true,
                            destination: remoteName
                        })
                    }
                }
                if (INTEL[remoteName].threatLevel && INTEL[remoteName].tickDetected + CREEP_LIFE_TIME < Game.time) {
                    if (!getCreepCount(undefined, 'explorer', remoteName)) {
                        queueCreep(room, PRIORITIES.priority, {
                            role: 'explorer',
                            destination: remoteName
                        })
                    }
                    room.memory.borderPatrol = undefined;
                } else room.memory.borderPatrol = remoteName;
                continue;
            }
            // Handle SK
            if (INTEL[remoteName].sk && room.level >= 7 && !room.memory.noRemote && !INTEL[remoteName].invaderCore) {
                if (!getCreepCount(undefined, 'SKAttacker', remoteName) || (creepExpiringSoon(remoteName, 'SKAttacker') && getCreepCount(undefined, 'SKAttacker', remoteName) === 1)) {
                    queueCreep(room, PRIORITIES.remoteHarvester - 1, {
                        role: 'SKAttacker',
                        military: true,
                        destination: remoteName
                    })
                }
                // If we have an SKAttacker send harvesters
                if (getCreepCount(undefined, 'SKAttacker', remoteName)) {
                    if (getCreepCount(undefined, 'remoteHarvester', remoteName) < INTEL[remoteName].sources) {
                        queueCreep(room, PRIORITIES.remoteHarvester + (getCreepCount(room, 'remoteHarvester') * 0.2), {
                            role: 'remoteHarvester',
                            destination: remoteName
                        })
                    }
                    if (!getCreepCount(undefined, 'SKMineral', remoteName) && (!INTEL[remoteName].mineralCooldown || INTEL[remoteName].mineralCooldown < Game.time)) {
                        queueCreep(room, PRIORITIES.remoteHarvester, {role: 'SKMineral', destination: remoteName})
                    }
                }
            } else if (!INTEL[remoteName].sk) {
                if (getCreepCount(undefined, 'remoteHarvester', remoteName) < INTEL[remoteName].sources) {
                    queueCreep(room, PRIORITIES.remoteHarvester + (getCreepCount(room, 'remoteHarvester') * 0.2), {
                        role: 'remoteHarvester',
                        destination: remoteName
                    })
                }
                if (room.level >= 4 && (!INTEL[remoteName].reservationExpires || Game.time > INTEL[remoteName].reservationExpires)) {
                    let amount = INTEL[remoteName].reserverCap || 1;
                    if (getCreepCount(undefined, 'reserver', remoteName) < amount) {
                        queueCreep(room, PRIORITIES.reserver + getCreepCount(undefined, 'reserver', remoteName) * 2.5, {
                            role: 'reserver',
                            destination: remoteName
                        })
                    }
                }
                // Obstructions
                /**
                if (INTEL[remoteName] && (INTEL[remoteName].obstructions || INTEL[remoteName].needCleaner) && Game.map.getRoomStatus(remoteName).status === "normal") {
                if (!getCreepCount(undefined, 'cleaner', remoteName)) {
                queueCreep(room, PRIORITIES.secondary, {role: 'cleaner', destination: remoteName})
                    }
                }**/
            }
            if (getCreepCount(undefined, 'remoteHarvester', remoteName)) {
                // Haulers
                // Get energy output for room
                if (Game.rooms[remoteName]) {
                    let harvesters = _.filter(Game.rooms[remoteName].myCreeps, (c) => c.memory.destination === remoteName && c.memory.role === 'remoteHarvester' && c.memory.setSourceAmount);
                    let energyOutput = 0;
                    harvesters.forEach((c) => energyOutput += Game.getObjectById(c.memory.source).memory.carryAmountNeeded);
                    // Determine if we have enough haulers for the room
                    if (energyOutput) {
                        let assignedHaulers = _.filter(Game.creeps, (c) => c.my && c.memory.destination === remoteName && c.memory.role === 'remoteHauler');
                        let currentHaulingCapacity = 0;
                        if (assignedHaulers.length) assignedHaulers.forEach((c) => currentHaulingCapacity += c.store.getCapacity());
                        // Only 4 per source
                        if (assignedHaulers.length < 4 * Game.rooms[remoteName].sources.length && currentHaulingCapacity < energyOutput) {
                            queueCreep(room, PRIORITIES.remoteHauler + getCreepCount(undefined, "remoteHauler", remoteName), {
                                role: 'remoteHauler',
                                destination: remoteName,
                                misc: energyOutput
                            })
                        }
                    }
                }
                // Remote Road Builder
                if (getCreepCount(room, 'roadBuilder') < _.filter(Game.map.describeExits(room.name), (r) => !INTEL[r] || (INTEL[r].sources && !INTEL[r].roadsBuilt)).length + 1) {
                    queueCreep(room, PRIORITIES.roadBuilder, {
                        role: 'roadBuilder',
                        misc: _.pluck(JSON.parse(remoteHives[room.name]), 'room')
                    })
                }
            }
        }
    }
    // Robbery
    if (robberyTargets[room.name] && JSON.parse(robberyTargets[room.name]).length) {
        for (let remoteName of JSON.parse(robberyTargets[room.name])) {
            if (!INTEL[remoteName].hostile && !getCreepCount(undefined, 'remoteHauler', remoteName)) {
                queueCreep(room, PRIORITIES.remoteHauler, {role: 'remoteHauler', destination: remoteName})
            } else if (INTEL[remoteName].hostile && userStrength(INTEL[remoteName].user) <= MAX_LEVEL && getCreepCount(undefined, 'longbow', remoteName) < 2) {
                queueCreep(room, PRIORITIES.medium, {
                    role: 'longbow',
                    destination: remoteName,
                    military: true,
                    operation: 'guard'
                })
            }
        }
    }
};

//Military creeps
let lastGlobalTick = 0;
module.exports.globalCreepQueue = function () {
    if (lastGlobalTick + 15 > Game.time) return;
    lastGlobalTick = Game.time;
    let operations = Object.assign({}, Memory.targetRooms, Memory.auxiliaryTargets);
    // Targets
    if (!_.size(operations)) return;
    for (let key in operations) {
        // Clear bogus rooms
        if (!operations[key]) {
            Memory.targetRooms[key] = undefined;
            Memory.auxiliaryTargets[key] = undefined;
            continue;
        }
        // Set vars
        let opLevel = operations[key].level;
        let priority = operations[key].priority;
        if (!priority) {
            if (INTEL[key]) {
                priority = getPriority(key);
            } else priority = PRIORITIES.medium;
            operations[key].priority = priority;
        }
        // Scouts for rooms at level 0 or who haven't been checked by an observer
        if (!operations[key].observerCheck && Memory.targetRooms[key] && !opLevel && operations[key].type !== 'harass' && operations[key].type !== 'pending') {
            if (!getCreepCount(undefined, 'scout', key)) {
                queueGlobalCreep(PRIORITIES.priority, {role: 'scout', destination: key, military: true})
            }
        }
        // Special Guard requests
        if (operations[key].guard && (!getCreepCount(undefined, 'longbow', key) || (creepExpiringSoon(key, 'longbow') && getCreepCount(undefined, 'longbow', key) === 1))) {
            queueGlobalCreep(priority, {role: 'longbow', destination: key, military: true});
        }
        // Handle harassers
        if (Memory.harassTargets && Memory.harassTargets.length) {
            let targetAmount = Memory.harassTargets.length * 2;
            if (targetAmount > MY_ROOMS.length * 2) targetAmount = MY_ROOMS.length * 2;
            if (getCreepCount(undefined, 'longbow', undefined, 'harass') < targetAmount) {
                let harassTarget = _.sample(_.filter(INTEL, (r) => !r.owner && Memory.harassTargets.includes(r.user)));
                if (harassTarget) {
                    queueGlobalCreep(PRIORITIES.medium, {
                        role: 'longbow',
                        destination: harassTarget.name,
                        operation: 'harass',
                        military: true
                    })
                }
            }
        }
        switch (operations[key].type) {
            // Testing
            case 'test':
                if (getCreepCount(undefined, 'tester', key) < 4) {
                    queueGlobalCreep(priority, {role: 'tester', destination: key, military: true});
                }
                break;
            // Scout
            case 'scout':
                if (!getCreepCount(undefined, 'scout', key)) {
                    queueGlobalCreep(priority, {role: 'scout', destination: key, military: true});
                }
                break;
            // Claiming
            case 'claim':
                if (!getCreepCount(undefined, 'claimer', key)) {
                    queueGlobalCreep(PRIORITIES.priority, {role: 'claimer', destination: key, military: true});
                }
                break;
            // Rebuilding allies
            case 'rebuild':
                if (!INTEL[key] || !INTEL[key].threatLevel) {
                    if (getCreepCount(undefined, 'drone', key) < 5) {
                        queueGlobalCreep(priority, {role: 'drone', destination: key, military: true});
                    }
                    // If threats are present, spawn longbows
                    if (THREATS.length && getCreepCount(undefined, 'longbow', key) < 2) {
                        queueGlobalCreep(PRIORITIES.medium, {
                            role: 'longbow',
                            destination: key,
                            military: true,
                            operation: 'guard',
                        });
                    }
                }
                break;
            case 'commodity': // Commodity Mining
                let commoditySpace = operations[key].space || 2;
                if (getCreepCount(undefined, 'commodityMiner', key) < commoditySpace) {
                    queueGlobalCreep(PRIORITIES.secondary, {role: 'commodityMiner', destination: key, military: true})
                }
                break;
            case 'mineral': // Middle room mineral mining
                let mineralSpace = operations[key].space || 1;
                if (getCreepCount(undefined, 'commodityMiner', key) < mineralSpace) {
                    queueGlobalCreep(PRIORITIES.secondary, {role: 'commodityMiner', destination: key, military: true})
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
                    queueGlobalCreep(PRIORITIES.secondary, {role: 'powerHealer', destination: key, military: true})
                }
                if (!operations[key].complete && (powerAttacker < powerSpace || (powerAttackerTTL && powerAttackerTTL < 450 && powerAttacker < powerSpace + 1))) {
                    queueGlobalCreep(PRIORITIES.secondary - 1, {
                        role: 'powerAttacker',
                        destination: key,
                        military: true
                    })
                }
                if (operations[key].hauler && getCreepCount(undefined, 'powerHauler', key) < operations[key].hauler) {
                    queueGlobalCreep(PRIORITIES.secondary - 1, {role: 'powerHauler', destination: key, military: true})
                }
                break;
            case 'denial': // Deny Room
                let remotes = _.filter(_.map(Game.map.describeExits(key)), (r) => (!INTEL[r] || !INTEL[r].owner));
                let harassers = _.filter(Game.creeps, (c) => c.my && c.memory.other && c.memory.other.target === key);
                // Camp remotes unless an ally controls them, or they're owned
                if (harassers.length < remotes.length * 1.25) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: _.sample(remotes),
                        operation: 'denial',
                        military: true,
                        other: {target: key}
                    })
                }
                break;
            case 'hold': // Hold Room
                if (getCreepCount(undefined, 'longbow', key) < opLevel || (creepExpiringSoon(key, 'longbow') && getCreepCount(undefined, 'longbow', key) === opLevel)) {
                    queueGlobalCreep(priority + getCreepCount(undefined, 'longbow', key), {
                        role: 'longbow',
                        destination: key,
                        operation: 'hold',
                        military: true
                    })
                }
                if (getCreepCount(undefined, 'attacker', key) < opLevel) {
                    queueGlobalCreep(priority + getCreepCount(undefined, 'attacker', key), {
                        role: 'attacker',
                        destination: key,
                        operation: 'hold',
                        military: true
                    })
                }
                if (operations[key].claimAttacker) {
                    if (!getCreepCount(undefined, 'claimAttacker', key)) {
                        queueGlobalCreep(priority + 1, {
                            role: 'claimAttacker',
                            destination: key,
                            operation: 'hold',
                            military: true
                        })
                    }
                }
                if (operations[key].cleaner) {
                    if (getCreepCount(undefined, 'cleaner', key) < 2) {
                        queueGlobalCreep(priority + 1, {
                            role: 'cleaner',
                            destination: key,
                            operation: 'hold',
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
            case 'guard': // Room Guard
                if (getCreepCount(undefined, 'longbow', key) < opLevel || (creepExpiringSoon(key, 'longbow') && getCreepCount(undefined, 'longbow', key) === opLevel)) {
                    queueGlobalCreep(priority, {role: 'longbow', destination: key, operation: 'guard', military: true})
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
    if (!key) return;
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
    if (!energyOrder[room.name] || orderStored[room.name] + 750 < Game.time) {
        let harvester = _.filter(room.myCreeps, (c) => c.memory.role === 'stationaryHarvester' && c.memory.onContainer);
        let energyStructures = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION);
        let rangeArray = [];
        let usedIdArray = [];
        for (let x = 0; x < energyStructures.length; x++) {
            let nextClosest;
            let harvesterExtensions = _.filter(room.structures, (s) => !_.includes(usedIdArray, s.id) && (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.pos.findFirstInRange(harvester, 1));
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
}

let processedQueues = {};
function displayQueue(roomName) {
    let queue;
    let room = Game.rooms[roomName];
    // Global queue
    let importantBuilds = _.find(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    if (_.size(globalQueue) && room.level >= 3 && !INTEL[room.name].threatLevel && !importantBuilds) {
        let operationQueue = JSON.parse(JSON.stringify(globalQueue));
        for (let key in operationQueue) {
            if (operationQueue[key].destination) {
                let body = generator.bodyGenerator(room.level, operationQueue[key].role, room, operationQueue[key]);
                // Add a distance sanity checks
                let maxRange = 22;
                if (_.includes(body, CLAIM)) maxRange = 14;
                if (!room.shibRoute(operationQueue[key].destination) || room.shibRoute(operationQueue[key].destination).length > maxRange) {
                    delete operationQueue[key]
                    continue;
                }
                // If not a military op just check for route safety
                // If a military op check if room can produce creeps at the level required
                if (!operationQueue[key].military) {
                    if (!room.routeSafe(operationQueue[key].destination, 500, 1, maxRange)) {
                        delete operationQueue[key]
                        continue;
                    }
                } else if (Memory.targetRooms[operationQueue[key].destination] && Memory.targetRooms[operationQueue[key].destination].maxLevel > room.level) {
                    delete operationQueue[key]
                    continue;
                }
                // Tweak priority based on range and if shared sector
                let priority = operationQueue[key].priority
                if ((sameSectorCheck(roomName, operationQueue[key].destination) || (INTEL[operationQueue[key].destination] && findClosestOwnedRoom(operationQueue[key].destination) === roomName)) && room.energyState) {
                    priority *= 0.5;
                } else if (!room.energyState && operationQueue[key].military) {
                    priority *= 2;
                } else priority += 1;
                if (priority < PRIORITIES.priority) priority = PRIORITIES.priority;
                operationQueue[key].priority = priority;

            }
        }
        queue = _.sortBy(Object.assign({}, operationQueue, roomQueue[room.name]), 'priority');
    } else if (_.size(roomQueue[room.name])) {
        queue = _.sortBy(Object.assign({}, roomQueue[room.name]), 'priority');
    }
    let activeSpawns = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.spawning);
    if (!_.size(queue) && !activeSpawns.length) return;
    let lower = _.size(queue) + activeSpawns.length + 2;
    if (lower > 9) lower = 9;
    room.visual.rect(34, 0, 49, lower, {
        fill: '#ffffff',
        opacity: '0.55',
        stroke: 'black'
    });
    displayText(room, 35, 1, 'Creep Build Queue');
    let i = 0;
    if (_.size(queue)) {
        for (let item of queue) {
            if (i >= 5) break;
            let mil = '';
            if (item.military) mil = '*';
            let cost = global.UNIT_COST(generator.bodyGenerator(room.level, item.role, room, item));
            displayText(room, 35, 2 + i, item.priority + ' ' + _.capitalize(item.role) + mil + ': ' + room.energyAvailable + '/' + cost + ' Age: ' + (Game.time - item.cached));
            i++;
        }
    }
    // Display spawning
    for (let spawn of activeSpawns) {
        let spawningCreep = Game.creeps[spawn.spawning.name];
        displayText(room, 35, 2 + i, 'Spawning - ' + _.capitalize(spawningCreep.name.split("_")[0]) + ' - Ticks: ' + spawn.spawning.remainingTime);
        i++;
    }
    return queue;
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
    if (!destination && !operation && room) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && (c.memory.destination === room.name || c.room.name === room.name || c.memory.overlord === room.name)).length;
    else if (room && operation && !destination) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && (c.memory.destination === room.name || c.memory.overlord === room.name) && c.memory.operation === operation).length;
    else if (destination && !operation) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && (c.memory.destination === destination || c.memory.overlord === destination)).length;
    else if (!destination && operation) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && c.memory.operation === operation).length;
    else if (destination && operation) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role && (c.memory.destination === destination || c.memory.overlord === destination) && c.memory.operation === operation).length;
    else if (!destination && !operation && !room) return _.filter(Game.creeps, (c) => c.my && c.memory.role === role).length;
}

/**
 *
 * @param {object} room - Room object for room creeps
 * @param {string} role - Role
 * @returns {*|number}
 */
function creepExpiringSoon(room, role) {
    let creeps = _.filter(Game.creeps, (r) => r.my && r.memory.role === role && (r.room.name === room || r.memory.destination === room));
    if (creeps.length) return _.min(creeps, '.ticksToLive').ticksToLive <= (CREEP_SPAWN_TIME * _.size(_.min(creeps, '.ticksToLive').body)) + 15; else return false;
}

function getPriority(room) {
    let range = findClosestOwnedRoom(room, true)
    if (range <= 1) return PRIORITIES.priority;
    else if (range <= 3) return PRIORITIES.urgent;
    else if (range <= 5) return PRIORITIES.high;
    else if (range <= 10) return PRIORITIES.medium;
    else return PRIORITIES.secondary;
}