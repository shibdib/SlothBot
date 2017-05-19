/**
 * Created by rober on 5/16/2017.
 */

////////////////////////////////////////////Vars//////////////////////////////////////////////////

//Stationary Creeps
let stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester');
let stationaryBuilders = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryBuilder');

//Worker Creeps
let worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker');
let upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader');
let wallRepairers = _.filter(Game.creeps, (creep) => creep.memory.role === 'wallRepairer');
let remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHarvester');

//Hauling Creeps
let haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler');
let expediters = _.filter(Game.creeps, (creep) => creep.memory.role === 'expediter');
let dumpTrucks = _.filter(Game.creeps, (creep) => creep.memory.role === 'dumpTruck');
let remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler');

//Combat Creeps
let rangedDefenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'rangedDefender');
let defenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'defender');
let scout = _.filter(Game.creeps, (creep) => creep.memory.role === 'scout');

//MISC
let sourceCount = Game.spawns['spawn1'].room.find(FIND_SOURCES);
let containers = Game.spawns['spawn1'].room.find(FIND_STRUCTURES, {
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

        //COMBAT RESPAWNS
        if (Game.flags.combatBuild) {
            if (rangedDefenders.length < 3) {
                let newName = Game.spawns['spawn1'].createCreep([RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE], undefined, {role: 'rangedDefender'});
            } else if (defenders.length < 4 && Game.spawns['spawn1'].energyCapacity >= 350) {
                let newName = Game.spawns['spawn1'].createCreep([ATTACK, ATTACK, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'defender'});
            }
        }

        //HAULER RESPAWNS
        if (Game.flags.haulerBuild) {
            if (expediters.length < containers.length) {
                let newName = Game.spawns['spawn1'].createCreep([CARRY, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'expediter'});
            } else if (haulers.length < containers.length) {
                let newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, MOVE, MOVE, MOVE], undefined, {role: 'hauler'});
            } else if (dumpTrucks.length < stationaryBuilders.length + upgraders.length) {
                let newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, MOVE, MOVE, MOVE], undefined, {role: 'dumpTruck'});
            }
        }

        //HARVESTER RESPAWNS
        if (Game.flags.harvesterBuild) {
            if (stationaryHarvester.length < Math.ceil(sourceCount.length * 3)) {
                let newName = Game.spawns['spawn1'].createCreep([WORK, WORK, MOVE], undefined, {role: 'stationaryHarvester'});
            }
        }

        //BUILDER RESPAWNS
        if (Game.flags.builderBuild) {
            let constructionSites = sources = Game.spawns['spawn1'].room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType !== STRUCTURE_WALL || STRUCTURE_ROAD || STRUCTURE_RAMPART});
            if (constructionSites.length === 0 && stationaryBuilders.length < 2){
                let newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], undefined, {role: 'stationaryBuilder'});
            }else
            if (stationaryBuilders.length < Math.ceil(constructionSites.length / 3)) {
                let newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], undefined, {role: 'stationaryBuilder'});
            }
        }

        //WORKER RESPAWNS
        if (Game.flags.workerBuild) {
            if (worker.length < 3) {
                let newName = Game.spawns['spawn1'].createCreep([CARRY, WORK, WORK, MOVE], undefined, {role: 'worker'});
            } else if (upgraders.length < 1) {
                let newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK, WORK, WORK, MOVE], undefined, {role: 'upgrader'});
            } else if (wallRepairers.length < 1) {
                let newName = Game.spawns['spawn1'].createCreep([CARRY, WORK, WORK, MOVE], undefined, {role: 'wallRepairer'});
            }
        }

        //REMOTE RESPAWN
        if (Game.flags.remoteBuild) {
            for (let i = 0; i < 5; i++) {
                let remote = 'remote' + i;
                if (Game.flags[remote]) {
                    let creep = _.filter(Game.creeps, (creep) => creep.memory.destination === remote);
                    if (creep.length === 0) {
                        let newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, CARRY, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE], undefined, {
                            role: 'remoteHarvester',
                            destination: remote
                        });
                    }
                }
            }
            if (remoteHauler.length < remoteHarvester.length) {
                let newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'remoteHauler'});
            }
        }

        //SCOUT RESPAWNS
        if (Game.flags.scoutBuild) {
            for (let i = 0; i < 5; i++) {
                let scout = 'scout' + i;
                if (Game.flags[scout]) {
                    let creep = _.filter(Game.creeps, (creep) => creep.memory.destination === scout);
                    if (creep.length === 0) {
                        let newName = Game.spawns['spawn1'].createCreep([MOVE, MOVE, MOVE, MOVE], undefined, {
                            role: 'scout',
                            destination: scout
                        });
                    }
                }
            }
        }


        if (Game.spawns['spawn1'].spawning) {
            let spawningCreep = Game.creeps[Game.spawns['spawn1'].spawning.name];
            Game.spawns['spawn1'].room.visual.text(
                '🛠️' + spawningCreep.memory.role,
                Game.spawns['spawn1'].pos.x + 1,
                Game.spawns['spawn1'].pos.y,
                {align: 'left', opacity: 0.8});
        }

    }
};

module.exports = respawnCreeps;
