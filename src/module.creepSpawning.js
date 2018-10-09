/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let generator = require('module.bodyGenerator');

module.exports.processBuildQueue = function () {
    let spawns = Game.spawns;
    for (let key in spawns) {
        let spawn = spawns[key];
        let level = getLevel(spawn.room);
        if (level > spawns[key].room.controller.level) level = spawns[key].room.controller.level;
        let oldest = _.min(spawn.room.memory.creepBuildQueue, 'cached');
        if (oldest.priority > 3 && oldest.cached + 500 < Game.time) {
            log.a(spawn.room.name + ' Re-prioritizing creep queue, ' + oldest.role + ' is now priority ' + _.round(oldest.priority / 2));
            spawn.room.memory.creepBuildQueue[oldest.role].cached = Game.time;
            spawn.room.memory.creepBuildQueue[oldest.role].priority = _.round(oldest.priority / 2);
        }
        if (!spawn.spawning) {
            if (spawn.room.memory.creepBuildQueue || Memory.militaryBuildQueue) {
                let queue;
                if (level >= 2) {
                    queue = _.sortBy(Object.assign({}, spawn.room.memory.creepBuildQueue, Memory.militaryBuildQueue), 'importance');
                } else {
                    queue = _.sortBy(spawn.room.memory.creepBuildQueue, 'importance')
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
                    }
                    if (body && body.length) break;
                }
                if (!body || !body.length) continue;
                let cost = global.UNIT_COST(body);
                // Continue if you cant afford it
                if (cost > spawn.room.energyCapacityAvailable) continue;
                if (cost > spawn.room.energyAvailable) return spawn.say('Queued - ' + role.charAt(0).toUpperCase() + role.slice(1) + ' - Energy (' + spawn.room.energyAvailable + '/' + cost + ')');
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
                        misc: undefined
                    });
                    if (!topPriority.role) return;
                    switch (spawn.spawnCreep(body, role + '_' + spawn.room.name + '_T' + spawn.room.controller.level + '_' + _.random(1, 500), {
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
                            misc: topPriority.misc
                        }
                    })) {
                        case OK:
                            if (!topPriority.military) log.i(spawn.room.name + ' Spawning a ' + role);
                            if (topPriority.military) {
                                log.i(spawn.room.name + ' Spawning a ' + role + ' [Op: ' + topPriority.operation + ' in ' + topPriority.targetRoom + ']');
                                delete Memory.militaryBuildQueue;
                            }
                            return delete spawn.room.memory.creepBuildQueue[role];
                    }
                }
            }
        } else {
            let spawningCreep = Game.creeps[spawn.spawning.name];
            spawn.say(ICONS.build + ' ' + spawningCreep.name + ' - Ticks Remaining: ' + spawn.spawning.remainingTime);
        }
    }
};

function queueCreep(room, importance, options = {}, military = false) {
    let cache;
    if (!military) {
        cache = room.memory.creepBuildQueue || {};
        if (!room.memory.creepBuildQueue) room.memory.creepBuildQueue = {};
    } else {
        cache = Memory.militaryBuildQueue || {};
        if (!Memory.militaryBuildQueue) Memory.militaryBuildQueue = {};
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
            reboot: options.reboot,
            misc: options.misc
        };
        if (!military) {
            if (!room.memory.creepBuildQueue[key]) room.memory.creepBuildQueue = cache;
        } else {
            if (!Memory.militaryBuildQueue[key]) Memory.militaryBuildQueue = cache;
        }
    }
}

function queueMilitaryCreep(importance, options = {}) {
    let cache;
    cache = Memory.militaryBuildQueue || {};
    if (!Memory.militaryBuildQueue) Memory.militaryBuildQueue = {};
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
    if (!Memory.militaryBuildQueue[key]) Memory.militaryBuildQueue = cache;
}

function roomStartup(room, roomCreeps) {
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (harvesters.length < 2) {
        queueCreep(room, 1 + (harvesters.length * 2), {role: 'stationaryHarvester'})
    }
    let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
    if (pawn.length < 2) {
        queueCreep(room, 2, {role: 'hauler'})
    }
    let worker = _.filter(roomCreeps, (creep) => (creep.memory.role === 'worker'));
    if (worker.length < 5) {
        queueCreep(room, 4, {role: 'worker'})
    }
    let upgrader = _.filter(roomCreeps, (creep) => (creep.memory.role === 'upgrader'));
    if (upgrader.length < 2) {
        queueCreep(room, 3, {role: 'upgrader'})
    }
    let explorers = _.filter(roomCreeps, (creep) => creep.memory.role === 'explorer');
    if (explorers.length < 5) {
        queueCreep(room, 5, {role: 'explorer'})
    }
    let tower = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    if (tower.length) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        let amount = 1;
        if (wallers.length < amount) {
            queueCreep(room, PRIORITIES.waller + wallers.length, {role: 'waller'})
        }
    }
    if (room.memory.responseNeeded === true) {
        let queue = room.memory.creepBuildQueue;
        if (!_.includes(queue, 'responder')) {
            let count = room.memory.numberOfHostiles;
            if (room.memory.threatLevel < 3) count = 1;
            let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.name && creep.memory.role === 'responder');
            if (responder.length < count) {
                queueCreep(room, PRIORITIES.responder, {role: 'responder', responseTarget: room.name, military: true})
            }
        }
        if (!_.includes(queue, 'longbow') && room.memory.threatLevel > 2) {
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.name && creep.memory.role === 'longbow');
            if (longbow.length < _.round(room.memory.numberOfHostiles / 3) + 1) {
                queueCreep(room, PRIORITIES.responder + 1, {
                    role: 'longbow',
                    responseTarget: room.name,
                    military: true,
                    misc: 'vary'
                })
            }
        }
    }
}

module.exports.workerCreepQueue = function (room) {
    let queue = room.memory.creepBuildQueue;
    let level = getLevel(room);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name);
    // Level 1 room management
    if (level === 1) {
        return roomStartup(room, roomCreeps);
    }
    //Harvesters
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (harvesters.length === 0) {
        delete room.memory.creepBuildQueue;
        return queueCreep(room, -1, {role: 'stationaryHarvester', reboot: true});
    }
    if (!_.includes(queue, 'stationaryHarvester')) {
        if (harvesters.length < 2 || (harvesters[0].ticksToLive < 100 && harvesters.length < 3)) {
            queueCreep(room, PRIORITIES.stationaryHarvester, {role: 'stationaryHarvester'})
        }
    }
    //Upgrader
    if (!_.includes(queue, 'upgrader') && !room.memory.responseNeeded) {
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
        let priority = PRIORITIES.upgrader;
        if (upgraders.length && level >= 4) priority = priority + upgraders.length;
        let number = 1;
        if (room.controller.level < 4) number = _.round((20 - level) / 2);
        if (upgraders.length < number || (upgraders[0].ticksToLive < 100 && upgraders.length < number + 1)) {
            queueCreep(room, priority, {role: 'upgrader'})
        }
    }
    //Worker
    if (!_.includes(queue, 'worker') && !room.memory.responseNeeded) {
        let amount = 0;
        if (_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL).length) amount = 3;
        let workers = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker');
        if (workers.length < amount) {
            queueCreep(room, PRIORITIES.worker, {role: 'worker'})
        } else if (level <= 3 && workers.length < _.size(room.constructionSites) * 1.5 && !TEN_CPU) {
            queueCreep(room, (PRIORITIES.upgrader - 1) + workers.length, {role: 'worker'})
        }
    }
    //Repairer
    if (level >= 3 && !_.includes(queue, 'repairer') && !room.memory.responseNeeded) {
        let amount = 1;
        let repairers = _.filter(roomCreeps, (creep) => creep.memory.role === 'repairer');
        if (repairers.length < amount) {
            queueCreep(room, PRIORITIES.worker, {role: 'repairer'})
        }
    }
    //Haulers
    let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
    if (hauler.length === 0) {
        delete room.memory.creepBuildQueue;
        return queueCreep(room, -1, {role: 'hauler', reboot: true});
    }
    if (!_.includes(queue, 'hauler')) {
        let amount = 1;
        if (level < 6) amount = 2;
        let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
        if ((hauler[0].ticksToLive < 250 && hauler.length <= amount) || hauler.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {role: 'hauler'})
        }
    }
    if (level >= 6 && !_.includes(queue, 'labTech') && room.memory.reactionRoom && _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB)[0]) {
        let amount = 1;
        let labTech = _.filter(roomCreeps, (creep) => (creep.memory.role === 'labTech'));
        if (labTech.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {role: 'labTech'})
        }
    }
    //SPECIALIZED
    //Waller
    let tower = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    if (level >= 4 && !_.includes(queue, 'waller') && tower.length) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        let amount = 1;
        if (room.memory.energySurplus) amount = 2;
        if (room.memory.extremeEnergySurplus) amount = 3;
        if (TEN_CPU) amount = 1;
        if (wallers.length < amount) {
            queueCreep(room, PRIORITIES.waller + wallers.length, {role: 'waller'})
        }
    }
    //Mineral Harvester
    if (level >= 6 && !_.includes(queue, 'mineralHarvester') && level === room.controller.level && !room.memory.responseNeeded && room.constructionSites.length === 0) {
        let mineralHarvesters = _.filter(roomCreeps, (creep) => creep.memory.role === 'mineralHarvester');
        let extractor = _.filter(room.structures, (s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
        if (mineralHarvesters.length < 1 && extractor && room.mineral[0].mineralAmount > 0) {
            queueCreep(room, PRIORITIES.mineralHarvester, {
                role: 'mineralHarvester',
                assignedMineral: room.mineral[0].id
            })
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
    }
    //Explorer
    if (!_.includes(queue, 'explorer') && level < 8 && !TEN_CPU && !room.memory.responseNeeded) {
        let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer');
        if (explorers.length < 8 - level) {
            queueCreep(room, PRIORITIES.explorer + explorers.length, {role: 'explorer'})
        }
    }
    //Jerk
    if (!_.includes(queue, 'jerk') && level >= 2 && !TEN_CPU && !room.memory.responseNeeded) {
        let jerks = _.filter(Game.creeps, (creep) => creep.memory.role === 'jerk' || creep.memory.role === 'explorer');
        if (jerks.length < 0) {
            queueCreep(room, PRIORITIES.jerk + jerks.length, {role: 'jerk'})
        }
    }
    //Claim Stuff
    if (!_.includes(queue, 'claimer') && room.memory.claimTarget && !room.memory.responseNeeded) {
        if (!Game.rooms[room.memory.claimTarget] || !Game.rooms[room.memory.claimTarget].controller.my) {
            let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'claimer');
            if (claimer.length < 1 && !_.includes(Memory.ownedRooms, room.memory.claimTarget) && !room.memory.activeClaim) {
                queueCreep(room, PRIORITIES.pioneer - 1, {role: 'claimer', destination: room.memory.claimTarget})
            }
        }
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'pioneer');
        if (!_.includes(queue, 'pioneer') && pioneers.length < -2 + level) {
            queueCreep(room, PRIORITIES.pioneer + pioneers.length, {
                role: 'pioneer',
                destination: room.memory.claimTarget,
                initialBuilder: true
            })
        }
    }
    // Assist room
    let needyRoom = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.memory.buildersNeeded && room.shibRoute(r.name).length - 1 <= 15))[0];
    if (needyRoom && !room.memory.responseNeeded) {
        if (!_.includes(queue, 'pioneer')) {
            let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === needyRoom.name && (creep.memory.role === 'pioneer' || creep.memory.role === 'worker'));
            if (pioneers.length < 5) {
                queueCreep(room, PRIORITIES.pioneer + pioneers.length, {
                    role: 'pioneer',
                    destination: needyRoom.name
                })
            }
        }
    }
    // Power Level
    let upgradeAssist = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.controller.level + 1 < level))[0];
    if (upgradeAssist && room.memory.energySurplus && level >= 6 && !room.memory.responseNeeded && !_.includes(queue, 'remoteUpgrader')) {
        let remoteUpgraders = _.filter(Game.creeps, (creep) => creep.memory.destination === upgradeAssist.name && creep.memory.role === 'remoteUpgrader');
        if (remoteUpgraders.length < 2) {
            queueCreep(room, PRIORITIES.remoteUpgrader + remoteUpgraders.length, {
                role: 'remoteUpgrader',
                destination: upgradeAssist.name
            })
        }
    }
};

module.exports.remoteCreepQueue = function (room) {
    let level = getLevel(room);
    let queue = room.memory.creepBuildQueue;
    let range = room.memory.remoteRange || 1;
    let sources = 0;
    // Set harvester target
    let harvesterTarget = 7;
    if (room.memory.energySurplus) harvesterTarget = 4;
    if (room.memory.extremeEnergySurplus) harvesterTarget = 1;
    if (level >= 2 && (!room.memory.remoteRange || Game.time % 200 === 0)) {
        range:
            for (range = 1; range < 4; range++) {
                for (let keys in room.memory.remoteRooms) {
                    if (!Memory.roomCache[room.memory.remoteRooms[keys]] || room.shibRoute(room.memory.remoteRooms[keys]).length - 1 > range ||
                        checkIfSK(room.memory.remoteRooms[keys]) || Memory.roomCache[room.memory.remoteRooms[keys]].owner) continue;
                    if (Memory.roomCache[room.memory.remoteRooms[keys]] && (Memory.roomCache[room.memory.remoteRooms[keys]].reservation && Memory.roomCache[room.memory.remoteRooms[keys]].reservation !== USERNAME)) continue;
                    let roomSources = Memory.roomCache[room.memory.remoteRooms[keys]].sources.length || 0;
                    sources = sources + roomSources;
                    if (sources >= harvesterTarget) break range;
                }
            }
        room.memory.remoteRange = range;
    }
    let responseNeeded = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.memory.requestingSupport && room.shibRoute(r.name).length - 1 < 15))[0];
    if (responseNeeded && !_.includes(queue, 'remoteResponse')) {
        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === responseNeeded.name && creep.memory.role === 'remoteResponse');
        if (responder.length < 3) {
            queueCreep(room, PRIORITIES.remoteResponse, {
                role: 'remoteResponse',
                responseTarget: responseNeeded.name,
                military: true
            })
        }
    }
    //Remotes
    if (room.memory.remoteRooms) {
        let totalRemoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'remoteHarvester');
        for (let keys in room.memory.remoteRooms) {
            let remoteRoom = Game.rooms[room.memory.remoteRooms[keys]];
            if (room.shibRoute(room.memory.remoteRooms[keys]).length - 1 > range || checkIfSK(room.memory.remoteRooms[keys])) continue;
            if (Memory.roomCache[room.memory.remoteRooms[keys]] && (Memory.roomCache[room.memory.remoteRooms[keys]].reservation && Memory.roomCache[room.memory.remoteRooms[keys]].reservation !== USERNAME)) continue;
            if (Memory.roomCache[room.memory.remoteRooms[keys]] && Memory.roomCache[room.memory.remoteRooms[keys]].owner) continue;
            // Check if room is hostile
            let roomThreat;
            if ((Game.rooms[room.memory.remoteRooms[keys]] && Game.rooms[room.memory.remoteRooms[keys]].memory.responseNeeded) || (Memory.roomCache[room.memory.remoteRooms[keys]] && (Memory.roomCache[room.memory.remoteRooms[keys]].threatLevel || Memory.roomCache[room.memory.remoteRooms[keys]].hostiles))) roomThreat = true;
            if (!roomThreat && !room.memory.responseNeeded && !_.includes(queue, 'reserver') && level >= 6 && !TEN_CPU && (!remoteRoom || (!remoteRoom.memory.responseNeeded && (!remoteRoom.memory.reservationExpires || remoteRoom.memory.reservationExpires <= Game.time)))) {
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === room.memory.remoteRooms[keys]);
                if (reserver.length < 1) {
                    let priority = PRIORITIES.remoteHarvester + 1;
                    if (room.memory.energySurplus) priority = PRIORITIES.remoteHarvester - 1;
                    if (room.memory.extremeEnergySurplus) priority = PRIORITIES.remoteHarvester - 2;
                    queueCreep(room, priority, {
                        role: 'reserver',
                        reservationTarget: room.memory.remoteRooms[keys]
                    })
                }
            }
            if (!roomThreat && !room.memory.responseNeeded && !_.includes(queue, 'remoteHarvester') && !TEN_CPU && (!remoteRoom || (remoteRoom && !remoteRoom.memory.responseNeeded))) {
                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester');
                let sourceCount = 1;
                if (Memory.roomCache[room.memory.remoteRooms[keys]] && Memory.roomCache[room.memory.remoteRooms[keys]].sources) sourceCount = Memory.roomCache[room.memory.remoteRooms[keys]].sources.length;
                if (remoteHarvester.length < sourceCount && totalRemoteHarvester.length < harvesterTarget) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
            if (!roomThreat && !room.memory.responseNeeded && !_.includes(queue, 'pioneer') && !TEN_CPU && remoteRoom && remoteRoom.memory.requestingPioneer && !remoteRoom.memory.responseNeeded) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'pioneer');
                if (pioneers.length < 1) {
                    queueCreep(room, PRIORITIES.pioneer, {
                        role: 'pioneer',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
        }
        // Remote Response
        if (!_.includes(queue, 'remoteGuard')) {
            let remoteGuard = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'remoteGuard');
            if (remoteGuard.length < 1) {
                queueCreep(room, PRIORITIES.urgent, {
                    role: 'remoteGuard',
                    awaitingOrders: true,
                    military: true
                })
            }
        }
        if (!_.includes(queue, 'remoteMedic')) {
            let remoteMedic = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'remoteMedic');
            if (remoteMedic.length < 1) {
                queueCreep(room, PRIORITIES.urgent, {
                    role: 'remoteMedic',
                    military: true
                })
            }
        }
        if (!_.includes(queue, 'remoteHauler') && !room.memory.responseNeeded) {
            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'remoteHarvester');
            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler' && creep.memory.overlord === room.name);
            if (remoteHauler.length < remoteHarvester.length) {
                queueCreep(room, PRIORITIES.remoteHauler, {role: 'remoteHauler'})
            }
        }
    }
    //SK Rooms
    if (level >= 7 && room.memory.skRooms && !room.memory.responseNeeded && !TEN_CPU) {
        let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.role === 'SKattacker' && creep.memory.overlord === room.name);
        if (!_.includes(queue, 'SKattacker') && SKAttacker.length < 1) {
            queueCreep(room, PRIORITIES.SKattacker, {role: 'SKattacker', misc: room.memory.skRooms})
        }
        for (let key in room.memory.skRooms) {
            let SKRoom = Game.rooms[room.memory.skRooms[key]];
            if (!SKRoom) continue;
            let SKmineral = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.skRooms[key] && creep.memory.role === 'SKmineral');
            if (!_.includes(queue, 'SKmineral') && SKmineral.length < 1 && SKAttacker.length > 0) {
                queueCreep(room, PRIORITIES.SKworker, {role: 'SKmineral', destination: room.memory.skRooms[key]})
            }
        }
    }

    //Power Mining
    if (level >= 7 && !TEN_CPU && room.memory.powerRooms && room.memory.energySurplus && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
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

module.exports.militaryCreepQueue = function () {
    if (!_.size(Memory.targetRooms)) return;
    let queue = Memory.militaryBuildQueue;
    // Targets
    for (let key in shuffle(Memory.targetRooms)) {
        let stagingRoom;
        let opLevel = Memory.targetRooms[key].level;
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
        for (let staging in Memory.stagingRooms) {
            if (Game.map.getRoomLinearDistance(staging, key) === 1) {
                stagingRoom = staging;
            }
        }
        //Room Scouting
        if (Memory.targetRooms[key].type === 'attack') {
            let totalScout = _.filter(Game.creeps, (creep) => creep.memory.role === 'scout');
            let scout = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'scout');
            if (totalScout.length < 3 && !scout.length && !_.includes(queue, 'scout')) {
                queueMilitaryCreep(2, {role: 'scout', targetRoom: key, military: true})
            }
        }
        // Hold
        if (Memory.targetRooms[key].type === 'hold') {
            let unClaimerNeeded = Memory.targetRooms[key].unClaimer;
            let longbows = 0;
            let attackers = 0;
            let healers = 0;
            let waitFor = 2;
            if (opLevel === 1) {
                longbows = 2;
            } else if (opLevel === 2) {
                longbows = 3;
            } else if (opLevel >= 3) {
                longbows = 2;
                attackers = 1;
                healers = 1;
            }
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if ((longbow.length < longbows || (longbow[0] && longbow[0].ticksToLive <= 500 && longbow.length < longbows + 1)) && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'hold',
                    waitFor: waitFor,
                    military: true
                })
            }
            let attacker = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'attacker');
            if ((attacker.length < attackers || (attacker[0] && attacker[0].ticksToLive <= 500 && attacker.length < attackers + 1)) && !_.includes(queue, 'attacker')) {
                queueMilitaryCreep(priority, {
                    role: 'attacker',
                    targetRoom: key,
                    operation: 'hold',
                    waitFor: waitFor,
                    military: true
                })
            }
            let healer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'healer');
            if ((healer.length < healers || (healer[0] && healer[0].ticksToLive <= 500 && healer.length < healers + 1)) && !_.includes(queue, 'healer') && longbow.length) {
                queueMilitaryCreep(priority, {
                    role: 'healer',
                    targetRoom: key,
                    operation: 'hold',
                    waitFor: waitFor,
                    military: true
                })
            }
            let unClaimer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'unClaimer');
            if (unClaimerNeeded && (unClaimer.length < 1 || (unClaimer[0] && unClaimer[0].ticksToLive <= 125 && unClaimer.length < 2)) && !_.includes(queue, 'unClaimer') && longbow.length) {
                queueMilitaryCreep(priority, {
                    role: 'unClaimer',
                    targetRoom: key,
                    operation: 'hold',
                    waitFor: waitFor,
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
            if ((longbow.length < opLevel * 2 || (longbow[0] && longbow[0].ticksToLive <= 500 && longbow.length < opLevel * 2 + 1)) && !_.includes(queue, 'longbow')) {
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
            if ((drainer.length < drainers || (drainer[0] && drainer[0].ticksToLive <= 500)) && !_.includes(queue, 'drainer')) {
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
            if (swarm.length < 60 * opLevel && !_.includes(queue, 'swarm')) {
                queueMilitaryCreep(priority, {
                    role: 'swarm',
                    targetRoom: key,
                    operation: 'swarm',
                    military: true,
                    waitFor: 50 * opLevel,
                    staging: stagingRoom
                })
            }
        }
        // Swarm Harass
        if (Memory.targetRooms[key].type === 'swarmHarass') {
            let swarm = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'swarm');
            if (swarm.length < 4 * opLevel && !_.includes(queue, 'swarm')) {
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
            let rangers = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if (rangers.length < 5 * opLevel && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'rangers',
                    military: true,
                    waitFor: 4 * opLevel,
                    staging: stagingRoom
                })
            }
        }
    }
};

function checkIfSK(roomName) {
    let parsed;
    if (!parsed) parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
    let fMod = parsed[1] % 10;
    let sMod = parsed[2] % 10;
    return !(fMod === 5 && sMod === 5) && ((fMod >= 4) && (fMod <= 6)) && ((sMod >= 4) && (sMod <= 6));
}