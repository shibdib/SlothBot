/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let generator = require('module.bodyGenerator');
const lastQueue = {};
let roomQueue = {};
let globalQueue = {};
let energyOrder = {};
let storedLevel = {};
let remoteHives = {};
let lastBuilt = {};

//Build Creeps From Queue
module.exports.processBuildQueue = function () {
    let spawns = Game.spawns;
    for (let key in spawns) {
        let spawn = spawns[key];
        let level = getLevel(spawn.room);
        // Clear queue if something is stuck
        if (lastBuilt[spawn.room.name] && roomQueue[spawn.room.name] && (Game.time - lastBuilt[spawn.room.name] >= 1450 || (level >= 3 && spawn.room.creeps.length < 4 && Math.random() > 0.5))) {
            roomQueue[spawn.room.name] = undefined;
            continue;
        }
        if (!energyOrder[spawn.pos.roomName] || storedLevel[spawn.pos.roomName] !== level) determineEnergyOrder(spawn.room);
        if (level > spawns[key].room.controller.level) level = spawns[key].room.controller.level;
        if (!spawn.spawning) {
            if (roomQueue[spawn.room.name] || globalQueue) {
                let topPriority, body, role, queue;
                if (!Memory.roomCache[spawn.room.name]) spawn.room.cacheRoomIntel(true);
                let maxLevel = Memory.maxLevel;
                if (!spawn.room.memory.nuke && _.size(globalQueue) && !Memory.roomCache[spawn.room.name].responseNeeded && _.inRange(level, maxLevel - 1, maxLevel + 1)) {
                    // If no energy surplus just urgent priority targets
                    if (spawn.room.energyState || spawn.room.energyAvailable === spawn.room.energyCapacityAvailable) {
                        queue = _.sortBy(Object.assign({}, globalQueue, roomQueue[spawn.room.name]), 'priority');
                    } else {
                        queue = _.sortBy(Object.assign({}, _.filter(globalQueue, (t) => t.priority <= PRIORITIES.urgent), roomQueue[spawn.room.name]), 'priority');
                    }
                } else {
                    queue = _.sortBy(roomQueue[spawn.room.name], 'priority')
                }
                displayQueue(spawn.room, queue);
                let cost;
                for (let key in queue) {
                    topPriority = queue[key];
                    if (!topPriority.role) continue;
                    if (topPriority.destination && Game.map.findRoute(topPriority.destination, spawn.room.name).length > 20) continue;
                    role = topPriority.role;
                    if (topPriority.misc && topPriority.misc === 'vary') level = _.random(_.round(level / 1.5), level);
                    if (topPriority.reboot || level === 1) {
                        body = _.get(SPAWN[0], role);
                    } else {
                        body = generator.bodyGenerator(level, role, spawn.room, topPriority.misc);
                    }
                    cost = global.UNIT_COST(body);
                    // If boosts are required to spawn check that a room has them
                    if (topPriority.boostCheck) {
                        let hasBoost;
                        for (let boost of BOOST_USE[topPriority.boostCheck]) {
                            hasBoost = spawn.room.getBoostAmount(boost) >= 500;
                        }
                        if (!hasBoost) continue;
                    }
                    // If cant afford try the previous level
                    if (cost > spawn.room.energyCapacityAvailable && level >= 2 && (lastBuilt[spawn.room.name] && Game.time - lastBuilt[spawn.room.name] >= 750)) {
                        body = generator.bodyGenerator(level - 1, role, spawn.room, topPriority.misc);
                        cost = global.UNIT_COST(body);
                    }
                    if (body && body.length && cost <= spawn.room.energyCapacityAvailable) break;
                }
                if (cost > spawn.room.energyAvailable) {
                    if (cost <= spawn.room.energyCapacityAvailable) spawn.say('Queued - ' + role.charAt(0).toUpperCase() + role.slice(1) + ' - Energy (' + spawn.room.energyAvailable + '/' + cost + ')');
                    continue;
                }
                if (topPriority && typeof topPriority === 'object') {
                    _.defaults(topPriority, {
                        role: undefined,
                        overlord: undefined,
                        assignedSource: undefined,
                        destination: undefined,
                        other: undefined,
                        military: undefined,
                        operation: undefined,
                        siegePoint: undefined,
                        waitFor: undefined,
                        reservationTarget: undefined,
                        initialBuilder: undefined,
                        localCache: undefined,
                        boostCheck: undefined,
                        misc: undefined
                    });
                    let name = role + '_' + spawn.room.name + '_T' + level + '_' + _.random(1, 100);
                    if (topPriority.operation) name = topPriority.operation + '_' + spawn.room.name + '_T' + level + '_' + _.random(1, 100);
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
                            siegePoint: topPriority.siegePoint,
                            waitFor: topPriority.waitFor,
                            reservationTarget: topPriority.reservationTarget,
                            initialBuilder: topPriority.initialBuilder,
                            localCache: topPriority.localCache,
                            boostCheck: topPriority.boostCheck,
                            misc: topPriority.misc
                        },
                        energyStructures: energyStructures
                    })) {
                        case OK:
                            if (!topPriority.operation) log.d(spawn.room.name + ' Spawning a ' + role);
                            if (topPriority.military && globalQueue) delete globalQueue[role];
                            if (topPriority.buildCount && roomQueue[spawn.room.name][role]) return roomQueue[spawn.room.name][role].buildCount = topPriority.buildCount - 1;
                            if (roomQueue[spawn.room.name]) delete roomQueue[spawn.room.name][role];
                            lastBuilt[spawn.room.name] = Game.time;
                            break;
                        default:
                            spawn.say('??')
                    }
                }
            }
        }
    }
};

//First Room Startup
module.exports.roomStartup = function (room) {
    let queue = roomQueue[room.name];
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name);
    let drones = _.filter(roomCreeps, (c) => (c.memory.role === 'drone'));
    let priority = 3;
    if (drones.length < 2) priority = 1;
    if (drones.length < ROOM_SOURCE_SPACE[room.name] + 3) {
        queueCreep(room, priority, {role: 'drone'})
    }
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (!_.includes(queue, 'stationaryHarvester')) {
        if (harvesters.length < 2 || (harvesters[0].ticksToLive < (harvesters[0].body.length * 3 + 10) && harvesters.length < 3)) {
            queueCreep(room, 2, {role: 'stationaryHarvester'})
        }
    }
    let hauler = _.filter(roomCreeps, (c) => (c.memory.role === 'hauler'));
    if (!_.includes(queue, 'hauler')) {
        if (hauler.length < 2 || (hauler[0].ticksToLive < (hauler[0].body.length * 3 + 10) && hauler.length < 3)) {
            queueCreep(room, 2, {role: 'hauler'})
        }
    }
    if (!_.includes(queue, 'explorer') && !Memory.roomCache[room.name].responseNeeded) {
        let amount = 6;
        let explorers = _.filter(roomCreeps, (creep) => creep.memory.role === 'explorer');
        if (explorers.length < amount) {
            queueCreep(room, PRIORITIES.explorer + explorers.length, {role: 'explorer'})
        }
    }
    if (Memory.roomCache[room.name].responseNeeded) {
        if (!_.includes(queue, 'attacker')) {
            let count = Memory.roomCache[room.name].numberOfHostiles;
            if (Memory.roomCache[room.name].threatLevel < 3) count = 1;
            let responder = _.filter(roomCreeps, (creep) => creep.memory.other.responseTarget === room.name && creep.memory.role === 'attacker');
            if (responder.length < count) {
                queueCreep(room, PRIORITIES.responder, {
                    role: 'attacker',
                    other: {
                        responseTarget: room.name
                    },
                    military: true
                })
            }
        }
    }
};

//Essential creeps
module.exports.essentialCreepQueue = function (room) {
    //Static room info
    let level = getLevel(room);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name);
    //Harvesters
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (harvesters.length === 0) {
        delete roomQueue[room.name];
        return queueCreep(room, 1, {role: 'stationaryHarvester', reboot: true});
    } else {
        if (harvesters.length < 2 || (harvesters[0].ticksToLive < (harvesters[0].body.length * 3 + 10) && harvesters.length < 3)) {
            queueCreep(room, PRIORITIES.stationaryHarvester, {role: 'stationaryHarvester'})
        }
    }
    //Haulers
    if (room.memory.hubLink) {
        let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
        if (hauler.length === 0) {
            delete roomQueue[room.name];
            return queueCreep(room, -1, {role: 'hauler', reboot: true, localCache: true});
        } else {
            let amount = 1;
            //if (room.controller.level >= 6 && room.energyCapacity * 0.4 > room.energyAvailable) amount = 2;
            if ((hauler[0] && hauler[0].ticksToLive < (hauler[0].body.length * 6 + 50) && hauler.length < amount + 1) || hauler.length < amount) {
                queueCreep(room, PRIORITIES.hauler + hauler.length, {role: 'hauler', localCache: true})
            }
        }
    }
    //Filler
    if (_.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' && !c.memory.linkID)).length) {
        let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' && c.memory.linkAttempt && (!c.memory.linkID || !c.room.memory.hubLink)));
        let filler = _.filter(roomCreeps, (c) => (c.memory.role === 'filler'));
        if ((filler[0] && filler[0].ticksToLive < (filler[0].body.length * 3 + 10) && filler.length < harvesters.length + 1) || filler.length < harvesters.length) {
            if (filler.length === 0) {
                delete roomQueue[room.name];
                return queueCreep(room, -1, {role: 'filler', reboot: true, localCache: true});
            } else {
                queueCreep(room, PRIORITIES.hauler - 1, {role: 'filler', localCache: true})
            }
        }
    }
    // Local Responder
    if (Memory.roomCache[room.name].threatLevel >= 3) {
        let role = _.sample(['longbow', 'attacker']);
        let responder = _.filter(Game.creeps, (creep) => creep.memory.other.responseTarget === room.name);
        if (responder.length < Memory.roomCache[room.name].numberOfHostiles) {
            queueCreep(room, PRIORITIES.responder, {
                role: role,
                other: {
                    responseTarget: room.name
                },
                military: true
            })
        }
    }
    //Upgrader
    let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
    let number = 1;
    let inBuild = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER)[0];
    if (level < 5 && !inBuild) {
        number = 6 - level;
    } else if (level >= 5 && room.energyState && level !== 8) number = 2;
    if (upgraders.length < number || (upgraders[0] && upgraders[0].ticksToLive < (upgraders[0].body.length * 3 + 10) && upgraders.length < number + 1)) {
        //If room is about to downgrade get a creep out asap
        let reboot;
        let priority = PRIORITIES.upgrader;
        if (room.controller.ticksToDowngrade <= 1500 || room.controller.progress > room.controller.progressTotal) {
            reboot = true;
            priority = 1;
        }
        queueCreep(room, priority + upgraders.length, {role: 'upgrader', reboot: reboot})
    }
};

//Non essential creeps
module.exports.miscCreepQueue = function (room) {
    let queueTracker = lastQueue[room.name] || {};
    let level = getLevel(room);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name && (!r.memory.destination || r.memory.destination === room.name));
    //Drones
    let inBuild = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD)[0];
    if (inBuild) {
        let drones = _.filter(roomCreeps, (c) => (c.memory.role === 'drone'));
        let priority = PRIORITIES.drone;
        let amount = 12 - level;
        if (drones.length < amount) {
            queueCreep(room, priority + drones.length, {role: 'drone', localCache: true})
        }
    }
    //LabTech
    if ((!queueTracker['labTech'] || queueTracker['labTech'] + 1400 <= Game.time) && room.terminal) {
        let labTech = _.filter(roomCreeps, (creep) => (creep.memory.role === 'labTech'));
        if (!labTech.length) {
            queueCreep(room, PRIORITIES.miscHauler, {role: 'labTech', localCache: true})
        }
        queueTracker['labTech'] = Game.time;
    }
    //Power
    if (level === 8 && room.energy >= ENERGY_AMOUNT && _.filter(room.structures, (s) => s.structureType === STRUCTURE_POWER_SPAWN)[0] && (!queueTracker['powerManager'] || queueTracker['powerManager'] + 1400 <= Game.time)) {
        let powerManager = _.filter(roomCreeps, (creep) => (creep.memory.role === 'powerManager'));
        if (!powerManager.length) {
            queueCreep(room, PRIORITIES.miscHauler, {role: 'powerManager', localCache: true})
        }
        queueTracker['powerManager'] = Game.time;
    }
    //SPECIALIZED
    //Expediter
    if (level >= 3 && (!queueTracker['expediter'] || queueTracker['expediter'] + 1400 <= Game.time)) {
        let expediter = _.filter(roomCreeps, (creep) => creep.memory.role === 'expediter');
        let needed = _.filter(roomCreeps, (creep) => creep.memory.needExpediter)[0];
        let amount = 1;
        if (needed && expediter.length < amount) {
            queueCreep(room, PRIORITIES.expediter, {role: 'expediter', localCache: true})
        }
        queueTracker['waller'] = Game.time;
    }
    //Waller
    if (level >= 2 && (!queueTracker['waller'] || queueTracker['waller'] + 1400 <= Game.time)) {
        let waller = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        let amount = 1;
        if (Memory.roomCache[room.name].responseNeeded) amount = 2;
        if (waller.length < amount) {
            queueCreep(room, PRIORITIES.waller + (waller.length * 3), {role: 'waller', localCache: true})
        }
        queueTracker['waller'] = Game.time;
    }
    //Mineral Harvester
    if (level >= 6 && room.mineral.mineralAmount && (!queueTracker['mineralHarvester'] || queueTracker['mineralHarvester'] + 1400 <= Game.time)) {
        let mineralHarvester = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'mineralHarvester');
        let extractor = room.structures.filter((s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
        if (extractor && !mineralHarvester.length) {
            queueCreep(room, PRIORITIES.mineralHarvester, {
                role: 'mineralHarvester',
                other: {
                    assignedMineral: room.mineral.id
                }
            })
        }
        queueTracker['mineralHarvester'] = Game.time;
    }
    // If no conflict detected
    if (!Memory.roomCache[room.name].responseNeeded && !room.memory.spawnBorderPatrol) {
        //Pre observer spawn explorers
        if (Memory.maxLevel < 8) {
            //Explorer
            if ((!queueTracker['explorer'] || queueTracker['explorer'] + 150 <= Game.time)) {
                let amount = 5;
                let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer');
                if (explorers.length < amount) {
                    queueCreep(room, PRIORITIES.explorer + explorers.length, {role: 'explorer'})
                }
                queueTracker['explorer'] = Game.time;
            }
        }
        // Portal explorers
        if ((!queueTracker['explorer'] || queueTracker['explorer'] + 1500 <= Game.time)) {
            if (_.filter(Memory.roomCache, (r) => r.portal && JSON.parse(r.portal)[0].destination.roomName).length) {
                for (let portalRoom of _.filter(Memory.roomCache, (r) => r.portal && JSON.parse(r.portal)[0].destination.roomName)) {
                    let explorer = _.filter(Game.creeps, (creep) => creep.memory.destination === portalRoom.name);
                    if (!explorer.length) {
                        queueCreep(room, PRIORITIES.explorer, {
                            role: 'explorer',
                            destination: portalRoom.name,
                            other: {
                                portalJump: JSON.parse(portalRoom.portal)[0].destination.roomName
                            }
                        });
                    }
                }
                queueTracker['explorer'] = Game.time;
            }
        }
        // Assist room
        if (level >= 3) {
            let safeToSupport = _.filter(Game.rooms, (r) => !r.hostileCreeps.length && (!Memory.roomCache[r.name] || !Memory.roomCache[r.name].lastPlayerSighting || Memory.roomCache[r.name].lastPlayerSighting + 100 < Game.time));
            let needDrones = _.sample(_.filter(safeToSupport, ((r) => r.name !== room.name && r.memory.buildersNeeded)));
            if (needDrones) {
                let drones = _.filter(Game.creeps, (creep) => (creep.memory.destination === needDrones.name || creep.memory.overlord === needDrones.name) && creep.memory.role === 'drone');
                let amount = ROOM_SOURCE_SPACE[needDrones.name] || 2;
                if (drones.length < amount) {
                    queueCreep(room, PRIORITIES.assistPioneer, {
                        role: 'drone',
                        destination: needDrones.name
                    });
                }
            }
            if (level >= 6 && room.energyState) {
                // Energy Supplies
                let needEnergy = _.sample(_.filter(safeToSupport, ((r) => r.name !== room.name && !r.energyState)));
                if (needEnergy && (!queueTracker['fuelTruck'] || queueTracker['fuelTruck'] + 1450 <= Game.time)) {
                    let fuelTruck = _.filter(Game.creeps, (creep) => creep.memory.destination === needEnergy.name && creep.memory.role === 'fuelTruck');
                    if (!fuelTruck.length) {
                        queueCreep(room, PRIORITIES.fuelTruck, {
                            role: 'fuelTruck',
                            destination: needEnergy.name
                        });
                        queueTracker['fuelTruck'] = Game.time;
                    }
                }
                // Power Level
                let upgraderRequested = _.sample(_.filter(safeToSupport, ((r) => r.name !== room.name && r.controller && r.controller.my && r.controller.level && r.controller.level + 1 < level)));
                if (upgraderRequested) {
                    let remoteUpgraders = _.filter(Game.creeps, (creep) => creep.memory.destination === upgraderRequested.name && creep.memory.role === 'remoteUpgrader');
                    if (!remoteUpgraders.length) {
                        queueCreep(room, PRIORITIES.remoteUpgrader + remoteUpgraders.length, {
                            role: 'remoteUpgrader',
                            destination: upgraderRequested.name
                        })
                    }
                }
                // Marauder
                if (POKE_ATTACKS && !queueTracker['marauder'] || queueTracker['marauder'] + 2500 <= Game.time) {
                    let marauder = _.filter(Game.creeps, (creep) => creep.memory.operation === 'marauding');
                    if (marauder.length < 2 && Math.random() > 0.5) {
                        queueCreep(room, PRIORITIES.medium, {
                            role: 'longbow',
                            operation: 'marauding',
                            military: true,
                            localCache: true
                        });
                    }
                    queueTracker['marauder'] = Game.time;
                }
            }
        }
    } // Border Patrol
    else if (room.memory.spawnBorderPatrol) {
        let borderPatrol = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.operation === 'borderPatrol');
        let count = 2;
        if (borderPatrol.length < count || (borderPatrol[0] && borderPatrol[0].ticksToLive < (borderPatrol[0].body.length * 3 + 10) && borderPatrol.length < count + 1)) {
            //let role = _.sample(['longbow', 'longbow', 'attacker']);
            queueCreep(room, PRIORITIES.borderPatrol + (borderPatrol.length * 2.5), {
                role: 'longbow',
                operation: 'borderPatrol',
                military: true
            });
        }
    }
    // Log queue tracking
    lastQueue[room.name] = queueTracker;
};

//Remote creeps
module.exports.remoteCreepQueue = function (room) {
    if (!Memory.roomCache) Memory.roomCache = {};
    room.memory.remoteRange = undefined;
    let level = getLevel(room);
    if (!remoteHives[room.name] || Math.random() > 0.95) {
        room.memory.remoteRooms = undefined;
        let adjacent = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && !Memory.roomCache[r].isHighway && !Memory.roomCache[r].owner);
        // Handle SK middle room
        if (level >= 7 && _.filter(adjacent, (r) => Memory.roomCache[r] && Memory.roomCache[r].sk).length) {
            let skAdjacent = _.filter(adjacent, (r) => Memory.roomCache[r] && Memory.roomCache[r].sk);
            skAdjacent = _.uniq(skAdjacent, _.filter(Game.map.describeExits(skAdjacent[0]), (r) => Memory.roomCache[r] && Memory.roomCache[r].sources >= 3 && !Memory.roomCache[r].sk));
            if (skAdjacent.length > 1) adjacent = _.uniq(adjacent, skAdjacent);
        }
        // Handle highway deadends
        if (!adjacent.length) {
            let highway = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && !Memory.roomCache[r].owner);
            if (highway.length) {
                let adjacent = _.filter(Game.map.describeExits(highway[0]), (r) => Memory.roomCache[r] && !Memory.roomCache[r].isHighway && !Memory.roomCache[r].owner);
            }
        }
        // Handle less than 3
        if (adjacent.length < 3) {
            let secondaryAdjacent = _.filter(Game.map.describeExits(adjacent[0]), (r) => Memory.roomCache[r] && Memory.roomCache[r].sources && !Memory.roomCache[r].owner && !Memory.roomCache[r].sk);
            if (secondaryAdjacent.length) adjacent = adjacent.concat(secondaryAdjacent);
        }
        remoteHives[room.name] = JSON.stringify(adjacent);
    }
    //Remotes
    if (remoteHives[room.name] && !Memory.roomCache[room.name].responseNeeded) {
        room.memory.spawnBorderPatrol = undefined;
        let remotes = JSON.parse(remoteHives[room.name]);
        for (let keys in shuffle(remotes)) {
            if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remotes[keys])) continue;
            // Handle invader cores
            if (Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].invaderCore && !Memory.roomCache[remotes[keys]].sk) {
                let guards = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.operation === 'guard');
                if (guards.length < 1 || (guards[0] && guards[0].ticksToLive < (guards[0].body.length * 3 + 10) && guards.length < 2)) {
                    queueCreep(room, PRIORITIES.borderPatrol, {
                        role: 'attacker',
                        operation: 'guard',
                        destination: remotes[keys],
                        military: true,
                        localCache: true
                    })
                }
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === remotes[keys]);
                let amount = 1;
                if (Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].reserverCap) amount = Memory.roomCache[remotes[keys]].reserverCap;
                if (reserver.length < amount && (!Memory.roomCache[remotes[keys]] || !Memory.roomCache[remotes[keys]].isHighway)) {
                    queueCreep(room, PRIORITIES.reserver + reserver.length, {
                        role: 'reserver',
                        reservationTarget: remotes[keys]
                    })
                }
            }
            // If owned or a highway continue
            if (Memory.roomCache[remotes[keys]] && (Memory.roomCache[remotes[keys]].level || !Memory.roomCache[remotes[keys]].sources)) continue;
            // If it's reserved by someone else continue
            if (Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].reservation && Memory.roomCache[remotes[keys]].reservation !== MY_USERNAME) continue;
            // Handle response needed
            if (Memory.roomCache[remotes[keys]] && !Memory.roomCache[remotes[keys]].sk && (Memory.roomCache[remotes[keys]].hostilePower > Memory.roomCache[remotes[keys]].friendlyPower || (Game.rooms[remotes[keys]] && Game.rooms[remotes[keys]].hostileCreeps.length)) && Memory.roomCache[remotes[keys]].lastInvaderCheck + 1000 > Game.time) {
                room.memory.spawnBorderPatrol = remotes[keys] && _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.operation === 'borderPatrol').length < 2;
                continue;
            }
            // Handle SK
            if (Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].sk && level >= 7 && (!Memory.roomCache[remotes[keys]].invaderCooldown || Memory.roomCache[remotes[keys]].invaderCooldown < Game.time - 50)) {
                let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.role === 'SKAttacker');
                if ((SKAttacker[0] && SKAttacker[0].ticksToLive < (SKAttacker[0].body.length * 3 + 10) && SKAttacker.length < 2) || SKAttacker.length < 1) {
                    queueCreep(room, PRIORITIES.SKWorker + 1, {
                        role: 'SKAttacker',
                        destination: remotes[keys]
                    })
                }
                let SKHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.role === 'SKHarvester');
                let sourceCount = Memory.roomCache[remotes[keys]].sources || 1;
                if (room.energyState !== 2 && SKHarvester.length < sourceCount && SKAttacker.length) {
                    queueCreep(room, PRIORITIES.SKWorker, {
                        role: 'SKHarvester',
                        destination: remotes[keys]
                    })
                }
                let SKMineral = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.role === 'SKMineral');
                if (!SKMineral.length && SKAttacker.length && (!Memory.roomCache[remotes[keys]].mineralCooldown || Memory.roomCache[remotes[keys]].mineralCooldown < Game.time)) {
                    queueCreep(room, PRIORITIES.SKWorker, {
                        role: 'SKMineral',
                        destination: remotes[keys]
                    })
                }
            } else if (!Memory.roomCache[remotes[keys]] || !Memory.roomCache[remotes[keys]].sk) {
                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.role === 'remoteHarvester');
                let sourceCount = 1;
                if (!room.energyState && Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].sources) sourceCount = Memory.roomCache[remotes[keys]].sources;
                if (remoteHarvester.length < sourceCount || (remoteHarvester[0] && remoteHarvester[0].ticksToLive < (remoteHarvester[0].body.length * 3 + 10) && remoteHarvester.length < sourceCount + 1)) {
                    queueCreep(room, PRIORITIES.remoteHarvester + remoteHarvester.length, {
                        role: 'remoteHarvester',
                        destination: remotes[keys]
                    })
                }
                if (Memory.roomCache[remotes[keys]] && (!Memory.roomCache[remotes[keys]].reservationExpires || Game.time > Memory.roomCache[remotes[keys]].reservationExpires)) {
                    let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === remotes[keys]);
                    let amount = 1;
                    if (Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].reserverCap) amount = Memory.roomCache[remotes[keys]].reserverCap;
                    if (reserver.length < amount && (!Memory.roomCache[remotes[keys]] || !Memory.roomCache[remotes[keys]].isHighway)) {
                        queueCreep(room, PRIORITIES.reserver + reserver.length, {
                            role: 'reserver',
                            reservationTarget: remotes[keys]
                        })
                    }
                }
            }
            // Remote Hauler
            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && (creep.memory.role === 'remoteHarvester' || creep.memory.role === 'SKHarvester'));
            if (remoteHarvester.length) {
                let remoteHaulers = _.filter(Game.creeps, (creep) => creep.my && creep.memory.role === 'remoteHauler' && creep.memory.destination === remotes[keys]).length;
                let target = 1;
                if (Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].sk) target = 2;
                let misc;
                if (Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].sources === 1) misc = true;
                if (remoteHaulers < target) {
                    queueCreep(room, PRIORITIES.remoteHauler, {
                        role: 'remoteHauler',
                        destination: remotes[keys],
                        misc: misc
                    })
                }
            }
        }
        // Remote Road Builder
        let roadBuilder = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'roadBuilder');
        let amount = 2;
        if (!remotes.length) amount = 1;
        if (roadBuilder.length < amount) {
            queueCreep(room, PRIORITIES.roadBuilder, {
                role: 'roadBuilder',
                misc: remoteHives[room.name]
            })
        }
    }
};

//Military creeps
module.exports.globalCreepQueue = function () {
    if (!_.size(Memory.targetRooms)) return;
    let queue = globalQueue;
    // Targets
    for (let key in shuffle(Memory.targetRooms)) {
        if (!Memory.targetRooms[key]) continue;
        let opLevel = Number(Memory.targetRooms[key].level) || 1;
        let escort = Memory.targetRooms[key].escort;
        let priority = Memory.targetRooms[key].priority || 4;
        //Observers
        if (opLevel === 0 && !Memory.targetRooms[key].observerCheck && Memory.targetRooms[key].type !== 'clean') {
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
        switch (Memory.targetRooms[key].type) {
            // Claiming
            case 'claim':
                let claimTarget = _.filter(Memory.targetRooms, (r) => r.type === 'claim')[0];
                if (claimTarget && !_.filter(Game.creeps, (c) => c.memory.role === 'claimer' && c.memory.destination === claimTarget.destination).length) {
                    queueGlobalCreep(PRIORITIES.claimer, {role: 'claimer', destination: claimTarget.destination});
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
                if ((commodityMiner.length < 2 || (commodityMiner[0] && commodityMiner[0].ticksToLive < (commodityMiner[0].body.length * 3 + 100) && commodityMiner.length < 3))) {
                    queueGlobalCreep(PRIORITIES.power, {role: 'commodityMiner', destination: key, military: true})
                }
                break;
            case 'power': //Power Mining
                if (Memory.roomCache[key].power < Game.time) {
                    Memory.targetRooms[key] = undefined;
                    Memory.roomCache[key].power = undefined;
                    break;
                }
                let powerHealer = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerHealer' && creep.memory.destination === key);
                if (!Memory.targetRooms[key].complete && !_.includes(queue, 'powerHealer') && (powerHealer.length < 2 || (powerHealer[0] && powerHealer[0].ticksToLive < (powerHealer[0].body.length * 3 + 100) && powerHealer.length < 3))) {
                    queueGlobalCreep(PRIORITIES.power, {role: 'powerHealer', destination: key, military: true})
                }
                let powerAttacker = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerAttacker' && creep.memory.destination === key);
                if (!Memory.targetRooms[key].complete && !_.includes(queue, 'powerAttacker') && (powerAttacker.length < 2 || (powerAttacker[0] && powerAttacker[0].ticksToLive < (powerAttacker[0].body.length * 3 + 100) && powerAttacker.length < 3)) && powerHealer.length) {
                    queueGlobalCreep(PRIORITIES.power - 1, {role: 'powerAttacker', destination: key, military: true})
                }
                let powerHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerHauler' && creep.memory.destination === key);
                if (Memory.targetRooms[key].hauler && !_.includes(queue, 'powerHauler') && powerHauler.length < Memory.targetRooms[key].hauler) {
                    queueGlobalCreep(PRIORITIES.power - 1, {role: 'powerHauler', destination: key, military: true})
                }
                break;
            case 'hold': //Hold Room
                let unClaimerNeeded = Memory.targetRooms[key].claimAttacker;
                let cleanerNeeded = Memory.targetRooms[key].cleaner;
                let longbows = 1;
                let reboot = true;
                if (opLevel > 1) {
                    longbows = 2;
                    reboot = false;
                }
                let longbow = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'longbow' && creep.memory.operation === 'hold');
                if ((longbow.length < longbows || (longbow[0] && longbow[0].ticksToLive < (longbow[0].body.length * 3 + 50) && longbow.length < longbows + 1))) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'hold',
                        military: true,
                        reboot: reboot
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
                        boostCheck: 'heal'
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
                let cleaningEscort = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'longbow');
                if (escort && cleaningEscort.length < deconstructors && !_.includes(queue, 'longbow')) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'guard',
                        military: true
                    })
                }
                break;
            case 'claimClear': //Claim Clearing
                let claimClear = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'claimer');
                if (!claimClear.length && !_.includes(queue, 'claimer')) {
                    queueGlobalCreep(2, {
                        role: 'claimer',
                        destination: key,
                        operation: 'claimClear',
                        military: true
                    })
                }
                break;
            case 'robbery': //Room Robbery
                let raider = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'raider');
                if (opLevel > 10) opLevel = 6;
                if (TEN_CPU) opLevel = 1;
                if (raider.length < opLevel && !_.includes(queue, 'raider')) {
                    queueGlobalCreep(priority, {
                        role: 'raider',
                        destination: key,
                        operation: 'robbery',
                        military: true
                    })
                }
                break;
            case 'harass': // Harass
                let harasser = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'longbow');
                let annoy = Memory.targetRooms[key].annoy;
                if ((harasser.length < opLevel * 2 || (harasser[0] && harasser[0].ticksToLive < (harasser[0].body.length * 3 + 50) && harasser.length < opLevel * 2 + 1))) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'harass',
                        waitFor: opLevel * 2,
                        military: true,
                        reboot: annoy
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
                        boostCheck: 'heal'
                    })
                }
                break;
            case 'siege': // Siege
                let sieger = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'siegeEngine');
                let siegeHealer = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'siegeHealer');
                if (opLevel > 2) opLevel = 2;
                if (sieger.length < siegeHealer.length) {
                    queueGlobalCreep(priority - 1, {
                        role: 'siegeEngine',
                        destination: key,
                        operation: 'siege',
                        military: true,
                        waitFor: opLevel * 2
                    })
                }
                if (siegeHealer.length < opLevel) {
                    queueGlobalCreep(priority, {
                        role: 'siegeHealer',
                        destination: key,
                        operation: 'siege',
                        military: true,
                        waitFor: opLevel * 2,
                        boostCheck: 'heal'
                    })
                }
                break;
            case 'swarm': // Swarm
                let swarm = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'swarm');
                if (swarm.length < (120 * opLevel) + 10) {
                    queueGlobalCreep(priority, {
                        role: 'swarm',
                        destination: key,
                        operation: 'swarm',
                        military: true,
                        waitFor: 110 * opLevel
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
                        waitFor: 2
                    })
                }
                let rangerUnClaimer = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'claimAttacker' && creep.memory.operation === 'rangers');
                if (Memory.targetRooms[key].claimAttacker && rangerUnClaimer.length < 1 || (rangerUnClaimer[0] && rangerUnClaimer[0].ticksToLive < (rangerUnClaimer[0].body.length * 3 + 10) && rangerUnClaimer.length < 2)) {
                    queueGlobalCreep(priority, {
                        role: 'claimAttacker',
                        destination: key,
                        operation: 'rangers',
                        military: true
                    })
                }
                break;
            case 'poke': // Pokes
                let jerk = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'jerk');
                if (jerk.length < 2) {
                    queueGlobalCreep(priority, {
                        role: 'jerk',
                        destination: key,
                        operation: 'poke',
                        military: true
                    })
                }
                break;
            case 'guard': // Room Guard
                let guards = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'longbow');
                if (guards.length < 2) {
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
        other: undefined,
        military: undefined,
        operation: undefined,
        siegePoint: undefined,
        waitFor: undefined,
        reservationTarget: undefined,
        initialBuilder: undefined,
        localCache: undefined,
        reboot: undefined,
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
            siegePoint: options.siegePoint,
            waitFor: options.waitFor,
            reservationTarget: options.reservationTarget,
            initialBuilder: options.initialBuilder,
            localCache: options.localCache,
            reboot: options.reboot,
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
        operation: undefined,
        siegePoint: undefined,
        waitFor: undefined,
        reservationTarget: undefined,
        initialBuilder: undefined,
        reboot: undefined,
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
        operation: options.operation,
        siegePoint: options.siegePoint,
        waitFor: options.waitFor,
        reservationTarget: options.reservationTarget,
        initialBuilder: options.initialBuilder,
        reboot: options.reboot,
        misc: options.misc
    };
    globalQueue = cache;
}

function determineEnergyOrder(room) {
    storedLevel[room.name] = getLevel(room);
    if (!room.memory.bunkerHub) return;
    if (!energyOrder[room.name] || Math.random() > 0.8) {
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
                nextClosest = hub.findClosestByPath(energyStructures, {filter: (s) => !_.includes(usedIdArray, s.id)});
            }
            if (!nextClosest) break;
            usedIdArray.push(nextClosest.id);
            rangeArray.push(nextClosest);
        }
        energyOrder[room.name] = JSON.stringify(rangeArray);
    }
}

function displayQueue(room, queue) {
    let roles = _.pluck(queue, 'role');
    let tickQueued = _.pluck(queue, 'cached');
    let priority = _.pluck(queue, 'priority');
    for (let i = 0; i < 5; i++) {
        if (!roles[i]) break;
        displayText(room, 38, 1, 'Creep Build Queue', true);
        displayText(room, 38, 2 + i, _.capitalize(roles[i]) + ' Priority- ' + priority[i] + ' Age- ' + (Game.time - tickQueued[i]), true);
    }
}