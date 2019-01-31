/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let generator = require('module.bodyGenerator');
const lastQueue = {};
let roomQueue = {};
let militaryQueue = {};
let energyOrder = {};
let storedLevel = {};
let remoteHives = {};
let skRooms = {};

//Build Creeps From Queue
module.exports.processBuildQueue = function () {
    let spawns = Game.spawns;
    for (let key in spawns) {
        let spawn = spawns[key];
        let level = getLevel(spawn.room);
        if (!energyOrder[spawn.pos.roomName] || storedLevel[spawn.pos.roomName] !== level) determineEnergyOrder(spawn.room);
        if (level > spawns[key].room.controller.level) level = spawns[key].room.controller.level;
        let oldest = _.min(roomQueue[spawn.room.name], 'cached');
        if (oldest.priority > 3 && oldest.cached + 100 < Game.time) {
            log.a(spawn.room.name + ' Re-prioritizing creep queue, ' + oldest.role + ' is now priority ' + (oldest.priority - 1));
            roomQueue[spawn.room.name][oldest.role].cached = Game.time;
            roomQueue[spawn.room.name][oldest.role].priority = oldest.priority - 1;
        }
        if (militaryQueue) {
            let oldest = _.min(militaryQueue, 'cached');
            if (oldest.priority > 3 && oldest.cached + 100 < Game.time) {
                log.a('Re-prioritizing military creep queue, ' + oldest.role + ' is now priority ' + (oldest.priority - 1));
                roomQueue[spawn.room.name][oldest.role].cached = Game.time;
                roomQueue[spawn.room.name][oldest.role].priority = oldest.priority - 1;
            }
        }
        if (!spawn.spawning) {
            if (roomQueue[spawn.room.name] || militaryQueue) {
                let queue;
                let maxLevel = _.max(Memory.ownedRooms, 'controller.level').controller.level;
                if (!spawn.room.memory.responseNeeded && level >= 2 && _.inRange(level, maxLevel - 1, maxLevel + 1) && (spawn.room.memory.state >= 1 || !roomQueue[spawn.room.name] || !roomQueue[spawn.room.name].length) && !_.size(spawn.room.constructionSites)) {
                    queue = _.sortBy(Object.assign({}, militaryQueue, roomQueue[spawn.room.name]), 'importance');
                } else {
                    queue = _.sortBy(roomQueue[spawn.room.name], 'importance')
                }
                let topPriority;
                let body;
                let role;
                for (let key in queue) {
                    topPriority = queue[key];
                    if (topPriority.targetRoom && Game.map.findRoute(topPriority.targetRoom, spawn.room.name).length > 20) continue;
                    role = topPriority.role;
                    if (topPriority.misc && topPriority.misc === 'vary') level = _.random(_.round(level / 1.5), level);
                    if (topPriority.reboot || level === 1) {
                        body = _.get(SPAWN[0], role);
                    } else {
                        body = generator.bodyGenerator(level, role, spawn.room);
                        let cost = global.UNIT_COST(body);
                    }
                    if (body && body.length && global.UNIT_COST(body) <= spawn.room.energyCapacityAvailable) break;
                }
                let cost = global.UNIT_COST(body);
                if (cost > spawn.room.energyAvailable) {
                    spawn.say('Queued - ' + role.charAt(0).toUpperCase() + role.slice(1) + ' - Energy (' + spawn.room.energyAvailable + '/' + cost + ')');
                    continue;
                }
                if (topPriority && typeof topPriority === 'object') {
                    _.defaults(topPriority, {
                        role: undefined,
                        overlord: undefined,
                        assignedSource: undefined,
                        destination: undefined,
                        assignedMineral: undefined,
                        military: undefined,
                        responseTarget: undefined,
                        targetRoom: undefined,
                        operation: undefined,
                        siegePoint: undefined,
                        staging: undefined,
                        waitFor: undefined,
                        reservationTarget: undefined,
                        initialBuilder: undefined,
                        localCache: undefined,
                        misc: undefined
                    });
                    if (!topPriority.role) continue;
                    let name = role + '_' + spawn.room.name + '_T' + level + '_' + _.random(1, 100);
                    if (topPriority.operation) name = topPriority.operation + '_' + spawn.room.name + '_T' + level + '_' + _.random(1, 100);
                    switch (spawn.spawnCreep(body, name, {
                        memory: {
                            born: Game.time,
                            role: role,
                            overlord: spawn.room.name,
                            assignedSource: topPriority.assignedSource,
                            destination: topPriority.destination,
                            assignedMineral: topPriority.assignedMineral,
                            military: topPriority.military,
                            responseTarget: topPriority.responseTarget,
                            targetRoom: topPriority.targetRoom,
                            operation: topPriority.operation,
                            siegePoint: topPriority.siegePoint,
                            staging: topPriority.staging,
                            waitFor: topPriority.waitFor,
                            reservationTarget: topPriority.reservationTarget,
                            initialBuilder: topPriority.initialBuilder,
                            localCache: topPriority.localCache,
                            misc: topPriority.misc
                        },
                        energyStructures: JSON.parse(energyOrder[spawn.pos.roomName])
                    })) {
                        case OK:
                            if (!topPriority.operation) log.d(spawn.room.name + ' Spawning a ' + role);
                            if (topPriority.military && militaryQueue) delete militaryQueue[role];
                            if (topPriority.buildCount && roomQueue[spawn.room.name][role]) return roomQueue[spawn.room.name][role].buildCount = topPriority.buildCount - 1;
                            if (roomQueue[spawn.room.name]) delete roomQueue[spawn.room.name][role];
                    }
                }
            }
        } else {
            let spawningCreep = Game.creeps[spawn.spawning.name];
            spawn.say(ICONS.build + ' ' + spawningCreep.name + ' - Ticks Remaining: ' + spawn.spawning.remainingTime);
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
    if (drones.length < roomSourceSpace[room.name] + 4) {
        queueCreep(room, priority, {role: 'drone'})
    }
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (!_.includes(queue, 'stationaryHarvester')) {
        if (harvesters.length < 2 || (harvesters[0].ticksToLive < (harvesters[0].body.length * 3 + 10) && harvesters.length < 3)) {
            queueCreep(room, 2, {role: 'stationaryHarvester'})
        }
    }
    if (!_.includes(queue, 'explorer') && !room.memory.responseNeeded) {
        let amount = 3;
        let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer');
        if (explorers.length < amount) {
            queueCreep(room, PRIORITIES.explorer + explorers.length, {role: 'explorer'})
        }
    }
    if (room.memory.responseNeeded === true) {
        if (!_.includes(queue, 'responder')) {
            let count = room.memory.numberOfHostiles;
            if (room.memory.threatLevel < 3) count = 1;
            let responder = _.filter(roomCreeps, (creep) => creep.memory.responseTarget === room.name && creep.memory.role === 'responder');
            if (responder.length < count) {
                queueCreep(room, PRIORITIES.responder, {role: 'responder', responseTarget: room.name, military: true})
            }
        }
    }
};

//Essential creeps
module.exports.essentialCreepQueue = function (room) {
    //Static room info
    let queue = roomQueue[room.name];
    let level = getLevel(room);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name);
    //Harvesters
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (harvesters.length === 0) {
        delete roomQueue[room.name];
        return queueCreep(room, 1, {role: 'stationaryHarvester', reboot: true});
    } else if (!_.includes(queue, 'stationaryHarvester')) {
        if (harvesters.length < 2 || (harvesters[0].ticksToLive < (harvesters[0].body.length * 3 + 10) && harvesters.length < 3)) {
            queueCreep(room, PRIORITIES.stationaryHarvester, {role: 'stationaryHarvester'})
        }
    }
    //Haulers
    if (room.storage || room.memory.hubLink || room.memory.hubLinks || room.memory.hubContainer) {
        let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
        if (hauler.length === 0) {
            delete roomQueue[room.name];
            return queueCreep(room, -1, {role: 'hauler', reboot: true, localCache: true});
        } else if (!_.includes(queue, 'hauler')) {
            let amount = 1;
            if ((hauler[0] && hauler[0].ticksToLive < (hauler[0].body.length * 6 + 10) && hauler.length < amount + 1) || hauler.length < amount) {
                queueCreep(room, PRIORITIES.hauler, {role: 'hauler', localCache: true})
            }
        }
    }
    //Filler
    if (!_.includes(queue, 'filler') && _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' && c.memory.containerAttempt && !c.memory.linkID)).length) {
        let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' && c.memory.containerAttempt && !c.memory.linkID));
        let filler = _.filter(roomCreeps, (c) => (c.memory.role === 'filler'));
        if ((filler[0] && filler[0].ticksToLive < (filler[0].body.length * 3 + 10) && filler.length < harvesters.length + 1) || filler.length < harvesters.length) {
            queueCreep(room, PRIORITIES.hauler, {role: 'filler', localCache: true})
        }
    }
    // Local Responder
    if (room.memory.responseNeeded || room.memory.earlyWarning) {
        if (!_.includes(queue, 'responder') && room.memory.threatLevel > 2) {
            let count = 1;
            if (room.memory.threatLevel >= 3 && room.memory.numberOfHostiles) count = room.memory.numberOfHostiles * 0.5;
            let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.name && creep.memory.role === 'responder');
            if (responder.length < count) {
                queueCreep(room, PRIORITIES.responder, {role: 'responder', responseTarget: room.name, military: true})
            }
        }
        if (!_.includes(queue, 'longbow') && room.memory.threatLevel > 3) {
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.name && creep.memory.role === 'longbow');
            if (longbow.length < _.round(room.memory.numberOfHostiles / 3) + 1) {
                queueCreep(room, PRIORITIES.responder, {
                    role: 'longbow',
                    responseTarget: room.name,
                    military: true
                })
            }
        }
    } else {
        //Remove old queues
        if (_.includes(queue, 'responder')) delete roomQueue[room.name]['responder'];
        //Upgrader
        if (!_.includes(queue, 'upgrader')) {
            let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
            let number = 2;
            if (room.controller.level === 8 || level !== room.controller.level) number = 1;
            let importantBuilds = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER).length;
            if (!TEN_CPU && room.controller.level < 4 && !importantBuilds) number = _.round((12 - level) / 2);
            //If room is about to downgrade get a creep out asap
            let reboot;
            let priority = PRIORITIES.upgrader;
            if (room.controller.ticksToDowngrade <= 1500 || room.controller.progress > room.controller.progressTotal) {
                reboot = true;
                priority = 1;
            }
            if (upgraders.length < number || (upgraders[0] && upgraders[0].ticksToLive < (upgraders[0].body.length * 3 + 10) && upgraders.length < number + 1)) {
                queueCreep(room, priority, {role: 'upgrader', reboot: reboot})
            }
        }
        // Assist room
        if (level >= 4) {
            let needyRooms = _.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.memory.buildersNeeded && !r.memory.responseNeeded && Game.map.getRoomLinearDistance(room.name, r.name) <= 15);
            if (!_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART).length && needyRooms.length && !room.memory.responseNeeded) {
                for (let needyRoom of needyRooms) {
                    if (!_.includes(queue, 'drone')) {
                        let drones = _.filter(Game.creeps, (creep) => creep.memory.destination === needyRoom.name && creep.memory.role === 'drone');
                        let amount = roomSourceSpace[needyRoom.name] + 2;
                        if (drones.length < amount) {
                            queueCreep(room, PRIORITIES.assistPioneer, {
                                role: 'drone',
                                destination: needyRoom.name
                            });
                        }
                    }
                }
            }
            // Remote response
            let responseNeeded = _.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.memory.requestingSupport && Game.map.getRoomLinearDistance(room.name, r.name) <= 15);
            if (responseNeeded.length && !room.memory.responseNeeded) {
                for (let responseRoom of responseNeeded) {
                    if (!_.includes(queue, 'remoteResponse')) {
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === responseRoom.name && creep.memory.role === 'remoteResponse');
                        if (responder.length < 3) {
                            queueCreep(room, PRIORITIES.remoteResponse, {
                                role: 'remoteResponse',
                                responseTarget: responseRoom.name,
                                military: true
                            })
                        }
                    }
                }
            }
        }
    }
};

//Non essential creeps
module.exports.miscCreepQueue = function (room) {
    let queue = roomQueue[room.name];
    let queueTracker = lastQueue[room.name] || {};
    let level = getLevel(room);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name && (!r.memory.destination || r.memory.destination === room.name));
    //Drones
    if (_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART).length && !_.includes(queue, 'drone')) {
        let drones = _.filter(roomCreeps, (c) => (c.memory.role === 'drone'));
        let amount = roomSourceSpace[room.name] || 1;
        if (amount > room.constructionSites.length) amount = room.constructionSites.length;
        if (amount <= 1 || room.memory.responseNeeded || TEN_CPU) amount = 2;
        if (drones.length < amount) {
            queueCreep(room, PRIORITIES.drone, {role: 'drone', localCache: true})
        }
    }
    //LabTech
    if (!_.includes(queue, 'labTech') && _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB)[0]) {
        let labTech = _.filter(roomCreeps, (creep) => (creep.memory.role === 'labTech'));
        if (labTech.length < 1) {
            queueCreep(room, PRIORITIES.hauler, {role: 'labTech', localCache: true})
        }
    }
    //SPECIALIZED
    //Waller
    if (!_.includes(queue, 'waller')) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        let amount = 1;
        let lowRampart = _.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 10000);
        if (_.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART).length || level < 5 || lowRampart.length) amount = 2;
        if (wallers.length < amount) {
            queueCreep(room, PRIORITIES.waller, {role: 'waller', localCache: true})
        }
    }
    //Mineral Harvester
    if (_.filter(room.structures, (s) => s.structureType === STRUCTURE_EXTRACTOR)[0] && !_.includes(queue, 'mineralHarvester') && level === room.controller.level && !room.memory.responseNeeded && room.mineral[0].mineralAmount > 0) {
        let mineralHarvesters = _.filter(roomCreeps, (creep) => creep.memory.role === 'mineralHarvester');
        if (mineralHarvesters.length < 1) {
            queueCreep(room, PRIORITIES.mineralHarvester, {
                role: 'mineralHarvester',
                assignedMineral: room.mineral[0].id
            })
        }
    }
    //Herald
    if (Memory.tickLength && Memory.tickLength > 2 && !_.includes(queue, 'herald') && !TEN_CPU) {
        let herald = _.filter(roomCreeps, (creep) => creep.memory.role === 'herald');
        if (!herald.length) {
            queueCreep(room, PRIORITIES.explorer, {role: 'herald'})
        }
    }
    //Explorer
    if (!_.includes(queue, 'explorer') && !room.memory.responseNeeded && (!queueTracker['explorer'] || queueTracker['explorer'] + 4500 <= Game.time)) {
        let amount = 1;
        let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer');
        if (explorers.length < amount) {
            queueCreep(room, PRIORITIES.explorer + explorers.length, {role: 'explorer'})
        }
        queueTracker['explorer'] = Game.time;
    }
    //Jerk
    /**
     if (!_.includes(queue, 'jerk') && level >= 2 && !TEN_CPU && !room.memory.responseNeeded) {
        let jerks = _.filter(Game.creeps, (creep) => creep.memory.role === 'jerk' || creep.memory.role === 'explorer');
        if (jerks.length < (10 - level) / 2) {
            queueCreep(room, PRIORITIES.jerk + jerks.length, {role: 'jerk'})
        }
    }**/
    //Claim Stuff
    if (!_.includes(queue, 'claimer') && room.memory.claimTarget && !room.memory.responseNeeded) {
        let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'claimer');
        if (claimer.length < 1 && !_.includes(Memory.ownedRooms, room.memory.claimTarget) && !room.memory.activeClaim) {
            queueCreep(room, PRIORITIES.claimer, {role: 'claimer', destination: room.memory.claimTarget})
        }
    }
    // Assist room
    if (level >= 4 && !TEN_CPU) {
        let needyRoom = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.memory.buildersNeeded && !r.memory.responseNeeded && Game.map.getRoomLinearDistance(room.name, r.name) <= 15))[0];
        if (needyRoom && !room.memory.responseNeeded) {
            if (!_.includes(queue, 'fuelTruck') && level >= 6 && room.storage && room.memory.state > 1 && (!queueTracker['fuelTruck'] || queueTracker['fuelTruck'] + 200 <= Game.time)) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === needyRoom.name && (creep.memory.role === 'pioneer' || creep.memory.role === 'worker' || creep.memory.role === 'drone'));
                let fuelTruck = _.filter(Game.creeps, (creep) => creep.memory.destination === needyRoom.name && creep.memory.role === 'fuelTruck');
                if (fuelTruck.length < 1 && pioneers.length > 1) {
                    queueCreep(room, PRIORITIES.fuelTruck, {
                        role: 'fuelTruck',
                        destination: needyRoom.name
                    });
                    queueTracker['fuelTruck'] = Game.time;
                }
            }
        }
        // Power Level
        let upgradeAssist = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.controller.level + 1 < level))[0];
        if (upgradeAssist && room.memory.state > 1 && level >= 6 && !room.memory.responseNeeded && !_.includes(queue, 'remoteUpgrader')) {
            let remoteUpgraders = _.filter(Game.creeps, (creep) => creep.memory.destination === upgradeAssist.name && creep.memory.role === 'remoteUpgrader');
            if (remoteUpgraders.length < 1) {
                queueCreep(room, PRIORITIES.remoteUpgrader + remoteUpgraders.length, {
                    role: 'remoteUpgrader',
                    destination: upgradeAssist.name
                })
            }
        }
        // Messenger
        /**let sayHello = shuffle(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && r.level && _.includes(FRIENDLIES, r.user) && Game.map.getRoomLinearDistance(room.name, r.name) <= 7))[0];
        if (sayHello && !room.memory.responseNeeded && !_.includes(queue, 'messenger')) {
            let messengers = _.filter(Game.creeps, (creep) => creep.memory.role === 'messenger');
            let currentMessenger = _.filter(Game.creeps, (creep) => creep.memory.destination === sayHello.name && creep.memory.role === 'messenger');
            if (!currentMessenger.length && messengers.length < 3) {
                queueCreep(room, PRIORITIES.explorer, {
                    role: 'messenger',
                    destination: sayHello.name
                })
            }
        }**/
    }
    // Log queue tracking
    lastQueue[room.name] = queueTracker;
};

//Remote creeps
module.exports.remoteCreepQueue = function (room) {
    if (!Memory.roomCache) Memory.roomCache = {};
    room.memory.remoteRange = undefined;
    let level = getLevel(room);
    let queue = roomQueue[room.name];
    if (!remoteHives[room.name] || Math.random() > 0.95) {
        room.memory.remoteRooms = undefined;
        let adjacent = Game.map.describeExits(room.name);
        let possibles;
        possibles = _.filter(adjacent, (r) => Memory.roomCache[r] && (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && !Memory.roomCache[r].isHighway && !Memory.roomCache[r].sk);
        if (!possibles.length) possibles = adjacent;
        remoteHives[room.name] = JSON.stringify(possibles);
    }
    /**
     //SK Rooms
     if (!TEN_CPU && level >= 8 && (!skRooms[room.name] || Math.random() > 0.95)) {
        let adjacent = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r].sk);
        if (adjacent.length) skRooms[room.name] = adjacent[0]; else skRooms[room.name] = undefined;
    }
     if (!TEN_CPU && level >= 9 && skRooms[room.name] && !room.memory.responseNeeded && !TEN_CPU) {
        let SKSupport = _.filter(Game.creeps, (creep) => creep.memory.role === 'SKsupport' && creep.memory.overlord === room.name);
        if (!_.includes(queue, 'SKsupport') && (SKSupport.length < 1 || SKSupport[0] && SKSupport[0].ticksToLive < 100 && SKSupport.length < 2)) {
            queueCreep(room, PRIORITIES.SKsupport, {role: 'SKsupport', destination: skRooms[room.name]})
        }
        let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.role === 'SKattacker' && creep.memory.overlord === room.name);
        if (!_.includes(queue, 'SKattacker') && (SKAttacker.length < 1 || SKAttacker[0] && SKAttacker[0].ticksToLive < 200 && SKAttacker.length < 2) && SKSupport.length) {
            queueCreep(room, PRIORITIES.SKattacker, {role: 'SKattacker', destination: skRooms[room.name]})
        }
        if (!_.includes(queue, 'SKworker') && SKAttacker.length && SKSupport.length) {
            let SKworker = _.filter(Game.creeps, (creep) => creep.memory.destination === skRooms[room.name] && creep.memory.role === 'SKworker');
            let sourceCount = 1;
            if (Memory.roomCache[skRooms[room.name]] && Memory.roomCache[skRooms[room.name]].sources) sourceCount = Memory.roomCache[skRooms[room.name]].sources;
            if (SKworker.length < sourceCount + 1) {
                queueCreep(room, PRIORITIES.SKworker, {
                    role: 'SKworker',
                    destination: skRooms[room.name]
                })
            }
        }
        if (!_.includes(queue, 'pioneer') && SKAttacker.length && SKSupport.length) {
            let pioneer = _.filter(Game.creeps, (creep) => creep.memory.destination === skRooms[room.name] && creep.memory.role === 'pioneer');
            if (pioneer.length < 1) {
                queueCreep(room, PRIORITIES.pioneer, {
                    role: 'pioneer',
                    destination: skRooms[room.name]
                })
            }
        }
    }
     **/
    //Remotes
    if (remoteHives[room.name] && !room.memory.responseNeeded) {
        let responseNeeded;
        let responseRoom;
        let heavyResponse;
        let remotes = JSON.parse(remoteHives[room.name]);
        for (let keys in remotes) {
            if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remotes[keys])) continue;
            if (Memory.roomCache[remotes[keys]] && ((Memory.roomCache[remotes[keys]].user && Memory.roomCache[remotes[keys]].user !== USERNAME) || Memory.roomCache[remotes[keys]].sk)) continue;
            // Check if room is hostile
            let roomThreat;
            if ((Game.rooms[remotes[keys]] && Game.rooms[remotes[keys]].memory.responseNeeded) || (Memory.roomCache[remotes[keys]] && (Memory.roomCache[remotes[keys]].threatLevel || Memory.roomCache[remotes[keys]].hostiles))) roomThreat = true;
            if (!responseNeeded && Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].threatLevel > 0) {
                responseNeeded = true;
                responseRoom = remotes[keys];
                // If many hostiles or hostiles are players spawn more
                if (Memory.roomCache[remotes[keys]].threatLevel > 2) heavyResponse = true;
            }
            if (roomThreat) continue;
            let remoteRoom = Game.rooms[remotes[keys]];
            //All in One
            if (!_.includes(queue, 'remoteAllInOne')) {
                let remoteAllInOne = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.role === 'remoteAllInOne');
                let sourceCount = 1;
                if (Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].sources && room.energy < ENERGY_AMOUNT) sourceCount = Memory.roomCache[remotes[keys]].sources;
                if (remoteAllInOne.length < sourceCount) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteAllInOne',
                        destination: remotes[keys],
                        localCache: true
                    })
                }
            }
            if (level >= 4 && !_.includes(queue, 'reserver') && (!remoteRoom || (!remoteRoom.memory.reservationExpires || remoteRoom.memory.reservationExpires <= Game.time))) {
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === remotes[keys]);
                if (reserver.length < 1) {
                    queueCreep(room, PRIORITIES.reserver, {
                        role: 'reserver',
                        reservationTarget: remotes[keys]
                    })
                }
            }
            /**
             // If not in non sub mode
             if (!TEN_CPU) {
                //Pioneers
                if (!_.includes(queue, 'pioneer') && remoteRoom) {
                    let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.role === 'pioneer');
                    if (pioneers.length < 1) {
                        queueCreep(room, PRIORITIES.remotePioneer, {
                            role: 'pioneer',
                            destination: remotes[keys],
                            localCache: true
                        })
                    }
                }
                //Reserver
                if (level >= 4 && !_.includes(queue, 'reserver') && (!remoteRoom || (!remoteRoom.memory.reservationExpires || remoteRoom.memory.reservationExpires <= Game.time))) {
                    // Cache number of spaces around sources for things
                    if (!roomControllerSpace[remotes[keys]]) {
                        let spaces = 1;
                        if (Game.rooms[remotes[keys]] && Game.rooms[remotes[keys]].controller) {
                            spaces += Game.rooms[remotes[keys]].controller.pos.countOpenTerrainAround();
                        }
                        roomControllerSpace[remotes[keys]] = spaces;
                    }
                    let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === remotes[keys]);
                    if (reserver.length < 1) {
                        let priority = PRIORITIES.remoteHarvester + 1;
                        if (room.memory.energySurplus) priority = PRIORITIES.remoteHarvester;
                        queueCreep(room, priority, {
                            role: 'reserver',
                            reservationTarget: remotes[keys]
                        })
                    }
                }
                //Harvesters
                if (!_.includes(queue, 'remoteHarvester')) {
                    let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.role === 'remoteHarvester');
                    let sourceCount = 1;
                    if (!TEN_CPU && Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].sources && room.energy < ENERGY_AMOUNT) sourceCount = Memory.roomCache[remotes[keys]].sources;
                    if (remoteHarvester.length < sourceCount) {
                        queueCreep(room, PRIORITIES.remoteHarvester, {
                            role: 'remoteHarvester',
                            destination: remotes[keys]
                        })
                    }
                }
            } else {
                //All in One
                if (!_.includes(queue, 'remoteAllInOne')) {
                    let remoteAllInOne = _.filter(Game.creeps, (creep) => creep.memory.destination === remotes[keys] && creep.memory.role === 'remoteAllInOne');
                    let sourceCount = 1;
                    if (!TEN_CPU && Memory.roomCache[remotes[keys]] && Memory.roomCache[remotes[keys]].sources && room.energy < ENERGY_AMOUNT) sourceCount = Memory.roomCache[remotes[keys]].sources;
                    if (remoteAllInOne.length < sourceCount) {
                        queueCreep(room, PRIORITIES.remoteHarvester, {
                            role: 'remoteAllInOne',
                            destination: remotes[keys],
                            localCache: true
                        })
                    }
                }
            }
             **/
        }
        // Remote Hauler
        if (!TEN_CPU && !_.includes(queue, 'remoteHauler')) {
            let remoteHarvesters = _.filter(Game.creeps, (creep) => creep.my && creep.memory.overlord === room.name && creep.memory.role === 'remoteHarvester');
            let remoteHauler = _.filter(Game.creeps, (creep) => creep.my && creep.memory.role === 'remoteHauler' && creep.memory.overlord === room.name);
            let count = remoteHarvesters.length - 1 || 1;
            if (remoteHauler.length < count) {
                queueCreep(room, PRIORITIES.remoteHauler, {
                    role: 'remoteHauler',
                    localCache: true
                })
            }
        }
        // Border Patrol
        if (!TEN_CPU && responseNeeded) {
            let borderPatrol = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.operation === 'borderPatrol' && creep.memory.role === 'longbow');
            let count = 1;
            if (!TEN_CPU && heavyResponse) count = 2;
            if (!_.includes(queue, 'longbow') && (borderPatrol.length < count || (borderPatrol[0].ticksToLive < (borderPatrol[0].body.length * 3 + 10) && borderPatrol.length < count + 1))) {
                queueCreep(room, PRIORITIES.borderPatrol, {
                    role: 'longbow',
                    operation: 'borderPatrol',
                    responseTarget: responseRoom,
                    military: true,
                    localCache: true
                });
            }
            let riotPatrol = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.operation === 'borderPatrol' && creep.memory.role === 'attacker');
            if (!_.includes(queue, 'attacker') && riotPatrol.length < count) {
                queueCreep(room, PRIORITIES.borderPatrol, {
                    role: 'attacker',
                    operation: 'borderPatrol',
                    responseTarget: responseRoom,
                    military: true,
                    localCache: true
                });
            }
        }
    }

    //Power Mining
    if (level >= 9 && room.memory.state > 2 && !TEN_CPU && room.memory.powerRooms && room.memory.energySurplus && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
        for (let key in room.memory.powerRooms) {
            let powerRoom = room.memory.powerRooms[key];
            if ((powerRoom.decayOn <= Game.time + 2000 && powerRoom.hits === 2000000) || powerRoom.decayOn < Game.time) {
                delete room.memory.powerRooms[key];
                continue;
            }
            let powerHealer = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerHealer' && creep.memory.destination === key);
            if (!_.includes(queue, 'powerHealer') && powerHealer.length < 1) {
                queueCreep(room, PRIORITIES.Power, {role: 'powerHealer', destination: key})
            }
            let powerAttacker = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerAttacker' && creep.memory.destination === key);
            if (!_.includes(queue, 'powerAttacker') && powerAttacker.length < 2 && powerHealer.length > 0) {
                queueCreep(room, PRIORITIES.Power - 1, {role: 'powerAttacker', destination: key})
            }
            let powerHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'powerHauler' && creep.memory.destination === key);
            if (!_.includes(queue, 'powerHauler') && powerHauler.length < 1 && powerAttacker.length > 0 && powerHealer.length > 0 && powerRoom.hits <= 100000) {
                queueCreep(room, PRIORITIES.scout, {role: 'powerHauler', destination: key})
            }
        }
    }
};

//Military creeps
module.exports.militaryCreepQueue = function () {
    if (!_.size(Memory.targetRooms)) return;
    let queue = militaryQueue;
    // Targets
    for (let key in shuffle(Memory.targetRooms)) {
        let stagingRoom;
        let opLevel = Number(Memory.targetRooms[key].level);
        let escort = Memory.targetRooms[key].escort;
        let priority = Memory.targetRooms[key].priority || 4;
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
        }
        //Number fatigue
        if (_.size(Memory.targetRooms) > _.size(Memory.ownedRooms)) priority += 1;
        for (let staging in Memory.stagingRooms) {
            if (Game.map.getRoomLinearDistance(staging, key) === 1) {
                stagingRoom = staging;
            }
        }
        //Observers
        if (opLevel === 0) {
            let observer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'observer');
            if ((observer.length < 1 || (observer[0] && observer[0].ticksToLive < (observer[0].body.length * 3 + 10) && observer.length < 2)) && !_.includes(queue, 'observer')) {
                queueMilitaryCreep(PRIORITIES.priority, {
                    role: 'observer',
                    targetRoom: key,
                    military: true
                })
            }
            continue;
        }
        //Claim Scouting
        if (Memory.targetRooms[key].type === 'claimScout') {
            let claimScout = _.filter(Game.creeps, (creep) => creep.memory.role === 'claimScout');
            if (!claimScout.length && !_.includes(queue, 'claimScout')) {
                queueMilitaryCreep(PRIORITIES.priority, {role: 'claimScout', targetRoom: key, military: true})
            }
        }
        //Room Scouting
        if (Memory.targetRooms[key].type === 'attack' || Memory.targetRooms[key].type === 'scout') {
            let totalScout = _.filter(Game.creeps, (creep) => creep.memory.role === 'scout');
            let scout = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'scout');
            if (totalScout.length < 3 && !scout.length && !_.includes(queue, 'scout')) {
                queueMilitaryCreep(PRIORITIES.priority, {role: 'scout', targetRoom: key, military: true})
            }
        }
        // Hold
        if (Memory.targetRooms[key].type === 'hold') {
            let unClaimerNeeded = Memory.targetRooms[key].unClaimer;
            let longbows = 1;
            let reboot = true;
            if (opLevel > 1) {
                longbows = 2;
                reboot = false;
            }
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow' && creep.memory.operation === 'hold');
            if ((longbow.length < longbows || (longbow[0] && longbow[0].ticksToLive < (longbow[0].body.length * 3 + 50) && longbow.length < longbows + 1)) && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'hold',
                    military: true,
                    reboot: reboot
                })
            }
            let unClaimer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'unClaimer' && creep.memory.operation === 'hold');
            if (unClaimerNeeded && (unClaimer.length < 1 || (unClaimer[0] && unClaimer[0].ticksToLive < (unClaimer[0].body.length * 3 + 10) && unClaimer.length < 2)) && !_.includes(queue, 'unClaimer') && longbow.length) {
                queueMilitaryCreep(priority, {
                    role: 'unClaimer',
                    targetRoom: key,
                    operation: 'hold',
                    military: true
                })
            }
        }
        // Group Siege
        if (Memory.targetRooms[key].type === 'siegeGroup') {
            let siegeEngines = 1;
            let healers = 2;
            let siegeEngine = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeEngine' && creep.memory.operation === 'siegeGroup');
            if ((siegeEngine.length < siegeEngines || (siegeEngine[0] && siegeEngine[0].ticksToLive < (siegeEngine[0].body.length * 3 + 50) && siegeEngine.length < siegeEngines + 1)) && !_.includes(queue, 'siegeEngine')) {
                queueMilitaryCreep(priority, {
                    role: 'siegeEngine',
                    targetRoom: key,
                    operation: 'siegeGroup',
                    military: true
                })
            }
            let healer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'healer' && creep.memory.operation === 'siegeGroup');
            if ((healer.length < healers || (healer[0] && healer[0].ticksToLive < (healer[0].body.length * 3 + 50) && healer.length < healers + 1)) && !_.includes(queue, 'healer') && siegeEngine.length) {
                queueMilitaryCreep(priority, {
                    role: 'healer',
                    targetRoom: key,
                    operation: 'siegeGroup',
                    military: true
                })
            }
        }
        // Clean
        if (Memory.targetRooms[key].type === 'clean') {
            let deconstructors = 1;
            if (opLevel === 1) {
                deconstructors = 1;
            } else if (opLevel === 2) {
                deconstructors = 2;
            } else if (opLevel === 3) {
                deconstructors = 3;
            }
            let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'deconstructor');
            if (deconstructor.length < deconstructors && !_.includes(queue, 'deconstructor')) {
                queueMilitaryCreep(priority, {
                    role: 'deconstructor',
                    targetRoom: key,
                    operation: 'clean',
                    military: true,
                    staging: stagingRoom
                })
            }
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if (escort && longbow.length < deconstructors && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'guard',
                    military: true,
                    staging: stagingRoom
                })
            }
        }
        //Claim clear
        if (Memory.targetRooms[key].type === 'claimClear') {
            let claimer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'claimer');
            if (!claimer.length && !_.includes(queue, 'claimer')) {
                queueMilitaryCreep(2, {
                    role: 'claimer', targetRoom: key,
                    operation: 'claimClear', military: true
                })
            }
        }
        // Robbery
        if (Memory.targetRooms[key].type === 'robbery') {
            let raider = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'raider');
            if (opLevel > 10) opLevel = 6;
            if (raider.length < opLevel && !_.includes(queue, 'raider')) {
                queueMilitaryCreep(priority, {
                    role: 'raider',
                    targetRoom: key,
                    operation: 'robbery',
                    military: true,
                    staging: stagingRoom
                })
            }
        }
        // Harass
        if (Memory.targetRooms[key].type === 'harass') {
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            let annoy = Memory.targetRooms[key].annoy;
            if ((longbow.length < opLevel * 2 || (longbow[0] && longbow[0].ticksToLive < (longbow[0].body.length * 3 + 50) && longbow.length < opLevel * 2 + 1)) && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'harass',
                    waitFor: opLevel * 2,
                    military: true,
                    reboot: annoy
                })
            }
        }
        // Drain
        if (Memory.targetRooms[key].type === 'drain') {
            let drainers = 0;
            if (opLevel === 1) {
                drainers = 1;
            } else if (opLevel === 2) {
                drainers = 2;
            } else if (opLevel >= 3) {
                drainers = 3;
            }
            let drainer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'drainer');
            if ((drainer.length < drainers || (drainer[0] && drainer[0].ticksToLive < (drainer[0].body.length * 3 + 50) && drainer.length < drainers + 1)) && !_.includes(queue, 'drainer')) {
                queueMilitaryCreep(priority, {
                    role: 'drainer',
                    targetRoom: key,
                    operation: 'drain',
                    military: true,
                    staging: stagingRoom
                })
            }
        }
        // Siege
        if (Memory.targetRooms[key].type === 'siege' && Memory.targetRooms[key].activeSiege) {
            let siegeEngine = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeEngine');
            let siegeHealer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeHealer');
            if (opLevel > 2) opLevel = 2;
            if (siegeEngine.length < siegeHealer.length && !_.includes(queue, 'siegeEngine')) {
                queueMilitaryCreep(priority, {
                    role: 'siegeEngine',
                    targetRoom: key,
                    operation: 'siege',
                    military: true,
                    waitFor: opLevel * 2,
                    staging: stagingRoom
                })
            }
            if (siegeHealer.length < opLevel && !_.includes(queue, 'siegeHealer')) {
                queueMilitaryCreep(priority, {
                    role: 'siegeHealer',
                    targetRoom: key,
                    operation: 'siege',
                    military: true,
                    waitFor: opLevel * 2,
                    staging: stagingRoom
                })
            }
        }
        // Swarm
        if (Memory.targetRooms[key].type === 'swarm') {
            let swarm = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'swarm');
            if (swarm.length < (120 * opLevel) + 10 && !_.includes(queue, 'swarm')) {
                queueMilitaryCreep(priority, {
                    role: 'swarm',
                    targetRoom: key,
                    operation: 'swarm',
                    military: true,
                    waitFor: 110 * opLevel,
                    staging: stagingRoom
                })
            }
        }
        // Swarm Harass
        if (Memory.targetRooms[key].type === 'swarmHarass') {
            let swarm = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'swarm');
            if (swarm.length < (4 * opLevel) + 10 && !_.includes(queue, 'swarm')) {
                queueMilitaryCreep(priority, {
                    role: 'swarm',
                    targetRoom: key,
                    operation: 'swarmHarass',
                    military: true,
                    waitFor: 4 * opLevel,
                    staging: stagingRoom
                })
            }
        }
        // Rangers
        if (Memory.targetRooms[key].type === 'rangers') {
            let number = 2;
            if (opLevel > 1) number = 3;
            let rangers = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if (rangers.length < number && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'rangers',
                    military: true,
                    waitFor: 2,
                    staging: stagingRoom
                })
            }
        }
        // Rangers
        if (Memory.targetRooms[key].type === 'conscripts') {
            let number = 10;
            if (opLevel > 1) number = 20;
            let conscripts = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'conscript');
            if (conscripts.length < number + 2 && !_.includes(queue, 'conscript')) {
                queueMilitaryCreep(priority, {
                    role: 'conscript',
                    targetRoom: key,
                    operation: 'conscripts',
                    military: true,
                    waitFor: number,
                    staging: stagingRoom
                })
            }
        }
        // Pokes
        if (Memory.targetRooms[key].type === 'poke') {
            let jerk = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'jerk');
            if (jerk.length < 1 && !_.includes(queue, 'jerk')) {
                queueMilitaryCreep(priority, {
                    role: 'jerk',
                    targetRoom: key,
                    operation: 'poke',
                    military: true
                })
            }
        }
        // Guard
        if (Memory.targetRooms[key].type === 'guard') {
            let rangers = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if (rangers.length < 2 && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(PRIORITIES.priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'guard',
                    military: true
                })
            }
        }
    }
};

function queueCreep(room, importance, options = {}, military = false) {
    let cache;
    if (!military) {
        cache = roomQueue[room.name] || {};
        if (cache[options.role]) return;
    } else {
        cache = militaryQueue || {};
        if (cache[options.role]) return;
    }
    _.defaults(options, {
        role: undefined,
        assignedSource: undefined,
        destination: undefined,
        assignedMineral: undefined,
        military: undefined,
        responseTarget: undefined,
        targetRoom: undefined,
        operation: undefined,
        siegePoint: undefined,
        staging: undefined,
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
            importance: importance,
            role: options.role,
            assignedSource: options.assignedSource,
            destination: options.destination,
            assignedMineral: options.assignedMineral,
            military: options.military,
            responseTarget: options.responseTarget,
            targetRoom: options.targetRoom,
            operation: options.operation,
            siegePoint: options.siegePoint,
            staging: options.staging,
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
            militaryQueue = cache;
        }
    }
}

function queueMilitaryCreep(importance, options = {}) {
    let cache;
    cache = militaryQueue || {};
    if (cache[options.role]) return;
    _.defaults(options, {
        role: undefined,
        assignedSource: undefined,
        destination: undefined,
        assignedMineral: undefined,
        military: undefined,
        responseTarget: undefined,
        targetRoom: undefined,
        operation: undefined,
        siegePoint: undefined,
        staging: undefined,
        waitFor: undefined,
        reservationTarget: undefined,
        initialBuilder: undefined,
        reboot: undefined,
        misc: undefined
    });
    let key = options.role;
    cache[key] = {
        cached: Game.time,
        importance: importance,
        role: options.role,
        assignedSource: options.assignedSource,
        destination: options.destination,
        assignedMineral: options.assignedMineral,
        military: options.military,
        responseTarget: options.responseTarget,
        targetRoom: options.targetRoom,
        operation: options.operation,
        siegePoint: options.siegePoint,
        staging: options.staging,
        waitFor: options.waitFor,
        reservationTarget: options.reservationTarget,
        initialBuilder: options.initialBuilder,
        reboot: options.reboot,
        misc: options.misc
    };
    militaryQueue = cache;
}

function determineEnergyOrder(room) {
    if (!room.memory.bunkerHub) return;
    let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    let energyStructures = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION);
    let rangeArray = [];
    let usedIdArray = [];
    for (let x = 0; x < energyStructures.length; x++) {
        let nextClosest = hub.findClosestByPath(energyStructures, {filter: (s) => !_.includes(usedIdArray, s.id)});
        if (!nextClosest) break;
        usedIdArray.push(nextClosest.id);
        rangeArray.push(nextClosest);
    }
    storedLevel[room.name] = getLevel(room);
    energyOrder[room.name] = JSON.stringify(rangeArray);
}