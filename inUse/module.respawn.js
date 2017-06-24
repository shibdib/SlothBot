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
        return;
    }
    if (level === 2) {
        rcl2(spawnName);
        return;
    }
    if (level === 3) {
        rcl3(spawnName);
        return;
    }
    if (level === 4) {
        rcl4(spawnName);
        return;
    }
    if (level === 5) {
        rcl5(spawnName);
        return;
    }
    if (level === 6) {
        rcl6(spawnName);
        return;
    }
    if (level === 7) {
        rcl5(spawnName);
        return;
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
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);

                //PEASANT RESPAWNS
                for (let i = 0; i < sources.length; i++) {
                    let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                    let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'peasant');
                    if (peasant.length === 0 && harvester.length === 0 && Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasant', {
                            role: 'peasant',
                            assignedSpawn: Game.spawns[spawnName].id,
                            assignedRoom: Game.spawns[spawnName].room.name,
                            assignedSource: sources[i].id,
                            level: 0
                        }) === OK) {
                        console.log(Game.spawns[spawnName].room.name + ' Spawning a peasant');
                        return;
                    }
                }
                let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
                if (peasantUpgrader.length < 2 && Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader', {
                        role: 'peasantUpgrader',
                        assignedSpawn: Game.spawns[spawnName].id,
                        assignedRoom: Game.spawns[spawnName].room.name,
                        level: 0
                    }) === OK) {
                    console.log(Game.spawns[spawnName].room.name + ' Spawning a peasantUpgrader');
                    return;
                }
                let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
                if (peasantBuilder.length < 3 && Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder', {
                        role: 'peasantBuilder',
                        assignedSpawn: Game.spawns[spawnName].id,
                        assignedRoom: Game.spawns[spawnName].room.name,
                        level: 0
                    }) === OK) {
                    console.log(Game.spawns[spawnName].room.name + ' Spawning a peasantBuilder');

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
                const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyAvailable < 550) {
                    rcl1(spawnName);
                    return;
                }

                //HAULER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 300) {
                    if (stationaryHarvester.length > 0) {
                        let hauler = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'hauler');
                        if (hauler.length < 2 && Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 2
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a hauler');
                            return;
                        }
                    }
                }

                //HARVESTER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 550) {
                    for (let i = 0; i < sources.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                        let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'peasant');
                        if (((peasant.length === 0 && harvester.length === 0) || harvester.ticksToLive < 150) && Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE], generatedNumber + 'stationaryHarvester', {
                                role: 'stationaryHarvester',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 2,
                                assignedSource: sources[i].id
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a stationaryHarvester');
                            return;
                        }
                    }
                }

                //PEASANT RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 550) {
                    for (let i = 0; i < sources.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                        let peasant = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'peasant');
                        if (peasant.length === 0 && harvester.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, CARRY, CARRY], generatedNumber + 'peasant', {
                                role: 'peasant',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                assignedSource: sources[i].id,
                                level: 0
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a peasant');
                            return;
                        }
                    }
                    let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
                    if (peasantBuilder.length < 2 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, CARRY, CARRY], generatedNumber + 'peasantBuilder', {
                            role: 'peasantBuilder',
                            assignedSpawn: Game.spawns[spawnName].id,
                            assignedRoom: Game.spawns[spawnName].room.name,
                            level: 0
                        }) === OK) {
                        console.log(Game.spawns[spawnName].room.name + ' Spawning a peasantBuilder');
                        return;
                    }
                    let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
                    if (peasantUpgrader.length < 5 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, CARRY, CARRY], generatedNumber + 'peasantUpgrader', {
                            role: 'peasantUpgrader',
                            assignedSpawn: Game.spawns[spawnName].id,
                            assignedRoom: Game.spawns[spawnName].room.name,
                            level: 0
                        }) === OK) {
                        console.log(Game.spawns[spawnName].room.name + ' Spawning a peasantUpgrader');
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

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyCapacityAvailable < 800) {
                    rcl2(spawnName);
                    return;
                }

                //SCOUT RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 100) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 20; i++) {
                            let scout = 'scout' + i;
                            if (Game.flags[scout]) {
                                let scouts = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[scout].name && creep.memory.role === 'scout');
                                if (scouts.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE], generatedNumber + 'scout', {
                                        role: 'scout',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 0,
                                        destination: Game.flags[scout].name,
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a scout');
                                    return;
                                }
                            }
                        }
                    }
                }

                //Defense Force Spawn
                if (Game.spawns[spawnName].room.energyAvailable >= 800) {
                    let assistNeeded = _.filter(Game.creeps, (creep) => creep.memory.invaderDetected === true);
                    if (assistNeeded.length > 0) {
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[0].memory.invaderID && creep.memory.role === 'responder');
                        if (responder.length === 0 && remoteNeighborCheck(spawnName, "hostile" + assistNeeded[0].memory.invaderID) === true && Game.spawns[spawnName].createCreep([TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'responder', {
                                role: 'responder',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 3,
                                responseTarget: assistNeeded[0].memory.invaderID
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a responder');
                            return;
                        }
                    }
                }

                //RAIDER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 500) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let raid = 'raid' + i;
                            if (Game.flags[raid]) {
                                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[raid].name && creep.memory.role === 'raider');
                                if (attackers.length < i && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'raider', {
                                        role: 'raider',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 3,
                                        attackTarget: Game.flags[raid].name,
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a raider');
                                    return;
                                }
                            }
                        }
                    }
                }

                //ATTACK RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 800) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let attack = 'attack' + i;
                            if (Game.flags[attack]) {
                                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                                if (attackers.length < (i * 2) && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker', {
                                        role: 'attacker',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 3,
                                        attackTarget: Game.flags[attack].name,
                                        waitForHealers: (i),
                                        waitForAttackers: (i * 2)
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a attacker');
                                    return;
                                }
                                let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'healer');
                                if (healer.length < i && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL], generatedNumber + 'healer', {
                                        role: 'healer',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 3,
                                        attackTarget: Game.flags[attack].name,
                                        waitForHealers: (i),
                                        waitForAttackers: (i * 2)
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a healer');
                                    return;
                                }
                            }
                        }
                    }
                }

                //CLAIM RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 700) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let claim = 'claim' + i;
                            if (Game.flags[claim]) {
                                let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[claim].name && creep.memory.role === 'claimer');
                                if (claimer.length < 1 && Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer', {
                                        role: 'claimer',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 3,
                                        destination: claim
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a claimer');
                                    return;
                                }
                            }
                        }
                    }
                }

                //HAULER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 300) {
                    if (stationaryHarvester.length >= sourceCount) {
                        const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        if (basicHauler.length < 2 && Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 0,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a hauler');
                            return;
                        }
                    }
                }

                //HARVESTER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 800) {
                    for (let i = 0; i < sources.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                        if ((harvester.length === 0 || harvester.ticksToLive < 150) && Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'stationaryHarvester', {
                                role: 'stationaryHarvester',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 3,
                                assignedSource: sources[i].id
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a stationaryHarvester');
                            return;
                        }
                    }
                }

                //REMOTE RESPAWN
                if (Game.spawns[spawnName].room.energyAvailable >= 700) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let remote = 'remote' + i;
                            if (Game.flags[remote] && remoteNeighborCheck(spawnName, remote) === true) {
                                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                                let roadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'roadBuilder');
                                if (remoteHarvester.length === 0 && remoteHauler.length > 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester', {
                                        role: 'remoteHarvester',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        destination: remote
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a remoteHarvester');
                                    return;
                                } else if (remoteHauler.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler', {
                                        role: 'remoteHauler',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        destination: remote
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a remoteHauler');
                                    return;
                                }
                            }
                        }
                    }
                }

                //WORKER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 750) {
                    if (stationaryHarvester.length >= sourceCount) {
                        const limit = _.round(((((harvestingPower(spawnName) * 1500) - 2000) / 800) * 0.2) / 2);
                        const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        if (worker.length < limit && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, CARRY, CARRY, CARRY], generatedNumber + 'worker', {
                                role: 'worker',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 3,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a worker');

                        } else if (upgraders.length < limit && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, CARRY, CARRY, CARRY], generatedNumber + 'upgrader', {
                                role: 'upgrader',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 3,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a upgrader');

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

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyCapacityAvailable < 1300) {
                    rcl3(spawnName);
                    return;
                }

                //SCOUT RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 100) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 20; i++) {
                            let scout = 'scout' + i;
                            if (Game.flags[scout]) {
                                let scouts = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[scout].name && creep.memory.role === 'scout');
                                if (scouts.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE], generatedNumber + 'scout', {
                                        role: 'scout',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 0,
                                        destination: Game.flags[scout].name,
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a scout');
                                    return;
                                }
                            }
                        }
                    }
                }

                //Defense Force Spawn
                if (Game.spawns[spawnName].room.energyAvailable >= 920) {
                    let assistNeeded = _.filter(Game.creeps, (creep) => creep.memory.invaderDetected === true);
                    if (assistNeeded.length > 0) {
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[0].memory.invaderID && creep.memory.role === 'responder');
                        if (responder.length === 0 && remoteNeighborCheck(spawnName, "hostile" + assistNeeded[0].memory.invaderID) === true && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'responder', {
                                role: 'responder',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                                responseTarget: assistNeeded[0].memory.invaderID
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a responder');
                            return;
                        }
                    }
                }

                //RAIDER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1050) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 10; i++) {
                            let raid = 'raid' + i;
                            if (Game.flags[raid]) {
                                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[raid].name && creep.memory.role === 'raider');
                                if (attackers.length < i && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, HEAL], generatedNumber + 'raider', {
                                        role: 'raider',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[raid].name,
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a raider');
                                    return;
                                }
                            }
                        }
                    }
                }

                //ATTACK RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1050) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 10; i++) {
                            let attack = 'attack' + i;
                            if (Game.flags[attack]) {
                                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                                if (attackers.length < (i * 2) && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker', {
                                        role: 'attacker',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[attack].name,
                                        waitForHealers: (i),
                                        waitForAttackers: (i * 2)
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a attacker');
                                    return;
                                }
                                let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'healer');
                                if (healer.length < i && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL], generatedNumber + 'healer', {
                                        role: 'healer',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[attack].name,
                                        waitForHealers: (i),
                                        waitForAttackers: (i * 2)
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a healer');
                                    return;
                                }
                            }
                        }
                    }
                }

                //RESERVE RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1300) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        let reserver = _.filter(Game.creeps, (creep) => creep.memory.assignedRoom === Game.spawns[spawnName].pos.roomName && creep.memory.role === 'reserver');
                        if (reserver.length < 1 && Game.spawns[spawnName].createCreep([CLAIM, CLAIM, MOVE, MOVE], generatedNumber + 'reserver', {
                                role: 'reserver',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a reserver');
                            return;
                        }
                    }
                }

                //CLAIM RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 700) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let claim = 'claim' + i;
                            if (Game.flags[claim]) {
                                let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[claim].name && creep.memory.role === 'claimer');
                                if (claimer.length < 1 && Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer', {
                                        role: 'claimer',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 3,
                                        destination: claim
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a claimer');
                                    return;
                                }
                            }
                        }
                    }
                }

                //HAULER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 300) {
                    if (stationaryHarvester.length >= sourceCount) {
                        const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const basicHaulerLarge = _.filter(Game.creeps, (creep) => creep.memory.role === 'largeHauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        if (basicHauler.length < 2 && Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 0,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a basicHauler');
                            return;
                        }
                        if (basicHaulerLarge.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'largeHauler', {
                                role: 'largeHauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a largeHauler');
                            return;
                        }
                    }
                }

                //HARVESTER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 850) {
                    for (let i = 0; i < sources.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                        if ((harvester.length === 0 || harvester.ticksToLive < 150) && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'stationaryHarvester', {
                                role: 'stationaryHarvester',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                                assignedSource: sources[i].id
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a stationaryHarvester');
                            return;
                        }
                    }
                }

                //REMOTE RESPAWN
                if (Game.spawns[spawnName].room.energyAvailable >= 1000) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 10; i++) {
                            let remote = 'remote' + i;
                            if (Game.flags[remote] && remoteNeighborCheck(spawnName, remote) === true) {
                                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                                let roadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'roadBuilder');
                                if (remoteHarvester.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester', {
                                        role: 'remoteHarvester',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        destination: remote
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a remoteHarvester');
                                    return;
                                } else if (remoteHauler.length === 0 && remoteHarvester.length > 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler', {
                                        role: 'remoteHauler',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        destination: remote
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a remoteHauler');
                                    return;
                                }
                            }
                        }
                    }
                }

                //WORKER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1300) {
                    if (stationaryHarvester.length >= sourceCount) {
                        const limit = _.round(((((harvestingPower(spawnName) * 1500) - 2000) / 1300) * 0.2) / 2);
                        const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const spawnBuilder = _.filter(Game.creeps, (creep) => creep.memory.role === 'spawnBuilder');
                        const spawnSite = _.filter(Game.constructionSites, (site) => site.structureType === STRUCTURE_SPAWN);
                        if (spawnSite.length > 0 && spawnBuilder.length < 2 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'spawnBuilder', {
                                role: 'spawnBuilder',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                target: spawnSite[0].id,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a spawnBuilder');

                        } else if (worker.length < limit && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'worker', {
                                role: 'worker',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a worker');

                        } else if (upgraders.length < limit && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'upgrader', {
                                role: 'upgrader',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a upgrader');

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

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyCapacityAvailable < 1800) {
                    rcl4(spawnName);
                    return;
                }

                //SCOUT RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 100) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 20; i++) {
                            let scout = 'scout' + i;
                            if (Game.flags[scout]) {
                                let scouts = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[scout].name && creep.memory.role === 'scout');
                                if (scouts.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE], generatedNumber + 'scout', {
                                        role: 'scout',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 0,
                                        destination: Game.flags[scout].name,
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a scout');
                                    return;
                                }
                            }
                        }
                    }
                }

                //Defense Force Spawn
                if (Game.spawns[spawnName].room.energyAvailable >= 1380) {
                    let assistNeeded = _.filter(Game.creeps, (creep) => creep.memory.invaderDetected === true && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    if (assistNeeded.length > 0) {
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[0].memory.invaderID && creep.memory.role === 'responder');
                        if (responder.length === 0 && remoteNeighborCheck(spawnName, "hostile" + assistNeeded[0].memory.invaderID) === true && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'responder', {
                                role: 'responder',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                                responseTarget: assistNeeded[0].memory.invaderID
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a responder');
                            return;
                        }
                    }
                }

                //RAIDER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1050) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 10; i++) {
                            let raid = 'raid' + i;
                            if (Game.flags[raid]) {
                                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[raid].name && creep.memory.role === 'raider');
                                if (attackers.length < i && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, HEAL], generatedNumber + 'raider', {
                                        role: 'raider',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[raid].name,
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a raider');
                                    return;
                                }
                            }
                        }
                    }
                }

                //ATTACK RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1770) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 10; i++) {
                            let attack = 'attack' + i;
                            if (Game.flags[attack]) {
                                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                                if (attackers.length < (i * 2) && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker', {
                                        role: 'attacker',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[attack].name,
                                        waitForHealers: (i),
                                        waitForAttackers: (i * 2)
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a attacker');
                                    return;
                                }
                                let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'healer');
                                if (healer.length < i && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL], generatedNumber + 'healer', {
                                        role: 'healer',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[attack].name,
                                        waitForHealers: (i),
                                        waitForAttackers: (i * 2)
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a healer');
                                    return;
                                }
                            }
                        }
                    }
                }

                //RESERVE RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1300) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        let reserver = _.filter(Game.creeps, (creep) => creep.memory.assignedRoom === Game.spawns[spawnName].pos.roomName && creep.memory.role === 'reserver');
                        if (reserver.length < 1 && Game.spawns[spawnName].createCreep([CLAIM, CLAIM, MOVE, MOVE], generatedNumber + 'reserver', {
                                role: 'reserver',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a reserver');
                            return;
                        }
                    }
                }

                //CLAIM RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 700) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let claim = 'claim' + i;
                            if (Game.flags[claim]) {
                                let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[claim].name && creep.memory.role === 'claimer');
                                if (claimer.length < 1 && Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer', {
                                        role: 'claimer',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 3,
                                        destination: claim
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a claimer');
                                    return;
                                }
                            }
                        }
                    }
                }

                //HAULER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 300) {
                    if (stationaryHarvester.length >= sourceCount) {
                        const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const basicHaulerLarge = _.filter(Game.creeps, (creep) => creep.memory.role === 'largeHauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        if (basicHauler.length < 2 && Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 0,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a hauler');
                            return;
                        }
                        if (basicHaulerLarge.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'largeHauler', {
                                role: 'largeHauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a largeHauler');
                            return;
                        }
                    }
                }

                //HARVESTER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 850) {
                    for (let i = 0; i < sources.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                        if ((harvester.length === 0 || harvester.ticksToLive < 150) && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'stationaryHarvester', {
                                role: 'stationaryHarvester',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                                assignedSource: sources[i].id
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a stationaryHarvester');
                            return;
                        }
                    }
                }

                //REMOTE RESPAWN
                if (Game.spawns[spawnName].room.energyAvailable >= 1150) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let remote = 'remote' + i;
                            if (Game.flags[remote] && remoteNeighborCheck(spawnName, remote) === true) {
                                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                                let roadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'roadBuilder');
                                if (remoteHarvester.length === 0 && remoteHauler.length > 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester', {
                                        role: 'remoteHarvester',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        destination: remote
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a remoteHarvester');
                                    return;
                                } else if (remoteHauler.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler', {
                                        role: 'remoteHauler',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        destination: remote
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a remoteHauler');
                                    return;
                                }
                            }
                        }
                    }
                }

                //WORKER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1800) {
                    if (stationaryHarvester.length >= sourceCount) {
                        const limit = _.round(((((harvestingPower(spawnName) * 1500) - 2000) / 1800) * 0.2) / 2);
                        const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const spawnBuilder = _.filter(Game.creeps, (creep) => creep.memory.role === 'spawnBuilder');
                        const spawnSite = _.filter(Game.constructionSites, (site) => site.structureType === STRUCTURE_SPAWN);
                        if (worker.length < limit && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'worker', {
                                role: 'worker',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a worker');
                        } else if (upgraders.length < limit && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY], generatedNumber + 'upgrader', {
                                role: 'upgrader',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a upgrader');
                        } else if (spawnSite.length > 0 && spawnBuilder.length < 2 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'spawnBuilder', {
                                role: 'spawnBuilder',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                target: spawnSite[0].id,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a spawnBuilder');
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


function rcl6(spawnName) {

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
                const minerals = Game.spawns[spawnName].room.find(FIND_MINERALS);

                if ((peasant.length === 0 && stationaryHarvester.length === 0) || creeps.length < 2) {
                    collapsePrevention(spawnName);
                    return;
                }

                if (Game.spawns[spawnName].room.energyCapacityAvailable < 2300) {
                    rcl5(spawnName);
                    return;
                }

                //SCOUT RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 100) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 20; i++) {
                            let scout = 'scout' + i;
                            if (Game.flags[scout]) {
                                let scouts = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[scout].name && creep.memory.role === 'scout');
                                if (scouts.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE], generatedNumber + 'scout', {
                                        role: 'scout',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 0,
                                        destination: Game.flags[scout].name,
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a scout');
                                    return;
                                }
                            }
                        }
                    }
                }

                //Defense Force Spawn
                if (Game.spawns[spawnName].room.energyAvailable >= 1380) {
                    let assistNeeded = _.filter(Game.creeps, (creep) => creep.memory.invaderDetected === true && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                    if (assistNeeded.length > 0) {
                        let responder = _.filter(Game.creeps, (creep) => creep.memory.responseTarget === assistNeeded[0].memory.invaderID && creep.memory.role === 'responder');
                        if (responder.length === 0 && remoteNeighborCheck(spawnName, "hostile" + assistNeeded[0].memory.invaderID) === true && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'responder', {
                                role: 'responder',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                                responseTarget: assistNeeded[0].memory.invaderID
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a responder');
                            return;
                        }
                    }
                }

                //RAIDER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1050) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 10; i++) {
                            let raid = 'raid' + i;
                            if (Game.flags[raid]) {
                                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[raid].name && creep.memory.role === 'raider');
                                if (attackers.length < i && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, HEAL], generatedNumber + 'raider', {
                                        role: 'raider',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[raid].name,
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a raider');
                                    return;
                                }
                            }
                        }
                    }
                }

                //ATTACK RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 2290) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        for (let i = 0; i < 10; i++) {
                            let attack = 'attack' + i;
                            if (Game.flags[attack]) {
                                let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'attacker');
                                if (attackers.length < (i * 2) && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, HEAL], generatedNumber + 'attacker', {
                                        role: 'attacker',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[attack].name,
                                        waitForHealers: (i),
                                        waitForAttackers: (i * 2)
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a attacker');
                                    return;
                                }
                                let healer = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[attack].name && creep.memory.role === 'healer');
                                if (healer.length < i && Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL], generatedNumber + 'healer', {
                                        role: 'healer',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        attackTarget: Game.flags[attack].name,
                                        waitForHealers: (i),
                                        waitForAttackers: (i * 2)
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a healer');
                                    return;
                                }
                            }
                        }
                    }
                }

                //RESERVE RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1950) {
                    if (stationaryHarvester.length >= sourceCount && worker.length > 0 && upgrader.length > 0) {
                        let reserver = _.filter(Game.creeps, (creep) => creep.memory.assignedRoom === Game.spawns[spawnName].pos.roomName && creep.memory.role === 'reserver');
                        if (reserver.length < 1 && Game.spawns[spawnName].createCreep([CLAIM, CLAIM, CLAIM, MOVE, MOVE, MOVE], generatedNumber + 'reserver', {
                                role: 'reserver',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a reserver');
                            return;
                        }
                    }
                }

                //CLAIM RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 700) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let claim = 'claim' + i;
                            if (Game.flags[claim]) {
                                let claimer = _.filter(Game.creeps, (creep) => creep.memory.destination === Game.flags[claim].name && creep.memory.role === 'claimer');
                                if (claimer.length < 1 && Game.spawns[spawnName].createCreep([CLAIM, MOVE, MOVE], generatedNumber + 'claimer', {
                                        role: 'claimer',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 3,
                                        destination: claim
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a claimer');
                                    return;
                                }
                            }
                        }
                    }
                }

                //HAULER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 300) {
                    if (stationaryHarvester.length >= sourceCount) {
                        const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const mineralHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'mineralHauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const basicHaulerLarge = _.filter(Game.creeps, (creep) => creep.memory.role === 'largeHauler' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        if (basicHauler.length < 2 && Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                                role: 'hauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 0,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a hauler');
                            return;
                        }
                        for (let i = 0; i < minerals.length; i++) {
                            if (mineralHauler.length === 0 && Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'mineralHauler', {
                                    role: 'mineralHauler',
                                    assignedSpawn: Game.spawns[spawnName].id,
                                    assignedRoom: Game.spawns[spawnName].room.name,
                                    level: 0,
                                    assignedMineral: minerals[i].id
                                }) === OK) {
                                console.log(Game.spawns[spawnName].room.name + ' Spawning a mineralHauler');
                                return;
                            }
                        }
                        if (basicHaulerLarge.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'largeHauler', {
                                role: 'largeHauler',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a largeHauler');
                            return;
                        }
                    }
                }

                //HARVESTER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 850) {
                    for (let i = 0; i < sources.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
                        if ((harvester.length === 0 || harvester.ticksToLive < 150) && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'stationaryHarvester', {
                                role: 'stationaryHarvester',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                                assignedSource: sources[i].id
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a stationaryHarvester');
                            return;
                        }
                    }
                }

                //MINERAL HARVESTER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 1450) {
                    for (let i = 0; i < minerals.length; i++) {
                        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedMineral === minerals[i].id && creep.memory.role === 'mineralHarvester');
                        if ((harvester.length < 2 || harvester.ticksToLive < 150) && minerals[i].mineralAmount > 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'mineralHarvester', {
                                role: 'mineralHarvester',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 6,
                                assignedMineral: minerals[i].id
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a mineralHarvester');
                            return;
                        }
                    }
                }

                //REMOTE RESPAWN
                if (Game.spawns[spawnName].room.energyAvailable >= 1150) {
                    if (stationaryHarvester.length >= sourceCount) {
                        for (let i = 0; i < 10; i++) {
                            let remote = 'remote' + i;
                            if (Game.flags[remote] && remoteNeighborCheck(spawnName, remote) === true) {
                                let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHarvester');
                                let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'remoteHauler');
                                let roadBuilder = _.filter(Game.creeps, (creep) => creep.memory.destination === remote && creep.memory.role === 'roadBuilder');
                                if (remoteHarvester.length === 0 && remoteHauler.length > 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY], generatedNumber + 'remoteHarvester', {
                                        role: 'remoteHarvester',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        destination: remote
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a remoteHarvester');
                                    return;
                                } else if (remoteHauler.length === 0 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'remoteHauler', {
                                        role: 'remoteHauler',
                                        assignedSpawn: Game.spawns[spawnName].id,
                                        assignedRoom: Game.spawns[spawnName].room.name,
                                        level: 4,
                                        destination: remote
                                    }) === OK) {
                                    console.log(Game.spawns[spawnName].room.name + ' Spawning a remoteHauler');
                                    return;
                                }
                            }
                        }
                    }
                }

                //WORKER RESPAWNS
                if (Game.spawns[spawnName].room.energyAvailable >= 2300) {
                    if (stationaryHarvester.length >= sourceCount) {
                        const limit = _.round(((((harvestingPower(spawnName) * 1500) - 2000) / 2300) * 0.22) / 2);
                        const worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader' && creep.memory.assignedSpawn === Game.spawns[spawnName].id);
                        const spawnBuilder = _.filter(Game.creeps, (creep) => creep.memory.role === 'spawnBuilder');
                        const spawnSite = _.filter(Game.constructionSites, (site) => site.structureType === STRUCTURE_SPAWN);
                        if (worker.length < limit && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'worker', {
                                role: 'worker',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a worker');
                        } else if (upgraders.length < limit && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY], generatedNumber + 'upgrader', {
                                role: 'upgrader',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a upgrader');
                        } else if (spawnSite.length > 0 && spawnBuilder.length < 2 && Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY], generatedNumber + 'spawnBuilder', {
                                role: 'spawnBuilder',
                                assignedSpawn: Game.spawns[spawnName].id,
                                assignedRoom: Game.spawns[spawnName].room.name,
                                target: spawnSite[0].id,
                                level: 4,
                            }) === OK) {
                            console.log(Game.spawns[spawnName].room.name + ' Spawning a spawnBuilder');
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

}
function collapsePrevention(spawnName) {
    const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester' && creep.room === Game.spawns[spawnName].room);
    const peasant = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant' && creep.room === Game.spawns[spawnName].room);
    const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);

    for (let i = 0; i < sources.length; i++) {
        let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
        if (harvester.length === 0 && stationaryHarvester.length < 1 && Game.spawns[spawnName].createCreep([WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester', {
                role: 'stationaryHarvester',
                assignedSpawn: Game.spawns[spawnName].id,
                assignedRoom: Game.spawns[spawnName].room.name,
                assignedSource: sources[i].id,
                level: 0
            }) === OK) {
            console.log(Game.spawns[spawnName].room.name + ' Spawning a stationaryHarvester');
            return;
        }
    }

    let peasantUpgrader = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantUpgrader');
    if (peasantUpgrader.length < 2 && peasant.length >= 1 && stationaryHarvester.length >= 1 && Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader', {
            role: 'peasantUpgrader',
            assignedSpawn: Game.spawns[spawnName].id,
            assignedRoom: Game.spawns[spawnName].room.name,
            level: 0
        }) === OK) {
        console.log(Game.spawns[spawnName].room.name + ' Spawning a peasantUpgrader');
        return;
    }

    let peasantBuilder = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[spawnName].id && creep.memory.role === 'peasantBuilder');
    if (peasantBuilder.length < 2 && peasant.length >= 1 && stationaryHarvester.length >= 1 && Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder', {
            role: 'peasantBuilder',
            assignedSpawn: Game.spawns[spawnName].id,
            assignedRoom: Game.spawns[spawnName].room.name,
            level: 0
        }) === OK) {
        console.log(Game.spawns[spawnName].room.name + ' Spawning a peasantBuilder');
        return;
    }

    let basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room === Game.spawns[spawnName].room);
    if (basicHauler.length < 2 && Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
            role: 'hauler',
            assignedSpawn: Game.spawns[spawnName].id,
            assignedRoom: Game.spawns[spawnName].room.name,
            level: 0,
        }) === OK) {
        console.log(Game.spawns[spawnName].room.name + ' Spawning a hauler');
    }
}

function remoteNeighborCheck(spawnName, remote) {
    let neighboringRooms = Game.map.describeExits(Game.spawns[spawnName].pos.roomName);
    for (let i = 0; i < 10; i++) {
        if (neighboringRooms[i] === Game.flags[remote].pos.roomName) {
            return true;
        }
    }
}