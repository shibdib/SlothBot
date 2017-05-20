/**
 * Created by rober on 5/16/2017.
 */

const balanceCreeps = {
    /** @param  {Spawn} spawn  **/
    run: function (spawnName) {

        //VARS
        var sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
        var containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
            filter: { structureType: STRUCTURE_CONTAINER }
        });

        //Split up harvesters
        var stationaryHarvester = _.filter(room.creeps, (creep) => creep.memory.role === 'stationaryHarvester');
        var perSource = stationaryHarvester.length / sources.length;
        for (var i = 0; i < stationaryHarvester.length; i++){
            if (i < perSource){
                stationaryHarvester[i].memory.assignedSource = sources[0].id;
            }else{
                stationaryHarvester[i].memory.assignedSource = sources[1].id;
            }
        }

        //Split up Expediter 1-1
        var expediter = _.filter(room.creeps, (creep) => creep.memory.role === 'expediter' && creep.room === Game.spawns[spawnName].room);
        for (var i = 0; i < containers.length && i < expediter.length; i++){
            expediter[i].memory.assignedContainer = containers[i].id;
        }

        //Split up Haulers 1-1
        var hauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room === Game.spawns[spawnName].room);
        for (var i = 0; i < containers.length && i < hauler.length; i++){
            hauler[i].memory.assignedContainer = containers[i].id;
        }

        //Split up Remote Haulers 1-1
       /**var remoteHauler = _.filter(room.creeps, (creep) => creep.memory.role === 'remoteHauler' && creep.room === Game.spawns[spawnName].room);
        var remoteHarvester = _.filter(room.creeps, (creep) => creep.memory.role === 'remoteHarvester' && creep.room === Game.spawns[spawnName].room);
        for (var i = 0; i < remoteHarvester.length && i < remoteHauler.length; i++){
            remoteHauler[i].memory.assignedHarvester = remoteHarvester[i].id;
        }**/
    }
}

module.exports = balanceCreeps;
