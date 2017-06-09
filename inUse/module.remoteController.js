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
    }

};