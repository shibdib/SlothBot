/**
 * Created by rober on 6/29/2017.
 */
//Number generator
//CREEP SPAWNING
let _ = require('lodash');
const profiler = require('screeps-profiler');

function creepRespawn() {
    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        if (spawn.spawning === null) {
            let upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedRoom === spawn.room.name);
            let worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedRoom === spawn.room.name);
            let basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedRoom === spawn.room.name);
            let pawn = _.filter(Game.creeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn') && creep.memory.assignedRoom === spawn.room.name);
            let attackRequested;
            for (let name in Game.flags) {
                if (_.startsWith(name, 'attack')) {
                    attackRequested = true;
                    break;
                }
            }

            let level = getLevel(spawn);
            if (!level) {
                continue;
            }
            let assistNeeded = _.filter(Game.rooms, (room) => room.memory.responseNeeded === true);
            let respondersNeeded;
            if (assistNeeded.length > 0) {
                for (let key in assistNeeded) {
                    respondersNeeded = neighborCheck(spawn.pos.roomName, assistNeeded[key].name) === true || spawn.room.memory.responseNeeded === true;
                }
            }
            if (harvesters(spawn, level) === true) {
                continue;
            }
            if (haulers(spawn, level) === true) {
                continue;
            }
            if (upgraders.length > 0 && (basicHauler.length === 1 || pawn.length >= 3)) {
                if (respondersNeeded === true) {
                    if (responseForce(spawn, level) === true) {
                        continue;
                    }
                    continue;
                }
                if (attackForce(spawn, level) === true) {
                    continue;
                }
                if (scouts(spawn, level) === true) {
                    continue;
                }
                if (remotes(spawn, level) === true) {
                    continue;
                }
            }
            if (workers(spawn, level) === true) {
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
}
module.exports.creepRespawn = profiler.registerFN(creepRespawn, 'creepRespawn');

function responseForce(spawn, level) {
    if (spawn.room.controller.level >= 4) {
        let assistNeeded = _.filter(Game.rooms, (room) => room.memory.responseNeeded === true);
        if (assistNeeded.length > 0) {
            for (let key in assistNeeded) {
                if (neighborCheck(spawn.pos.roomName, assistNeeded[key].name) === true) {
                    let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[key].name && creep.memory.role === 'responder');
                    if (responder.length < assistNeeded[key].memory.numberOfHostiles && spawn.createCreep(Memory.creepBodies[level].responder, 'responder' + Game.time, {
                            role: 'responder',
                            roleGroup: 'military',
                            assignedSpawn: spawn.id,
                            assignedRoom: spawn.room.name,
                            responseTarget: assistNeeded[key].name
                        }) === 'responder' + Game.time) {
                        console.log(spawn.room.name + ' Spawning an responder');
                        return true;
                    }
                }
            }
        }
    }
}
responseForce = profiler.registerFN(responseForce, 'responseForceSpawn');

function attackForce(spawn, level) {
    if (spawn.room.controller.level >= 3) {
        for (let key in Memory.militaryNeeds) {
                    let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'attacker');
                    if (attackers.length < Memory.militaryNeeds[key].attacker && spawn.createCreep(Memory.creepBodies[level].attacker, 'attacker' + Game.time, {
                            role: 'attacker',
                            roleGroup: 'military',
                            assignedSpawn: spawn.id,
                            assignedRoom: spawn.room.name,
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: 'W53N80',
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                        }) === 'attacker' + Game.time) {
                        console.log(spawn.room.name + ' Spawning an attacker');
                        return true;
                    }
                    let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'healer');
                    if (healer.length < Memory.militaryNeeds[key].healer && spawn.createCreep(Memory.creepBodies[level].healer, 'healer' + Game.time, {
                            role: 'healer',
                            roleGroup: 'military',
                            assignedSpawn: spawn.id,
                            assignedRoom: spawn.room.name,
                            attackTarget: key,
                            attackType: Memory.warControl[key].type,
                            siegePoint: Memory.warControl[key].siegePoint,
                            staging: 'W53N80',
                            waitForHealers: Memory.militaryNeeds[key].healer,
                            waitForAttackers: Memory.militaryNeeds[key].attacker,
                            waitForRanged: Memory.militaryNeeds[key].ranged,
                            waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                        }) === 'healer' + Game.time) {
                        console.log(spawn.room.name + ' Spawning an healer');
                        return true;
                    }
                    if (spawn.room.controller.level >= 5) {
                        let ranged = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'ranged');
                        if (ranged.length < Memory.militaryNeeds[key].ranged && spawn.createCreep(Memory.creepBodies[level].ranged, 'ranged' + Game.time, {
                                role: 'ranged',
                                roleGroup: 'military',
                                assignedSpawn: spawn.id,
                                assignedRoom: spawn.room.name,
                                attackTarget: key,
                                attackType: Memory.warControl[key].type,
                                siegePoint: Memory.warControl[key].siegePoint,
                                staging: 'W53N80',
                                waitForHealers: Memory.militaryNeeds[key].healer,
                                waitForAttackers: Memory.militaryNeeds[key].attacker,
                                waitForRanged: Memory.militaryNeeds[key].ranged,
                                waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                            }) === 'ranged' + Game.time) {
                            console.log(spawn.room.name + ' Spawning a ranged');
                            return true;
                        }
                        let deconstructor = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === key && creep.memory.role === 'deconstructor');
                        if (deconstructor.length < Memory.militaryNeeds[key].deconstructor && spawn.createCreep(Memory.creepBodies[level].deconstructor, 'deconstructor' + Game.time, {
                                role: 'deconstructor',
                                roleGroup: 'military',
                                assignedSpawn: spawn.id,
                                assignedRoom: spawn.room.name,
                                attackTarget: key,
                                attackType: Memory.warControl[key].type,
                                siegePoint: Memory.warControl[key].siegePoint,
                                staging: 'W53N80',
                                waitForHealers: Memory.militaryNeeds[key].healer,
                                waitForAttackers: Memory.militaryNeeds[key].attacker,
                                waitForRanged: Memory.militaryNeeds[key].ranged,
                                waitForDeconstructor: Memory.militaryNeeds[key].deconstructor
                            }) === 'deconstructor' + Game.time) {
                            console.log(spawn.room.name + ' Spawning an deconstructor');
                            return true;
                        }
                    }
            }
        }
}
attackForce = profiler.registerFN(attackForce, 'attackForceSpawn');

function harvesters(spawn, level) {
    let sources = spawn.room.find(FIND_SOURCES);
    for (let i = 0; i < sources.length; i++) {
        let stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
        if (_.filter(Game.creeps, (creep) => creep.memory.assignedRoom === spawn.room.name && creep.memory.role === 'stationaryHarvester').length === 0) {
            level = 1;
        }
        if ((stationaryHarvester.length < 1 || (stationaryHarvester.length === 1 && stationaryHarvester[0].ticksToLive < 50)) && spawn.createCreep(Memory.creepBodies[level].stationaryHarvester, 'stationaryHarvester' + Game.time, {
                role: 'stationaryHarvester',
                roleGroup: 'workers',
                assignedSpawn: spawn.id,
                assignedRoom: spawn.room.name,
                assignedSource: sources[i].id
            }) === 'stationaryHarvester' + Game.time) {
            console.log(spawn.room.name + ' Spawning a stationaryHarvester');
            return true;
        }
    }
}
harvesters = profiler.registerFN(harvesters, 'harvestersSpawn');

function scouts(spawn, level) {
    if (spawn.room.controller.level >= 2) {
        let explorers = _.filter(Game.creeps, (creep) => creep.memory.assignedRoom === spawn.pos.roomName && creep.memory.role === 'explorer');
        if (explorers.length < 1 && spawn.createCreep(Memory.creepBodies[level].explorer, 'explorer' + Game.time, {
                role: 'explorer',
                roleGroup: 'remotes',
                assignedSpawn: spawn.id,
                assignedRoom: spawn.room.name
            }) === 'explorer' + Game.time) {
            console.log(spawn.room.name + ' Spawning an explorer');
            return true;
        }
        for (let key in Memory.militaryNeeds) {
                let scouts = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'scout');
                if (scouts.length < Memory.militaryNeeds[key].scout && spawn.createCreep(Memory.creepBodies[level].scout, 'scout' + Game.time, {
                        role: 'scout',
                        roleGroup: 'scouts',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name,
                        destination: key,
                    }) === 'scout' + Game.time) {
                    console.log(spawn.room.name + ' Spawning a scout');
                    return true;
                }
            }
    }
}
scouts = profiler.registerFN(scouts, 'scoutsSpawn');

function haulers(spawn, level) {
    if (spawn.room.controller.level < 4 || !spawn.room.memory.storageBuilt) {
        if (_.pluck(_.filter(spawn.room.memory.structureCache, 'type', 'storage'), 'id').length > 0) {
            spawn.room.memory.storageBuilt = true;
        }
        let basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHauler' && creep.memory.assignedRoom === spawn.room.name);
        if (basicHauler.length < 2 && spawn.createCreep(Memory.creepBodies[level].hauler, 'basicHauler' + Game.time, {
                role: 'basicHauler',
                roleGroup: 'haulers',
                assignedSpawn: spawn.id,
                assignedRoom: spawn.room.name
            }) === 'basicHauler' + Game.time) {
            console.log(spawn.room.name + ' Spawning a basicHauler');
            return true;
        }
    } else if (spawn.room.memory.storageBuilt === true) {
        if (_.pluck(_.filter(spawn.room.memory.structureCache, 'type', 'storage'), 'id').length < 1) {
            spawn.room.memory.storageBuilt = undefined;
        }
        let pawn = _.filter(Game.creeps, (creep) => (creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'hauler' || creep.memory.role === 'pawn') && creep.memory.assignedRoom === spawn.room.name);
        if (pawn.length === 0) {
            level = 1;
        }
        if ((pawn.length < 4 || (pawn.length === 4 && pawn[0].ticksToLive < 100)) && spawn.createCreep(Memory.creepBodies[level].hauler, 'pawn' + Game.time, {
                role: 'pawn',
                roleGroup: 'haulers',
                assignedSpawn: spawn.id,
                assignedRoom: spawn.room.name
            }) === 'pawn' + Game.time) {
            console.log(spawn.room.name + ' Spawning a pawn');
            return true;
        }
        for (let i = 0; i < 20; i++) {
            let resupply = 'resupply' + i;
            if (Game.flags[resupply] && Game.flags[resupply].pos.roomName !== spawn.pos.roomName) {
                let trucks = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[resupply].name && creep.memory.role === 'resupply');
                if (trucks.length === 0 && spawn.createCreep(Memory.creepBodies[level].resupply, 'resupply' + Game.time, {
                        role: 'resupply',
                        roleGroup: 'haulers',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name,
                        destination: Game.flags[resupply].name,
                    }) === 'resupply' + Game.time) {
                    console.log(spawn.room.name + ' Spawning a resupply');
                    return true;
                }
            }
        }
    }
}
haulers = profiler.registerFN(haulers, 'haulersSpawn');

function workers(spawn, level) {
    if (spawn.room.controller.level >= 1) {
        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedRoom === spawn.room.name);
        const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedRoom === spawn.room.name);
        if (worker.length < 2 && upgraders.length > 0 && spawn.createCreep(Memory.creepBodies[level].worker, 'worker' + Game.time, {
                role: 'worker',
                roleGroup: 'workers',
                assignedSpawn: spawn.id,
                assignedRoom: spawn.room.name
            }) === 'worker' + Game.time) {
            console.log(spawn.room.name + ' Spawning a worker');
            return true;
        }
        if (spawn.room.memory.responseNeeded !== true) {
            if (upgraders.length < 2 && spawn.createCreep(Memory.creepBodies[level].upgrader, 'upgrader' + Game.time, {
                    role: 'upgrader',
                    roleGroup: 'workers',
                    assignedSpawn: spawn.id,
                    assignedRoom: spawn.room.name
                }) === 'upgrader' + Game.time) {
                console.log(spawn.room.name + ' Spawning an upgrader');
                return true;
            }
            if (spawn.room.controller.level >= 6) {
                let minerals = spawn.pos.findClosestByRange(FIND_MINERALS);
                let mineralHarvester = _.filter(Game.creeps, (creep) => creep.memory.assignedMineral === minerals.id && creep.memory.role === 'mineralHarvester');
                if (mineralHarvester.length < 2 && upgraders.length > 0 && minerals.mineralAmount > 0 && spawn.createCreep(Memory.creepBodies[level].mineralHarvester, 'mineralHarvester' + Game.time, {
                        role: 'mineralHarvester',
                        roleGroup: 'workers',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name,
                        assignedMineral: minerals.id
                    }) === 'mineralHarvester' + Game.time) {
                    console.log(spawn.room.name + ' Spawning a mineralHarvester');
                    return true;
                }
                let mineralHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'mineralHauler' && creep.memory.assignedRoom === spawn.room.name);
                if (mineralHauler.length < 1 && upgraders.length > 0 && minerals.mineralAmount > 0 && spawn.createCreep(Memory.creepBodies[level].mineralHauler, 'mineralHauler' + Game.time, {
                        role: 'mineralHauler',
                        roleGroup: 'workers',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name,
                        assignedMineral: minerals.id
                    }) === 'mineralHauler' + Game.time) {
                    console.log(spawn.room.name + ' Spawning a mineralHauler');
                    return true;
                }
                 const labTech = _.filter(Game.creeps, (creep) => creep.memory.role === 'labTech' && creep.memory.assignedRoom === spawn.room.name);
                 const labs = _.filter(Game.structures, (s) => s.room.name === spawn.room.name && s.structureType === STRUCTURE_LAB);
                 if (labTech.length < 1 && labs.length >= 3 && spawn.room.memory.reactions && spawn.createCreep(Memory.creepBodies[level].labTech, 'labTech' + Game.time, {
                        role: 'labTech',
                        roleGroup: 'workers',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name
                    }) === 'labTech' + Game.time) {
                    console.log(spawn.room.name + ' Spawning a labTech');
                    return true;
                }
            }
        }
    }
}
workers = profiler.registerFN(workers, 'workersSpawn');

function remotes(spawn, level) {
    if (spawn.room.controller.level >= 3) {
        for (let key in Memory.roomCache) {
            if (neighborCheck(spawn.room.name, key) === true && key !== spawn.room.name && Memory.roomCache[key].sources.length > 0) {
                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'remoteHarvester');
                if (remoteHarvester.length < Memory.roomCache[key].sources.length && spawn.createCreep(Memory.creepBodies[level].remoteHarvester, 'remoteHarvester' + Game.time, {
                        role: 'remoteHarvester',
                        roleGroup: 'remotes',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name,
                        destination: key
                    }) === 'remoteHarvester' + Game.time) {
                    console.log(spawn.room.name + ' Spawning a remoteHarvester');
                    return true;
                }
                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === key && creep.memory.role === 'remoteHauler');
                if (remoteHauler.length < 1 && spawn.createCreep(Memory.creepBodies[level].remoteHauler, 'remoteHauler' + Game.time, {
                        role: 'remoteHauler',
                        roleGroup: 'remotes',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name,
                        destination: key
                    }) === 'remoteHauler' + Game.time) {
                    console.log(spawn.room.name + ' Spawning an remoteHauler');
                    return true;
                }
            }
        }
        for (let i = 0; i < 20; i++) {
            let pioneer = 'pioneer' + i;
            if (Game.flags[pioneer] && Game.flags[pioneer].pos.roomName !== spawn.pos.roomName) {
                let pioneers = _.filter(Game.creeps, (creep) => creep.memory.destination === pioneer && creep.memory.role === 'pioneer');
                if (pioneers.length < 1 && spawn.createCreep(Memory.creepBodies[level].pioneer, 'pioneer' + Game.time, {
                        role: 'pioneer',
                        roleGroup: 'remotes',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name,
                        destination: pioneer
                    }) === 'pioneer' + Game.time) {
                    console.log(spawn.room.name + ' Spawning a pioneer');
                    return true;
                }
            }
        }
        for (let i = 0; i < 20; i++) {
            let claim = 'claim' + i;
            if (Game.flags[claim] && Game.flags[claim].pos.roomName !== spawn.pos.roomName) {
                let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === claim && creep.memory.role === 'claimer');
                if (claimer.length < 1 && spawn.createCreep(Memory.creepBodies[level].claimer, 'claimer' + Game.time, {
                        role: 'claimer',
                        roleGroup: 'remotes',
                        assignedSpawn: spawn.id,
                        assignedRoom: spawn.room.name,
                        destination: claim
                    }) === 'claimer' + Game.time) {
                    console.log(spawn.room.name + ' Spawning a claimer');
                    return true;
                }
            }
        }
        if (spawn.room.controller.level >= 4) {
            let reserver = _.filter(Game.creeps, (creep) => creep.memory.assignedRoom === spawn.room.name && creep.memory.role === 'reserver');
            if (reserver.length < _.round(Object.keys(Game.map.describeExits(spawn.room.name)).length, 0) / 2 && spawn.createCreep(Memory.creepBodies[level].reserver, 'reserver' + Game.time, {
                    role: 'reserver',
                    roleGroup: 'remotes',
                    assignedSpawn: spawn.id,
                    assignedRoom: spawn.room.name
                }) === 'reserver' + Game.time) {
                console.log(spawn.room.name + ' Spawning a reserver');
                return true;
            }
        }
    }
}
remotes = profiler.registerFN(remotes, 'remotesSpawn');

function neighborCheck(spawnRoom, remoteRoom) {
    let neighboringRooms = Game.map.describeExits(spawnRoom);
    for (let key in neighboringRooms) {
        if (neighboringRooms[key] && remoteRoom && (neighboringRooms[key] === remoteRoom || spawnRoom === remoteRoom)) {
            return true;
        }
    }
    return false;
}
neighborCheck = profiler.registerFN(neighborCheck, 'neighborCheckSpawn');

function getLevel(spawn) {
    let energy = spawn.room.energyCapacityAvailable;
    if (energy === RCL_1_ENERGY) {
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
neighborCheck = profiler.registerFN(neighborCheck, 'neighborCheckSpawn');


const RCL_1_ENERGY = 300;
const RCL_2_ENERGY = 550;
const RCL_3_ENERGY = 800;
const RCL_4_ENERGY = 1300;
const RCL_5_ENERGY = 1800;
const RCL_6_ENERGY = 2300;
const RCL_7_ENERGY = 5600;
const RCL_8_ENERGY = 12900;