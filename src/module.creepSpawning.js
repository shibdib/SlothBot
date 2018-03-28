/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.processBuildQueue = function () {
    let spawns = Game.spawns;
    for (let key in spawns) {
        let spawn = spawns[key];
        let level = getLevel(spawn.room);
        if (level > spawns[key].room.controller.level) level = spawns[key].room.controller.level;
        if (!spawn.spawning) {
            if (spawn.room.memory.creepBuildQueue || Memory.militaryBuildQueue) {
                let queue;
                if (spawn.room.constructionSites.length === 0) {
                    queue = _.sortBy(Object.assign({}, spawn.room.memory.creepBuildQueue, Memory.militaryBuildQueue), 'importance');
                } else {
                    queue = _.sortBy(spawn.room.memory.creepBuildQueue, 'importance')
                }
                let topPriority;
                let body;
                let role;
                for (let key in queue) {
                    topPriority = queue[key];
                    role = topPriority.role;
                    if (topPriority.reboot || level === 1) {
                        body = _.get(SPAWN[0], role);
                    } else {
                        body = bodyGenerator(level, role);
                    }
                    if (body) break;
                }
                if (!body) continue;
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
                    if (spawn.spawnCreep(body, role + '_' + spawn.room.name + '_T' + spawn.room.controller.level + '_' + _.random(1, 50), {
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
                    }) === OK) {
                        log.i(spawn.room.name + ' Spawning a ' + role);
                        if (topPriority.military) delete Memory.militaryBuildQueue;
                        return delete spawn.room.memory.creepBuildQueue;
                    } else {
                        spawn.room.visual.text('Queued - ' +
                            _.capitalize(topPriority.role),
                            spawn.pos.x + 1,
                            spawn.pos.y,
                            {align: 'left', opacity: 0.8}
                        );
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
    let containers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_CONTAINER)
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
        queueCreep(room, -1, {role: 'stationaryHarvester', reboot: true});
    }
    if (!_.includes(queue, 'stationaryHarvester')) {
        if (harvesters.length < 2 || (harvesters[0].ticksToLive < 100 && harvesters.length < 3)) {
            queueCreep(room, PRIORITIES.stationaryHarvester, {role: 'stationaryHarvester'})
        }
    }
    //Upgrader
    if (!_.includes(queue, 'upgrader') && level === room.controller.level && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
        let number = _.round((10 - level) / 2);
        if (level >= 6) number = 1;
        if (upgraders.length < number) {
            queueCreep(room, PRIORITIES.upgrader, {role: 'upgrader'})
        }
    }
    //Worker
    if (!_.includes(queue, 'worker') && room.constructionSites.length > 0 && !room.memory.responseNeeded) {
        let workers = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker');
        if (workers.length < 2) {
            queueCreep(room, PRIORITIES.worker, {role: 'worker'})
        }
    }
    //Haulers
    let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
    if (hauler.length === 0) {
        delete room.memory.creepBuildQueue;
        queueCreep(room, -1, {role: 'hauler', reboot: true});
    }
    if (!_.includes(queue, 'hauler')) {
        let amount = 2;
        //if (level >= 7) amount = 3;
        let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
        if (hauler.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {role: 'hauler'})
        }
    }
    if (level >= 6 && !_.includes(queue, 'labTech') && room.memory.reactionRoom && _.filter(room.structures, (s) => s.structureType === STRUCTURE_LAB)[0]) {
        let amount = 1;
        if (level > 6) amount = 2;
        let labTech = _.filter(roomCreeps, (creep) => (creep.memory.role === 'labTech'));
        if (labTech.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {role: 'labTech'})
        }
    }
    //SPECIALIZED
    //Waller
    if (level >= 3 && !_.includes(queue, 'waller') && level === room.controller.level && room.constructionSites.length === 0) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        let lowestRamp = _.min(_.filter(room.structures, (s) => s.structureType === STRUCTURE_RAMPART), 'hits');
        let amount = 2;
        if (lowestRamp.hits >= level * 500000) amount = 1;
        if (TEN_CPU) amount = 1;
        if (wallers.length < amount) {
            queueCreep(room, PRIORITIES.waller, {role: 'waller'})
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
        if (level >= 4 && !_.includes(queue, 'longbow') && room.memory.threatLevel > 2) {
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.name && creep.memory.role === 'longbow');
            if (longbow.length < _.round(room.memory.numberOfHostiles / 2)) {
                queueCreep(room, PRIORITIES.responder - 1, {role: 'longbow', responseTarget: room.name, military: true})
            }
        }
        //Explorer
        if (!_.includes(queue, 'explorer') && level < 8) {
            let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer' && creep.memory.overlord === room.name);
            if (explorers.length < 1) {
                queueCreep(room, PRIORITIES.explorer, {role: 'explorer'})
            }
        }
    }
};

module.exports.remoteCreepQueue = function (room) {
    let level = getLevel(room);
    if (level !== room.controller.level) return;
    let queue = room.memory.creepBuildQueue;
    //Remotes
    if (room.memory.remoteRooms && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
        for (let keys in room.memory.remoteRooms) {
            let range = 1;
            if (level === 8) range = 2;
            if (Game.map.getRoomLinearDistance(room.name, room.memory.remoteRooms[keys]) > 1 || checkIfSK(room.memory.remoteRooms[keys])) continue;
            // Remote Response
            if (!_.includes(queue, 'longbow')) {
                if (Game.rooms[room.memory.remoteRooms[keys]] && Game.rooms[room.memory.remoteRooms[keys]].memory.responseNeeded === true && !room.memory.responseNeeded) {
                    let longbow = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.memory.remoteRooms[keys] && creep.memory.role === 'longbow');
                    if (longbow.length < _.round(Game.rooms[room.memory.remoteRooms[keys]].memory.numberOfHostiles / 2)) {
                        queueCreep(room, PRIORITIES.remoteResponse, {
                            role: 'longbow',
                            responseTarget: room.memory.remoteRooms[keys],
                            military: true
                        })
                    }
                }
            }
            if (!_.includes(queue, 'reserver') && level >= 7 && !TEN_CPU) {
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === room.memory.remoteRooms[keys]);
                if (reserver.length < 1 && (!Game.rooms[room.memory.remoteRooms[keys]] || !Game.rooms[room.memory.remoteRooms[keys]].memory.reservationExpires || Game.rooms[room.memory.remoteRooms[keys]].memory.reservationExpires <= Game.time) && (!Game.rooms[room.memory.remoteRooms[keys]] || !Game.rooms[room.memory.remoteRooms[keys]].memory.noRemote)) {
                    queueCreep(room, PRIORITIES.reserver, {
                        role: 'reserver',
                        reservationTarget: room.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'remoteUtility') && TEN_CPU) {
                let sourceCount = 1;
                let remoteUtility = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'remoteUtility');
                if (Memory.roomCache[room.memory.remoteRooms[keys]] && level >= 7) sourceCount = Memory.roomCache[room.memory.remoteRooms[keys]].sources.length;
                if (remoteUtility.length < sourceCount) {
                    queueCreep(room, PRIORITIES.remoteUtility, {
                        role: 'remoteUtility',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester');
            if (!_.includes(queue, 'remoteHarvester') && !TEN_CPU) {
                let sourceCount = 1;
                if (Memory.roomCache[room.memory.remoteRooms[keys]] && level >= 7) sourceCount = Memory.roomCache[room.memory.remoteRooms[keys]].sources.length;
                if (remoteHarvester.length < sourceCount && (!Game.rooms[room.memory.remoteRooms[keys]] || !Game.rooms[room.memory.remoteRooms[keys]].memory.noRemote)) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'pioneer') && !TEN_CPU && Game.rooms[room.memory.remoteRooms[keys]] && Game.rooms[room.memory.remoteRooms[keys]].memory.requestingPioneer) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'pioneer');
                if (pioneers.length < 1) {
                    queueCreep(room, PRIORITIES.pioneer, {role: 'pioneer', destination: room.memory.remoteRooms[keys]})
                }
            }
        }
        if (!_.includes(queue, 'remoteHauler') && !TEN_CPU) {
            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHarvester' && creep.memory.overlord === room.name);
            let amount = _.round(remoteHarvester.length / 1.75);
            if (amount === 0) amount = 1;
            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler' && creep.memory.overlord === room.name);
            if (remoteHauler.length < amount) {
                queueCreep(room, PRIORITIES.remoteHauler, {role: 'remoteHauler'})
            }
        }
    }
    //SK Rooms
    if (level >= 7 && room.memory.skRooms && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
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

    //Claim Stuff
    if (!_.includes(queue, 'claimer') && room.memory.claimTarget && !room.memory.responseNeeded && room.constructionSites.length === 0) {
        let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'claimer');
        if (claimer.length < 1 && !_.includes(Memory.ownedRooms, room.memory.claimTarget) && !room.memory.activeClaim) {
            queueCreep(room, PRIORITIES.claimer, {role: 'claimer', destination: room.memory.claimTarget})
        }
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'pioneer');
        if (!_.includes(queue, 'pioneer') && pioneers.length < -2 + level) {
            queueCreep(room, PRIORITIES.pioneer, {
                role: 'pioneer',
                destination: room.memory.claimTarget,
                initialBuilder: true
            })
        }
    }

    // Assist room
    if (!_.includes(queue, 'pioneer') && room.memory.assistingRoom && !room.memory.responseNeeded && room.constructionSites.length === 0) {
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.assistingRoom && creep.memory.role === 'pioneer');
        if (pioneers.length < level) {
            queueCreep(room, PRIORITIES.pioneer, {
                role: 'pioneer',
                destination: room.memory.assistingRoom,
                initialBuilder: true
            })
        }
    }
    if (!_.includes(queue, 'remoteResponse') && room.memory.sendingResponse) {
        if (Game.rooms[room.memory.sendingResponse] && Game.rooms[room.memory.sendingResponse].memory.responseNeeded === true && !room.memory.responseNeeded) {
            let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.memory.sendingResponse && creep.memory.role === 'remoteResponse');
            if (responder.length < Game.rooms[room.memory.sendingResponse].memory.numberOfHostiles) {
                queueCreep(room, PRIORITIES.responder, {
                    role: 'remoteResponse',
                    responseTarget: room.memory.sendingResponse,
                    military: true
                })
            }
        }
    }
};

module.exports.militaryCreepQueue = function () {
    let queue = Memory.militaryBuildQueue;
    // Custom Flags
    for (let key in Memory.targetRooms) {
        let stagingRoom;
        for (let staging in Memory.stagingRooms) {
            if (Game.map.getRoomLinearDistance(staging, key) === 1) {
                stagingRoom = staging;
            }
        }
        //Room Scouting
        if (Memory.targetRooms[key].type === 'attack') {
            let scout = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'scout');
            if (!scout.length && !_.includes(queue, 'scout')) {
                queueMilitaryCreep(PRIORITIES.scout, {role: 'scout', targetRoom: key, military: true})
            }
        }
        // Clean
        if (Memory.targetRooms[key].type === 'clean') {
            let opLevel = Memory.targetRooms[key].level;
            let escort = Memory.targetRooms[key].escort;
            let deconstructors = 1;
            if (opLevel === '1') {
                deconstructors = 1;
            } else if (opLevel === '2') {
                deconstructors = 2;
            } else if (opLevel === '3') {
                deconstructors = 3;
            }
            let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'deconstructor');
            if (deconstructor.length < deconstructors && !_.includes(queue, 'deconstructor')) {
                queueMilitaryCreep(PRIORITIES.clean + 1, {
                    role: 'deconstructor',
                    targetRoom: key,
                    operation: 'clean',
                    military: true,
                    staging: stagingRoom
                })
            }
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if (escort && longbow.length < deconstructors && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(PRIORITIES.clean + 1, {
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
                queueMilitaryCreep(PRIORITIES.raid + 1, {
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
            let opLevel = Memory.targetRooms[key].level;
            let longbows = 0;
            let attackers = 0;
            let healers = 0;
            let waitFor = 1;
            if (opLevel === '1') {
                longbows = 2;
                waitFor = 1;
            } else if (opLevel === '2') {
                longbows = 2;
                attackers = 1;
                waitFor = 3;
            } else if (opLevel === '3') {
                longbows = 2;
                attackers = 1;
                healers = 1;
                waitFor = 4;
            }
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if ((longbow.length < longbows || (longbow[0] && longbow[0].ticksToLive <= 500 && longbow.length < longbows + 1)) && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(PRIORITIES.harass, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'harass',
                    waitFor: waitFor,
                    military: true
                })
            }
            let attacker = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'attacker');
            if ((attacker.length < attackers || (attacker[0] && attacker[0].ticksToLive <= 500 && attacker.length < attackers + 1)) && !_.includes(queue, 'attacker')) {
                queueMilitaryCreep(PRIORITIES.harass, {
                    role: 'attacker',
                    targetRoom: key,
                    operation: 'harass',
                    waitFor: waitFor,
                    military: true
                })
            }
            let healer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'healer');
            if ((healer.length < healers || (healer[0] && healer[0].ticksToLive <= 500 && healer.length < healers + 1)) && !_.includes(queue, 'healer')) {
                queueMilitaryCreep(PRIORITIES.harass, {
                    role: 'healer',
                    targetRoom: key,
                    operation: 'harass',
                    waitFor: waitFor,
                    military: true
                })
            }
        }
        // Drain
        if (Memory.targetRooms[key].type === 'drain') {
            let opLevel = Memory.targetRooms[key].level;
            let drainers = 0;
            if (opLevel === '1') {
                drainers = 1;
            } else if (opLevel === '2') {
                drainers = 2;
            } else if (opLevel === '3') {
                drainers = 3;
            }
            let drainer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'drainer');
            if ((drainer.length < drainers || (drainer[0] && drainer[0].ticksToLive <= 500)) && !_.includes(queue, 'drainer')) {
                queueMilitaryCreep(PRIORITIES.siege, {
                    role: 'drainer',
                    targetRoom: key,
                    operation: 'drain',
                    military: true,
                    staging: stagingRoom
                })
            }
        }
        // Siege
        if (Memory.targetRooms[key].type === 'siege') {
            let opLevel = Memory.targetRooms[key].level;
            let siegeEngine = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeEngine');
            let siegeHealer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeHealer');
            if ((siegeEngine.length < siegeHealer.length || (siegeEngine[0] && siegeEngine[0].ticksToLive <= 500 && siegeEngine.length < opLevel + 1)) && !_.includes(queue, 'siegeEngine')) {
                queueMilitaryCreep(PRIORITIES.siege, {
                    role: 'siegeEngine',
                    targetRoom: key,
                    operation: 'siege',
                    military: true,
                    waitFor: opLevel * 2,
                    staging: stagingRoom
                })
            }
            if ((siegeHealer.length < opLevel || (siegeHealer[0] && siegeHealer[0].ticksToLive <= 500 && siegeHealer.length < opLevel + 1)) && !_.includes(queue, 'siegeHealer')) {
                queueMilitaryCreep(PRIORITIES.siege, {
                    role: 'siegeHealer',
                    targetRoom: key,
                    operation: 'siege',
                    military: true,
                    waitFor: opLevel * 2,
                    staging: stagingRoom
                })
            }
        }
        // Hold
        if (Memory.targetRooms[key].type === 'hold') {
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'longbow');
            if ((longbow.length < 1 || (longbow[0] && longbow[0].ticksToLive <= 500 && longbow.length < 2)) && !_.includes(queue, 'longbow')) {
                queueMilitaryCreep(PRIORITIES.hold, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'hold',
                    waitFor: 1,
                    military: true
                })
            }
        }
        // Nuke
        if (Memory.targetRooms[key].type === 'nuke' && Memory.targetRooms[key].dDay <= Game.time - 50) {
            let level = Memory.targetRooms[key].level;
            if (level === 1) {
                let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'deconstructor');
                if (deconstructor.length < 2 && !_.includes(queue, 'deconstructor')) {
                    queueMilitaryCreep(PRIORITIES.clean + 1, {
                        role: 'deconstructor',
                        targetRoom: key,
                        operation: 'clean',
                        military: true,
                        staging: stagingRoom
                    })
                }
            } else if (level === 2) {
                let siegeEngine = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeEngine');
                let siegeHealer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeHealer');
                if ((siegeEngine.length < siegeHealer.length || (siegeEngine[0] && siegeEngine[0].ticksToLive <= 500 && siegeEngine.length < 2)) && !_.includes(queue, 'siegeEngine')) {
                    queueMilitaryCreep(PRIORITIES.siege, {
                        role: 'siegeEngine',
                        targetRoom: key,
                        operation: 'siege',
                        military: true,
                        waitFor: 2,
                        staging: stagingRoom
                    })
                }
                if ((siegeHealer.length < 1 || (siegeHealer[0] && siegeHealer[0].ticksToLive <= 500 && siegeHealer.length < 2)) && !_.includes(queue, 'siegeHealer')) {
                    queueMilitaryCreep(PRIORITIES.siege, {
                        role: 'siegeHealer',
                        targetRoom: key,
                        operation: 'siege',
                        military: true,
                        waitFor: 2,
                        staging: stagingRoom
                    })
                }
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

function bodyGenerator(level, role) {
    let body = [];
    let work, claim, carry, move, tough, attack, rangedAttack, heal;
    switch (role) {
        // Explorer/Scout
        case 'explorer':
            move = 1;
            break;
        case 'scout':
            move = 1;
            break;
        // General Creeps
        case 'worker':
            work = _.round((1 * level) / 2);
            carry = _.round((1 * level) / 3) || 1;
            move = work + carry;
            break;
        case 'waller':
            work = _.round((1 * level) / 2);
            carry = _.round((1 * level) / 3) || 1;
            move = work + carry;
            break;
        case 'upgrader':
            if (level < 3) {
                work = 2 * level;
                carry = _.round((1 * level) / 3) || 1;
                move = work + carry;
                break;
            } else {
                work = (2 * level) - 1;
                carry = _.round((1 * level) / 3) || 1;
                move = work / 2;
                break;
            }
        case 'hauler':
            if (level < 4) {
                carry = 1 * level;
                move = carry;
                break;
            } else {
                carry = 1 * level;
                move = carry / 2;
                break;
            }
        case 'labTech':
            carry = 1 * level;
            move = carry / 2;
            break;
        case 'stationaryHarvester':
            if (level < 3) {
                work = 2;
                carry = 1;
                move = 1;
                break;
            } else {
                work = 6;
                carry = 1;
                move = 2;
                break;
            }
        case 'mineralHarvester':
            work = 10;
            carry = 10;
            move = 10;
            break;
        // Military
        case 'responder':
            tough = _.round(0.5 * level);
            attack = 1 * level;
            if (level > 3) {
                _.round(attack = 2.5 * level);
            }
            move = (tough + attack) / 2;
            break;
        case 'remoteResponse':
            tough = _.round(0.5 * level);
            rangedAttack = _.round((0.5 * level) + 1);
            attack = _.round((0.5 * level) + 1);
            heal = 1;
            move = tough + rangedAttack + heal + attack;
            break;
        case 'attacker':
            tough = _.round(0.5 * level);
            attack = _.round(0.5 * level);
            heal = 0;
            if (level > 3) {
                attack = 1 * level;
                heal = _.round((1 * level) / 2);
            }
            move = tough + heal + attack;
            break;
        case 'longbow':
            if (level < 6) break;
            tough = _.round(0.5 * level);
            rangedAttack = (1 * level) + 1;
            heal = 1;
            move = tough + rangedAttack + heal;
            break;
        case 'raider':
            if (level < 6) break;
            carry = _.round(1.5 * level);
            move = carry;
            break;
        case 'deconstructor':
            if (level < 6) break;
            work = 1 * level;
            move = work;
            break;
        case 'siegeEngine':
            if (level < 7) break;
            tough = 10;
            work = 10;
            rangedAttack = 2;
            heal = 3;
            move = tough + work + rangedAttack + heal;
            break;
        case 'siegeHealer':
            if (level < 8) break;
            tough = 5;
            heal = 20;
            move = tough + heal;
            break;
        // Remote
        case 'claimer':
            claim = 1;
            move = 1;
            break;
        case 'reserver':
            claim = _.round(0.5 * level);
            move = claim;
            break;
        case 'pioneer':
            work = _.round((1 * level) / 2);
            carry = _.round((1 * level) / 3) || 1;
            move = work + carry;
            break;
        case 'remoteUtility':
            work = _.round((1 * level) / 2);
            carry = _.round((1 * level) / 3) || 1;
            move = work + carry;
            break;
        case 'remoteHarvester':
            work = _.round((1 * level) / 2);
            carry = _.round((1 * level) / 3) || 1;
            move = _.round(work / 2);
            break;
        case 'remoteHauler':
            carry = _.round(2.5 * level);
            move = carry;
            break;
        case 'SKattacker':
            attack = 20;
            heal = 5;
            move = attack + heal;
            break;
        case 'SKmineral':
            work = 15;
            carry = 10;
            move = work + carry;
            break;
    }
    for (let i = 0; i < work; i++) body.push(WORK)
    for (let i = 0; i < carry; i++) body.push(CARRY)
    for (let i = 0; i < move; i++) body.push(MOVE)
    for (let i = 0; i < claim; i++) body.push(CLAIM)
    for (let i = 0; i < attack; i++) body.push(ATTACK)
    let healArray = [];
    for (let i = 0; i < heal; i++) healArray.push(HEAL)
    for (let i = 0; i < rangedAttack; i++) body.push(RANGED_ATTACK)
    let toughArray = [];
    for (let i = 0; i < tough; i++) toughArray.push(TOUGH)
    return toughArray.concat(shuffle(body), healArray);
}