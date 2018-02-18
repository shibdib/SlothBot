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
                        attackTarget: undefined,
                        attackType: undefined,
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
                            attackTarget: topPriority.attackTarget,
                            attackType: topPriority.attackType,
                            siegePoint: topPriority.siegePoint,
                            staging: topPriority.staging,
                            waitForHealers: topPriority.waitForHealers,
                            waitForAttackers: topPriority.waitForAttackers,
                            waitForRanged: topPriority.waitForRanged,
                            waitForDeconstructor: topPriority.waitForDeconstructor,
                            reservationTarget: topPriority.reservationTarget,
                            initialBuilder: topPriority.initialBuilder
                        }) === role + Game.time) {
                        console.log(spawn.room.name + ' Spawning a ' + role);
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
                spawningCreep.memory.role,
                spawn.pos.x + 1,
                spawn.pos.y,
                {align: 'left', opacity: 0.8}
            );
        }
    }
};

Room.prototype.creepQueueChecks = function () {
    delete this.memory.creepBuildQueue;
    let level = getLevel(this);
    let war = Memory.war;
    let roomCreeps = _.filter(Game.creeps, (r) => r.memory.overlord === this.name);
    if (level === 1) return roomStartup(this, roomCreeps);
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester') && c.memory.overlord === this.name);
    let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn' || creep.memory.role === 'basicHauler'));
    if (harvesters.length === 0 || pawn.length === 0) {
        if (harvesters.length === 0) {
            queueCreep(this, PRIORITIES.basicHarvester, {
                role: 'basicHarvester'
            })
        }
        if (level < 4 || !this.memory.storageBuilt || pawn.length === 0) {
            if (_.filter(roomCreeps, (c) => c.memory.role === 'basicHauler' && c.memory.overlord === this.name).length < 3) {
                queueCreep(this, PRIORITIES.basicHauler, {
                    role: 'basicHauler'
                })
            }
        }
    } else {

        //Harvesters
        let sources = this.find(FIND_SOURCES);
        let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester') && c.memory.overlord === this.name);
        if (harvesters.length === 0) {
            queueCreep(this, PRIORITIES.basicHarvester, {
                role: 'basicHarvester'
            })
        }
        harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester') && c.memory.overlord === this.name);
        let basicHarvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'basicHarvester') && c.memory.overlord === this.name);
        if (harvesters.length < sources.length || (harvesters[0].ticksToLive < 100 && harvesters.length < sources.length + 1)) {
            queueCreep(this, PRIORITIES.stationaryHarvester, {
                role: 'stationaryHarvester'
            })
        } else {
            if (level > 1) {
                if (basicHarvesters.length > 0) {
                    basicHarvesters[0].suicide();
                }
            }
        }

        //Haulers
        let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'pawn' || creep.memory.role === 'mineralHauler' || creep.memory.role === 'labTech'));
        if (!this.memory.storageBuilt) {
            if (_.pluck(_.filter(this.memory.structureCache, 'type', 'storage'), 'id').length > 0) {
                this.memory.storageBuilt = true;
            }
            if (_.filter(roomCreeps, (c) => c.memory.role === 'basicHauler' && c.memory.overlord === this.name).length < 2) {
                queueCreep(this, PRIORITIES.basicHauler, {
                    role: 'basicHauler'
                })
            }
        } else {
            if (_.pluck(_.filter(this.memory.structureCache, 'type', 'storage'), 'id').length < 1) {
                this.memory.storageBuilt = undefined;
            }
            if (pawn.length < 2) {
                queueCreep(this, 1, {
                    role: 'pawn'
                })
            } else if (pawn.length < 3) {
                queueCreep(this, PRIORITIES.pawn, {
                    role: 'pawn'
                })
            }
        }

        //Workers
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.overlord === this.name);
        let worker = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker' && creep.memory.overlord === this.name);
        let priority = PRIORITIES.worker;
        if (worker.length === 0) priority = 2;
        if (upgraders.length > 0 && worker.length < 2) {
            queueCreep(this, priority, {
                role: 'worker'
            })
        }
        let number;
        if (this.controller.level === 8) {
            number = 1;
        } else if (level >= 5) {
            number = 3;
        } else {
            number = 5;
        }
        priority = PRIORITIES.upgrader;
        if (upgraders.length === 0) priority = 2;
        if (upgraders.length < number) {
            queueCreep(this, priority, {
                role: 'upgrader'
            })
        }
        if (level >= 3) {
            let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller' && creep.memory.overlord === this.name);
            if (wallers.length < 2 && upgraders.length > 0) {
                queueCreep(this, PRIORITIES.waller, {
                    role: 'waller'
                })
            }
        }
        if (level >= 6 && !war) {
            let minerals = this.controller.pos.findClosestByRange(FIND_MINERALS);
            let extractor = Game.getObjectById(_.pluck(_.filter(this.memory.structureCache, 'type', 'extractor'), 'id')[0]);
            let mineralHarvester = _.filter(roomCreeps, (creep) => creep.memory.assignedMineral === minerals.id && creep.memory.role === 'mineralHarvester' && creep.memory.overlord === this.name);
            if (mineralHarvester.length < 1 && upgraders.length > 0 && minerals.mineralAmount > 0 && extractor) {
                queueCreep(this, PRIORITIES.mineralHarvester, {
                    role: 'mineralHarvester',
                    assignedMineral: minerals.id
                })
            }
        }

        //Remotes
        if (level >= 3) {
            for (let i = 0; i < 20; i++) {
                let pioneer = 'pioneer' + i;
                if (Game.flags[pioneer] && Game.flags[pioneer].pos.roomName !== this.name) {
                    let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === pioneer && creep.memory.role === 'pioneer');
                    if (pioneers.length < 1) {
                        queueCreep(this, PRIORITIES.pioneer, {
                            role: 'pioneer',
                            destination: pioneer
                        })
                    }
                }
            }
            if (level >= 7 && this.memory.skRooms && !war) {
                for (let key in this.memory.skRooms) {
                    let SKRoom = Game.rooms[this.memory.skRooms[key]];
                    if (!SKRoom) continue;
                    let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKattacker' && creep.memory.overlord === this.name);
                    let SKSupport = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKsupport' && creep.memory.overlord === this.name);
                    if (((SKSupport.length < 1 || (SKSupport.length === 1 && SKSupport[0].ticksToLive < 100)) && SKAttacker.length > 0) && Game.map.getRoomLinearDistance(this.name, SKRoom.name) < 2 && (!SKRoom.memory || !SKRoom.memory.noMine)) {
                        queueCreep(this, PRIORITIES.SKsupport, {
                            role: 'SKsupport',
                            destination: this.memory.skRooms[key]
                        })
                    }
                    if ((SKAttacker.length < 1 || (SKAttacker.length === 1 && SKAttacker[0].ticksToLive < 100)) && Game.map.getRoomLinearDistance(this.name, SKRoom.name) < 2 && (!SKRoom.memory || !SKRoom.memory.noMine)) {
                        queueCreep(this, PRIORITIES.SKattacker, {
                            role: 'SKattacker',
                            destination: this.memory.skRooms[key]
                        })
                    }
                    let SKworker = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKworker');
                    if (SKworker.length < Memory.roomCache[this.memory.skRooms[key]].sources.length + 1 && (SKAttacker.length > 0)) {
                        queueCreep(this, PRIORITIES.SKworker, {
                            role: 'SKworker',
                            destination: this.memory.skRooms[key]
                        })
                    }
                    let SKhauler = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'remoteHauler' && creep.memory.overlord === this.name);
                    if (SKhauler.length < SKworker.length / 2 && (SKAttacker.length > 0)) {
                        queueCreep(this, PRIORITIES.remoteHauler, {
                            role: 'remoteHauler',
                            destination: this.memory.skRooms[key]
                        })
                    }
                    let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'pioneer');
                    if (pioneers.length < 1 && (SKAttacker.length > 0)) {
                        queueCreep(this, PRIORITIES.pioneer, {
                            role: 'pioneer',
                            destination: this.memory.skRooms[key]
                        })
                    }
                }
            }
            if (this.memory.remoteRooms) {
                for (let keys in this.memory.remoteRooms) {
                    let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester');
                    if (remoteHarvester.length < Memory.roomCache[this.memory.remoteRooms[keys]].sources.length && Game.map.getRoomLinearDistance(this.name, this.memory.remoteRooms[keys]) < 2 && (!Game.rooms[this.memory.remoteRooms[keys]] || !Game.rooms[this.memory.remoteRooms[keys]].memory.noRemote)) {
                        queueCreep(this, PRIORITIES.remoteHarvester, {
                            role: 'remoteHarvester',
                            destination: this.memory.remoteRooms[keys]
                        })
                    }
                    let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'remoteHauler' && creep.memory.overlord === this.name);
                    if (remoteHauler.length < Memory.roomCache[this.memory.remoteRooms[keys]].sources.length / 2 && remoteHarvester.length >= 1 && Game.map.getRoomLinearDistance(this.name, this.memory.remoteRooms[keys]) < 2) {
                        queueCreep(this, PRIORITIES.remoteHauler, {
                            role: 'remoteHauler',
                            destination: this.memory.remoteRooms[keys]
                        })
                    }
                    let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'pioneer');
                    let site = _.filter(Game.constructionSites, (s) => s.pos.roomName === this.memory.remoteRooms[keys]);
                    if (pioneers.length < 1 && remoteHarvester.length > 0 && site.length > 0) {
                        queueCreep(this, PRIORITIES.pioneer, {
                            role: 'pioneer',
                            destination: this.memory.remoteRooms[keys]
                        })
                    }
                }
            }
            if (level >= 4) {
                let remotes = this.memory.remoteRooms;
                for (let key in remotes) {
                    let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(remotes[key]);
                    let fMod = parsed[1] % 10;
                    let sMod = parsed[2] % 10;
                    let isSK = ((fMod >= 4) && (fMod <= 6)) && ((sMod >= 4) && (sMod <= 6));
                    if (isSK) continue;
                    let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === remotes[key]);
                    if ((reserver.length < 1 || (reserver[0].ticksToLive < 100 && reserver.length < 2)) && (!Game.rooms[remotes[key]] || !Game.rooms[remotes[key]].memory.reservationExpires || Game.rooms[remotes[key]].memory.reservationExpires <= Game.time + 150) && (!Game.rooms[remotes[key]] || !Game.rooms[remotes[key]].memory.noRemote)) {
                        queueCreep(this, PRIORITIES.reserver, {
                            role: 'reserver',
                            reservationTarget: remotes[key]
                        })
                    }
                }
            }
            for (let i = 0; i < 20; i++) {
                let claim = 'claim' + i;
                if (Game.flags[claim] && Game.flags[claim].pos.roomName !== this.roomName) {
                    let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === claim && creep.memory.role === 'claimer');
                    if (claimer.length < 1) {
                        queueCreep(this, PRIORITIES.claimer, {
                            role: 'claimer',
                            destination: claim
                        })
                    }
                }
            }
        }

        //Scouts
        if (level >= 2) {
            let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer' && creep.memory.overlord === this.name);
            if (explorers.length < 1) {
                queueCreep(this, PRIORITIES.explorer, {
                    role: 'explorer'
                })
            }
            for (let key in Memory.militaryNeeds) {
                if (!Memory.militaryNeeds[key]) {
                    Memory.militaryNeeds[key] = undefined;
                    continue;
                }
                let scouts = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'scout');
                if (scouts.length < Memory.militaryNeeds[key].scout) {
                    queueCreep(this, PRIORITIES.scout, {
                        role: 'scout',
                        destination: key
                    })
                }
            }
        }

        //Responder
        if (level >= 4) {
            let assistNeeded = _.filter(Game.rooms, (room) => room.memory.responseNeeded === true);
            if (assistNeeded.length > 0) {
                for (let key in assistNeeded) {
                    if ((neighborCheck(this.name, assistNeeded[key].name) === true || assistNeeded[key].name === this.name) && !_.includes(this.memory.skRooms, assistNeeded[key].name) && !_.includes(this.memory.skRooms, assistNeeded[key].name) && !assistNeeded[key].memory.noRemote) {
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[key].name && creep.memory.role === 'responder');
                        if (responder.length < assistNeeded[key].memory.numberOfHostiles) {
                            queueCreep(this, PRIORITIES.responder, {
                                role: 'responder',
                                responseTarget: assistNeeded[key].name,
                                military: true
                            })
                        }
                    }
                }
            }
        }

        //Military
        if (level >= 3) {
            for (let key in Memory.militaryNeeds) {
                if (!Memory.militaryNeeds[key]) {
                    Memory.militaryNeeds[key] = undefined;
                    continue;
                }
                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'attacker');
                if (attackers.length < Memory.militaryNeeds[key].attacker) {
                    queueCreep(this, PRIORITIES.attacker, {
                        role: 'attacker',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        siegePoint: Memory.warControl[key].siegePoint,
                        staging: STAGING_ROOM,
                        waitForHealers: Memory.militaryNeeds[key].healer,
                        waitForAttackers: Memory.militaryNeeds[key].attacker,
                        waitForRanged: Memory.militaryNeeds[key].ranged,
                        waitForDeconstructor: Memory.militaryNeeds[key].deconstructor,
                        military: true
                    })
                }
                let swarms = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'swarm');
                if (swarms.length < Memory.militaryNeeds[key].swarm) {
                    queueCreep(this, PRIORITIES.swarm, {
                        role: 'swarm',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        staging: STAGING_ROOM,
                        military: true
                    })
                }
                let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'healer');
                if (healer.length < Memory.militaryNeeds[key].healer) {
                    queueCreep(this, PRIORITIES.healer, {
                        role: 'healer',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        siegePoint: Memory.warControl[key].siegePoint,
                        staging: STAGING_ROOM,
                        waitForHealers: Memory.militaryNeeds[key].healer,
                        waitForAttackers: Memory.militaryNeeds[key].attacker,
                        waitForRanged: Memory.militaryNeeds[key].ranged,
                        waitForDeconstructor: Memory.militaryNeeds[key].deconstructor,
                        military: true
                    })
                }
                if (level >= 3) {
                    let drainer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'drainer');
                    if (drainer.length < Memory.militaryNeeds[key].drainer) {
                        queueCreep(this, PRIORITIES.drainer, {
                            role: 'drainer',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: STAGING_ROOM,
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor,
                            military: true
                        })
                    }
                    let ranged = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'ranged');
                    if (ranged.length < Memory.militaryNeeds[key].ranged) {
                        queueCreep(this, PRIORITIES.ranged, {
                            role: 'ranged',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: STAGING_ROOM,
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor,
                            military: true
                        })
                    }
                    let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'deconstructor');
                    if (deconstructor.length < Memory.militaryNeeds[key].deconstructor) {
                        queueCreep(this, PRIORITIES.deconstructor, {
                            role: 'deconstructor',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: STAGING_ROOM,
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                        })
                    }
                }
            }
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
        attackTarget: undefined,
        attackType: undefined,
        siegePoint: undefined,
        staging: undefined,
        waitForHealers: undefined,
        waitForAttackers: undefined,
        waitForRanged: undefined,
        waitForDeconstructor: undefined,
        reservationTarget: undefined,
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
            attackTarget: options.attackTarget,
            attackType: options.attackType,
            siegePoint: options.siegePoint,
            staging: options.staging,
            waitForHealers: options.waitForHealers,
            waitForAttackers: options.waitForAttackers,
            waitForRanged: options.waitForRanged,
            waitForDeconstructor: options.waitForDeconstructor,
            reservationTarget: options.reservationTarget,
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
    if (harvesters.length === 0 && energy < 600) {
        this.memory.creepBuildQueue = undefined;
        queueCreep(this, PRIORITIES.stationaryHarvester, {
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
    if (!_.includes(queue, 'upgrader') && level === this.controller.level) {
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
        if (upgraders.length < _.round((9 - level) / 2)) {
            queueCreep(this, PRIORITIES.upgrader, {
                role: 'upgrader'
            })
        }
    }
    //Worker
    if (!_.includes(queue, 'worker')) {
        if (_.filter(Game.constructionSites, (site) => site.pos.roomName === this.name).length > 0) {
            let workers = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker');
            if (workers.length < 4) {
                queueCreep(this, PRIORITIES.worker, {
                    role: 'worker'
                })
            }
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
        if (hauler.length < 3 || (hauler[0].ticksToLive < 250 && hauler.length < 4)) {
            queueCreep(this, PRIORITIES.hauler, {
                role: 'hauler'
            })
        }
    }
    //SPECIALIZED
    //Waller
    if (level >= 3 && !_.includes(queue, 'waller') && level === this.controller.level) {
        let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller');
        if (wallers.length < 1) {
            queueCreep(this, PRIORITIES.waller, {
                role: 'waller'
            })
        }
    }
    //Mineral Harvester
    if (level >= 6 && !_.includes(queue, 'mineralHarvester') && level === this.controller.level) {
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
    //Responder
    if (level >= 4 && !_.includes(queue, 'responder')) {
        let assistNeeded = _.filter(Game.rooms, (room) => room.memory.responseNeeded === true);
        if (assistNeeded.length > 0) {
            for (let key in assistNeeded) {
                if ((neighborCheck(this.name, assistNeeded[key].name) === true || assistNeeded[key].name === this.name) && !_.includes(this.memory.skRooms, assistNeeded[key].name) && !_.includes(this.memory.skRooms, assistNeeded[key].name) && !assistNeeded[key].memory.noRemote) {
                    let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[key].name && creep.memory.role === 'responder');
                    if (responder.length < assistNeeded[key].memory.numberOfHostiles) {
                        queueCreep(this, PRIORITIES.responder, {
                            role: 'responder',
                            responseTarget: assistNeeded[key].name,
                            military: true
                        })
                    }
                }
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
    if (this.memory.remoteRooms) {
        for (let keys in this.memory.remoteRooms) {
            if (!_.includes(queue, 'remoteHarvester')) {
                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester');
                if (remoteHarvester.length < Memory.roomCache[this.memory.remoteRooms[keys]].sources.length && Game.map.getRoomLinearDistance(this.name, this.memory.remoteRooms[keys]) < 2 && (!Game.rooms[this.memory.remoteRooms[keys]] || !Game.rooms[this.memory.remoteRooms[keys]].memory.noRemote)) {
                    queueCreep(this, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: this.memory.remoteRooms[keys]
                    })
                }
            }
            if (!_.includes(queue, 'remoteHauler')) {
                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'remoteHauler' && creep.memory.overlord === this.name);
                if (remoteHauler.length < Memory.roomCache[this.memory.remoteRooms[keys]].sources.length / 2 && Game.map.getRoomLinearDistance(this.name, this.memory.remoteRooms[keys]) < 2) {
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
        }
    }
    //SK Rooms
    if (level >= 7 && this.memory.skRooms) {
        for (let key in this.memory.skRooms) {
            let SKRoom = Game.rooms[this.memory.skRooms[key]];
            if (!SKRoom) continue;
            let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKattacker' && creep.memory.overlord === this.name);
            let SKworker = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKworker');
            if (!_.includes(queue, 'SKsupport')) {
                let SKSupport = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKsupport' && creep.memory.overlord === this.name);
                if (((SKSupport.length < 1 || (SKSupport.length === 1 && SKSupport[0].ticksToLive < 100)) && SKAttacker.length > 0) && Game.map.getRoomLinearDistance(this.name, SKRoom.name) < 2 && (!SKRoom.memory || !SKRoom.memory.noMine)) {
                    queueCreep(this, PRIORITIES.SKsupport, {
                        role: 'SKsupport',
                        destination: this.memory.skRooms[key]
                    })
                }
            }
            if (!_.includes(queue, 'SKattacker')) {
                if ((SKAttacker.length < 1 || (SKAttacker.length === 1 && SKAttacker[0].ticksToLive < 100)) && Game.map.getRoomLinearDistance(this.name, SKRoom.name) < 2 && (!SKRoom.memory || !SKRoom.memory.noMine)) {
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
                if (SKhauler.length < SKworker.length / 2 && (SKAttacker.length > 0)) {
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
    //Reserver
    if (level >= 4 && !_.includes(queue, 'reserver')) {
        let remotes = this.memory.remoteRooms;
        for (let key in remotes) {
            let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(remotes[key]);
            let fMod = parsed[1] % 10;
            let sMod = parsed[2] % 10;
            let isSK = ((fMod >= 4) && (fMod <= 6)) && ((sMod >= 4) && (sMod <= 6));
            if (isSK) continue;
            let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === remotes[key]);
            if ((reserver.length < 1 || (reserver[0].ticksToLive < 100 && reserver.length < 2)) && (!Game.rooms[remotes[key]] || !Game.rooms[remotes[key]].memory.reservationExpires || Game.rooms[remotes[key]].memory.reservationExpires <= Game.time + 150) && (!Game.rooms[remotes[key]] || !Game.rooms[remotes[key]].memory.noRemote)) {
                queueCreep(this, PRIORITIES.reserver, {
                    role: 'reserver',
                    reservationTarget: remotes[key]
                })
            }
        }
    }
    //Claimer
    if (!_.includes(queue, 'claimer') && this.memory.claimTarget) {
        let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.claimTarget && creep.memory.role === 'claimer');
        if (claimer.length < 1 && !_.includes(Memory.ownedRooms, this.memory.claimTarget)) {
            queueCreep(this, 2, {
                role: 'claimer',
                destination: this.memory.claimTarget
            })
        }
        let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.claimTarget && creep.memory.role === 'pioneer');
        if (pioneers.length < 2) {
            queueCreep(this, 3, {
                role: 'pioneer',
                destination: this.memory.claimTarget,
                initialBuilder: true
            })
        }
    }
};
Room.prototype.remoteCreepQueue = profiler.registerFN(remoteCreepQueue, 'remoteCreepQueue');