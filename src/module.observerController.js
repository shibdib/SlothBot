/**
 * Created by rober on 5/16/2017.
 */

module.exports.observerControl = function (room) {
    let observer = _.filter(room.structures, (s) => s.structureType === STRUCTURE_OBSERVER)[0];
    if (observer) {
        if (Game.time % 2 === 0) {
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
            observer.room.memory.observerTarget = target;
        } else {
            try {
                if (observer.room.memory.observerTarget) {
                    if (Game.rooms[observer.room.memory.observerTarget]) Game.rooms[observer.room.memory.observerTarget].cacheRoomIntel();
                    if (Game.map.findRoute(observer.room.memory.observerTarget, observer.room.name).length <= 2) Game.rooms[observer.room.memory.observerTarget].invaderCheck();
                }
            }
            catch(err) {
                log.e('Observer error: ' + err)
            }
        }
    }
};

