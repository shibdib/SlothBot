let profiler = require('screeps-profiler');

Room.prototype.processBuildQueue = function () {
    let spawns = Game.spawns;
    for (let key in spawns) {
        let spawn = spawns[key];
        let level = getLevel(spawn.room);
        if (!spawn.spawning) {
            if (spawn.room.memory.creepBuildQueue) {
                let topPriority = _.min(spawn.room.memory.creepBuildQueue, 'importance');
                let role = topPriority.role;
                let body;
                if (topPriority.reboot) {
                    body = _.get(SPAWN[1], role);
                } else {
                    body = _.get(SPAWN[level], role);
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
                        waitForHealers: undefined,
                        waitForAttackers: undefined,
                        waitForRanged: undefined,
                        waitForDeconstructor: undefined,
                        reservationTarget: undefined,
                        initialBuilder: undefined
                    });
                    if (!topPriority.role) return;
                    if (spawn.createCreep(body, role + Game.time, {
                            born: Game.time,
                            role: role,
                            overlord: topPriority.overlord,
                            assignedSource: topPriority.assignedSource,
                            destination: topPriority.destination,
                            assignedMineral: topPriority.assignedMineral,
                            military: topPriority.military,
                            responseTarget: topPriority.responseTarget,
                            targetRoom: topPriority.targetRoom,
                            operation: topPriority.operation,
                            siegePoint: topPriority.siegePoint,
                            staging: topPriority.staging,
                            waitForHealers: topPriority.waitForHealers,
                            waitForAttackers: topPriority.waitForAttackers,
                            waitForRanged: topPriority.waitForRanged,
                            waitForDeconstructor: topPriority.waitForDeconstructor,
                            reservationTarget: topPriority.reservationTarget,
                            initialBuilder: topPriority.initialBuilder
                        }) === role + Game.time) {
                        log.i(spawn.room.name + ' Spawning a ' + role);
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

function queueCreep(room, importance, options = {}) {
    let cache = room.memory.creepBuildQueue || {};
    if (!room.memory.creepBuildQueue) room.memory.creepBuildQueue = {};
    _.defaults(options, {
        role: undefined,
        overlord: undefined,
        assignedSource: undefined,
        destination: undefined,
        assignedMineral: undefined,
        responseTarget: undefined,
        targetRoom: undefined,
        operation: undefined,
        siegePoint: undefined,
        staging: undefined,
        waitForHealers: undefined,
        waitForAttackers: undefined,
        waitForRanged: undefined,
        waitForDeconstructor: undefined,
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
            overlord: room.name,
            assignedSource: options.assignedSource,
            destination: options.destination,
            assignedMineral: options.assignedMineral,
            responseTarget: options.responseTarget,
            targetRoom: options.targetRoom,
            operation: options.operation,
            siegePoint: options.siegePoint,
            staging: options.staging,
            waitForHealers: options.waitForHealers,
            waitForAttackers: options.waitForAttackers,
            waitForRanged: options.waitForRanged,
            waitForDeconstructor: options.waitForDeconstructor,
            reservationTarget: options.reservationTarget,
            initialBuilder: options.initialBuilder,
            reboot: options.reboot
        };
        if (!room.memory.creepBuildQueue[key]) room.memory.creepBuildQueue = cache;
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
    let containers = room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
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

workerCreepQueue = function () {
    let queue = this.memory.creepBuildQueue;
    let level = getLevel(this);
    let energy = this.energyAvailable;
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === this.name);
    // Level 1 room management
    if (level === 1) {
        roomStartup(this, roomCreeps);
    }
    //Harvesters
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester'));
    if (harvesters.length === 0) {
        this.memory.creepBuildQueue = undefined;
        queueCreep(this, -1, {
            role: 'stationaryHarvester',
            reboot: true
        });
        return;
    }
    if (!_.includes(queue, 'stationaryHarvester')) {
        if (harvesters.length < 2 || (harvesters[0].ticksToLive < 100 && harvesters.length < 3)) {
            queueCreep(this, PRIORITIES.stationaryHarvester, {
                role: 'stationaryHarvester'
            })
        }
    }
    //Upgrader
    if (!_.includes(queue, 'upgrader') && level === this.controller.level && !this.memory.responseNeeded) {
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
        if (upgraders.length < _.round((9 - level) / 2)) {
            queueCreep(this, PRIORITIES.upgrader, {
                role: 'upgrader'
            })
        }
    }
    //Worker
    if (!_.includes(queue, 'worker') && _.filter(Game.constructionSites, (site) => site.pos.roomName === this.name).length > 0 && !this.memory.responseNeeded) {
        let workers = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker');
        if (workers.length < 2) {
            queueCreep(this, PRIORITIES.worker, {
                role: 'worker'
            })
        }
    }
    //Haulers
    let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
    if (hauler.length === 0 && energy <= 350) {
        this.memory.creepBuildQueue = undefined;
        queueCreep(this, PRIORITIES.hauler, {
            role: 'hauler',
            reboot: true
        });
        return;
    }
    if (!_.includes(queue, 'hauler')) {
        let hauler = _.filter(roomCreeps, (creep) => (creep.memory.role === 'hauler'));
        if (hauler.length < 2 || (hauler[0].ticksToLive < 250 && hauler.length < 3)) {
            queueCreep(this, PRIORITIES.hauler, {
                role: 'hauler'
            })
        }
    }
    //SPECIALIZED
    //Waller
    if (level >= 3 && !_.includes(queue, 'waller') && level === this.controller.level) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        if (wallers.length < 2) {
            queueCreep(this, PRIORITIES.waller, {
                role: 'waller'
            })
        }
    }
    //Mineral Harvester
    if (level >= 6 && !_.includes(queue, 'mineralHarvester') && level === this.controller.level && !this.memory.responseNeeded) {
        let mineralHarvesters = _.filter(roomCreeps, (creep) => creep.memory.role === 'mineralHarvester');
        let extractor = Game.getObjectById(_.pluck(_.filter(this.memory.structureCache, 'type', 'extractor'), 'id')[0]);
        if (mineralHarvesters.length < 1 && extractor) {
            let minerals = this.controller.pos.findClosestByRange(FIND_MINERALS);
            queueCreep(this, PRIORITIES.mineralHarvester, {
                role: 'mineralHarvester',
                assignedMineral: minerals.id
            })
        }
    }
    // Local Responder
    if (!_.includes(queue, 'responder')) {
        if (this.memory.responseNeeded === true) {
            let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === this.name && creep.memory.role === 'responder');
            if (responder.length < this.memory.numberOfHostiles) {
                queueCreep(this, PRIORITIES.responder, {
                    role: 'responder',
                    responseTarget: this.name,
                    military: true
                })
            }
        }
    }
};
Room.prototype.workerCreepQueue = profiler.registerFN(workerCreepQueue, 'workerCreepQueue');

remoteCreepQueue = function () {
    let level = getLevel(this);
    if (level !== this.controller.level) return;
    let queue = this.memory.creepBuildQueue;
    //Explorer
    if (!_.includes(queue, 'explorer')) {
        let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer' && creep.memory.overlord === this.name);
        if (explorers.length < 1) {
            queueCreep(this, PRIORITIES.explorer, {
                role: 'explorer'
            })
        }
    }
    //Remotes
    if (this.memory.remoteRooms && !this.memory.responseNeeded) {
        for (let keys in this.memory.remoteRooms) {
            if (Game.map.findRoute(this.name, this.memory.remoteRooms[keys]).length >= 2 || checkIfSK(this.memory.remoteRooms[keys])) continue;
            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester');
            if (!_.includes(queue, 'remoteHarvester')) {
                if (remoteHarvester.length < Memory.roomCache[this.memory.remoteRooms[keys]].sources.length && (!Game.rooms[this.memory.remoteRooms[keys]] || !Game.rooms[this.memory.remoteRooms[keys]].memory.noRemote)) {
                    queueCreep(this, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: this.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'remoteHauler')) {
                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'remoteHauler' && creep.memory.overlord === this.name);
                if (remoteHarvester.length > 0 && remoteHauler.length < 1 && Game.map.findRoute(this.name, this.memory.remoteRooms[keys]).length < 2) {
                    queueCreep(this, PRIORITIES.remoteHauler, {
                        role: 'remoteHauler',
                        destination: this.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'pioneer')) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'pioneer');
                if (pioneers.length < 1) {
                    queueCreep(this, PRIORITIES.pioneer, {
                        role: 'pioneer',
                        destination: this.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'reserver') && level >= 5) {
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === this.memory.remoteRooms[keys]);
                if ((reserver.length < 1 || (reserver[0].ticksToLive < 100 && reserver.length < 2)) && (!Game.rooms[this.memory.remoteRooms[keys]] || !Game.rooms[this.memory.remoteRooms[keys]].memory.reservationExpires || Game.rooms[this.memory.remoteRooms[keys]].memory.reservationExpires <= Game.time + 250) && (!Game.rooms[this.memory.remoteRooms[keys]] || !Game.rooms[this.memory.remoteRooms[keys]].memory.noRemote)) {
                    queueCreep(this, PRIORITIES.reserver, {
                        role: 'reserver',
                        reservationTarget: this.memory.remoteRooms[keys]
                    })
                }
            }
            // Remote Response
            if (!_.includes(queue, 'remoteResponse')) {
                if (Game.rooms[this.memory.remoteRooms[keys]] && Game.rooms[this.memory.remoteRooms[keys]].memory.responseNeeded === true && !this.memory.responseNeeded) {
                    let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === this.memory.remoteRooms[keys] && creep.memory.role === 'responder');
                    if (responder.length < Game.rooms[this.memory.remoteRooms[keys]].memory.numberOfHostiles) {
                        queueCreep(this, PRIORITIES.remoteResponse, {
                            role: 'remoteResponse',
                            responseTarget: this.memory.remoteRooms[keys],
                            military: true
                        })
                    }
                }
            }
        }
    }
    //SK Rooms
    if (level >= 7 && this.memory.skRooms && !this.memory.responseNeeded) {
        for (let key in this.memory.skRooms) {
            let SKRoom = Game.rooms[this.memory.skRooms[key]];
            if (!SKRoom) continue;
            let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKattacker' && creep.memory.overlord === this.name);
            let SKworker = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKworker');
            /**f (!_.includes(queue, 'SKsupport')) {
                let SKSupport = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKsupport' && creep.memory.overlord === this.name);
                if (((SKSupport.length < 1 || (SKSupport.length === 1 && SKSupport[0].ticksToLive < 100)) && SKAttacker.length > 0) && Game.map.findRoute(this.name, SKRoom.name).length < 2 && (!SKRoom.memory || !SKRoom.memory.noMine)) {
                    queueCreep(this, PRIORITIES.SKsupport, {
                        role: 'SKsupport',
                        destination: this.memory.skRooms[key]
                    })
                }
            }**/
            if (!_.includes(queue, 'SKattacker')) {
                if ((SKAttacker.length < 1 || (SKAttacker.length === 1 && SKAttacker[0].ticksToLive < 250)) && Game.map.findRoute(this.name, SKRoom.name).length < 2 && (!SKRoom.memory || !SKRoom.memory.noMine)) {
                    queueCreep(this, PRIORITIES.SKattacker, {
                        role: 'SKattacker',
                        destination: this.memory.skRooms[key]
                    })
                }
            }
            if (!_.includes(queue, 'SKworker')) {
                if (SKworker.length < Memory.roomCache[this.memory.skRooms[key]].sources.length + 1 && (SKAttacker.length > 0)) {
                    queueCreep(this, PRIORITIES.SKworker, {
                        role: 'SKworker',
                        destination: this.memory.skRooms[key]
                    })
                }
            }
            if (!_.includes(queue, 'remoteHauler')) {
                let SKhauler = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'remoteHauler' && creep.memory.overlord === this.name);
                if (SKhauler.length < 2 && (SKAttacker.length > 0)) {
                    queueCreep(this, PRIORITIES.remoteHauler, {
                        role: 'remoteHauler',
                        destination: this.memory.skRooms[key]
                    })
                }
            }
            if (!_.includes(queue, 'pioneer')) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'pioneer');
                if (pioneers.length < 1 && (SKAttacker.length > 0)) {
                    queueCreep(this, PRIORITIES.pioneer, {
                        role: 'pioneer',
                        destination: this.memory.skRooms[key]
                    })
                }
            }
        }
    }

    //Claim Stuff
    if (!_.includes(queue, 'claimer') && this.memory.claimTarget) {
        let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.claimTarget && creep.memory.role === 'claimer');
        if (claimer.length < 1 && !_.includes(Memory.ownedRooms, this.memory.claimTarget) && !this.memory.activeClaim) {
            queueCreep(this, 2, {
                role: 'claimer',
                destination: this.memory.claimTarget
            })
        }
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.claimTarget && creep.memory.role === 'pioneer');
        if (!_.includes(queue, 'pioneer') && pioneers.length < -2 + level) {
            queueCreep(this, 2, {
                role: 'pioneer',
                destination: this.memory.claimTarget,
                initialBuilder: true
            })
        }
    }

    // Assist room
    if (!_.includes(queue, 'pioneer') && this.memory.assistingRoom) {
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.assistingRoom && creep.memory.role === 'pioneer');
        if (pioneers.length < -2 + level) {
            queueCreep(this, 2, {
                role: 'pioneer',
                destination: this.memory.assistingRoom,
                initialBuilder: true
            })
        }
    }
};
Room.prototype.remoteCreepQueue = profiler.registerFN(remoteCreepQueue, 'remoteCreepQueue');

militaryCreepQueue = function () {
    let queue = this.memory.creepBuildQueue;
    let level = getLevel(this);
    // Cleaning
    if (this.memory.cleaningTargets && this.memory.cleaningTargets.length > 0 && !_.includes(queue, 'deconstructor') && level >= 4) {
        for (let key in this.memory.cleaningTargets) {
            let target = this.memory.cleaningTargets[key].name;
            let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.targetRoom === target && creep.memory.role === 'deconstructor');
            if (deconstructor.length < 1) {
                queueCreep(this, PRIORITIES.deconstructor, {
                    role: 'deconstructor',
                    targetRoom: target,
                    operation: 'clean',
                    reboot: true
                })
            }
        }
    }
};
Room.prototype.militaryCreepQueue = profiler.registerFN(militaryCreepQueue, 'militaryCreepQueue');

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