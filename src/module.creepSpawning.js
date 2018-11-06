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

module.exports.processBuildQueue = function () {
    let spawns = Game.spawns;
    for (let key in spawns) {
        let spawn = spawns[key];
        let level = getLevel(spawn.room);
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
                if (!spawn.room.memory.responseNeeded && level >= 2 && _.inRange(level, maxLevel - 1, maxLevel + 1) && spawn.room.memory.state >= 1) {
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
                            misc: topPriority.misc
                        }
                    })) {
                        case OK:
                            if (!topPriority.operation) log.i(spawn.room.name + ' Spawning a ' + role);
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

function roomStartup(room, roomCreeps) {
    let level = getLevel(room);
    let queue = roomQueue[room.name];
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (harvesters.length < 2) {
        queueCreep(room, 2 + (harvesters.length * 2), {role: 'stationaryHarvester'})
    }
    let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
    if (pawn.length < 1) {
        queueCreep(room, 3, {role: 'hauler'})
    }
    let worker = _.filter(roomCreeps, (creep) => (creep.memory.role === 'worker'));
    let number = 0;
    if (level !== room.controller.level) number = 5;
    if (worker.length < number) {
        queueCreep(room, 4, {role: 'worker'})
    }
    let upgrader = _.filter(roomCreeps, (creep) => (creep.memory.role === 'upgrader'));
    number = 3 * level;
    if (upgrader.length < number) {
        queueCreep(room, 3 + (upgrader.length / 2), {role: 'upgrader'})
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
    let maxLevel = _.max(Memory.ownedRooms, 'controller.level').controller.level;
    let queue = roomQueue[room.name];
    let queueTracker = lastQueue[room.name] || {};
    let level = getLevel(room);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name);
    // Level 1 room management
    if (level < 2) {
        return roomStartup(room, roomCreeps);
    }
    //Harvesters
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (harvesters.length === 0) {
        delete roomQueue[room.name];
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
        if (upgraders.length && level >= 2) priority = priority + upgraders.length;
        let number = 2;
        if (room.controller.level >= 6) number = 1;
        let importantBuilds = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER).length;
        if (room.controller.level < 8 && room.memory.energySurplus) number = 2;
        if (room.controller.level < 4 && !importantBuilds) number = _.round((10 - level) / 2);
        //If room is about to downgrade get a creep out asap
        let reboot;
        if (level !== room.controller.level || (room.controller.level >= 4 && room.memory.state < 3)) number = 1;
        if (room.controller.ticksToDowngrade <= 1500) reboot = true;
        if (upgraders.length < number || (upgraders[0] && upgraders[0].ticksToLive < 100 && upgraders.length < number + 1)) {
            queueCreep(room, priority + (upgraders.length * 2), {role: 'upgrader', reboot: reboot})
        }
    }
    //Worker
    if (!_.includes(queue, 'worker') && !room.memory.responseNeeded) {
        let amount = 0;
        if (_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL).length) amount = 2;
        let workers = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker');
        if (workers.length < amount) {
            queueCreep(room, PRIORITIES.worker, {role: 'worker'})
        } else if (level <= 2 && workers.length < _.size(room.constructionSites) * 1.5 && !TEN_CPU) {
            queueCreep(room, (PRIORITIES.upgrader - 1) + workers.length, {role: 'worker'})
        }
    }
    //Repairer
    if (level >= 3 && !_.includes(queue, 'repairer') && !room.memory.responseNeeded) {
        let amount = 1;
        let repairers = _.filter(roomCreeps, (creep) => creep.memory.role === 'repairer');
        if (repairers.length < amount) {
            queueCreep(room, PRIORITIES.repairer, {role: 'repairer'})
        }
    }
    //Haulers
    let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
    if (hauler.length === 0) {
        delete roomQueue[room.name];
        return queueCreep(room, -1, {role: 'hauler', reboot: true});
    }
    if (!_.includes(queue, 'hauler')) {
        let amount = 1;
        let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
        if ((hauler[0] && hauler[0].ticksToLive < 250 && hauler.length < amount + 1) || hauler.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {role: 'hauler'})
        }
    }
    if (room.memory.hubContainer && !_.includes(queue, 'filler')) {
        let amount = 1;
        let filler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'filler'));
        if ((filler[0] && filler[0].ticksToLive < 250 && filler.length < amount + 1) || filler.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {role: 'filler'})
        }
    }
    if (level >= 3 && !_.includes(queue, 'courier')) {
        let amount = 1;
        let courier = _.filter(roomCreeps, (creep) => (creep.memory.role === 'courier'));
        if (courier.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {role: 'courier'})
        }
    }
    //LabTech
    if (level >= 6 && room.memory.state > 0 && !_.includes(queue, 'labTech') && room.memory.reactionRoom && _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB)[0]) {
        let amount = 1;
        let labTech = _.filter(roomCreeps, (creep) => (creep.memory.role === 'labTech'));
        if (labTech.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {role: 'labTech'})
        }
    }
    //SPECIALIZED
    //Waller
    let tower = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    if (level >= 3 && !_.includes(queue, 'waller') && tower.length) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        let amount = 1;
        if (_.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART).length >= 5 && room.memory.state > 1) amount = 2;
        if (wallers.length < amount) {
            queueCreep(room, PRIORITIES.waller + wallers.length, {role: 'waller'})
        }
    }
    //Mineral Harvester
    if (level >= 6 && room.memory.state > 1 && !_.includes(queue, 'mineralHarvester') && level === room.controller.level && !room.memory.responseNeeded && room.constructionSites.length === 0) {
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
    //Herald
    if (!_.includes(queue, 'herald')) {
        let herald = _.filter(roomCreeps, (creep) => creep.memory.role === 'herald');
        if (!herald.length) {
            queueCreep(room, PRIORITIES.explorer, {role: 'herald'})
        }
    }
    //Explorer
    if (!_.includes(queue, 'explorer') && !TEN_CPU && !room.memory.responseNeeded) {
        let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer');
        if (explorers.length < 5) {
            queueCreep(room, PRIORITIES.explorer + explorers.length, {role: 'explorer'})
        }
    }
    //ProximityScout
    if (room.memory.remoteRooms && room.memory.remoteRooms.length && !_.includes(queue, 'proximityScout') && level < 8 && !TEN_CPU && !room.memory.responseNeeded) {
        let proximityScouts = _.filter(roomCreeps, (creep) => creep.memory.role === 'proximityScout');
        if (proximityScouts.length < 1) {
            queueCreep(room, PRIORITIES.explorer + proximityScouts.length, {role: 'proximityScout'})
        }
    }
    //Jerk
    if (maxLevel < 5 && !_.includes(queue, 'jerk') && room.memory.state > 1 && level >= 2 && !TEN_CPU && !room.memory.responseNeeded) {
        let jerks = _.filter(Game.creeps, (creep) => creep.memory.role === 'jerk' || creep.memory.role === 'explorer');
        if (jerks.length < (8 - level) / 2) {
            queueCreep(room, PRIORITIES.jerk + jerks.length, {role: 'jerk'})
        }
    }
    //Claim Stuff
    if (!_.includes(queue, 'claimer') && room.memory.claimTarget && !room.memory.responseNeeded) {
        let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'claimer');
        if (claimer.length < 1 && !_.includes(Memory.ownedRooms, room.memory.claimTarget) && !room.memory.activeClaim) {
            queueCreep(room, PRIORITIES.claimer, {role: 'claimer', destination: room.memory.claimTarget})
        }
    }
    if (!_.includes(queue, 'pioneer') && room.memory.claimTarget && !room.memory.responseNeeded) {
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'pioneer');
        if (pioneers.length < -2 + level) {
            queueCreep(room, PRIORITIES.assistPioneer, {
                role: 'pioneer',
                destination: room.memory.claimTarget,
                initialBuilder: true
            })
        }
    }
    // Assist room
    let needyRoom = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.memory.buildersNeeded && room.shibRoute(r.name).length - 1 <= 15))[0];
    if (needyRoom && room.memory.state > 0 && !room.memory.responseNeeded) {
        if (!_.includes(queue, 'pioneer') && (!queueTracker['pioneer'] || queueTracker['pioneer'] + 200 <= Game.time)) {
            let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === needyRoom.name && (creep.memory.role === 'pioneer' || creep.memory.role === 'worker'));
            if (pioneers.length < 5) {
                queueCreep(room, PRIORITIES.assistPioneer + pioneers.length, {
                    role: 'pioneer',
                    destination: needyRoom.name
                });
                queueTracker['pioneer'] = Game.time;
            }
        }
        if (!_.includes(queue, 'fuelTruck') && level >= 6 && room.storage && room.memory.state > 1 && (!queueTracker['fuelTruck'] || queueTracker['fuelTruck'] + 200 <= Game.time)) {
            let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === needyRoom.name && (creep.memory.role === 'pioneer' || creep.memory.role === 'worker'));
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
    // Remote response
    let responseNeeded = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.memory.requestingSupport && room.shibRoute(r.name).length - 1 < 15))[0];
    if (responseNeeded && !_.includes(queue, 'remoteResponse') && !room.memory.responseNeeded) {
        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === responseNeeded.name && creep.memory.role === 'remoteResponse');
        if (responder.length < 3) {
            queueCreep(room, PRIORITIES.remoteResponse, {
                role: 'remoteResponse',
                responseTarget: responseNeeded.name,
                military: true
            })
        }
    }
    // Power Level
    let upgradeAssist = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.controller.level + 1 < level))[0];
    if (upgradeAssist && room.memory.state > 1 && level >= 6 && !room.memory.responseNeeded && !_.includes(queue, 'remoteUpgrader')) {
        let remoteUpgraders = _.filter(Game.creeps, (creep) => creep.memory.destination === upgradeAssist.name && creep.memory.role === 'remoteUpgrader');
        if (remoteUpgraders.length < 2) {
            queueCreep(room, PRIORITIES.remoteUpgrader + remoteUpgraders.length, {
                role: 'remoteUpgrader',
                destination: upgradeAssist.name
            })
        }
    }
    // Log queue tracking
    lastQueue[room.name] = queueTracker;
};

module.exports.remoteCreepQueue = function (room) {
    let level = getLevel(room);
    let queue = roomQueue[room.name];
    let range = room.memory.remoteRange || 1;
    let sources = 0;
    let queueTracker = lastQueue[room.name] || {};
    // Set harvester target
    let harvesterTarget = 7;
    if (room.memory.state >= 2) harvesterTarget = 5;
    if (room.memory.state >= 4) harvesterTarget = 3;
    if (!room.memory.remoteRange || Game.time % 200 === 0) {
        range:
            for (range = 1; range < 6; range++) {
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
    let totalRemoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'remoteHarvester');
    //SK Rooms DISABLED FOR NOW
    if (level >= 9 && room.memory.skRooms && !room.memory.responseNeeded && !TEN_CPU) {
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
            //Harvesters
            if (!_.includes(queue, 'remoteHarvester')) {
                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.skRooms[keys] && creep.memory.role === 'remoteHarvester');
                let sourceCount = 1;
                if (Memory.roomCache[room.memory.skRooms[keys]] && Memory.roomCache[room.memory.skRooms[keys]].sources) sourceCount = Memory.roomCache[room.memory.skRooms[keys]].sources.length;
                if ((remoteHarvester.length < sourceCount || (remoteHarvester[0] && remoteHarvester[0].ticksToLive < 100 && remoteHarvester.length - 1 < sourceCount)) && totalRemoteHarvester.length < harvesterTarget + (harvesterTarget * 0.5)) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
        }
    }
    //Remotes
    if (room.memory.remoteRooms && room.memory.remoteRooms.length && !room.memory.responseNeeded) {
        let responseNeeded;
        for (let keys in room.memory.remoteRooms) {
            if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, room.memory.remoteRooms[keys])) continue;
            let remoteRoom = Game.rooms[room.memory.remoteRooms[keys]];
            if (room.shibRoute(room.memory.remoteRooms[keys]).length - 1 > range || checkIfSK(room.memory.remoteRooms[keys])) continue;
            if (Memory.roomCache[room.memory.remoteRooms[keys]] && (Memory.roomCache[room.memory.remoteRooms[keys]].reservation && Memory.roomCache[room.memory.remoteRooms[keys]].reservation !== USERNAME)) continue;
            if (Memory.roomCache[room.memory.remoteRooms[keys]] && Memory.roomCache[room.memory.remoteRooms[keys]].owner) continue;
            // Check if room is hostile
            let roomThreat;
            if ((Game.rooms[room.memory.remoteRooms[keys]] && Game.rooms[room.memory.remoteRooms[keys]].memory.responseNeeded) || (Memory.roomCache[room.memory.remoteRooms[keys]] && (Memory.roomCache[room.memory.remoteRooms[keys]].threatLevel || Memory.roomCache[room.memory.remoteRooms[keys]].hostiles))) roomThreat = true;
            if (!responseNeeded && (Memory.roomCache[room.memory.remoteRooms[keys]] && Memory.roomCache[room.memory.remoteRooms[keys]].threatLevel)) responseNeeded = Memory.roomCache[room.memory.remoteRooms[keys]].threatLevel > 3;
            if (roomThreat) continue;
            if (!_.includes(queue, 'reserver') && level >= 4 && !TEN_CPU && (!remoteRoom || (!remoteRoom.memory.reservationExpires || remoteRoom.memory.reservationExpires <= Game.time))) {
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === room.memory.remoteRooms[keys]);
                let number = 1;
                if (level < 6) number = 2;
                if (reserver.length < number && room.memory.state >= 1) {
                    let priority = PRIORITIES.remoteHarvester + 1;
                    if (room.memory.energySurplus) priority = PRIORITIES.remoteHarvester;
                    queueCreep(room, priority, {
                        role: 'reserver',
                        reservationTarget: room.memory.remoteRooms[keys]
                    })
                }
            }
            //Harvesters
            if (!_.includes(queue, 'remoteHarvester') && !TEN_CPU) {
                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester');
                let sourceCount = 1;
                if (Memory.roomCache[room.memory.remoteRooms[keys]] && Memory.roomCache[room.memory.remoteRooms[keys]].sources) sourceCount = Memory.roomCache[room.memory.remoteRooms[keys]].sources.length;
                if ((remoteHarvester.length < sourceCount || (remoteHarvester[0] && remoteHarvester[0].ticksToLive < 100 && remoteHarvester.length - 1 < sourceCount)) && totalRemoteHarvester.length < harvesterTarget + (harvesterTarget * 0.5)) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
            //Pioneers
            if (Memory.roomCache[room.memory.remoteRooms[keys]] && Memory.roomCache[room.memory.remoteRooms[keys]].requestingPioneer && !_.includes(queue, 'pioneer') && !TEN_CPU && remoteRoom) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'pioneer');
                if (pioneers.length < 1) {
                    queueCreep(room, PRIORITIES.remotePioneer, {
                        role: 'pioneer',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
        }
        // Border Patrol
        if (level >= 3) {
            let borderPatrol = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.operation === 'borderPatrol' && creep.memory.role === 'longbow');
            let count = 1;
            if (responseNeeded) count = 2;
            if (!_.includes(queue, 'longbow') && borderPatrol.length < count) {
                queueCreep(room, PRIORITIES.borderPatrol, {
                    role: 'longbow',
                    operation: 'borderPatrol',
                    military: true
                });
            }
            ;
            let riotPatrol = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.operation === 'borderPatrol' && creep.memory.role === 'attacker');
            if (!_.includes(queue, 'attacker') && !riotPatrol.length) {
                queueCreep(room, PRIORITIES.borderPatrol, {
                    role: 'attacker',
                    operation: 'borderPatrol',
                    military: true
                });
            }
        }
    }
    // Remote Hauler
    if (!_.includes(queue, 'remoteHauler')) {
        let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'remoteHarvester');
        let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler' && creep.memory.overlord === room.name);
        if (remoteHauler.length < remoteHarvester.length) {
            queueCreep(room, PRIORITIES.remoteHauler, {role: 'remoteHauler'})
        }
    }

    //Power Mining
    if (level >= 7 && room.memory.state > 2 && !TEN_CPU && room.memory.powerRooms && room.memory.energySurplus && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
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
            if ((observer.length < 1 || (observer[0] && observer[0].ticksToLive <= 500 && observer.length < 2)) && !_.includes(queue, 'observer')) {
                queueMilitaryCreep(PRIORITIES.priority, {
                    role: 'observer',
                    targetRoom: key,
                    military: true
                })
            }
            continue;
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
            if ((longbow.length < longbows || (longbow[0] && longbow[0].ticksToLive <= 500 && longbow.length < longbows + 1)) && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'hold',
                    military: true,
                    reboot: reboot
                })
            }
            let unClaimer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'unClaimer' && creep.memory.operation === 'hold');
            if (unClaimerNeeded && (unClaimer.length < 1 || (unClaimer[0] && unClaimer[0].ticksToLive <= 125 && unClaimer.length < 2)) && !_.includes(queue, 'unClaimer') && longbow.length) {
                queueMilitaryCreep(priority, {
                    role: 'unClaimer',
                    targetRoom: key,
                    operation: 'hold',
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
            if ((drainer.length < drainers || (drainer[0] && drainer[0].ticksToLive <= 600 && drainer.length < drainers + 1)) && !_.includes(queue, 'drainer')) {
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

function checkIfSK(roomName) {
    let parsed;
    if (!parsed) parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
    let fMod = parsed[1] % 10;
    let sMod = parsed[2] % 10;
    return !(fMod === 5 && sMod === 5) && ((fMod >= 4) && (fMod <= 6)) && ((sMod >= 4) && (sMod <= 6));
}