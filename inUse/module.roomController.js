//modules
let autoBuild = require('room.autoBuild');
let _ = require('lodash');
const profiler = require('screeps-profiler');

function roomControl() {

    for (let name in Game.rooms) {
        let currentRoom = Game.rooms[name];
        if (!currentRoom.controller || (currentRoom.controller.owner && currentRoom.controller.owner.username !== 'Shibdib')) continue;

        //RCL
        //let level = Game.spawns[name].room.controller.level;

        //Every 100 ticks
        /**if (Game.time % 100 === 0) {
            //autoBuild.run(name);
            if (Game.spawns[name].memory.wallCheck !== true && level >= 3) {
                //militaryFunctions.buildWalls(Game.spawns[name]);
                militaryFunctions.borderWalls(Game.spawns[name]);
                //militaryFunctions.roadNetwork(Game.spawns[name]);
            }
        }**/

        //CREEP AMOUNT CHECKS
        if (Game.time % 10 === 0 || !currentRoom.memory.creepBuildQueue) {
            creepQueueChecks(currentRoom);
        }

        //Process Build Queue
        cleanQueue(currentRoom);
        currentRoom.processBuildQueue();


        //Room Building
        if (Game.time % 75 === 0) {
            autoBuild.roomBuilding(currentRoom.name);
        }

        //Cache Buildings
        if (Game.time % 50 === 0) {
            currentRoom.memory.structureCache = undefined;
            for (let structures of currentRoom.find(FIND_STRUCTURES)) {
                if (structures.room === currentRoom && structures.structureType !== STRUCTURE_ROAD && structures.structureType !== STRUCTURE_WALL && structures.structureType !== STRUCTURE_RAMPART) {
                    currentRoom.cacheRoomStructures(structures.id);
                }
            }
        }

        //Hauling


    }
}
module.exports.roomControl = profiler.registerFN(roomControl, 'roomControl');


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

function cleanQueue(room){
    for (let key in room.memory.creepBuildQueue) {
        if (room.memory.creepBuildQueue[key].room !== room.name) delete room.memory.creepBuildQueue[key]
    }
}

function neighborCheck(spawnRoom, remoteRoom) {
    if (spawnRoom && remoteRoom) {
        return Game.map.getRoomLinearDistance(spawnRoom, remoteRoom) <= 1;
    }
}
neighborCheck = profiler.registerFN(neighborCheck, 'neighborCheckSpawn');

function creepQueueChecks(currentRoom) {
    delete currentRoom.memory.creepBuildQueue;
    let level = getLevel(currentRoom);
    let war = Memory.war;
    let roomCreeps = currentRoom.find(FIND_MY_CREEPS);
    if (roomCreeps.length < 2) {
        let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester') && c.memory.assignedRoom === currentRoom.name)
        if (harvesters.length === 0) {
            queueCreep(currentRoom, PRIORITIES.basicHarvester, {
                role: 'basicHarvester'
            })
        }
        let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn'));
        if (level < 4 || !currentRoom.memory.storageBuilt || pawn.length === 0) {
            if (_.filter(roomCreeps, (c) => c.memory.role === 'basicHauler' && c.memory.assignedRoom === currentRoom.name).length < 3) {
                queueCreep(currentRoom, PRIORITIES.basicHauler, {
                    role: 'basicHauler'
                })
            }
        }
    } else {

        //Harvesters
        let sources = currentRoom.find(FIND_SOURCES);
        let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester') && c.memory.assignedRoom === currentRoom.name)
        if (harvesters.length === 0) {
            queueCreep(currentRoom, PRIORITIES.basicHarvester, {
                role: 'basicHarvester'
            })
        }
        if (harvesters.length < sources.length || (harvesters[0].ticksToLive < 100 && harvesters.length < sources.length + 1)) {
            queueCreep(currentRoom, PRIORITIES.basicHauler, {
                role: 'stationaryHarvester'
            })
        }

        //Haulers
        let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn' || creep.memory.role === 'mineralHauler' || creep.memory.role === 'labTech'));
        if (level < 4 || !currentRoom.memory.storageBuilt) {

            if (_.pluck(_.filter(currentRoom.memory.structureCache, 'type', 'storage'), 'id').length > 0) {
                currentRoom.memory.storageBuilt = true;
            }
            if (_.filter(roomCreeps, (c) => c.memory.role === 'basicHauler' && c.memory.assignedRoom === currentRoom.name).length < 2) {
                queueCreep(currentRoom, PRIORITIES.basicHauler, {
                    role: 'basicHauler'
                })
            }
        } else if (currentRoom.memory.storageBuilt) {
            if (_.pluck(_.filter(currentRoom.memory.structureCache, 'type', 'storage'), 'id').length < 1) {
                currentRoom.memory.storageBuilt = undefined;
            }
            if (pawn.length < 2) {
                queueCreep(currentRoom, 1, {
                    role: 'pawn'
                })
            } else if (pawn.length < 4) {
                queueCreep(currentRoom, PRIORITIES.pawn, {
                    role: 'pawn'
                })
            }
        }

        //Workers
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedRoom === currentRoom.name);
        let worker = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedRoom === currentRoom.name);
        let count;
        let construction = _.filter(Game.constructionSites, (site) => site.pos.roomName === currentRoom.name);
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
            queueCreep(currentRoom, PRIORITIES.worker, {
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
        let upgradePower = 0;
        for (let key in upgraders) {
            let upgrade = upgraders[key].getActiveBodyparts(WORK);
            upgradePower = upgradePower + upgrade;
        }
        if (upgradePower * UPGRADE_CONTROLLER_POWER < count && upgraders.length < 5) {
            queueCreep(currentRoom, PRIORITIES.upgrader, {
                role: 'upgrader'
            })
        }
        if (level >= 6 && !war) {
            let minerals = currentRoom.controller.pos.findClosestByRange(FIND_MINERALS);
            let extractor = Game.getObjectById(_.pluck(_.filter(currentRoom.memory.structureCache, 'type', 'extractor'), 'id')[0]);
            let mineralHarvester = _.filter(roomCreeps, (creep) => creep.memory.assignedMineral === minerals.id && creep.memory.role === 'mineralHarvester' && creep.memory.assignedRoom === currentRoom.name);
            if (mineralHarvester.length < 2 && upgraders.length > 0 && minerals.mineralAmount > 0 && extractor) {
                queueCreep(currentRoom, PRIORITIES.mineralHarvester, {
                    role: 'mineralHarvester',
                    assignedMineral: minerals.id
                })
            }
        }

        //Remotes
        if (level >= 3 && !war && Game.cpu.bucket > 5000) {
            for (let i = 0; i < 20; i++) {
                let pioneer = 'pioneer' + i;
                if (Game.flags[pioneer] && Game.flags[pioneer].pos.roomName !== currentRoom.name) {
                    let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === pioneer && creep.memory.role === 'pioneer');
                    if (pioneers.length < 1) {
                        queueCreep(currentRoom, PRIORITIES.pioneer, {
                            role: 'pioneer',
                            destination: pioneer
                        })
                    }
                }
            }
            if (level >= 7 && currentRoom.memory.skRooms && !war) {
                for (let key in currentRoom.memory.skRooms) {
                    let SKRanged = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.skRooms[key] && creep.memory.role === 'SKranged' && creep.memory.assignedRoom === currentRoom.name);
                    if ((SKRanged.length < 1 || (SKRanged.length === 1 && SKRanged[0].ticksToLive < 100))) {
                        queueCreep(currentRoom, PRIORITIES.SKranged, {
                            role: 'SKranged',
                            destination: currentRoom.memory.skRooms[key]
                        })
                    }
                    let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.skRooms[key] && creep.memory.role === 'SKattacker' && creep.memory.assignedRoom === currentRoom.name);
                    if (SKAttacker.length < 1) {
                        queueCreep(currentRoom, PRIORITIES.SKattacker, {
                            role: 'SKattacker',
                            destination: currentRoom.memory.skRooms[key]
                        })
                    }
                    let SKworker = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.skRooms[key] && creep.memory.role === 'SKworker' && creep.memory.assignedRoom === currentRoom.name);
                    if (SKworker.length < 4 && (SKRanged.length > 0 || SKAttacker.length > 0)) {
                        queueCreep(currentRoom, PRIORITIES.SKworker, {
                            role: 'SKworker',
                            destination: currentRoom.memory.skRooms[key]
                        })
                    }
                    let SKhauler = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.skRooms[key] && creep.memory.role === 'remoteHauler' && creep.memory.assignedRoom === currentRoom.name);
                    if (SKhauler.length < SKworker.length && (SKRanged.length > 0 || SKAttacker.length > 0)) {
                        queueCreep(currentRoom, PRIORITIES.remoteHauler, {
                            role: 'remoteHauler',
                            destination: currentRoom.memory.skRooms[key]
                        })
                    }
                }
            }
            if (currentRoom.memory.remoteRooms && !war) {
                for (let keys in currentRoom.memory.remoteRooms) {
                    let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester' && creep.memory.assignedRoom === currentRoom.name);
                    if (remoteHarvester.length < Memory.roomCache[currentRoom.memory.remoteRooms[keys]].sources.length && Game.map.getRoomLinearDistance(currentRoom.name, currentRoom.memory.remoteRooms[keys]) < 1 && !Game.rooms[currentRoom.memory.remoteRooms[keys]].memory.noRemote) {
                        queueCreep(currentRoom, PRIORITIES.remoteHarvester, {
                            role: 'remoteHarvester',
                            destination: currentRoom.memory.remoteRooms[keys]
                        })
                    }
                    let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.remoteRooms[keys] && creep.memory.role === 'remoteHauler' && creep.memory.assignedRoom === currentRoom.name);
                    if (remoteHauler.length < Memory.roomCache[currentRoom.memory.remoteRooms[keys]].sources.length && remoteHarvester.length >= 1 && Game.map.getRoomLinearDistance(currentRoom.name, currentRoom.memory.remoteRooms[keys]) < 2) {
                        queueCreep(currentRoom, PRIORITIES.remoteHauler, {
                            role: 'remoteHauler',
                            destination: currentRoom.memory.remoteRooms[keys]
                        })
                    }
                }
            }
            if (level >= 4) {
                let remotes = currentRoom.memory.remoteRooms;
                for (let key in remotes) {
                    let reserver = _.filter(Game.creeps, (creep) => creep.memory.role === 'reserver' && creep.memory.reservationTarget === remotes[key]);
                    if ((reserver.length < 1 || (reserver[0].ticksToLive < 100 && reserver.length < 2)) && (!Game.rooms[remotes[key]] || !Game.rooms[remotes[key]].memory.reservationExpires || Game.rooms[remotes[key]].memory.reservationExpires <= Game.time + 150) && !Game.rooms[currentRoom.memory.remoteRooms[keys]].memory.noRemote) {
                        queueCreep(currentRoom, PRIORITIES.reserver, {
                            role: 'reserver',
                            reservationTarget: remotes[key]
                        })
                    }
                }
            }
            for (let i = 0; i < 20; i++) {
                let claim = 'claim' + i;
                if (Game.flags[claim] && Game.flags[claim].pos.roomName !== currentRoom.roomName) {
                    let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === claim && creep.memory.role === 'claimer');
                    if (claimer.length < 1) {
                        queueCreep(currentRoom, PRIORITIES.claimer, {
                            role: 'claimer',
                            destination: claim
                        })
                    }
                }
            }
        }

        //Scouts
        if (level >= 2 && Game.cpu.bucket > 5000) {
            if (Game.time % 150 === 0) {
                let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer' && creep.memory.assignedRoom === currentRoom.name);
                if (explorers.length < 1) {
                    queueCreep(currentRoom, PRIORITIES.explorer, {
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
                    queueCreep(currentRoom, PRIORITIES.scout, {
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
                    if (neighborCheck((currentRoom.name, assistNeeded[key].name) === true || assistNeeded[key].name === currentRoom.name) && !assistNeeded[key].memory.sk) {
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[key].name && creep.memory.role === 'responder');
                        if (responder.length < assistNeeded[key].memory.numberOfHostiles) {
                            queueCreep(currentRoom, PRIORITIES.responder, {
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
                    queueCreep(currentRoom, PRIORITIES.attacker, {
                        role: 'attacker',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        siegePoint: Memory.warControl[key].siegePoint,
                        staging: 'E1S9',
                        waitForHealers: Memory.militaryNeeds[key].healer,
                        waitForAttackers: Memory.militaryNeeds[key].attacker,
                        waitForRanged: Memory.militaryNeeds[key].ranged,
                        waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                    })
                }
                let swarms = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'swarm');
                if (swarms.length < Memory.militaryNeeds[key].swarm) {
                    queueCreep(currentRoom, PRIORITIES.swarm, {
                        role: 'swarm',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        staging: 'E1S9'
                    })
                }
                let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'healer');
                if (healer.length < Memory.militaryNeeds[key].healer) {
                    queueCreep(currentRoom, PRIORITIES.healer, {
                        role: 'healer',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        siegePoint: Memory.warControl[key].siegePoint,
                        staging: 'E1S9',
                        waitForHealers: Memory.militaryNeeds[key].healer,
                        waitForAttackers: Memory.militaryNeeds[key].attacker,
                        waitForRanged: Memory.militaryNeeds[key].ranged,
                        waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                    })
                }
                if (level >= 3) {
                    let drainer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'drainer');
                    if (drainer.length < Memory.militaryNeeds[key].drainer) {
                        queueCreep(currentRoom, PRIORITIES.drainer, {
                            role: 'drainer',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: 'E1S9',
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                        })
                    }
                    let ranged = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'ranged');
                    if (ranged.length < Memory.militaryNeeds[key].ranged) {
                        queueCreep(currentRoom, PRIORITIES.ranged, {
                            role: 'ranged',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: 'E1S9',
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                        })
                    }
                    let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'deconstructor');
                    if (deconstructor.length < Memory.militaryNeeds[key].deconstructor) {
                        queueCreep(currentRoom, PRIORITIES.deconstructor, {
                            role: 'deconstructor',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: 'E1S9',
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
creepQueueChecks = profiler.registerFN(creepQueueChecks, 'creepQueueChecks');

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