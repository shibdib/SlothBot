//Always have 1 basic peasant
if (peasants.length < 1 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasant') === OK) {
    Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasant', {role: 'peasant'});
    console.log('Spawning a peasant');
    return;
}
//ERRBODY DEAD?? Build basic builders/upgraders
if (totalCreeps.length <= 2 || Game.spawns[spawnName].room.memory.peasant === true) {
    Game.spawns[spawnName].room.memory.peasant = true;
    if (peasantBuilders.length < 2 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder') === OK) {
        Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantBuilder', {role: 'peasantBuilder'});
        console.log('Spawning a peasantBuilder');
        return;
    }
    if (peasantUpgraders.length < 1 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader') === OK) {
        Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], generatedNumber + 'peasantUpgrader', {role: 'peasantUpgrader'});
        console.log('Spawning a peasantUpgrader');
    }
}
if (totalCreeps.length > 2) {
    if (totalCreeps.length > 8) {
        //Kill peasantBuilders and upgraders
        Game.spawns[spawnName].room.memory.peasant = false;
        for (let i = 0; i < peasantBuilders.length; i++) {
            peasantBuilders[i].memory.role = 'worker';
        }
        for (let i = 0; i < peasantUpgraders.length; i++) {
            peasantUpgraders[i].memory.role = 'worker';
        }
    }

    //SENTRY RESPAWNS
    if (Game.flags.sentryBuild && stationaryHarvester.length >= sourceCount) {
        for (let i = 0; i < sentryRamparts.length; i++) {
            let sentry = _.filter(Game.creeps, (creep) => creep.memory.assignedRampart === sentryRamparts[i].id && creep.memory.role === 'sentry');
            if (sentry.length < 2 && Game.spawns[spawnName].canCreateCreep([RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE], generatedNumber + 'sentry') === OK) {
                Game.spawns[spawnName].createCreep([RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE], generatedNumber + 'sentry', {
                    role: 'sentry',
                    assignedRampart: sentryRamparts[i].id
                });
                console.log('Spawning a sentry');
                return;
            }
        }
    }

    //DEFENSE RESPAWNS
    if (Game.flags.combatBuild) {
        if (rangedDefenders.length < 3 && Game.spawns[spawnName].canCreateCreep([RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE], generatedNumber + 'rangedDefender') === OK) {
            Game.spawns[spawnName].createCreep([RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE], generatedNumber + 'rangedDefender', {role: 'rangedDefender'});
            console.log('Spawning a rangedDefender');
            return;
        } else if (defenders.length < 4 && Game.spawns[spawnName].canCreateCreep([ATTACK, ATTACK, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'defender') === OK) {
            Game.spawns[spawnName].createCreep([ATTACK, ATTACK, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'defender', {role: 'defender'});
            console.log('Spawning a defender');
            return;
        }
    }

    //HAULER RESPAWNS
    if (Game.flags.haulerBuild && stationaryHarvester.length >= sourceCount) {
        for (let i = 0; i < containers.length; i++) {
            let hauler = _.filter(Game.creeps, (creep) => creep.memory.assignedContainer === containers[i].id && creep.memory.role === 'hauler');
            if (hauler.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler') === OK) {
                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'hauler', {
                    role: 'hauler',
                    assignedContainer: containers[i].id
                });
                console.log('Spawning a hauler');
                return;
            }
        }
    }

    //MISC HAULER RESPAWNS
    if (Game.flags.haulerBuild && stationaryHarvester.length >= sourceCount) {
        if (dumpTrucks.length < stationaryBuilders.length + upgraders.length && stationaryHarvester.length >= 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'dumpTruck') === OK) {
            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'dumpTruck', {role: 'dumpTruck'});
            console.log('Spawning a dumpTruck');
            return;
        } else if (basicHauler.length < 1 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'basicHauler') === OK) {
            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'basicHauler', {role: 'basicHauler'});
            console.log('Spawning a basicHauler');
            return;
        }
    }

    //HARVESTER RESPAWNS
    if (Game.flags.harvesterBuild) {
        for (let i = 0; i < sources.length; i++) {
            let harvester = _.filter(Game.creeps, (creep) => creep.memory.assignedSource === sources[i].id && creep.memory.role === 'stationaryHarvester');
            if (harvester.length === 0 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester', {
                    role: 'stationaryHarvester',
                    assignedSource: sources[i].id
                });
                console.log('Spawning a stationaryHarvester');
                return;
            } else if (harvester.length === 0 && roomEnergyCapacity >= 600 && roomEnergyCapacity < 700 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester', {
                    role: 'stationaryHarvester',
                    assignedSource: sources[i].id
                });
                console.log('Spawning a stationaryHarvester');
                return;
            }
            if (harvester.length === 0 && roomEnergyCapacity >= 500 && roomEnergyCapacity < 600 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                Game.spawns[spawnName].createCreep([WORK, WORK, WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester', {
                    role: 'stationaryHarvester',
                    assignedSource: sources[i].id
                });
                console.log('Spawning a stationaryHarvester');
                return;
            }
            if (harvester.length === 0 && roomEnergyCapacity < 500 && Game.spawns[spawnName].canCreateCreep([WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester') === OK) {
                Game.spawns[spawnName].createCreep([WORK, WORK, CARRY, MOVE], generatedNumber + 'stationaryHarvester', {
                    role: 'stationaryHarvester',
                    assignedSource: sources[i].id
                });
                console.log('Spawning a stationaryHarvester');
                return;
            }
        }
    }

    //WORKER RESPAWNS
    if (Game.flags.workerBuild && stationaryHarvester.length >= sourceCount) {
        if (worker.length < 3 && Game.spawns[spawnName].canCreateCreep([CARRY, WORK, WORK, MOVE, MOVE, MOVE], generatedNumber + 'worker') === OK) {
            Game.spawns[spawnName].createCreep([CARRY, WORK, WORK, MOVE, MOVE, MOVE], generatedNumber + 'worker', {role: 'worker'});
            console.log('Spawning a worker');
            return;
        } else if (upgraders.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE], generatedNumber + 'upgrader') === OK) {
            Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE], generatedNumber + 'upgrader', {role: 'upgrader'});
            console.log('Spawning a upgrader');
            return;
        } else if (wallRepairers.length < 1 && Game.spawns[spawnName].canCreateCreep([CARRY, WORK, WORK, MOVE], generatedNumber + 'wallRepairer') === OK) {
            Game.spawns[spawnName].createCreep([CARRY, WORK, WORK, MOVE], generatedNumber + 'wallRepairer', {role: 'wallRepairer'});
            console.log('Spawning a wallRepairer');
            return;
        }
    }

    //BUILDER RESPAWNS
    if (Game.flags.builderBuild && stationaryHarvester.length >= sourceCount) {
        let constructionSites = Game.spawns[spawnName].room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType !== STRUCTURE_WALL || STRUCTURE_ROAD || STRUCTURE_RAMPART});
        if (roomEnergyCapacity >= 450) {
            if (constructionSites.length === 0 && stationaryBuilders.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], generatedNumber + 'stationaryBuilder') === OK) {
                Game.spawns[spawnName].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], generatedNumber + 'stationaryBuilder', {role: 'stationaryBuilder'});
                console.log('Spawning a stationaryBuilder');
                return;
            } else if (stationaryBuilders.length < Math.ceil(constructionSites.length / 3) && stationaryBuilders.length < 5 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], generatedNumber + 'stationaryBuilder') === OK) {
                Game.spawns[spawnName].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], generatedNumber + 'stationaryBuilder', {role: 'stationaryBuilder'});
                console.log('Spawning a stationaryBuilder');
                return;
            }
        }
        if (roomEnergyCapacity < 450) {
            if (constructionSites.length === 0 && stationaryBuilders.length < 2 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, WORK, MOVE], generatedNumber + 'stationaryBuilder') === OK) {
                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, WORK, MOVE], generatedNumber + 'stationaryBuilder', {role: 'stationaryBuilder'});
                console.log('Spawning a stationaryBuilder');
                return;
            } else if (stationaryBuilders.length < Math.ceil(constructionSites.length / 3) && stationaryBuilders.length < 5 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, WORK, MOVE], generatedNumber + 'stationaryBuilder') === OK) {
                Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, WORK, MOVE], generatedNumber + 'stationaryBuilder', {role: 'stationaryBuilder'});
                console.log('Spawning a stationaryBuilder');
                return;
            }
        }
    }

    //REMOTE RESPAWN
    if (Game.flags.remoteBuild && stationaryHarvester.length >= sourceCount) {
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
                        destination: remote
                    });
                    console.log('Spawning a remoteHarvester');
                    return;
                } else if (remoteHauler.length < 2 && harvester.length > 0 && Game.spawns[spawnName].canCreateCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler') === OK) {
                    Game.spawns[spawnName].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'remoteHauler', {
                        role: 'remoteHauler',
                        destination: remote
                    });
                    console.log('Spawning a remoteHauler');
                    return;
                } else if (reserver.length < 2 && Game.spawns[spawnName].canCreateCreep([CLAIM, MOVE], generatedNumber + 'reserver') === OK) {
                    Game.spawns[spawnName].createCreep([CLAIM, MOVE], generatedNumber + 'reserver', {
                        role: 'reserver',
                        destination: remote
                    });
                    console.log('Spawning a reserver');
                    return;
                } else if (longRoadBuilder.length < 1 && Game.spawns[spawnName].canCreateCreep([WORK, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'longRoadBuilder') === OK) {
                    Game.spawns[spawnName].createCreep([WORK, CARRY, CARRY, MOVE, MOVE, MOVE], generatedNumber + 'longRoadBuilder', {
                        role: 'longRoadBuilder',
                        destination: remote,
                        resupply: spawnName
                    });
                    console.log('Spawning a longRoadBuilder');
                    return;
                }
            }
        }
    }

    //SCOUT RESPAWNS
    if (Game.flags.scoutBuild && stationaryHarvester.length >= sourceCount) {
        for (let i = 0; i < 5; i++) {
            let scout = 'scout' + i;
            if (Game.flags[scout]) {
                let creep = _.filter(Game.creeps, (creep) => creep.memory.destination === scout);
                if (creep.length === 0 && Game.spawns[spawnName].canCreateCreep([MOVE, MOVE, MOVE, MOVE], generatedNumber + 'scout') === OK) {
                    Game.spawns[spawnName].createCreep([MOVE, MOVE, MOVE, MOVE], generatedNumber + 'scout', {
                        role: 'scout',
                        destination: scout
                    });
                    console.log('Spawning a scout');
                    return;
                }
            }
        }
    }
}
/**
 * Created by rober on 5/24/2017.
 */
