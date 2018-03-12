module.exports.processBuildQueue = function () {
    let spawns = Game.spawns;
    for (let key in spawns) {
        let spawn = spawns[key];
        let level = getLevel(spawn.room);
        if (!spawn.spawning) {
            if (spawn.room.memory.creepBuildQueue || Memory.militaryBuildQueue) {
                let queue = _.sortBy(Object.assign({}, spawn.room.memory.creepBuildQueue, Memory.militaryBuildQueue), 'importance');
                let topPriority;
                let body;
                let role;
                for (let key in queue) {
                    topPriority = queue[key];
                    role = topPriority.role;
                    if (topPriority.reboot) {
                        body = _.get(SPAWN[1], role);
                    } else {
                        body = _.get(SPAWN[level], role);
                    }
                    if (body) break;
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
                        initialBuilder: undefined
                    });
                    if (!topPriority.role) return;
                    let count = _.filter(Game.creeps, (c) => c.memory.role === role && c.memory.overlord === spawn.room.name).length + 1;
                    if (spawn.spawnCreep(body, role + '_' + spawn.room.name + '_T' + spawn.room.controller.level + '_' + count, {
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
                                initialBuilder: topPriority.initialBuilder
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
        reboot: undefined
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
            reboot: options.reboot
        };
        if (!military) {
            if (!room.memory.creepBuildQueue[key]) room.memory.creepBuildQueue = cache;
        } else {
            if (!Memory.militaryBuildQueue[key]) Memory.militaryBuildQueue = cache;
        }
    }
}

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

function roomStartup(room, roomCreeps) {
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester'));
    if (harvesters.length < 2) {
        queueCreep(room, 1, {
            role: 'stationaryHarvester'
        })
    }
    let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn' || creep.memory.role === 'basicHauler'));
    let containers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_CONTAINER)
    if (pawn.length < 2 && containers.length > 0) {
        queueCreep(room, 2, {
            role: 'hauler'
        })
    }
    let worker = _.filter(roomCreeps, (creep) => (creep.memory.role === 'worker'));
    if (worker.length < 2) {
        queueCreep(room, 3, {
            role: 'worker'
        })
    }
    let upgrader = _.filter(roomCreeps, (creep) => (creep.memory.role === 'upgrader'));
    if (upgrader.length < 5) {
        queueCreep(room, 4, {
            role: 'upgrader'
        })
    }
    let explorers = _.filter(roomCreeps, (creep) => creep.memory.role === 'explorer');
    if (explorers.length < 1) {
        queueCreep(room, 5, {
            role: 'explorer'
        })
    }
}

function neighborCheck(spawnRoom, remoteRoom) {
    return Game.map.getRoomLinearDistance(spawnRoom, remoteRoom) <= 1;
}

module.exports.workerCreepQueue = function (room) {
    let queue = room.memory.creepBuildQueue;
    let level = getLevel(room);
    let energy = room.energyAvailable;
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === room.name);
    // Level 1 room management
    if (level === 1) {
        roomStartup(room, roomCreeps);
    }
    //Harvesters
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (harvesters.length === 0) {
        room.memory.creepBuildQueue = undefined;
        queueCreep(room, -1, {
            role: 'stationaryHarvester',
            reboot: true
        });
        return;
    }
    if (!_.includes(queue, 'stationaryHarvester')) {
        if (harvesters.length < 2 || (harvesters[0].ticksToLive < 100 && harvesters.length < 3)) {
            queueCreep(room, PRIORITIES.stationaryHarvester, {
                role: 'stationaryHarvester'
            })
        }
    }
    //Upgrader
    if (!_.includes(queue, 'upgrader') && level === room.controller.level && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
        if (upgraders.length < _.round((9 - level) / 2)) {
            queueCreep(room, PRIORITIES.upgrader, {
                role: 'upgrader'
            })
        }
    }
    //Worker
    if (!_.includes(queue, 'worker') && room.constructionSites.length > 0 && !room.memory.responseNeeded) {
        let workers = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker');
        if (workers.length < 2) {
            queueCreep(room, PRIORITIES.worker, {
                role: 'worker'
            })
        }
    }
    //Haulers
    let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
    if (hauler.length === 0) {
        room.memory.creepBuildQueue = undefined;
        queueCreep(room, -1, {
            role: 'hauler',
            reboot: true
        });
        return;
    }
    if (!_.includes(queue, 'hauler')) {
        let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
        if (hauler.length < 2 || (hauler[0].ticksToLive < 250 && hauler.length < 2 + 1)) {
            queueCreep(room, PRIORITIES.hauler, {
                role: 'hauler'
            })
        }
    }
    if (!_.includes(queue, 'labTech') && room.memory.reactionRoom) {
        let amount = 1;
        if (level > 6) amount = 2;
        let labTech = _.filter(roomCreeps, (creep) => (creep.memory.role === 'labTech'));
        if (labTech.length < amount) {
            queueCreep(room, PRIORITIES.hauler, {
                role: 'labTech'
            })
        }
    }
    //SPECIALIZED
    //Waller
    if (level >= 3 && !_.includes(queue, 'waller') && level === room.controller.level && !room.memory.responseNeeded && room.constructionSites.length === 0) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        if (wallers.length < 1) {
            queueCreep(room, PRIORITIES.waller, {
                role: 'waller'
            })
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
                queueCreep(room, PRIORITIES.responder, {
                    role: 'responder',
                    responseTarget: room.name,
                    military: true
                })
            }
        }
        if (level >= 4 && !_.includes(queue, 'longbow') && room.memory.threatLevel > 2) {
            let longbow = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.name && creep.memory.role === 'longbow');
            if (longbow.length < _.round(room.memory.numberOfHostiles / 2)) {
                queueCreep(room, PRIORITIES.responder - 1, {
                    role: 'longbow',
                    responseTarget: room.name,
                    military: true
                })
            }
        }
    }
};

module.exports.remoteCreepQueue = function (room) {
    let level = getLevel(room);
    if (level !== room.controller.level) return;
    let queue = room.memory.creepBuildQueue;
    //Explorer
    if (!_.includes(queue, 'explorer')) {
        let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer' && creep.memory.overlord === room.name);
        if (explorers.length < 2) {
            queueCreep(room, PRIORITIES.explorer, {
                role: 'explorer'
            })
        }
    }
    //Remotes
    if (room.memory.remoteRooms && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
        for (let keys in room.memory.remoteRooms) {
            if (Game.map.findRoute(room.name, room.memory.remoteRooms[keys]).length >= 3 || checkIfSK(room.memory.remoteRooms[keys])) continue;
            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester');
            if (!_.includes(queue, 'remoteHarvester')) {
                let sourceCount = 1;
                if (Memory.roomCache[room.memory.remoteRooms[keys]] && level >= 7) sourceCount = Memory.roomCache[room.memory.remoteRooms[keys]].sources.length;
                if (remoteHarvester.length < sourceCount && (!Game.rooms[room.memory.remoteRooms[keys]] || !Game.rooms[room.memory.remoteRooms[keys]].memory.noRemote)) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'remoteHauler')) {
                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'remoteHauler' && creep.memory.overlord === room.name);
                if (remoteHauler.length < remoteHarvester.length) {
                    queueCreep(room, PRIORITIES.remoteHauler, {
                        role: 'remoteHauler',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'pioneer') && Game.rooms[room.memory.remoteRooms[keys]] && Game.rooms[room.memory.remoteRooms[keys]].memory.requestingPioneer) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.remoteRooms[keys] && creep.memory.role === 'pioneer');
                if (pioneers.length < 1) {
                    queueCreep(room, PRIORITIES.pioneer, {
                        role: 'pioneer',
                        destination: room.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'reserver') && level >= 7) {
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === room.memory.remoteRooms[keys]);
                if ((reserver.length < 1 || (reserver[0].ticksToLive < 100 && reserver.length < 2)) && (!Game.rooms[room.memory.remoteRooms[keys]] || !Game.rooms[room.memory.remoteRooms[keys]].memory.reservationExpires || Game.rooms[room.memory.remoteRooms[keys]].memory.reservationExpires <= Game.time + 250) && (!Game.rooms[room.memory.remoteRooms[keys]] || !Game.rooms[room.memory.remoteRooms[keys]].memory.noRemote)) {
                    queueCreep(room, PRIORITIES.reserver, {
                        role: 'reserver',
                        reservationTarget: room.memory.remoteRooms[keys]
                    })
                }
            }
            // Remote Response
            if (!_.includes(queue, 'remoteResponse')) {
                if (Game.rooms[room.memory.remoteRooms[keys]] && Game.rooms[room.memory.remoteRooms[keys]].memory.responseNeeded === true && !room.memory.responseNeeded) {
                    let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === room.memory.remoteRooms[keys] && creep.memory.role === 'remoteResponse');
                    if (responder.length < Game.rooms[room.memory.remoteRooms[keys]].memory.numberOfHostiles) {
                        queueCreep(room, PRIORITIES.remoteResponse, {
                            role: 'remoteResponse',
                            responseTarget: room.memory.remoteRooms[keys],
                            military: true
                        })
                    }
                }
            }
        }
    }
    //SK Rooms
    if (level >= 7 && room.memory.skRooms && !room.memory.responseNeeded && room.constructionSites.length <= 3) {
        for (let key in room.memory.skRooms) {
            let SKRoom = Game.rooms[room.memory.skRooms[key]];
            if (!SKRoom) continue;
            let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.skRooms[key] && creep.memory.role === 'SKattacker' && creep.memory.overlord === room.name);
            let SKworker = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.skRooms[key] && creep.memory.role === 'SKworker');
            /**f (!_.includes(queue, 'SKsupport')) {
                let SKSupport = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.skRooms[key] && creep.memory.role === 'SKsupport' && creep.memory.overlord === room.name);
                if (((SKSupport.length < 1 || (SKSupport.length === 1 && SKSupport[0].ticksToLive < 100)) && SKAttacker.length > 0) && Game.map.findRoute(room.name, SKRoom.name).length < 2 && (!SKRoom.memory || !SKRoom.memory.noMine)) {
                    queueCreep(room, PRIORITIES.SKsupport, {
                        role: 'SKsupport',
                        destination: room.memory.skRooms[key]
                    })
                }
            }**/
            if (!_.includes(queue, 'SKattacker')) {
                if ((SKAttacker.length < 1 || (SKAttacker.length === 1 && SKAttacker[0].ticksToLive < 250)) && Game.map.findRoute(room.name, SKRoom.name).length < 2 && (!SKRoom.memory || !SKRoom.memory.noMine)) {
                    queueCreep(room, PRIORITIES.SKattacker, {
                        role: 'SKattacker',
                        destination: room.memory.skRooms[key]
                    })
                }
            }
            if (!_.includes(queue, 'SKworker')) {
                if (SKworker.length < Memory.roomCache[room.memory.skRooms[key]].sources.length + 1 && (SKAttacker.length > 0)) {
                    queueCreep(room, PRIORITIES.SKworker, {
                        role: 'SKworker',
                        destination: room.memory.skRooms[key]
                    })
                }
            }
            if (!_.includes(queue, 'remoteHauler')) {
                let SKhauler = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.skRooms[key] && creep.memory.role === 'remoteHauler' && creep.memory.overlord === room.name);
                if (SKhauler.length < 2 && (SKAttacker.length > 0)) {
                    queueCreep(room, PRIORITIES.remoteHauler, {
                        role: 'remoteHauler',
                        destination: room.memory.skRooms[key]
                    })
                }
            }
            if (!_.includes(queue, 'pioneer')) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.skRooms[key] && creep.memory.role === 'pioneer');
                if (pioneers.length < 1 && (SKAttacker.length > 0)) {
                    queueCreep(room, PRIORITIES.pioneer, {
                        role: 'pioneer',
                        destination: room.memory.skRooms[key]
                    })
                }
            }
        }
    }

    //Claim Stuff
    if (!_.includes(queue, 'claimer') && room.memory.claimTarget && !room.memory.responseNeeded && room.constructionSites.length === 0) {
        let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'claimer');
        if (claimer.length < 1 && !_.includes(Memory.ownedRooms, room.memory.claimTarget) && !room.memory.activeClaim) {
            queueCreep(room, 2, {
                role: 'claimer',
                destination: room.memory.claimTarget
            })
        }
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.claimTarget && creep.memory.role === 'pioneer');
        if (!_.includes(queue, 'pioneer') && pioneers.length < -2 + level) {
            queueCreep(room, 2, {
                role: 'pioneer',
                destination: room.memory.claimTarget,
                initialBuilder: true
            })
        }
    }

    // Assist room
    if (!_.includes(queue, 'pioneer') && room.memory.assistingRoom && !room.memory.responseNeeded && room.constructionSites.length === 0) {
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === room.memory.assistingRoom && creep.memory.role === 'pioneer');
        if (pioneers.length < -2 + level) {
            queueCreep(room, 2, {
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
                queueCreep(room, 2, {
                    role: 'remoteResponse',
                    responseTarget: room.memory.sendingResponse,
                    military: true
                })
            }
        }
    }
};

module.exports.militaryCreepQueue = function (room) {
    let queue = Memory.militaryBuildQueue;
    let level = getLevel(room);
    // Cleaning
    if (room.memory.cleaningTargets && room.memory.cleaningTargets.length > 0 && !_.includes(queue, 'deconstructor') && level >= 4) {
        for (let key in room.memory.cleaningTargets) {
            let target = room.memory.cleaningTargets[key].name;
            let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === target && creep.memory.role === 'deconstructor');
            if (deconstructor.length < 1) {
                queueCreep(room, PRIORITIES.deconstructor, {
                    role: 'deconstructor',
                    targetRoom: target,
                    operation: 'clean',
                    military: true
                }, true)
            }
        }
    }
    // Custom Flags
    for (let key in Memory.targetRooms) {
        // Clean
        if (level >= 5 && Memory.targetRooms[key].type === 'clean' && Game.map.findRoute(room.name, key).length <= 20) {
            let opLevel = Memory.targetRooms[key].level;
            let deconstructors = 1;
            if (opLevel === '1') {
                deconstructors = 1;
            } else if (opLevel === '2') {
                deconstructors = 2;
            } else if (opLevel === '3') {
                deconstructors = 3;
            }
            let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'deconstructor');
            if ((deconstructor.length < deconstructors || (deconstructor[0] && deconstructor[0].ticksToLive <= 500)) && !_.includes(queue, 'deconstructor')) {
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'deconstructor',
                    targetRoom: key,
                    operation: 'clean',
                    military: true
                }, true)
            }
        }
        // Harass
        if (level >= 5 && Memory.targetRooms[key].type === 'harass' && Game.map.findRoute(room.name, key).length <= 20) {
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
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'longbow',
                    targetRoom: key,
                    operation: 'harass',
                    waitFor: waitFor,
                    military: true
                }, true)
            }
            let attacker = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'attacker');
            if ((attacker.length < attackers || (attacker[0] && attacker[0].ticksToLive <= 500 && attacker.length < attackers + 1)) && !_.includes(queue, 'attacker')) {
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'attacker',
                    targetRoom: key,
                    operation: 'harass',
                    waitFor: waitFor,
                    military: true
                }, true)
            }
            let healer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'healer');
            if ((healer.length < healers || (healer[0] && healer[0].ticksToLive <= 500 && healer.length < healers + 1)) && !_.includes(queue, 'healer')) {
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'healer',
                    targetRoom: key,
                    operation: 'harass',
                    waitFor: waitFor,
                    military: true
                }, true)
            }
        }
        // Drain
        if (level >= 4 && Memory.targetRooms[key].type === 'drain' && Game.map.findRoute(room.name, key).length <= 20) {
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
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'drainer',
                    targetRoom: key,
                    operation: 'drain',
                    military: true
                }, true)
            }
        }
        // Siege
        if (level >= 6 && Memory.targetRooms[key].type === 'siege' && Game.map.findRoute(room.name, key).length <= 20) {
            let opLevel = Memory.targetRooms[key].level;
            let deconstructors = 0;
            let healers = 0;
            let siegeEngines = 0;
            let siegeHealers = 0;
            let waitFor = 2;
            if (opLevel === '1') {
                deconstructors = 1;
                healers = 1;
                waitFor = 2;
            } else if (opLevel === '2') {
                deconstructors = 1;
                healers = 2;
                waitFor = 3;
            } else if (opLevel === '3') {
                siegeEngines = 1;
                siegeHealers = 1;
                waitFor = 2;
            } else if (opLevel === '4') {
                siegeEngines = 2;
                siegeHealers = 2;
                waitFor = 4;
            }
            let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'deconstructor');
            let healer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'healer');
            let siegeEngine = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeEngine');
            let siegeHealer = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === key && creep.memory.role === 'siegeHealer');
            if ((deconstructor.length < deconstructors || (deconstructor[0] && deconstructor[0].ticksToLive <= 500)) && !_.includes(queue, 'deconstructor')) {
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'deconstructor',
                    targetRoom: key,
                    operation: 'siege',
                    military: true,
                    waitFor: waitFor
                }, true)
            }
            if ((healer.length < healers || (healer[0] && healer[0].ticksToLive <= 500)) && !_.includes(queue, 'healer')) {
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'healer',
                    targetRoom: key,
                    operation: 'siege',
                    military: true,
                    waitFor: waitFor
                }, true)
            }
            if ((siegeEngine.length < siegeEngines || (siegeEngine[0] && siegeEngine[0].ticksToLive <= 500)) && !_.includes(queue, 'siegeEngine')) {
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'siegeEngine',
                    targetRoom: key,
                    operation: 'siege',
                    military: true,
                    waitFor: waitFor
                }, true)
            }
            if ((siegeHealer.length < siegeHealers || (siegeHealer[0] && siegeHealer[0].ticksToLive <= 500)) && !_.includes(queue, 'siegeHealer')) {
                queueCreep(room, PRIORITIES.attacker, {
                    role: 'siegeHealer',
                    targetRoom: key,
                    operation: 'siege',
                    military: true,
                    waitFor: waitFor
                }, true)
            }
        }
    }
};

function checkIfSK(roomName) {
    let parsed;
    if (!parsed) {
        parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
    }
    let fMod = parsed[1] % 10;
    let sMod = parsed[2] % 10;
    return !(fMod === 5 && sMod === 5) &&
        ((fMod >= 4) && (fMod <= 6)) &&
        ((sMod >= 4) && (sMod <= 6));
};