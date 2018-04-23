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
                        body = generator.bodyGenerator(level, role);
                    }
                    if (body && body.length) break;
                }
                if (!body || !body.length) continue;
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
                            log.i(spawn.room.name + ' Spawning a ' + role);
                            if (topPriority.military) delete Memory.militaryBuildQueue;
                            return delete spawn.room.memory.creepBuildQueue;
                    }
                }
            }
        } else {
            let spawningCreep = Game.creeps[spawn.spawning.name];
            spawn.room.visual.text(
                ICONS.build + ' ' + spawningCreep.name,
                spawn.pos.x + 1,
                spawn.pos.y,
                {align: 'left', opacity: 0.8}
            );
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
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester'));
    if (harvesters.length < 2) {
        queueCreep(room, 1, {role: 'stationaryHarvester'})
    }
    let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn' || creep.memory.role === 'basicHauler'));
    let containers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_CONTAINER);
    if (pawn.length < 2 && containers.length > 0) {
        queueCreep(room, 2, {role: 'hauler'})
    }
    let worker = _.filter(roomCreeps, (creep) => (creep.memory.role === 'worker'));
    if (worker.length < 2) {
        queueCreep(room, 3, {role: 'worker'})
    }
    let upgrader = _.filter(roomCreeps, (creep) => (creep.memory.role === 'upgrader'));
    if (upgrader.length < 5) {
        queueCreep(room, 4, {role: 'upgrader'})
    }
    let explorers = _.filter(roomCreeps, (creep) => creep.memory.role === 'explorer');
    if (explorers.length < 1) {
        queueCreep(room, 5, {role: 'explorer'})
    }
}

module.exports.workerCreepQueue = function (room) {
    let queue = room.memory.creepBuildQueue;
    let level = getLevel(room);
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name);
    // Level 1 room management
    if (level === 1) {
        roomStartup(room, roomCreeps);
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
    if (!_.includes(queue, 'upgrader') && level === room.controller.level) {
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
        let count;
        count = upgraders.length;
        let number = _.round((8 - level) / 2);
        if (level >= 5 || (Game.getObjectById(room.memory.controllerContainer) && Game.getObjectById(room.memory.controllerContainer).store[RESOURCE_ENERGY] < 500)) number = 1;
        if (count < number) {
            if (level < 3) {
                queueCreep(room, 2, {role: 'upgrader'})
            } else {
                queueCreep(room, PRIORITIES.upgrader, {role: 'upgrader'})
            }
        }
    }
    //Worker
    if (!_.includes(queue, 'worker') && !room.memory.responseNeeded) {
        let amount = 1;
        if (_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL).length > 0) amount = 3;
        let workers = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker');
        if (workers.length < amount) {
            queueCreep(room, PRIORITIES.worker, {role: 'worker'})
        } else if (level <= 3 && 6 > workers.length < room.constructionSites.length) {
            queueCreep(room, workers.length + 1, {role: 'worker'})
        }
    }
    //Haulers
    let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
    if (hauler.length === 0) {
        delete room.memory.creepBuildQueue;
        return queueCreep(room, -1, {role: 'hauler', reboot: true});
    }
    if (!_.includes(queue, 'hauler')) {
        let amount = 2;
        let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
        if (hauler.length < amount) {
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
    if (room.controller.level >= 2 && !_.includes(queue, 'waller') && tower.length) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        let amount = 3;
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
    //Explorer
    if (!_.includes(queue, 'explorer') && level < 8) {
        let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer');
        if (explorers.length < 2) {
            queueCreep(room, PRIORITIES.explorer + explorers.length, {role: 'explorer'})
        }
    }
    //Jerk
    if (!_.includes(queue, 'jerk') && level >= 2) {
        let jerks = _.filter(Game.creeps, (creep) => creep.memory.role === 'jerk' || creep.memory.role === 'explorer');
        if (jerks.length < 5) {
            queueCreep(room, PRIORITIES.jerk + jerks.length, {role: 'jerk'})
        }
    }
};

module.exports.remoteCreepQueue = function (room) {
    let level = getLevel(room);
    let queue = room.memory.creepBuildQueue;
    let range = room.memory.remoteRange || 1;
    let sources = 0;
    if (level >= 6 && (!room.memory.remoteRange || Game.time % 1000 === 0)) {
        range:
            for (range = 1; range < 3; range++) {
                for (let keys in room.memory.remoteRooms) {
                    if (!Memory.roomCache[room.memory.remoteRooms[keys]] || Game.map.findRoute(room.name, room.memory.remoteRooms[keys]).length > range ||
                        checkIfSK(room.memory.remoteRooms[keys]) || Memory.roomCache[room.memory.remoteRooms[keys]].owner) continue;
                    let roomSources = Memory.roomCache[room.memory.remoteRooms[keys]].sources.length || 0;
                    sources = sources + roomSources;
                    if (sources >= 6) break range;
                }
            }
        room.memory.remoteRange = range;
    }
    // Assist room
    let needyRoom = shuffle(_.filter(Memory.ownedRooms, (r) => r.memory.buildersNeeded && Game.map.findRoute(room.name, r.name).length < 9))[0];
    if (needyRoom && !room.memory.responseNeeded && !_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL).length) {
        if (!_.includes(queue, 'pioneer')) {
            let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === needyRoom.name && creep.memory.role === 'pioneer');
            if (pioneers.length < level * 2) {
                queueCreep(room, 2, {
                    role: 'pioneer',
                    destination: needyRoom.name
                })
            }
        }
        if (!_.includes(queue, 'longbow')) {
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === needyRoom.name && creep.memory.role === 'longbow');
            if (longbow.length < 2) {
                queueCreep(room, 2, {role: 'longbow', responseTarget: needyRoom.name, military: true})
            }
        }
    }
    let responseNeeded = shuffle(_.filter(Memory.ownedRooms, (r) => r.name !== room.name && r.memory.requestingSupport && Game.map.findRoute(room.name, r.name).length < 9))[0];
    if (responseNeeded && !_.includes(queue, 'remoteResponse')) {
        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === responseNeeded.name && creep.memory.role === 'remoteResponse');
        if (responder.length < 3) {
            queueCreep(room, PRIORITIES.responder, {
                role: 'remoteResponse',
                responseTarget: responseNeeded.name,
                military: true
            })
        }
    }
    //Remotes
    if (room.memory.remoteRooms && !room.memory.responseNeeded) {
        let harvesterCount = 0;
        for (let keys in room.memory.remoteRooms) {
            let remoteRoom = Game.rooms[room.memory.remoteRooms[keys]];
            if (Game.map.findRoute(room.name, room.memory.remoteRooms[keys]).length > range || checkIfSK(room.memory.remoteRooms[keys])) continue;
            // Remote Response
            if (!_.includes(queue, 'longbow')) {
                if (remoteRoom && remoteRoom.memory.responseNeeded === true && !room.memory.responseNeeded) {
                    let longbow = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.memory.remoteRooms[keys] && creep.memory.role === 'longbow');
                    if (longbow.length < _.round(remoteRoom.memory.numberOfHostiles / 2)) {
                        queueCreep(room, PRIORITIES.remoteResponse, {
                            role: 'longbow',
                            responseTarget: room.memory.remoteRooms[keys],
                            military: true,
                            misc: 'vary'
                        })
                    }
                }
            }
            if (!_.includes(queue, 'reserver') && level >= 4 && !TEN_CPU && (!remoteRoom || (!remoteRoom.memory.responseNeeded && (!remoteRoom.memory.reservationExpires || remoteRoom.memory.reservationExpires <= Game.time)))) {
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === room.memory.remoteRooms[keys]);
                if (reserver.length < 1) {
                    queueCreep(room, PRIORITIES.reserver, {
                        role: 'reserver',
                        reservationTarget: room.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'remoteHarvester') && !TEN_CPU && (!remoteRoom || (remoteRoom && !remoteRoom.memory.responseNeeded))) {
                let totalRemoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.overlord === room.name && creep.memory.role === 'remoteHarvester');
                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester');
                let sourceCount = 1;
                if (Memory.roomCache[room.memory.remoteRooms[keys]]) sourceCount = Memory.roomCache[room.memory.remoteRooms[keys]].sources.length;
                if (remoteHarvester.length < sourceCount && totalRemoteHarvester.length < 6) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
                harvesterCount = remoteHarvester.length;
            }
            if (!_.includes(queue, 'pioneer') && !TEN_CPU && remoteRoom && remoteRoom.memory.requestingPioneer && !remoteRoom.memory.responseNeeded) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'pioneer');
                if (pioneers.length < _.round(level / 2)) {
                    queueCreep(room, PRIORITIES.pioneer, {
                        role: 'pioneer',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
        }
        if (!_.includes(queue, 'remoteHauler') && !TEN_CPU && harvesterCount) {
            let amount = _.round(harvesterCount / 1.75);
            if (amount === 0) amount = 1;
            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler' && creep.memory.overlord === room.name);
            if (remoteHauler.length < amount) {
                queueCreep(room, PRIORITIES.remoteHauler, {role: 'remoteHauler'})
            }
        }
    }
    //SK Rooms
    if (level >= 7 && room.memory.skRooms && !room.memory.noSK && room.memory.energySurplus && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
        let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.role === 'SKattacker' && creep.memory.overlord === room.name);
        if (!_.includes(queue, 'SKattacker') && !TEN_CPU && SKAttacker.length < 1) {
            queueCreep(room, PRIORITIES.SKattacker, {role: 'SKattacker', misc: room.memory.skRooms})
        }
        for (let key in room.memory.skRooms) {
            let SKRoom = Game.rooms[room.memory.skRooms[key]];
            if (!SKRoom) continue;
            let SKmineral = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.skRooms[key] && creep.memory.role === 'SKmineral');
            if (!_.includes(queue, 'SKmineral') && !TEN_CPU && SKmineral.length < 1 && SKAttacker.length > 0) {
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

    //Claim Stuff
    if (!_.includes(queue, 'claimer') && room.memory.claimTarget && !room.memory.responseNeeded) {
        let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'claimer');
        if (claimer.length < 1 && !_.includes(Memory.ownedRooms, room.memory.claimTarget) && !room.memory.activeClaim) {
            queueCreep(room, PRIORITIES.claimer, {role: 'claimer', destination: room.memory.claimTarget})
        }
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'pioneer');
        if (!_.includes(queue, 'pioneer') && pioneers.length < -2 + level) {
            queueCreep(room, PRIORITIES.claimer, {
                role: 'pioneer',
                destination: room.memory.claimTarget,
                initialBuilder: true
            })
        }
    }
};

module.exports.militaryCreepQueue = function () {
    let queue = Memory.militaryBuildQueue;
    if (!Memory.targetRooms) return;
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
            if (!totalScout.length && !scout.length && !_.includes(queue, 'scout')) {
                queueMilitaryCreep(2, {role: 'scout', targetRoom: key, military: true})
            }
        }
        // Hold
        if (Memory.targetRooms[key].type === 'hold') {
            let unClaimerNeeded = Memory.targetRooms[key].unClaimer;
            let longbows = 0;
            let attackers = 0;
            let healers = 0;
            let waitFor = 1;
            if (opLevel === 1) {
                longbows = 1;
            } else if (opLevel === 2) {
                longbows = 2;
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
        // Robbery
        if (Memory.targetRooms[key].type === 'robbery') {
            let raiders = 3;
            let raider = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'raider');
            if (raider.length < raiders && !_.includes(queue, 'raider')) {
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
            let longbows = 0;
            let attackers = 0;
            let healers = 0;
            let waitFor = 1;
            if (opLevel === 1) {
                longbows = 1;
            } else if (opLevel >= 2) {
                longbows = 3;
                waitFor = 3;
            }
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if ((longbow.length < longbows || (longbow[0] && longbow[0].ticksToLive <= 500 && longbow.length < longbows + 1)) && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(priority, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'harass',
                    waitFor: waitFor,
                    military: true,
                    misc: 'vary'
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
            } else if (opLevel === 3) {
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
        // Rangers
        if (Memory.targetRooms[key].type === 'rangers') {
            let swarm = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if (swarm.length < 5 * opLevel && !_.includes(queue, 'longbow')) {
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

function getLevel(room) {
    let energy = room.energyCapacityAvailable;
    if (energy >= RCL_1_ENERGY && energy < RCL_2_ENERGY) {
        return 1;
    } else if (energy >= RCL_2_ENERGY && energy < RCL_3_ENERGY) {
        return 2
    } else if (energy >= RCL_3_ENERGY && energy < RCL_4_ENERGY) {
        return 3
    } else if (energy >= RCL_4_ENERGY && energy < RCL_5_ENERGY) {
        return 4
    } else if (energy >= RCL_5_ENERGY && energy < RCL_6_ENERGY) {
        return 5
    } else if (energy >= RCL_6_ENERGY && energy < RCL_7_ENERGY) {
        return 6
    } else if (energy >= RCL_7_ENERGY && energy < RCL_8_ENERGY) {
        return 7
    } else if (energy >= RCL_8_ENERGY) {
        return 8
    }
}

function checkIfSK(roomName) {
    let parsed;
    if (!parsed) parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
    let fMod = parsed[1] % 10;
    let sMod = parsed[2] % 10;
    return !(fMod === 5 && sMod === 5) && ((fMod >= 4) && (fMod <= 6)) && ((sMod >= 4) && (sMod <= 6));
}