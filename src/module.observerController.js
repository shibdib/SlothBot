/**
 * Created by rober on 5/16/2017.
 */
let observedRooms = {};
module.exports.observerControl = function (room) {
    if (Math.random() > 0.25) return;
    let observer = _.filter(room.structures, (s) => s.structureType === STRUCTURE_OBSERVER)[0];
    if (observer) {
        if (observedRooms[room.name] && Game.rooms[observedRooms[room.name]]) {
            if (!Memory.roomCache[observedRooms[room.name]]) Game.rooms[observedRooms[room.name]].cacheRoomIntel();
            if (Game.map.getRoomLinearDistance(observedRooms[room.name], room.name) <= 2) Game.rooms[observedRooms[room.name]].invaderCheck();
        }
        // Random observer queries
        let target;
        let roomX = parseInt(room.name.substr(1, 2));
        let roomY = parseInt(room.name.substr(4, 2));
        if (observer.room.memory.responseNeeded === true) {
            let targetX = roomX + (Math.round(Math.random() * 20 - 1));
            let targetY = roomY + (Math.round(Math.random() * 20 - 1));
            target = room.name.substr(0, 1) + targetX + room.name.substr(3, 1) + targetY;
        } else {
            let targetX = roomX + (Math.round(Math.random() * 20 - 10));
            let targetY = roomY + (Math.round(Math.random() * 20 - 10));
            target = room.name.substr(0, 1) + targetX + room.name.substr(3, 1) + targetY;
        }
        observer.observeRoom(target);
        observedRooms[room.name] = target;
    }
};

