//modules
let autoBuild = require('room.autoBuild');
let cache = require('module.cache');
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
        delete currentRoom.memory.creepBuildQueue;
        let roomCreeps = currentRoom.find(FIND_MY_CREEPS);

        //Harvesters
        let sources = currentRoom.find(FIND_SOURCES);
        for (let i = 0; i < sources.length; i++) {
            if (_.filter(roomCreeps, (c) => c.memory.role === 'stationaryHarvester' && c.memory.assignedSource === sources[i].id).length === 0) {
                queueCreep(currentRoom, 1, {
                    role: 'stationaryHarvester',
                    assignedSource: sources[i].id
                })
            }
        }

        //Haulers
        if (currentRoom.controller.level < 4 || !currentRoom.memory.storageBuilt) {
            if (_.pluck(_.filter(currentRoom.memory.structureCache, 'type', 'storage'), 'id').length > 0) {
                currentRoom.memory.storageBuilt = true;
            }
            if (_.filter(roomCreeps, (c) => c.memory.role === 'basicHauler').length < 3) {
                queueCreep(currentRoom, 2, {
                    role: 'basicHauler'
                })
            }
        } else if (currentRoom.memory.storageBuilt) {
            if (_.pluck(_.filter(currentRoom.memory.structureCache, 'type', 'storage'), 'id').length < 1) {
                currentRoom.memory.storageBuilt = undefined;
            }
            if (_.filter(roomCreeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn')).length < 4) {
                queueCreep(currentRoom, 2, {
                    role: 'pawn'
                })
            }
        } else if (currentRoom.controller.level >= 6) {
            let minerals = currentRoom.controller.pos.findClosestByRange(FIND_MINERALS);
            let mineralHauler = _.filter(roomCreeps, (creep) => creep.memory.role === 'mineralHauler');
            if (mineralHauler.length < 1 && minerals.mineralAmount > 0) {
                queueCreep(currentRoom, 5, {
                    role: 'mineralHauler',
                    assignedMineral: minerals.id
                })
            }
        }

        //Workers
        let upgraders = _.filter(roomCreeps, (creep) => creep.memory.role === 'upgrader');
        let worker = _.filter(roomCreeps, (creep) => creep.memory.role === 'worker');
        if (worker.length < 2 && upgraders.length > 0) {
            queueCreep(currentRoom, 3, {
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
            queueCreep(currentRoom, 5, {
                role: 'upgrader'
            })
        }
        if (currentRoom.controller.level >= 6) {
            let minerals = currentRoom.controller.pos.findClosestByRange(FIND_MINERALS);
            let mineralHarvester = _.filter(roomCreeps, (creep) => creep.memory.assignedMineral === minerals.id && creep.memory.role === 'mineralHarvester');
            if (mineralHarvester.length < 2 && upgraders.length > 0 && minerals.mineralAmount > 0) {
                queueCreep(currentRoom, 5, {
                    role: 'mineralHarvester',
                    assignedMineral: minerals.id
                })
            }
            const labTech = _.filter(roomCreeps, (creep) => creep.memory.role === 'labTech');
            const labs = _.filter(Game.structures, (s) => s.room.name === roomCreeps.name && s.structureType === STRUCTURE_LAB);
            if (labTech.length < 1 && labs.length >= 3) {
                queueCreep(currentRoom, 5, {
                    role: 'labTech',
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
                        queueCreep(currentRoom, 5, {
                            role: 'pioneer',
                            destination: pioneer
                        })
                    }
                }
            }
            if (currentRoom.controller.level >= 7 && currentRoom.memory.skRooms) {
                for (let key in currentRoom.memory.skRooms) {
                    let SKRanged = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.skRooms[key] && creep.memory.role === 'SKranged');
                    if ((SKRanged.length < 1 || (SKRanged.length === 1 && SKRanged[0].ticksToLive < 100))) {
                        queueCreep(currentRoom, 5, {
                            role: 'SKranged',
                            destination: currentRoom.memory.skRooms[key]
                        })
                    }
                    let SKAttacker = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.skRooms[key] && creep.memory.role === 'SKattacker');
                    if (SKAttacker.length < 1) {
                        queueCreep(currentRoom, 5, {
                            role: 'SKattacker',
                            destination: currentRoom.memory.skRooms[key]
                        })
                    }
                    let SKworker = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.skRooms[key] && creep.memory.role === 'SKworker');
                    if (SKworker.length < 4 && (SKRanged.length > 0 || SKAttacker.length > 0)) {
                        queueCreep(currentRoom, 5, {
                            role: 'SKworker',
                            destination: currentRoom.memory.skRooms[key]
                        })
                    }
                    let SKhauler = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.skRooms[key] && creep.memory.role === 'remoteHauler');
                    if (SKhauler.length < SKworker.length && (SKRanged.length > 0 || SKAttacker.length > 0)) {
                        queueCreep(currentRoom, 5, {
                            role: 'remoteHauler',
                            destination: currentRoom.memory.skRooms[key]
                        })
                    }
                }
            }
            if (currentRoom.memory.remoteRooms) {
                for (let key in currentRoom.memory.remoteRooms) {
                    let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.remoteRooms[key] && creep.memory.role === 'remoteHarvester');
                    if (remoteHarvester.length < Memory.roomCache[currentRoom.memory.remoteRooms[key]].sources.length) {
                        queueCreep(currentRoom, 5, {
                            role: 'remoteHarvester',
                            destination: currentRoom.memory.remoteRooms[key]
                        })
                    }
                    let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === currentRoom.memory.remoteRooms[key] && creep.memory.role === 'remoteHauler');
                    if (remoteHauler.length < 1) {
                        queueCreep(currentRoom, 5, {
                            role: 'remoteHauler',
                            destination: currentRoom.memory.remoteRooms[key]
                        })
                    }
                }
            }
            if (currentRoom.controller.level >= 4) {
                let reserver = _.filter(Game.creeps, (creep) => creep.memory.assignedRoom === currentRoom.name && creep.memory.role === 'reserver');
                if (reserver.length < _.round(Object.keys(Game.map.describeExits(currentRoom.name)).length, 0) / 2) {
                    queueCreep(currentRoom, 5, {
                        role: 'reserver'
                    })
                }
            }
            for (let i = 0; i < 20; i++) {
                let claim = 'claim' + i;
                if (Game.flags[claim] && Game.flags[claim].pos.roomName !== currentRoom.roomName) {
                    let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === claim && creep.memory.role === 'claimer');
                    if (claimer.length < 1) {
                        queueCreep(currentRoom, 5, {
                            role: 'claimer',
                            destination: claim
                        })
                    }
                }
            }
        }

        //Scouts
        if (currentRoom.controller.level >= 2) {
            let explorers = _.filter(Game.creeps, (creep) => creep.memory.role === 'explorer');
            if (explorers.length < 1) {
                queueCreep(currentRoom, 5, {
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
                    queueCreep(currentRoom, 5, {
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
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[key].name && creep.memory.role === 'responder');
                        if (responder.length < assistNeeded[key].memory.numberOfHostiles) {
                            queueCreep(currentRoom, 1, {
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
                    queueCreep(currentRoom, 1, {
                        role: 'attacker',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        siegePoint: Memory.warControl[key].siegePoint,
                        staging: 'W53N80',
                        waitForHealers: Memory.militaryNeeds[key].healer,
                        waitForAttackers: Memory.militaryNeeds[key].attacker,
                        waitForRanged: Memory.militaryNeeds[key].ranged,
                        waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                    })
                }
                let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'healer');
                if (healer.length < Memory.militaryNeeds[key].healer) {
                    queueCreep(currentRoom, 1, {
                        role: 'healer',
                        attackTarget: key,
                        attackType: Memory.warControl[key].type,
                        siegePoint: Memory.warControl[key].siegePoint,
                        staging: 'W53N80',
                        waitForHealers: Memory.militaryNeeds[key].healer,
                        waitForAttackers: Memory.militaryNeeds[key].attacker,
                        waitForRanged: Memory.militaryNeeds[key].ranged,
                        waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                    })
                }
                if (spawn.room.controller.level >= 3) {
                    let drainer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'drainer');
                    if (drainer.length < Memory.militaryNeeds[key].drainer) {
                        queueCreep(currentRoom, 1, {
                            role: 'drainer',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: 'W53N80',
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                        })
                    }
                }
                if (spawn.room.controller.level >= 3) {
                    let ranged = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'ranged');
                    if (ranged.length < Memory.militaryNeeds[key].ranged) {
                        queueCreep(currentRoom, 1, {
                            role: 'ranged',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: 'W53N80',
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                        })
                    }
                    let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'deconstructor');
                    if (deconstructor.length < Memory.militaryNeeds[key].deconstructor) {
                        queueCreep(currentRoom, 1, {
                            role: 'deconstructor',
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: 'W53N80',
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                        })
                    }
                }
            }
        }

        //Process Build Queue
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
                    cache.cacheRoomStructures(structures.id);
                }
            }
        }

        //Hauling


    }
}
module.exports.roomControl = profiler.registerFN(roomControl, 'roomControl');


function queueCreep(room, importance, options = {}) {
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