//modules
let autoBuild = require('room.autoBuild');
let _ = require('lodash');
const profiler = require('screeps-profiler');

function roomControl() {

    for (let name in Game.rooms) {
        let currentRoom = Game.rooms[name];
        if (currentRoom.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN}).length === 0) continue;

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
        if (Game.time % 10 === 0) {
            delete currentRoom.memory.creepBuildQueue;
            let roomCreeps = currentRoom.find(FIND_MY_CREEPS)
            if (roomCreeps.length < 2) {
                let harvesters = _.filter(roomCreeps, (c) => (c.memory.role === 'stationaryHarvester' || c.memory.role === 'basicHarvester') && c.memory.assignedRoom === currentRoom.name)
                if (harvesters.length === 0) {
                    queueCreep(currentRoom, PRIORITIES.basicHarvester, {
                        role: 'basicHarvester'
                    })
                }
                let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn'));
                if (currentRoom.controller.level < 4 || !currentRoom.memory.storageBuilt || pawn.length === 0) {
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
                if (harvesters.length < sources.length || (harvesters[0].ticksToLive < 100 && harvesters.length <= sources.length + 1)) {
                    queueCreep(currentRoom, PRIORITIES.basicHauler, {
                        role: 'stationaryHarvester'
                    })
                }

                //Haulers
                let pawn = _.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn'));
                if (currentRoom.controller.level < 4 || !currentRoom.memory.storageBuilt || pawn.length === 0) {

                    if (_.pluck(_.filter(currentRoom.memory.structureCache, 'type', 'storage'), 'id').length > 0) {
                        currentRoom.memory.storageBuilt = true;
                    }
                    if (_.filter(roomCreeps, (c) => c.memory.role === 'basicHauler' && c.memory.assignedRoom === currentRoom.name).length < 3) {
                        queueCreep(currentRoom, PRIORITIES.basicHauler, {
                            role: 'basicHauler'
                        })
                    }
                } else if (currentRoom.memory.storageBuilt) {
                    if (_.pluck(_.filter(currentRoom.memory.structureCache, 'type', 'storage'), 'id').length < 1) {
                        currentRoom.memory.storageBuilt = undefined;
                    }
                    if (pawn.length < 5) {
                        queueCreep(currentRoom, PRIORITIES.pawn, {
                            role: 'pawn'
                        })
                    }
                }

                //Workers
                let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedRoom === currentRoom.name);
                let worker = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedRoom === currentRoom.name);
                if (worker.length < 2 && upgraders.length > 0) {
                    queueCreep(currentRoom, PRIORITIES.worker, {
                        role: 'worker'
                    })
                }
                let count;
                if (currentRoom.controller.level >= 6) {
                    count = 2;
                } else {
                    count = 4;
                }
                if (upgraders.length < count) {
                    queueCreep(currentRoom, PRIORITIES.upgrader, {
                        role: 'upgrader'
                    })
                }
                if (currentRoom.controller.level >= 6) {
                    let minerals = currentRoom.controller.pos.findClosestByRange(FIND_MINERALS);
                    let mineralHarvester = _.filter(roomCreeps, (creep) => creep.memory.assignedMineral === minerals.id && creep.memory.role === 'mineralHarvester' && creep.memory.assignedRoom === currentRoom.name);
                    if (mineralHarvester.length < 2 && upgraders.length > 0 && minerals.mineralAmount > 0) {
                        queueCreep(currentRoom, PRIORITIES.mineralHarvester, {
                            role: 'mineralHarvester',
                            assignedMineral: minerals.id
                        })
                    }
                }

                //Remotes
                if (currentRoom.controller.level >= 3) {
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
                    if (currentRoom.controller.level >= 7 && currentRoom.memory.skRooms) {
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
                    if (currentRoom.memory.remoteRooms) {
                        for (let keys in currentRoom.memory.remoteRooms) {
                            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.remoteRooms[keys] && creep.memory.role === 'remoteHarvester' && creep.memory.assignedRoom === currentRoom.name);
                            if (remoteHarvester.length < Memory.roomCache[currentRoom.memory.remoteRooms[keys]].sources.length) {
                                queueCreep(currentRoom, PRIORITIES.remoteHarvester, {
                                    role: 'remoteHarvester',
                                    destination: currentRoom.memory.remoteRooms[keys]
                                })
                            }
                            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.remoteRooms[keys] && creep.memory.role === 'remoteHauler' && creep.memory.assignedRoom === currentRoom.name);
                            if (remoteHauler.length < 1) {
                                queueCreep(currentRoom, PRIORITIES.remoteHauler, {
                                    role: 'remoteHauler',
                                    destination: currentRoom.memory.remoteRooms[keys]
                                })
                            }
                        }
                    }
                    if (currentRoom.controller.level >= 4) {
                        let reserver = _.filter(Game.creeps, (creep) => creep.memory.assignedRoom === currentRoom.name && creep.memory.role === 'reserver' && creep.memory.assignedRoom === currentRoom.name);
                        if (reserver.length < _.round(Object.keys(Game.map.describeExits(currentRoom.name)).length, 0) / 2) {
                            queueCreep(currentRoom, PRIORITIES.reserver, {
                                role: 'reserver'
                            })
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
                if (currentRoom.controller.level >= 2) {
                    let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer' && creep.memory.assignedRoom === currentRoom.name);
                    if (explorers.length < 1) {
                        queueCreep(currentRoom, PRIORITIES.explorer, {
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
                            queueCreep(currentRoom, PRIORITIES.scout, {
                                role: 'scout',
                                destination: key
                            })
                        }
                    }
                }

                //Responder
                if (currentRoom.controller.level >= 4) {
                    let assistNeeded = _.filter(Game.rooms, (room) => room.memory.responseNeeded === true);
                    if (assistNeeded.length > 0) {
                        for (let key in assistNeeded) {
                            if (neighborCheck(currentRoom.name, assistNeeded[key].name) === true) {
                                let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[key].name && creep.memory.role === 'responder' && creep.memory.assignedRoom === currentRoom.name);
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
                if (currentRoom.controller.level >= 3) {
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
                                staging: 'W53N83',
                                waitForHealers: Memory.militaryNeeds[key].healer,
                                waitForAttackers: Memory.militaryNeeds[key].attacker,
                                waitForRanged: Memory.militaryNeeds[key].ranged,
                                waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                            })
                        }
                        let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'healer');
                        if (healer.length < Memory.militaryNeeds[key].healer) {
                            queueCreep(currentRoom, PRIORITIES.healer, {
                                role: 'healer',
                                attackTarget: key,
                                attackType: Memory.warControl[key].type,
                                siegePoint: Memory.warControl[key].siegePoint,
                                staging: 'W53N83',
                                waitForHealers: Memory.militaryNeeds[key].healer,
                                waitForAttackers: Memory.militaryNeeds[key].attacker,
                                waitForRanged: Memory.militaryNeeds[key].ranged,
                                waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                            })
                        }
                        if (currentRoom.controller.level >= 3) {
                            let drainer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'drainer');
                            if (drainer.length < Memory.militaryNeeds[key].drainer) {
                                queueCreep(currentRoom, PRIORITIES.drainer, {
                                    role: 'drainer',
                                    attackTarget: key,
                                    attackType: Memory.warControl[key].type,
                                    siegePoint: Memory.warControl[key].siegePoint,
                                    staging: 'W53N83',
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
                                    staging: 'W53N83',
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
                                    staging: 'W53N83',
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
        waitForDeconstructor: undefined
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
            waitForDeconstructor: options.waitForDeconstructor
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
    if (!Game.rooms[spawnRoom].memory.neighboringRooms) {
        Game.rooms[spawnRoom].memory.neighboringRooms = Game.map.describeExits(spawnRoom);
        for (let key in Game.rooms[spawnRoom].memory.neighboringRooms) {
            if (Game.rooms[spawnRoom].memory.neighboringRooms[key] && remoteRoom && (Game.rooms[spawnRoom].memory.neighboringRooms[key] === remoteRoom || spawnRoom === remoteRoom)) {
                return true;
            }
        }
        return false;
    } else {
        for (let key in Game.rooms[spawnRoom].memory.neighboringRooms) {
            if (Game.rooms[spawnRoom].memory.neighboringRooms[key] && remoteRoom && (Game.rooms[spawnRoom].memory.neighboringRooms[key] === remoteRoom || spawnRoom === remoteRoom)) {
                return true;
            }
        }
        return false;
    }
}
neighborCheck = profiler.registerFN(neighborCheck, 'neighborCheckSpawn');