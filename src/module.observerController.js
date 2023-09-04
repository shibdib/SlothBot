/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
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
            Game.rooms[observedRooms[room.name]].cacheRoomIntel();
            if (Memory.targetRooms[observedRooms[room.name]]) {
                observer.operationPlanner(Game.rooms[observedRooms[room.name]]);
            }
            observedRooms[room.name] = undefined;
        } else {
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
                if (INTEL[targetRoom] && INTEL[targetRoom].tick < Game.time - 100) {
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
