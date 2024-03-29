/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by rober on 5/16/2017.
 */
let observedRooms = {};
module.exports.observerControl = function (room) {
    if (room.level !== 8) return;
    let observer = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_OBSERVER);
    if (observer) {
        if (observedRooms[room.name] && Game.rooms[observedRooms[room.name]]) {
            // Force a refresh if it's a manual observation
            let force = undefined;
            if (Memory.observeRoom === observedRooms[room.name]) force = true;
            Game.rooms[observedRooms[room.name]].cacheRoomIntel(force);
            if (Memory.targetRooms[observedRooms[room.name]]) {
                observer.operationPlanner(Game.rooms[observedRooms[room.name]]);
            }
            if (Memory.observeRoom === observedRooms[room.name]) {
                log.a(room.name + ' is done observing ' + Memory.observeRoom + ' and will now observe randomly.');
                Memory.observeRoom = undefined;
            }
            observedRooms[room.name] = undefined;
        } else {
            // Manual queries
            if (Memory.observeRoom && Game.map.getRoomLinearDistance(room.name, Memory.observeRoom) <= OBSERVER_RANGE) {
                observer.observeRoom(Memory.observeRoom);
                observedRooms[room.name] = Memory.observeRoom;
                return;
            }
            // Observer queries (Military scouts first)
            let scoutOperation = _.findKey(Memory.targetRooms, (t) => t && t.type === 'scout');
            if (scoutOperation && Game.map.getRoomLinearDistance(room.name, scoutOperation) <= OBSERVER_RANGE) {
                observer.observeRoom(scoutOperation);
                observedRooms[room.name] = scoutOperation;
                return;
            }
            // Observer queries
            let observerOperation = _.findKey(Memory.targetRooms, (t) => t && (!t.observerCheck || t.observerCheck + 50 < Game.time));
            if (observerOperation && Game.map.getRoomLinearDistance(room.name, observerOperation) <= OBSERVER_RANGE) {
                Memory.targetRooms[observerOperation].observerCheck = Game.time;
                observer.observeRoom(observerOperation);
                observedRooms[room.name] = observerOperation;
                return;
            }
            // Observer queries, random
            let x = 0;
            while (x < 10) {
                let roomX = room.name.match(/\d+/g).map(Number)[0];
                let roomY = room.name.match(/\d+/g).map(Number)[1];
                let eW = room.name.replace(/[0-9]/g, '')[0];
                let nS = room.name.replace(/[0-9]/g, '')[1];
                let targetX = roomX + ((Math.floor(Math.random() * 11)) * (Math.round(Math.random()) ? 1 : -1));
                let targetY = roomY + ((Math.floor(Math.random() * 11)) * (Math.round(Math.random()) ? 1 : -1));
                // Handle changing directions
                if (targetX < 0) {
                    targetX *= -1;
                    if (eW === 'E') eW = 'W'; else eW = 'E';
                }
                if (targetY < 0) {
                    targetY *= -1;
                    if (nS === 'N') nS = 'S'; else nS = 'N';
                }
                let targetRoom = eW + targetX + nS + targetY;
                if ((INTEL[targetRoom] && INTEL[targetRoom].tick < Game.time - 50) || roomStatus(targetRoom) === 'closed') {
                    x++;
                    continue;
                }
                observer.observeRoom(eW + targetX + nS + targetY);
                observedRooms[room.name] = eW + targetX + nS + targetY;
                break;
            }
        }
    }
};
