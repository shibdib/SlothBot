/**
 * Created by rober on 6/7/2017.
 */


module.exports.remoteControl = function () {
    for (let name in Game.rooms) {
        if (Game.rooms[name].find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_SPAWN}}).length) {
            if (!Game.rooms[name].memory.neighboringRooms) {
                Game.rooms[name].memory.neighboringRooms = Game.map.describeExits(name);
            }
            for (let i = 0; i < 8; i++) {
                if (Game.rooms[name].memory.neighboringRooms[i] && !Game.rooms[Game.rooms[name].memory.neighboringRooms[i]].controller) {
                    const pos = new RoomPosition(25, 25, Game.rooms[name].memory.neighboringRooms[i]);
                    pos.createFlag('scout' + Game.rooms[name].memory.neighboringRooms[i] + i);
                }
            }
        }
    }
};