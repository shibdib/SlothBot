/**
 * Created by rober on 5/16/2017.
 */

const balanceCreeps = {
    /** @param  {Spawn} spawn  **/
    run: function () {

        //VARS
        var sources = Game.spawns['Spawn1'].room.find(FIND_SOURCES);
        var containers = Game.spawns['Spawn1'].room.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_CONTAINER }
        });

        //Split up harvesters
        var stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester');
        var perSource = stationaryHarvester.length / sources.length;
        for (var i = 0; i < stationaryHarvester.length; i++){
            if (i < perSource){
                stationaryHarvester[i].memory.assignedSource = sources[0].id;
            }else{
                stationaryHarvester[i].memory.assignedSource = sources[1].id;
            }
        }

        //Split up Expediter 1-1
        var expediter = _.filter(Game.creeps, (creep) => creep.memory.role === 'expediter');
        for (var i = 0; i < containers.length && i < expediter.length; i++){
            expediter[i].memory.assignedContainer = containers[i].id;
        }

        //Split up Haulers 1-1
        var hauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler');
        for (var i = 0; i < containers.length && i < hauler.length; i++){
            hauler[i].memory.assignedContainer = containers[i].id;
        }

        //Split up Remote Haulers 1-1
        var remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler');
        var remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHarvester');
        for (var i = 0; i < remoteHarvester.length && i < remoteHauler.length; i++){
            remoteHauler[i].memory.assignedHarvester = remoteHarvester[i].id;
        }
        return null;

        //Source Flags
        for (i = 0; i < Game.flags.mineHere.length; i++) {
            var stationaryBuilders = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryBuilder');

            //Worker Creeps
            var worker = _.filter(Game.creeps, (creep) => creep.memory.role === 'worker');

            //Hauling Creeps
            var haulers = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler');
            var Expediters = _.filter(Game.creeps, (creep) => creep.memory.role === 'expediter');
            var dumpTrucks = _.filter(Game.creeps, (creep) => creep.memory.role === 'dumpTruck');

            //Combat Creeps
            var rangedDefenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'rangedDefender');
            var Defenders = _.filter(Game.creeps, (creep) => creep.memory.role === 'defender');
            var scout = _.filter(Game.creeps, (creep) => creep.memory.role === 'scout');

            //HAULER RESPAWNS
            if (Game.flags.haulerBuild) {
                if (haulers.length < 2) {
                    var newName = Game.spawns['Spawn1'].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], undefined, {role: 'hauler'});
                } else if (dumpTrucks.length < 4) {
                    var newName = Game.spawns['Spawn1'].createCreep([CARRY, CARRY, CARRY, MOVE, MOVE, MOVE], undefined, {role: 'dumpTruck'});
                } else if (Expediters.length < 2) {
                    var newName = Game.spawns['Spawn1'].createCreep([CARRY, MOVE, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'expediter'});
                }
            } else

            //HARVESTER RESPAWNS
            if (Game.flags.harvesterBuild) {
                if (stationaryHarvester.length < 6) {
                    var newName = Game.spawns['Spawn1'].createCreep([WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE], undefined, {role: 'stationaryHarvester'});
                }
            } else

            //BUILDER RESPAWNS
            if (Game.flags.builderBuild) {
                if (stationaryBuilders.length < 3) {
                    var newName = Game.spawns['Spawn1'].createCreep([CARRY, CARRY, WORK, WORK, WORK, MOVE], undefined, {role: 'stationaryBuilder'});
                }
            } else

            //WORKER RESPAWNS
            if (Game.flags.workerBuild) {
                if (worker.length < 3) {
                    var newName = Game.spawns['Spawn1'].createCreep([CARRY, CARRY, WORK, MOVE, MOVE, MOVE], undefined, {role: 'worker'});
                }
            } else

            //COMBAT RESPAWNS
            if (Game.flags.combatBuild) {
                if (scout.length < 1) {
                    var newName = Game.spawns['Spawn1'].createCreep([MOVE], undefined, {role: 'scout'});
                } else if (rangedDefenders.length < 1) {
                    var newName = Game.spawns['Spawn1'].createCreep([RANGED_ATTACK, MOVE, MOVE, MOVE], undefined, {role: 'rangedDefender'});
                } else if (Defenders.length < 2 && Game.spawns['Spawn1'].energyCapacity >= 350) {
                    var newName = Game.spawns['Spawn1'].createCreep([ATTACK, ATTACK, TOUGH, TOUGH, TOUGH, TOUGH, MOVE, MOVE, MOVE], undefined, {role: 'defender'});
                }
            }

            if (Game.spawns['Spawn1'].spawning) {
                var spawningCreep = Game.creeps[Game.spawns['Spawn1'].spawning.name];
                Game.spawns['Spawn1'].room.visual.text(
                    '🛠️' + spawningCreep.memory.role,
                    Game.spawns['Spawn1'].pos.x + 1,
                    Game.spawns['Spawn1'].pos.y,
                    {align: 'left', opacity: 0.8});
            }

        }
    }
}

module.exports = balanceCreeps;
