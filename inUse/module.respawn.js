/**
 * Created by rober on 5/16/2017.
 */

////////////////////////////////////////////Vars//////////////////////////////////////////////////

    //Number generator
const generatedNumber = Math.floor((Math.random() * 100000) + 1);
//CREEP SPAWNING
module.exports.creepRespawn = function (spawnName) {
    let level = Game.spawns[spawnName].room.controller.level;
    if (level === 1) {
        rcl1(spawnName);
    }
    if (level === 2) {
        rcl2(spawnName);
    }
    if (level === 3) {
        rcl3(spawnName);
    }
    if (level === 4) {
        rcl4(spawnName);
    }
    if (level === 5) {
        rcl5(spawnName);
    }
    if (level === 6) {
        rcl5(spawnName);
    }
    if (level === 7) {
        rcl5(spawnName);
    }
    if (level === 8) {
        rcl5(spawnName);
    }
};

//RCL1
function rcl1(spawnName) {

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
                    let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                    let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'peasant');
                    if (peasant.length === 0 && harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasant') === OK) {
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
                if (peasantBuilder.length < 3 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder') === OK) {
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
}

function rcl2(spawnName) {

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

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyCapacityAvailable < 550) {
                    rcl1(spawnName);
                    return;
                }

                //HAULER RESPAWNS
                if (stationaryHarvester.length > 0) {
                    let hauler = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'hauler');
                    if (hauler.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
                            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                level: 2
                            });
                            console.log('Spawning a hauler');
                            return;
                        }
                }

                //HARVESTER RESPAWNS
                for (let i = 0; i < sources.length; i++) {
                    let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                    let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'peasant');
                    if (((peasant.length === 0 && harvester.length === 0) || harvester.ticksToLive < 150) && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                        Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester', {
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
                    if (peasant.length === 0 && harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'peasant') === OK) {
                        Game.spawns[spawnName].createCreep([WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'peasant', {
                            role: 'peasant',
                            assignedSpawn: Game.spawns[spawnName].id,
                            assignedSource: sources[i].id,
                            level: 0
                        });
                        console.log('Spawning a peasant');
                        return;
                    }
                }
                let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
                if (peasantBuilder.length < 2 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'peasantBuilder') === OK) {
                    Game.spawns[spawnName].createCreep([WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'peasantBuilder', {
                        role: 'peasantBuilder',
                        assignedSpawn: Game.spawns[spawnName].id,
                        level: 0
                    });
                    console.log('Spawning a peasantBuilder');

                }
                let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
                if (peasantUpgrader.length < 5 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'peasantUpgrader') === OK) {
                    Game.spawns[spawnName].createCreep([WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'peasantUpgrader', {
                        role: 'peasantUpgrader',
                        assignedSpawn: Game.spawns[spawnName].id,
                        level: 0
                    });
                    console.log('Spawning a peasantUpgrader');

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

function rcl3(spawnName) {

    ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
    if (Game.spawns[spawnName].room.find(FIND_MY_SPAWNS)) {
        if (Game.spawns[spawnName].memory.defenseMode !== true) {
            if (!Game.spawns[spawnName].spawning) {
                const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
                const creeps = _.filter(Game.creeps);
                const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
                const peasant = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant' && creep.room === Game.spawns[spawnName].room);
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
                const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
                    filter: {structureType: STRUCTURE_CONTAINER}
                });

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyCapacityAvailable < 800) {
                    rcl2(spawnName);
                    return;
                }

                //SCOUT RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
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
                }

                //RAIDER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let raid = 'raid' + i;
                        if (Game.flags[raid]) {
                            let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[raid].name && creep.memory.role === 'raider');
                            if (attackers.length < i && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'raider') === OK) {
                                Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'raider', {
                                    role: 'raider',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    attackTarget: Game.flags[raid].name,
                                });
                                console.log('Spawning a raider');
                                return;
                            }
                        }
                    }
                }

                //ATTACK RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let attack = 'attack' + i;
                        if (Game.flags[attack]) {
                            let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                            if (attackers.length < (i * 2) && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker', {
                                    role: 'attacker',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    attackTarget: Game.flags[attack].name,
                                    waitForHealers: (i),
                                    waitForAttackers: (i * 2)
                                });
                                console.log('Spawning a attacker');
                                return;
                            }
                            let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'healer');
                            if (healer.length < i && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL], generatedNumber + 'healer') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL], generatedNumber + 'healer', {
                                    role: 'healer',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    attackTarget: Game.flags[attack].name,
                                    waitForHealers: (i),
                                    waitForAttackers: (i * 2)
                                });
                                console.log('Spawning a healer');
                                return;
                            }
                        }
                    }
                }

                //RESERVE RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let reserve = 'reserve' + i;
                        if (Game.flags[reserve]) {
                            let reserver = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[reserve].name && creep.memory.role === 'reserver');
                            if (reserver.length < 1 && Game.spawns[spawnName].canCreateCreep([CLAIM, MOVE, MOVE], generatedNumber + 'reserver') === OK) {
                                Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'reserver', {
                                    role: 'reserver',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: reserve
                                });
                                console.log('Spawning a reserver');
                                return;
                            }
                        }
                    }
                }

                //CLAIM RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let claim = 'claim' + i;
                        if (Game.flags[claim]) {
                            let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[claim].name && creep.memory.role === 'claimer');
                            if (claimer.length < 1 && Game.spawns[spawnName].canCreateCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer') === OK) {
                                Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer', {
                                    role: 'claimer',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: claim
                                });
                                console.log('Spawning a claimer');
                                return;
                            }
                        }
                    }
                }

                //HAULER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    const basicHaulerLarge = _.filter(Game.creeps, (creep) => creep.memory.role === 'largeHauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    if (basicHauler.length === 0 && basicHaulerLarge.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                            role: 'hauler',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 0,
                        });
                        console.log('Spawning a hauler');
                        return;
                    }
                    if (basicHaulerLarge.length === 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'largeHauler') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'largeHauler', {
                            role: 'largeHauler',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 3,
                        });
                        console.log('Spawning a largeHauler');
                        return;
                    }
                }

                //HARVESTER RESPAWNS
                for (let i = 0; i < sources.length; i++) {
                    let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                    if ((harvester.length === 0 || harvester.ticksToLive < 150) && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                        Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'stationaryHarvester', {
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
                    const limit = _.round(((((harvestingPower(spawnName) * 1500) - 2000) / 800) * 0.175) / 2);
                    const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    if (worker.length < limit && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'worker') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'worker', {
                            role: 'worker',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 3,
                        });
                        console.log('Spawning a worker');
                        return;
                    } else if (upgraders.length < limit && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'upgrader') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'upgrader', {
                            role: 'upgrader',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 3,
                        });
                        console.log('Spawning a upgrader');
                        return;
                    }
                }

                //REMOTE RESPAWN
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let remote = 'remote' + i;
                        if (Game.flags[remote]) {
                            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                            let roadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'roadBuilder');
                            if (remoteHarvester.length === 0 && remoteHauler.length > 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester') === OK) {
                                Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester', {
                                    role: 'remoteHarvester',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHarvester');
                                return;
                            } else if (remoteHauler.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler') === OK) {
                                Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler', {
                                    role: 'remoteHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHauler');
                                return;
                            }
                            /**else if (remoteHauler.length === 0 && remoteHarvester.length > 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler') === OK) {
                                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler', {
                                    role: 'remoteHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHauler');
                                return;
                            }**/
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

function rcl4(spawnName) {

    ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
    if (Game.spawns[spawnName].room.find(FIND_MY_SPAWNS)) {
        if (Game.spawns[spawnName].memory.defenseMode !== true) {
            if (!Game.spawns[spawnName].spawning) {
                const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
                const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.room === Game.spawns[spawnName].room);
                const upgrader = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.room === Game.spawns[spawnName].room);
                const creeps = _.filter(Game.creeps, (creep) => creep.room === Game.spawns[spawnName].room);
                const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
                const peasant = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant' && creep.room === Game.spawns[spawnName].room);
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
                const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
                    filter: {structureType: STRUCTURE_CONTAINER}
                });

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyCapacityAvailable < 1300) {
                    rcl3(spawnName);
                    return;
                }

                //SCOUT RESPAWNS
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
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
                }

                //RAIDER RESPAWNS
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                    for (let i = 0; i < 10; i++) {
                        let raid = 'raid' + i;
                        if (Game.flags[raid]) {
                            let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[raid].name && creep.memory.role === 'raider');
                            if (attackers.length < i && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, HEAL], generatedNumber + 'raider') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, HEAL], generatedNumber + 'raider', {
                                    role: 'raider',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    attackTarget: Game.flags[raid].name,
                                });
                                console.log('Spawning a raider');
                                return;
                            }
                        }
                    }
                }

                //ATTACK RESPAWNS
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                    for (let i = 0; i < 10; i++) {
                        let attack = 'attack' + i;
                        if (Game.flags[attack]) {
                            let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                            if (attackers.length < (i * 2) && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker', {
                                    role: 'attacker',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    attackTarget: Game.flags[attack].name,
                                    waitForHealers: (i),
                                    waitForAttackers: (i * 2)
                                });
                                console.log('Spawning a attacker');
                                return;
                            }
                            let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'healer');
                            if (healer.length < i && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL], generatedNumber + 'healer') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL], generatedNumber + 'healer', {
                                    role: 'healer',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    attackTarget: Game.flags[attack].name,
                                    waitForHealers: (i),
                                    waitForAttackers: (i * 2)
                                });
                                console.log('Spawning a healer');
                                return;
                            }
                        }
                    }
                }

                //RESERVE RESPAWNS
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                    for (let i = 0; i < 10; i++) {
                        let reserve = 'reserve' + i;
                        if (Game.flags[reserve]) {
                            let reserver = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[reserve].name && creep.memory.role === 'reserver');
                            if (reserver.length < 1 && Game.spawns[spawnName].canCreateCreep([CLAIM, CLAIM, MOVE, MOVE], generatedNumber + 'reserver') === OK) {
                                Game.spawns[spawnName].createCreep([CLAIM, CLAIM, MOVE, MOVE], generatedNumber + 'reserver', {
                                    role: 'reserver',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: reserve
                                });
                                console.log('Spawning a reserver');
                                return;
                            }
                        }
                    }
                }

                //CLAIM RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let claim = 'claim' + i;
                        if (Game.flags[claim]) {
                            let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[claim].name && creep.memory.role === 'claimer');
                            if (claimer.length < 1 && Game.spawns[spawnName].canCreateCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer') === OK) {
                                Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer', {
                                    role: 'claimer',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: claim
                                });
                                console.log('Spawning a claimer');
                                return;
                            }
                        }
                    }
                }

                //HAULER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    const basicHaulerLarge = _.filter(Game.creeps, (creep) => creep.memory.role === 'largeHauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    if (basicHauler.length === 0 && basicHaulerLarge.length === 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                            role: 'hauler',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 0,
                        });
                        console.log('Spawning a basicHauler');
                        return;
                    }
                    if (basicHaulerLarge.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'largeHauler') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'largeHauler', {
                            role: 'largeHauler',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a largeHauler');
                        return;
                    }
                }

                //HARVESTER RESPAWNS
                for (let i = 0; i < sources.length; i++) {
                    let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                    if ((harvester.length === 0 || harvester.ticksToLive < 150) && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'stationaryHarvester') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'stationaryHarvester', {
                            role: 'stationaryHarvester',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                            assignedSource: sources[i].id
                        });
                        console.log('Spawning a stationaryHarvester');
                        return;
                    }
                }

                //WORKER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const limit = _.round(((((harvestingPower(spawnName) * 1500) - 2000) / 1300) * 0.175) / 2);
                    const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    if (worker.length < limit && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'worker') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'worker', {
                            role: 'worker',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a worker');
                        return;
                    } else if (upgraders.length < limit && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'upgrader') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'upgrader', {
                            role: 'upgrader',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a upgrader');
                        return;
                    }
                }

                //REMOTE RESPAWN
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                    for (let i = 0; i < 10; i++) {
                        let remote = 'remote' + i;
                        if (Game.flags[remote]) {
                            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                            let roadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'roadBuilder');
                            if (remoteHarvester.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester') === OK) {
                                Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester', {
                                    role: 'remoteHarvester',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHarvester');
                                return;
                            } else if (remoteHauler.length === 0 && remoteHarvester.length > 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler') === OK) {
                                Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler', {
                                    role: 'remoteHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHauler');
                                return;
                            }
                            /**else if (remoteHauler.length === 0 && remoteHarvester.length > 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler') === OK) {
                                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler', {
                                    role: 'remoteHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHauler');
                                return;
                            }**/
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

function rcl5(spawnName) {

    ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
    if (Game.spawns[spawnName].room.find(FIND_MY_SPAWNS)) {
        if (Game.spawns[spawnName].memory.defenseMode !== true) {
            if (!Game.spawns[spawnName].spawning) {
                const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
                const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.room === Game.spawns[spawnName].room);
                const upgrader = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.room === Game.spawns[spawnName].room);
                const creeps = _.filter(Game.creeps, (creep) => creep.room === Game.spawns[spawnName].room);
                const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
                const peasant = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant' && creep.room === Game.spawns[spawnName].room);
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
                const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
                    filter: {structureType: STRUCTURE_CONTAINER}
                });

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyCapacityAvailable < 1800) {
                    rcl4(spawnName);
                    return;
                }

                //SCOUT RESPAWNS
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
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
                }

                //RAIDER RESPAWNS
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                    for (let i = 0; i < 10; i++) {
                        let raid = 'raid' + i;
                        if (Game.flags[raid]) {
                            let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[raid].name && creep.memory.role === 'raider');
                            if (attackers.length < i && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, HEAL], generatedNumber + 'raider') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, HEAL], generatedNumber + 'raider', {
                                    role: 'raider',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    attackTarget: Game.flags[raid].name,
                                });
                                console.log('Spawning a raider');
                                return;
                            }
                        }
                    }
                }

                //ATTACK RESPAWNS
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                    for (let i = 0; i < 10; i++) {
                        let attack = 'attack' + i;
                        if (Game.flags[attack]) {
                            let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                            if (attackers.length < (i * 2) && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker', {
                                    role: 'attacker',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    attackTarget: Game.flags[attack].name,
                                    waitForHealers: (i),
                                    waitForAttackers: (i * 2)
                                });
                                console.log('Spawning a attacker');
                                return;
                            }
                            let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'healer');
                            if (healer.length < i && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL], generatedNumber + 'healer') === OK) {
                                Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL], generatedNumber + 'healer', {
                                    role: 'healer',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    attackTarget: Game.flags[attack].name,
                                    waitForHealers: (i),
                                    waitForAttackers: (i * 2)
                                });
                                console.log('Spawning a healer');
                                return;
                            }
                        }
                    }
                }

                //RESERVE RESPAWNS
                if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                    for (let i = 0; i < 10; i++) {
                        let reserve = 'reserve' + i;
                        if (Game.flags[reserve]) {
                            let reserver = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[reserve].name && creep.memory.role === 'reserver');
                            if (reserver.length < 1 && Game.spawns[spawnName].canCreateCreep([CLAIM, CLAIM, MOVE, MOVE], generatedNumber + 'reserver') === OK) {
                                Game.spawns[spawnName].createCreep([CLAIM, CLAIM, MOVE, MOVE], generatedNumber + 'reserver', {
                                    role: 'reserver',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: reserve
                                });
                                console.log('Spawning a reserver');
                                return;
                            }
                        }
                    }
                }

                //CLAIM RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let claim = 'claim' + i;
                        if (Game.flags[claim]) {
                            let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[claim].name && creep.memory.role === 'claimer');
                            if (claimer.length < 1 && Game.spawns[spawnName].canCreateCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer') === OK) {
                                Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer', {
                                    role: 'claimer',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: claim
                                });
                                console.log('Spawning a claimer');
                                return;
                            }
                        }
                    }
                }

                //HAULER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    const basicHaulerLarge = _.filter(Game.creeps, (creep) => creep.memory.role === 'largeHauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    if (basicHauler.length === 0 && basicHaulerLarge.length === 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
                        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                            role: 'hauler',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 0,
                        });
                        console.log('Spawning a hauler');
                        return;
                    }
                    if (basicHaulerLarge.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'largeHauler') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'largeHauler', {
                            role: 'largeHauler',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a largeHauler');
                        return;
                    }
                }

                //HARVESTER RESPAWNS
                for (let i = 0; i < sources.length; i++) {
                    let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                    if ((harvester.length === 0 || harvester.ticksToLive < 150) && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'stationaryHarvester') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'stationaryHarvester', {
                            role: 'stationaryHarvester',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                            assignedSource: sources[i].id
                        });
                        console.log('Spawning a stationaryHarvester');
                        return;
                    }
                }

                //WORKER RESPAWNS
                if (stationaryHarvester.length >= sourceCount) {
                    const limit = _.round(((((harvestingPower(spawnName) * 1500) - 2000) / 1800) * 0.175) / 2);
                    const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    const spawnBuilder = _.filter(Game.creeps, (creep) => creep.memory.role === 'spawnBuilder');
                    const spawnSite = _.filter(Game.constructionSites, (site) => site.structureType === STRUCTURE_SPAWN);
                    if (worker.length < limit && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'worker') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'worker', {
                            role: 'worker',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a worker');
                        return;
                    } else if (upgraders.length < limit && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY], generatedNumber + 'upgrader') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY], generatedNumber + 'upgrader', {
                            role: 'upgrader',
                            assignedSpawn: Game.spawns[spawnName].id,
                            level: 4,
                        });
                        console.log('Spawning a upgrader');
                        return;
                    } else if (spawnSite.length > 0 && spawnBuilder.length < 2 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'spawnBuilder') === OK) {
                        Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'spawnBuilder', {
                            role: 'spawnBuilder',
                            assignedSpawn: Game.spawns[spawnName].id,
                            target: spawnSite[0].id,
                            level: 4,
                        });
                        console.log('Spawning a spawnBuilder');
                        return;
                    }
                }

                //REMOTE RESPAWN
                if (stationaryHarvester.length >= sourceCount) {
                    for (let i = 0; i < 10; i++) {
                        let remote = 'remote' + i;
                        if (Game.flags[remote]) {
                            let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                            let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                            let roadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'roadBuilder');
                            if (remoteHarvester.length === 0 && remoteHauler.length > 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester') === OK) {
                                Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester', {
                                    role: 'remoteHarvester',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHarvester');
                                return;
                            } else if (remoteHauler.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler') === OK) {
                                Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler', {
                                    role: 'remoteHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 4,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHauler');
                                return;
                            }
                            /**else if (remoteHauler.length === 0 && remoteHarvester.length > 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler') === OK) {
                                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler', {
                                    role: 'remoteHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    level: 3,
                                    destination: remote
                                });
                                console.log('Spawning a remoteHauler');
                                return;
                            }**/
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

function harvestingPower(spawnName) {
    const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
    const peasant = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant' && creep.room === Game.spawns[spawnName].room);
    let power = 0;
    for (let i = 0; i < stationaryHarvester.length; i++) {
        let harvestingPower = stationaryHarvester[i].getActiveBodyparts(WORK) * HARVEST_POWER;
        for (let c = 0; c < harvestingPower; c++) {
            power++;
        }
    }
    for (let i = 0; i < peasant.length; i++) {
        let harvestingPower = peasant[i].getActiveBodyparts(WORK) * HARVEST_POWER;
        for (let c = 0; c < harvestingPower; c++) {
            power++;
        }
    }

    return power;

};

function collapsePrevention(spawnName) {
    const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
    const creeps = _.filter(Game.creeps);
    const sourceCount = Game.spawns[spawnName].room.find(FIND_SOURCES).length;
    const peasant = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant' && creep.room === Game.spawns[spawnName].room);
    const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
    const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
        filter: {structureType: STRUCTURE_CONTAINER}
    });

    for (let i = 0; i < sources.length; i++) {
        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
        if (harvester.length === 0 && stationaryHarvester.length < 1 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
            Game.spawns[spawnName].createCreep([WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester', {
                role: 'stationaryHarvester',
                assignedSpawn: Game.spawns[spawnName].id,
                assignedSource: sources[i].id,
                level: 0
            });
            console.log('Spawning a stationaryHarvester');
            return;
        }
    }

    let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
    if (peasantUpgrader.length < 2 && peasant.length >= 1 && stationaryHarvester.length >= 1 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader') === OK) {
        Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader', {
            role: 'peasantUpgrader',
            assignedSpawn: Game.spawns[spawnName].id,
            level: 0
        });
        console.log('Spawning a peasantUpgrader');
        return;
    }

    let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
    if (peasantBuilder.length < 2 && peasant.length >= 1 && stationaryHarvester.length >= 1 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder') === OK) {
        Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder', {
            role: 'peasantBuilder',
            assignedSpawn: Game.spawns[spawnName].id,
            level: 0
        });
        console.log('Spawning a peasantBuilder');

    }

    let basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room === Game.spawns[spawnName].room);
    if (basicHauler.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
        Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
            role: 'hauler',
            assignedSpawn: Game.spawns[spawnName].id,
            level: 0,
        });
        console.log('Spawning a hauler');

    }
}