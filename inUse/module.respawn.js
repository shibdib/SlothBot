/**
 * Created by rober on 5/16/2017.
 */

////////////////////////////////////////////Vars//////////////////////////////////////////////////

//Total creeps
var totalCreeps = _.filter(Game.creeps, (creep) => creep.memory.role !== null);

//Peasant Creeps
var peasants = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant');
var peasantBuilders = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasantBuilder');
var peasantUpgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasantUpgrader');

//Stationary Creeps
var stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester');
var stationaryBuilders = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryBuilder');

//Worker Creeps
var worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker');
var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader');
var wallRepairers = _.filter(Game.creeps, (creep) => creep.memory.role === 'wallRepairer');
var remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHarvester');

//Hauling Creeps
var haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler');
var expediters = _.filter(Game.creeps, (creep) => creep.memory.role === 'expediter');
var dumpTrucks = _.filter(Game.creeps, (creep) => creep.memory.role === 'dumpTruck');
var remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler');

//Combat Creeps
var rangedDefenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'rangedDefender');
var defenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'defender');
var scout = _.filter(Game.creeps, (creep) => creep.memory.role === 'scout');

//MISC
var sourceCount = Game.spawns['Spawn1'].room.find(FIND_SOURCES);
var containers = Game.spawns['Spawn1'].room.find(FIND_STRUCTURES, {
    filter: { structureType: STRUCTURE_CONTAINER }
});

const respawnCreeps = {
    /** @param  {Spawn} spawn  **/
    run: function () {

        ///////////////////////////////////////////////COUNT TO CONSOLE///////////////////////////////////////

        /**console.log('Creep Count');
         console.log('Harvesters: ' + stationaryHarvester.length);
         console.log('Remote Harvesters: ' + remoteHarvester.length);
         console.log('Remote Haulers: ' + remoteHauler.length);
         console.log('Builders: ' + stationaryBuilders.length);
         console.log('Workers: ' + worker.length);
         console.log('Upgraders: ' + upgraders.length);
         console.log('Haulers: ' + haulers.length);
         console.log('Expediters: ' + expediters.length);
         console.log('Dump Trucks: ' + dumpTrucks.length);**/

        ////////////////////////////////////////////Respawns//////////////////////////////////////////////////
        if (!Game.spawns['Spawn1'].spawning) {
            //ERRBODY DEAD??
            if (totalCreeps.length === 0){
                if (peasants.length < 2) {
                    Game.spawns['Spawn1'].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], undefined, {role: 'peasant'});
                    console.log('Spawning a peasant');
                }
                if (peasantBuilders.length < 1) {
                    Game.spawns['Spawn1'].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], undefined, {role: 'peasantBuilder'});
                    console.log('Spawning a peasantBuilder');
                }
                if (peasantUpgraders.length < 1) {
                    Game.spawns['Spawn1'].createCreep([WORK, CARRY, CARRY, MOVE, MOVE], undefined, {role: 'peasantUpgrader'});
                    console.log('Spawning a peasantUpgrader');
                }
            }else{


                if (totalCreeps.length < 8) {
                    //Kill peasants
                    for (let i = 0; i < peasants.length; i++) {
                        peasants[i].suicide();
                    }
                }

                //COMBAT RESPAWNS
                if (Game.flags.combatBuild) {
                    if (rangedDefenders.length < 3) {
                        Game.spawns['Spawn1'].createCreep([RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE], undefined, {role: 'rangedDefender'});
                        console.log('Spawning a rangedDefender');
                    } else if (defenders.length < 4 && Game.spawns['Spawn1'].energyCapacity >= 350) {
                        Game.spawns['Spawn1'].createCreep([ATTACK, ATTACK, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'defender'});
                        console.log('Spawning a defender');
                    }
                }

                //HAULER RESPAWNS
                if (Game.flags.haulerBuild) {
                    if (expediters.length < containers.length) {
                        Game.spawns['Spawn1'].createCreep([CARRY, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'expediter'});
                        console.log('Spawning a expediter');
                    } else if (haulers.length < containers.length) {
                        Game.spawns['Spawn1'].createCreep([CARRY, CARRY, MOVE, MOVE, MOVE], undefined, {role: 'hauler'});
                        console.log('Spawning a hauler');
                    } else if (dumpTrucks.length < stationaryBuilders.length + upgraders.length) {
                        Game.spawns['Spawn1'].createCreep([CARRY, CARRY, MOVE, MOVE, MOVE], undefined, {role: 'dumpTruck'});
                        console.log('Spawning a dumpTruck');
                    }
                }

                //HARVESTER RESPAWNS
                if (Game.flags.harvesterBuild) {
                    if (stationaryHarvester.length < Math.ceil(sourceCount.length * 3)) {
                        Game.spawns['Spawn1'].createCreep([WORK, WORK, MOVE], undefined, {role: 'stationaryHarvester'});
                        console.log('Spawning a stationaryHarvester');
                    }
                }

                //BUILDER RESPAWNS
                if (Game.flags.builderBuild) {
                    let constructionSites = sources = Game.spawns['Spawn1'].room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType !== STRUCTURE_WALL || STRUCTURE_ROAD || STRUCTURE_RAMPART});
                    if (constructionSites.length === 0 && stationaryBuilders.length < 2) {
                        Game.spawns['Spawn1'].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], undefined, {role: 'stationaryBuilder'})
                        console.log('Spawning a stationaryBuilder');
                    } else if (stationaryBuilders.length < Math.ceil(constructionSites.length / 3)) {
                        Game.spawns['Spawn1'].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], undefined, {role: 'stationaryBuilder'});
                        console.log('Spawning a stationaryBuilder');
                    }
                }

                //WORKER RESPAWNS
                if (Game.flags.workerBuild) {
                    if (worker.length < 3) {
                        Game.spawns['Spawn1'].createCreep([CARRY, WORK, WORK, MOVE], undefined, {role: 'worker'});
                        console.log('Spawning a worker');
                    } else if (upgraders.length < 1) {
                        Game.spawns['Spawn1'].createCreep([CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK, WORK, WORK, MOVE], undefined, {role: 'upgrader'});
                        console.log('Spawning a upgrader');
                    } else if (wallRepairers.length < 1) {
                        Game.spawns['Spawn1'].createCreep([CARRY, WORK, WORK, MOVE], undefined, {role: 'wallRepairer'});
                        console.log('Spawning a wallRepairer');
                    }
                }

                //REMOTE RESPAWN
                if (Game.flags.remoteBuild) {
                    for (let i = 0; i < 5; i++) {
                        let remote = 'remote' + i;
                        if (Game.flags[remote]) {
                            let creep = _.filter(Game.creeps, (creep) => creep.memory.destination === remote);
                            if (creep.length === 0) {
                                Game.spawns['Spawn1'].createCreep([CARRY, CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE], undefined, {
                                    role: 'remoteHarvester',
                                    destination: remote
                                });
                                console.log('Spawning a remoteHarvester');
                            }
                        }
                    }
                    if (remoteHauler.length < remoteHarvester.length) {
                        Game.spawns['Spawn1'].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'remoteHauler'});
                        console.log('Spawning a remoteHauler');
                    }
                }

                //SCOUT RESPAWNS
                if (Game.flags.scoutBuild) {
                    for (let i = 0; i < 5; i++) {
                        let scout = 'scout' + i;
                        if (Game.flags[scout]) {
                            let creep = _.filter(Game.creeps, (creep) => creep.memory.destination === scout);
                            if (creep.length === 0) {
                                Game.spawns['Spawn1'].createCreep([MOVE, MOVE, MOVE, MOVE], undefined, {
                                    role: 'scout',
                                    destination: scout
                                });
                                console.log('Spawning a scout');
                            }
                        }
                    }
                }
            }
        } else if (Game.spawns['Spawn1'].spawning) {
            let spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name];
            Game.spawns['Spawn1'].room.visual.text(
                '🛠️' + spawningCreep.memory.role,
                Game.spawns['Spawn1'].pos.x + 1,
                Game.spawns['Spawn1'].pos.y,
                {align: 'left', opacity: 0.8});
        }
    }
}
module.exports = respawnCreeps;
