/**
 * Created by rober on 5/16/2017.
 */

const balanceCreeps = {
    /**   *
     * @param spawnName
     */
    run: function (spawnName) {

        //VARS
        const sources = Game.spawns[spawnName].room.find(FIND_SOURCES);
        const containers = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
            filter: {structureType: STRUCTURE_CONTAINER}
        });

        //Split up harvesters and peasants
        const stationaryHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'stationaryHarvester');
        const peasant = _.filter(Game.creeps, (creep) => creep.memory.role === 'peasant');
        var perSource = stationaryHarvester.length / sources.length;
        for (var i = 0; i < stationaryHarvester.length; i++){
            if (i < perSource){
                stationaryHarvester[i].memory.assignedSource = sources[0].id;
            }else{
                stationaryHarvester[i].memory.assignedSource = sources[1].id;
            }
        }
        var perSource = peasant.length / sources.length;
        for (var i = 0; i < peasant.length; i++){
            if (i < perSource){
                peasant[i].memory.assignedSource = sources[0].id;
            }else{
                peasant[i].memory.assignedSource = sources[1].id;
            }
        }

        //Split up Expediter 1-1
        const expediter = _.filter(Game.creeps, (creep) => creep.memory.role === 'expediter' && creep.room === Game.spawns[spawnName].room);
        for (var i = 0; i < containers.length && i < expediter.length; i++){
            expediter[i].memory.assignedContainer = containers[i].id;
        }

        //Split up Haulers 1-1
        const hauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'hauler' && creep.room === Game.spawns[spawnName].room);
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
};

module.exports = balanceCreeps;
