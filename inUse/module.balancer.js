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
        const ramparts = Game.spawns[spawnName].room.find(FIND_STRUCTURES, {
            filter: {structureType: STRUCTURE_RAMPART}
        });
        let sentryRamparts = [];
        for (i=0; i < ramparts.length; i++) {
            const nearbyRamparts = ramparts[i].pos.findInRange(FIND_MY_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
            if (nearbyRamparts.length <= 1) {
                sentryRamparts.push(ramparts[i]);
            }
        }

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

        //Station Sentries
        const sentry = _.filter(Game.creeps, (creep) => creep.memory.role === 'sentry' && creep.room === Game.spawns[spawnName].room);
        for (var i = 0; i < sentryRamparts.length && i < sentry.length; i++){
            sentry[i].memory.assignedRampart = sentryRamparts[i].id;
        }

        //Split up Remote Haulers 1-1
        var remoteHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHauler');
        var remoteHarvester = _.filter(Game.creeps, (creep) => creep.memory.role === 'remoteHarvester');
        for (var i = 0; i < remoteHarvester.length && i < remoteHauler.length; i++){
            remoteHauler[i].memory.assignedHarvester = remoteHarvester[i].id;
        }
    }
};

module.exports = balanceCreeps;
