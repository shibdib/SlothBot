/**
 * Created by rober on 5/16/2017.
 */

////////////////////////////////////////////Vars//////////////////////////////////////////////////

    //Number generator
const generatedNumber = Math.floor((Math.random() * 100000) + 1);

//RCL1
module.exports.rcl1 = function (spawnName) {

    ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
    if (Game.spawns[spawnName].room.find(FIND_MY_SPAWNS)) {
        if (Game.spawns[spawnName].memory.defenseMode !== true) {
            if (!Game.spawns[spawnName].spawning) {
                const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
                const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
                const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
                    filter: {structureType: STRUCTURE_CONTAINER}
                });

                //PEASANT RESPAWNS
                for (let i = 0; i < sources.length; i++) {
                    let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'peasant');
                    if (peasant.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasant') === OK) {
                        Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasant', {
                            role: 'peasant',
                            assignedSpawn: Game.spawns[spawnName].id,
                            assignedSource: sources[i].id,
                            level: 0
                        });
                        console.log('Spawning a peasant');
                        return;
                    }
                }
                let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
                if (peasantUpgrader.length < 2 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader') === OK) {
                    Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader', {
                        role: 'peasantUpgrader',
                        assignedSpawn: Game.spawns[spawnName].id,
                        level: 0
                    });
                    console.log('Spawning a peasantUpgrader');
                    return;
                }
                let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
                if (peasantBuilder.length < 2 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder') === OK) {
                    Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder', {
                        role: 'peasantBuilder',
                        assignedSpawn: Game.spawns[spawnName].id,
                        level: 0
                    });
                    console.log('Spawning a peasantBuilder');

                }

            } else if (Game.spawns[spawnName].spawning) {
                let spawningCreep = Game.creeps[Game.spawns[spawnName].spawning.name];
                Game.spawns[spawnName].room.visual.text(
                    spawningCreep.memory.role,
                    Game.spawns[spawnName].pos.x + 1,
                    Game.spawns[spawnName].pos.y,
                    {align: 'left', opacity: 0.8});
            }
        }
    }
};
module.exports.rcl2 = function (spawnName) {

    ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
    if (Game.spawns[spawnName].room.find(FIND_MY_SPAWNS)) {
        if (Game.spawns[spawnName].memory.defenseMode !== true) {
            if (!Game.spawns[spawnName].spawning) {
                const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
                let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasant');
                const creeps = _.filter(Game.creeps);
                const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
                const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
                    filter: {structureType: STRUCTURE_CONTAINER}
                });
                if (Game.spawns[spawnName].room.energyCapacityAvailable < 400 || creeps.length < 3 || peasant.length === 0) {
                    //PEASANT RESPAWNS
                    for (let i = 0; i < sources.length; i++) {
                        if (peasant.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK * 1, CARRY * 2, MOVE * 2], generatedNumber + 'peasant') === OK) {
                            Game.spawns[spawnName].createCreep([WORK * 1, CARRY * 2, MOVE * 2], generatedNumber + 'peasant', {
                                role: 'peasant',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedSource: sources[i].id,
                                level: 0
                            });
                            console.log('Spawning a peasant');
                            return;
                        }
                    }
                    let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
                    if (peasantUpgrader.length < 3 && Game.spawns[spawnName].canCreateCreep([WORK * 1, CARRY * 2, MOVE * 2], generatedNumber + 'peasantUpgrader') === OK) {
                        Game.spawns[spawnName].createCreep([WORK * 1, CARRY * 2, MOVE * 2], generatedNumber + 'peasantUpgrader', {
                            role: 'peasantUpgrader',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 0
                        });
                        console.log('Spawning a peasantUpgrader');
                        return;
                    }
                    let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
                    if (peasantBuilder.length < 2 && Game.spawns[spawnName].canCreateCreep([WORK * 1, CARRY * 2, MOVE * 2], generatedNumber + 'peasantBuilder') === OK) {
                        Game.spawns[spawnName].createCreep([WORK * 1, CARRY * 2, MOVE * 2], generatedNumber + 'peasantBuilder', {
                            role: 'peasantBuilder',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 0
                        });
                        console.log('Spawning a peasantBuilder');
                        return;
                    }
                }

                //HAULER RESPAWNS
                if (stationaryHarvester.length > 0) {
                    for (let i = 0; i < containers.length; i++) {
                        let hauler = _.filter(Game.creeps, (creep) => creep.memory.assignedContainer === containers[i].id && creep.memory.role === 'hauler');
                        if (hauler.length === 0 && Game.spawns[spawnName].canCreateCreep([CARRY * 5, MOVE * 5], generatedNumber + 'hauler') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY * 5, MOVE * 5], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 2,
                                assignedContainer: containers[i].id
                            });
                            console.log('Spawning a hauler');
                            return;
                        }
                    }
                }

                //HARVESTER RESPAWNS
                for (let i = 0; i < sources.length; i++) {
                    let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                    if (harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK * 4, CARRY * 1, MOVE * 2], generatedNumber + 'stationaryHarvester') === OK) {
                        Game.spawns[spawnName].createCreep([WORK * 4, CARRY * 1, MOVE * 2], generatedNumber + 'stationaryHarvester', {
                            role: 'stationaryHarvester',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 2,
                            assignedSource: sources[i].id
                        });
                        console.log('Spawning a stationaryHarvester');
                        return;
                    }
                }

                //PEASANT RESPAWNS
                for (let i = 0; i < sources.length; i++) {
                    let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                    let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'peasant');
                    if (peasant.length === 0 && harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE * 3, WORK * 3, CARRY * 2], generatedNumber + 'peasant') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE * 3, WORK * 3, CARRY * 2], generatedNumber + 'peasant', {
                            role: 'peasant',
                            assignedSpawn: Game.spawns[spawnName].id,
                            assignedSource: sources[i].id,
                            level: 0
                        });
                        console.log('Spawning a peasant');
                        return;
                    }
                }
                let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
                if (peasantUpgrader.length < 3 && Game.spawns[spawnName].canCreateCreep([MOVE * 3, WORK * 3, CARRY * 2], generatedNumber + 'peasantUpgrader') === OK) {
                    Game.spawns[spawnName].createCreep([MOVE * 3, WORK * 3, CARRY * 2], generatedNumber + 'peasantUpgrader', {
                        role: 'peasantUpgrader',
                        assignedSpawn: Game.spawns[spawnName].id,
                        level: 0
                    });
                    console.log('Spawning a peasantUpgrader');
                    return;
                }
                let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
                if (peasantBuilder.length < 2 && Game.spawns[spawnName].canCreateCreep([MOVE * 3, WORK * 3, CARRY * 2], generatedNumber + 'peasantBuilder') === OK) {
                    Game.spawns[spawnName].createCreep([MOVE * 3, WORK * 3, CARRY * 2], generatedNumber + 'peasantBuilder', {
                        role: 'peasantBuilder',
                        assignedSpawn: Game.spawns[spawnName].id,
                        level: 0
                    });
                    console.log('Spawning a peasantBuilder');

                }

            } else if (Game.spawns[spawnName].spawning) {
                let spawningCreep = Game.creeps[Game.spawns[spawnName].spawning.name];
                Game.spawns[spawnName].room.visual.text(
                    spawningCreep.memory.role,
                    Game.spawns[spawnName].pos.x + 1,
                    Game.spawns[spawnName].pos.y,
                    {align: 'left', opacity: 0.8});
            }
        }
    }
};

module.exports.rcl3 = function (spawnName) {

    ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
    if (Game.spawns[spawnName].room.find(FIND_MY_SPAWNS)) {
        if (Game.spawns[spawnName].memory.defenseMode !== true) {
            if (!Game.spawns[spawnName].spawning) {
                const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
                const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
                const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
                    filter: {structureType: STRUCTURE_CONTAINER}
                });
                if (creeps.length <= 5) {
                    //PEASANT RESPAWNS
                    for (let i = 0; i < sources.length; i++) {
                        let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'peasant');
                        if (peasant.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasant') === OK) {
                            Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasant', {
                                role: 'peasant',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedSource: sources[i].id,
                                level: 0
                            });
                            console.log('Spawning a peasant');
                            return;
                        }
                    }
                    let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
                    if (peasantUpgrader.length < 3 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader') === OK) {
                        Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader', {
                            role: 'peasantUpgrader',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 0
                        });
                        console.log('Spawning a peasantUpgrader');
                        return;
                    }
                    let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
                    if (peasantBuilder.length < 3 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder') === OK) {
                        Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder', {
                            role: 'peasantBuilder',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 0
                        });
                        console.log('Spawning a peasantBuilder');
                        return;
                    }
                }

                //SCOUT RESPAWNS
                for (let i = 0; i < 20; i++) {
                    let scout = 'scout' + i;
                    if (Game.flags[scout]) {
                        let scouts = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[scout].name && creep.memory.role === 'scout');
                        if (scouts.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE], generatedNumber + 'scout') === OK) {
                            Game.spawns[spawnName].createCreep([MOVE, MOVE], generatedNumber + 'scout', {
                                role: 'scout',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 0,
                                destination: Game.flags[scout].name,
                            });
                            console.log('Spawning a scout');
                            return;
                        }
                    }
                }

                //ATTACK RESPAWNS
                for (let i = 0; i < 10; i++) {
                    let attack = 'attack' + i;
                    if (Game.flags[attack]) {
                        let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                        if (attackers.length < (i * 2) && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'attacker') === OK) {
                            Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'attacker', {
                                role: 'attacker',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 3,
                                attackTarget: Game.flags[attack].name,
                                waitFor: (i * 2)
                            });
                            console.log('Spawning a attacker');
                            return;
                        }
                    }
                }

                //HAULER RESPAWNS
                if (stationaryHarvester.length > 0) {
                    for (let i = 0; i < containers.length; i++) {
                        let hauler = _.filter(Game.creeps, (creep) => creep.memory.assignedContainer === containers[i].id && creep.memory.role === 'hauler');
                        if (hauler.length === 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 3,
                                assignedContainer: containers[i].id
                            });
                            console.log('Spawning a hauler');
                            return;
                        }
                    }
                }

                //MISC HAULER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHauler' && creep.room === Game.spawns[spawnName].room);
                    const dumpTrucks = _.filter(Game.creeps, (creep) => creep.memory.role === 'dumpTruck' && creep.room === Game.spawns[spawnName].room);
                    if (dumpTrucks.length < 2 && stationaryHarvester.length >= 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'dumpTruck') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'dumpTruck', {
                            role: 'dumpTruck',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 3,
                        });
                        console.log('Spawning a dumpTruck');
                        return;
                    } else if (basicHauler.length < 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'basicHauler') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'basicHauler', {
                            role: 'basicHauler',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 3,
                        });
                        console.log('Spawning a basicHauler');
                        return;
                    }
                }

                //HARVESTER RESPAWNS
                    for (let i = 0; i < sources.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                        if (harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                            Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester', {
                                role: 'stationaryHarvester',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 3,
                                assignedSource: sources[i].id
                            });
                            console.log('Spawning a stationaryHarvester');
                            return;
                        }
                    }

                //WORKER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.room === Game.spawns[spawnName].room);
                    const wallRepairers = _.filter(Game.creeps, (creep) => creep.memory.role === 'wallRepairer' && creep.room === Game.spawns[spawnName].room);
                    const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.room === Game.spawns[spawnName].room);
                    if (worker.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'worker') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'worker', {
                            role: 'worker',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 3,
                        });
                        console.log('Spawning a worker');
                        return;
                    } else if (upgraders.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE], generatedNumber + 'upgrader') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK, WORK, MOVE, MOVE], generatedNumber + 'upgrader', {
                            role: 'upgrader',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 3,
                        });
                        console.log('Spawning a upgrader');
                        return;
                    } else if (wallRepairers.length < 1 && Game.spawns[spawnName].canCreateCreep([CARRY, WORK, WORK, MOVE, MOVE, MOVE], generatedNumber + 'wallRepairer') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, WORK, WORK, MOVE, MOVE, MOVE], generatedNumber + 'wallRepairer', {
                            role: 'wallRepairer',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 3,
                        });
                        console.log('Spawning a wallRepairer');
                        return;
                    }
                }

                //REMOTE RESPAWN
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let remote = 'remote' + i;
                        if (Game.flags[remote]) {
                            let harvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                            let longRoadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'longRoadBuilder');
                            let reserver = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'reserver');
                            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                            if (harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'remoteHarvester') === OK && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE])) {
                                Game.spawns[spawnName].createCreep([WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'remoteHarvester', {
                                    role: 'remoteHarvester',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHarvester');
                                return;
                            } else if (remoteHauler.length === 0 && harvester.length > 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler') === OK) {
                                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler', {
                                    role: 'remoteHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHauler');
                                return;
                            } else if (reserver.length === 0 && Game.spawns[spawnName].canCreateCreep([CLAIM, MOVE, MOVE], generatedNumber + 'reserver') === OK) {
                                Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'reserver', {
                                    role: 'reserver',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: remote
                                });
                                console.log('Spawning a reserver');
                                return;
                            }
                        }
                    }
                } else if (Game.spawns[spawnName].spawning) {
                    let spawningCreep = Game.creeps[Game.spawns[spawnName].spawning.name];
                    Game.spawns[spawnName].room.visual.text(
                        spawningCreep.memory.role,
                        Game.spawns[spawnName].pos.x + 1,
                        Game.spawns[spawnName].pos.y,
                        {align: 'left', opacity: 0.8});
                }
            }
        }
    }
};

module.exports.rcl4 = function (spawnName) {

    ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
    if (Game.spawns[spawnName].room.find(FIND_MY_SPAWNS)) {
        if (Game.spawns[spawnName].memory.defenseMode !== true) {
            if (!Game.spawns[spawnName].spawning) {
                const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
                const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
                const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
                    filter: {structureType: STRUCTURE_CONTAINER}
                });

                //SCOUT RESPAWNS
                for (let i = 0; i < 20; i++) {
                    let scout = 'scout' + i;
                    if (Game.flags[scout]) {
                        let scouts = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[scout].name && creep.memory.role === 'scout');
                        if (scouts.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE], generatedNumber + 'scout') === OK) {
                            Game.spawns[spawnName].createCreep([MOVE, MOVE], generatedNumber + 'scout', {
                                role: 'scout',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 0,
                                destination: Game.flags[scout].name,
                            });
                            console.log('Spawning a scout');
                            return;
                        }
                    }
                }

                //ATTACK RESPAWNS
                for (let i = 0; i < 10; i++) {
                    let attack = 'attack' + i;
                    if (Game.flags[attack]) {
                        let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                        if (attackers.length < (i * 2) && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'attacker') === OK) {
                            Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'attacker', {
                                role: 'attacker',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 4,
                                attackTarget: Game.flags[attack].name,
                                waitFor: (i * 2)
                            });
                            console.log('Spawning a attacker');
                            return;
                        }
                    }
                }

                //HAULER RESPAWNS
                if (stationaryHarvester.length > 0) {
                    for (let i = 0; i < containers.length; i++) {
                        let hauler = _.filter(Game.creeps, (creep) => creep.memory.assignedContainer === containers[i].id && creep.memory.role === 'hauler');
                        if (hauler.length === 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 0,
                                assignedContainer: containers[i].id
                            });
                            console.log('Spawning a hauler');
                            return;
                        }
                    }
                }

                //MISC HAULER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHauler' && creep.room === Game.spawns[spawnName].room);
                    const dumpTrucks = _.filter(Game.creeps, (creep) => creep.memory.role === 'dumpTruck' && creep.room === Game.spawns[spawnName].room);
                    if (dumpTrucks.length < 2 && stationaryHarvester.length >= 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'dumpTruck') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'dumpTruck', {
                            role: 'dumpTruck',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a dumpTruck');
                        return;
                    } else if (basicHauler.length < 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'basicHauler') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'basicHauler', {
                            role: 'basicHauler',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a basicHauler');
                        return;
                    }
                }

                //HARVESTER RESPAWNS
                    for (let i = 0; i < sources.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                        if (harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                            Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester', {
                                role: 'stationaryHarvester',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 0,
                                assignedSource: sources[i].id
                            });
                            console.log('Spawning a stationaryHarvester');
                            return;
                        }
                    }

                //WORKER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.room === Game.spawns[spawnName].room);
                    const wallRepairers = _.filter(Game.creeps, (creep) => creep.memory.role === 'wallRepairer' && creep.room === Game.spawns[spawnName].room);
                    const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.room === Game.spawns[spawnName].room);
                    if (worker.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK], generatedNumber + 'worker') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK], generatedNumber + 'worker', {
                            role: 'worker',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a worker');
                        return;
                    } else if (upgraders.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK], generatedNumber + 'upgrader') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK], generatedNumber + 'upgrader', {
                            role: 'upgrader',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a upgrader');
                        return;
                    } else if (wallRepairers.length < 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK], generatedNumber + 'wallRepairer') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK], generatedNumber + 'wallRepairer', {
                            role: 'wallRepairer',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a wallRepairer');
                        return;
                    }
                }

                //REMOTE RESPAWN
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let remote = 'remote' + i;
                        if (Game.flags[remote]) {
                            let harvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                            let longRoadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'longRoadBuilder');
                            let reserver = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'reserver');
                            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                            if (harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'remoteHarvester') === OK && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE])) {
                                Game.spawns[spawnName].createCreep([WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'remoteHarvester', {
                                    role: 'remoteHarvester',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHarvester');
                                return;
                            } else if (remoteHauler.length === 0 && harvester.length > 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler') === OK) {
                                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler', {
                                    role: 'remoteHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHauler');
                                return;
                            } else if (reserver.length === 0 && Game.spawns[spawnName].canCreateCreep([CLAIM, MOVE, MOVE], generatedNumber + 'reserver') === OK) {
                                Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'reserver', {
                                    role: 'reserver',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a reserver');
                                return;
                            }
                        }
                    }
                } else if (Game.spawns[spawnName].spawning) {
                    let spawningCreep = Game.creeps[Game.spawns[spawnName].spawning.name];
                    Game.spawns[spawnName].room.visual.text(
                        spawningCreep.memory.role,
                        Game.spawns[spawnName].pos.x + 1,
                        Game.spawns[spawnName].pos.y,
                        {align: 'left', opacity: 0.8});
                }
            }
        }
    }
};
