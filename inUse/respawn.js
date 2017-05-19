/**
 * Created by rober on 5/16/2017.
 */

const respawnCreeps = {
    /** @param  {Spawn} spawn  **/
    run: function () {

        ////////////////////////////////////////////Vars//////////////////////////////////////////////////

        //Stationary Creeps
        var stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester');
        var stationaryBuilders = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryBuilder');

        //Worker Creeps
        var worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker');
        var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role === 'upgrader');
        var wallRepairers = _.filter(Game.creeps, (creep) => creep.memory.role === 'wallRepairer');

        //Hauling Creeps
        var haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler');
        var Expediters = _.filter(Game.creeps, (creep) => creep.memory.role === 'expediter');
        var dumpTrucks = _.filter(Game.creeps, (creep) => creep.memory.role === 'dumpTruck');

        //Combat Creeps
        var rangedDefenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'rangedDefender');
        var Defenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'defender');
        var scout = _.filter(Game.creeps, (creep) => creep.memory.role === 'scout');

        //MISC
        var sourceCount = Game.spawns['spawn1'].room.find(FIND_SOURCES);

        ///////////////////////////////////////////////COUNT TO CONSOLE///////////////////////////////////////

        /**console.log('Creep Count');
        console.log('Harvesters: ' + stationaryHarvester.length);
        console.log('Builders: ' + stationaryBuilders.length);
        console.log('Workers: ' + worker.length);
        console.log('Upgraders: ' + upgraders.length);
        console.log('Haulers: ' + haulers.length);
        console.log('Expediters: ' + Expediters.length);
        console.log('Dump Trucks: ' + dumpTrucks.length);**/

        ////////////////////////////////////////////Respawns//////////////////////////////////////////////////

        //COMBAT RESPAWNS
        if (Game.flags.combatBuild) {
            if (rangedDefenders.length < 3) {
                var newName = Game.spawns['spawn1'].createCreep([RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE, MOVE], undefined, {role: 'rangedDefender'});
            } else if (Defenders.length < 4 && Game.spawns['spawn1'].energyCapacity >= 350) {
                var newName = Game.spawns['spawn1'].createCreep([ATTACK, ATTACK, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'defender'});
            }
        }

        //HAULER RESPAWNS
        if (Game.flags.haulerBuild) {
            var containers = Game.spawns['spawn1'].room.find(FIND_STRUCTURES, {
                filter: { structureType: STRUCTURE_CONTAINER }
            });
            if (Expediters.length < containers.length) {
                var newName = Game.spawns['spawn1'].createCreep([CARRY, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'expediter'});
            } else if (haulers.length < containers.length) {
                var newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, MOVE, MOVE, MOVE], undefined, {role: 'hauler'});
            } else if (dumpTrucks.length < stationaryBuilders.length + upgraders.length) {
                var newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, MOVE, MOVE, MOVE], undefined, {role: 'dumpTruck'});
            }
        }

        //HARVESTER RESPAWNS
        if (Game.flags.harvesterBuild) {
            if (stationaryHarvester.length < Math.ceil(sourceCount.length * 3)) {
                var newName = Game.spawns['spawn1'].createCreep([WORK, WORK, MOVE], undefined, {role: 'stationaryHarvester'});
            }
        }

        //BUILDER RESPAWNS
        if (Game.flags.builderBuild) {
            var constructionSites = sources = Game.spawns['spawn1'].room.find(FIND_CONSTRUCTION_SITES);
            if (constructionSites.length === 0 && stationaryBuilders.length < 2){
                var newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], undefined, {role: 'stationaryBuilder'});
            }else
            if (stationaryBuilders.length < Math.ceil(constructionSites.length / 3)) {
                var newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], undefined, {role: 'stationaryBuilder'});
            }
        }

        //WORKER RESPAWNS
        if (Game.flags.workerBuild) {
            if (worker.length < 3) {
                var newName = Game.spawns['spawn1'].createCreep([CARRY, WORK, WORK, MOVE], undefined, {role: 'worker'});
            } else if (upgraders.length < 1) {
                var newName = Game.spawns['spawn1'].createCreep([CARRY, CARRY, CARRY, WORK, WORK, WORK, WORK, WORK, WORK, MOVE], undefined, {role: 'upgrader'});
            } else if (wallRepairers.length < 1) {
                var newName = Game.spawns['spawn1'].createCreep([CARRY, WORK, WORK, MOVE], undefined, {role: 'wallRepairer'});
            }
        }

        //SCOUT RESPAWNS
        if (Game.flags.scoutBuild) {
            for (var i = 0; i < 5; i++) {
                var scout = 'scout' + i;
                if (Game.flags[scout]) {
                    var creep = _.filter(Game.creeps, (creep) => creep.memory.destination === scout);
                    if (creep.length === 0) {
                        var newName = Game.spawns['spawn1'].createCreep([MOVE, MOVE, MOVE, MOVE], undefined, {
                            role: 'scout',
                            destination: scout
                        });
                    }
                }
            }
        }


        if (Game.spawns['spawn1'].spawning) {
            var spawningCreep = Game.creeps[Game.spawns['spawn1'].spawning.name];
            Game.spawns['spawn1'].room.visual.text(
                '🛠️' + spawningCreep.memory.role,
                Game.spawns['spawn1'].pos.x + 1,
                Game.spawns['spawn1'].pos.y,
                {align: 'left', opacity: 0.8});
        }

    }
};

module.exports = respawnCreeps;
