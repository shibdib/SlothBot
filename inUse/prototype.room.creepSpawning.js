Room.prototype.processBuildQueue = function () {
    let spawns = Game.spawns;
    for (let key in spawns) {
        let spawn = spawns[key];
        let level = getLevel(spawn.room);
        if (!spawn.spawning) {
            if (spawn.room.memory.creepBuildQueue) {
                let topPriority = _.min(spawn.room.memory.creepBuildQueue, 'importance');
                let role = topPriority.role;
                let body = _.get(SPAWN[level], role);
                if (topPriority && typeof topPriority === 'object') {
                    _.defaults(topPriority, {
                        role: undefined,
                        assignedRoom: undefined,
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
                        reservationTarget: undefined
                    });
                    if (spawn.createCreep(body, role + Game.time, {
                            born: Game.time,
                            role: topPriority.role,
                            assignedRoom: topPriority.assignedRoom,
                            assignedSource: topPriority.assignedSource,
                            destination: topPriority.destination,
                            assignedMineral: topPriority.assignedMineral,
                            responseTarget: topPriority.responseTarget,
                            attackTarget: topPriority.attackTarget,
                            attackType: topPriority.attackType,
                            siegePoint: topPriority.siegePoint,
                            staging: topPriority.staging,
                            waitForHealers: topPriority.waitForHealers,
                            waitForAttackers: topPriority.waitForAttackers,
                            waitForRanged: topPriority.waitForRanged,
                            waitForDeconstructor: topPriority.waitForDeconstructor,
                            reservationTarget: topPriority.reservationTarget
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
    let roomCreeps = this.memory._caches.creeps;
    if (level === 1) return roomStartup(this, roomCreeps);
    let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester') && c.memory.assignedRoom === this.name);
    let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn' || creep.memory.role === 'basicHauler'));
    if (harvesters.length === 0 || pawn.length === 0) {
        if (harvesters.length === 0) {
            queueCreep(this, PRIORITIES.basicHarvester, {
                role: 'basicHarvester'
            })
        }
        if (level < 4 || !this.memory.storageBuilt || pawn.length === 0) {
            if (_.filter(roomCreeps, (c) => c.memory.role === 'basicHauler' && c.memory.assignedRoom === this.name).length < 3) {
                queueCreep(this, PRIORITIES.basicHauler, {
                    role: 'basicHauler'
                })
            }
        }
    } else {

        //Harvesters
        let sources = this.find(FIND_SOURCES);
        let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester') && c.memory.assignedRoom === this.name);
        if (harvesters.length === 0) {
            queueCreep(this, PRIORITIES.basicHarvester, {
                role: 'basicHarvester'
            })
        }
        harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester') && c.memory.assignedRoom === this.name);
        let basicHarvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'basicHarvester') && c.memory.assignedRoom === this.name);
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
        if (level < 4 || !this.memory.storageBuilt) {

            if (_.pluck(_.filter(this.memory.structureCache, 'type', 'storage'), 'id').length > 0) {
                this.memory.storageBuilt = true;
            }
            if (_.filter(roomCreeps, (c) => c.memory.role === 'basicHauler' && c.memory.assignedRoom === this.name).length < 2) {
                queueCreep(this, PRIORITIES.basicHauler, {
                    role: 'basicHauler'
                })
            }
        } else if (this.memory.storageBuilt) {
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
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedRoom === this.name);
        let worker = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedRoom === this.name);
        let count;
        let construction = _.filter(Game.constructionSites, (site) => site.pos.roomName === this.name);
        if (war === true) {
            count = 5;
        } else if (construction.length > 5) {
            count = 15;
        } else {
            count = 5;
        }
        let workerPower = 0;
        for (let key in worker) {
            let work = worker[key].getActiveBodyparts(WORK);
            workerPower = workerPower + work;
        }
        if (workerPower < count && upgraders.length > 0 && worker.length < 5) {
            queueCreep(this, PRIORITIES.worker, {
                role: 'worker'
            })
        }
        if (level === 8) {
            count = 15;
        } else if (war === true) {
            count = 15;
        } else {
            count = 35;
        }
        let number;
        if (this.controller.level === 8) {
            number = 1;
        } else if (level >= 5) {
            number = 3;
        } else {
            number = 8;
        }
        let upgradePower = 0;
        for (let key in upgraders) {
            let upgrade = upgraders[key].getActiveBodyparts(WORK);
            upgradePower = upgradePower + upgrade;
        }
        if (upgradePower * UPGRADE_CONTROLLER_POWER < count && upgraders.length < number) {
            queueCreep(this, PRIORITIES.upgrader, {
                role: 'upgrader'
            })
        }
        if (level >= 3) {
            let wallers = _.filter(roomCreeps, (creep) => creep.memory.role === 'waller' && creep.memory.assignedRoom === this.name);
            if (wallers.length < 2 && upgraders.length > 0) {
                queueCreep(this, PRIORITIES.waller, {
                    role: 'waller'
                })
            }
        }
        if (level >= 6 && !war) {
            let minerals = this.controller.pos.findClosestByRange(FIND_MINERALS);
            let extractor = Game.getObjectById(_.pluck(_.filter(this.memory.structureCache, 'type', 'extractor'), 'id')[0]);
            let mineralHarvester = _.filter(roomCreeps, (creep) => creep.memory.assignedMineral === minerals.id && creep.memory.role === 'mineralHarvester' && creep.memory.assignedRoom === this.name);
            if (mineralHarvester.length < 2 && upgraders.length > 0 && minerals.mineralAmount > 0 && extractor) {
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
                    let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKattacker' && creep.memory.assignedRoom === this.name);
                    let SKSupport = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'SKsupport' && creep.memory.assignedRoom === this.name);
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
                    let SKhauler = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.skRooms[key] && creep.memory.role === 'remoteHauler' && creep.memory.assignedRoom === this.name);
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
                    let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'remoteHauler' && creep.memory.assignedRoom === this.name);
                    if (remoteHauler.length < Memory.roomCache[this.memory.remoteRooms[keys]].sources.length / 2 && remoteHarvester.length >= 1 && Game.map.getRoomLinearDistance(this.name, this.memory.remoteRooms[keys]) < 2) {
                        queueCreep(this, PRIORITIES.remoteHauler, {
                            role: 'remoteHauler',
                            destination: this.memory.remoteRooms[keys]
                        })
                    }
                    let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === this.memory.remoteRooms[keys] && creep.memory.role === 'pioneer');
                    if (pioneers.length < 1 && remoteHarvester.length > 0) {
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
            if (Game.time % 150 === 0) {
                let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer' && creep.memory.assignedRoom === this.name);
                if (explorers.length < 1) {
                    queueCreep(this, PRIORITIES.explorer, {
                        role: 'explorer'
                    })
                }
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
                    if ((neighborCheck(this.name, assistNeeded[key].name) === true || assistNeeded[key].name === this.name) && !_.includes(this.memory.skRooms, assistNeeded[key].name)) {
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[key].name && creep.memory.role === 'responder');
                        if (responder.length < assistNeeded[key].memory.numberOfHostiles) {
                            queueCreep(this, PRIORITIES.responder, {
                                role: 'responder',
                                responseTarget: assistNeeded[key].name
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
                        waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                    })
                }
                let swarms = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'swarm');
                if (swarms.length < Memory.militaryNeeds[key].swarm) {
                    queueCreep(this, PRIORITIES.swarm, {
                        role: 'swarm',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        staging: STAGING_ROOM,
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
                        waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
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
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
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
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
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
}

function queueCreep(room, importance, options = {}) {
    let cache = room.memory.creepBuildQueue || {};
    if (!room.memory.creepBuildQueue) room.memory.creepBuildQueue = {};
    _.defaults(options, {
        role: undefined,
        assignedRoom: undefined,
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
        reservationTarget: undefined
    });
    if (room) {
        let key = options.role;
        cache[key] = {
            cached: Game.time,
            room: room.name,
            importance: importance,
            role: options.role,
            assignedRoom: room.name,
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
            reservationTarget: options.reservationTarget
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
            role: 'basicHarvester'
        })
    }
    let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn' || creep.memory.role === 'basicHauler'));
    if (pawn.length < 2) {
        queueCreep(room, 2, {
            role: 'basicHauler'
        })
    }
    let worker = _.filter(roomCreeps, (creep) => (creep.memory.role === 'worker'));
    if (worker.length < 2) {
        queueCreep(room, 3, {
            role: 'upgrader'
        })
    }
    let upgrader = _.filter(roomCreeps, (creep) => (creep.memory.role === 'upgrader'));
    if (upgrader.length < 5) {
        queueCreep(room, 4, {
            role: 'upgrader'
        })
    }
}

function neighborCheck(spawnRoom, remoteRoom) {
    return Game.map.getRoomLinearDistance(spawnRoom, remoteRoom) <= 1;
}