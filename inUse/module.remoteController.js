/**
 * Created by rober on 6/7/2017.
 */


module.exports.claimedControl = function () {

    for (let name in Game.rooms) {
        if (Game.rooms[name].find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_SPAWN}}).length) {
            if (!Game.rooms[name].memory.neighboringRooms) {
                Game.rooms[name].memory.neighboringRooms = Game.map.describeExits(name);
            }
        }


        //GRAFANANANANANA
        Memory.stats["room." + room.name + ".energyAvailable"] = Game.rooms[name].energyAvailable;
        Memory.stats["room." + room.name + ".energyCapacityAvailable"] = Game.rooms[name].energyCapacityAvailable;
        Memory.stats["room." + room.name + ".controllerProgress"] = Game.rooms[name].controller.progress;
    }

};