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
            if (Game.map.getRoomLinearDistance(observedRooms[room.name], room.name) <= 2) Game.rooms[observedRooms[room.name]].invaderCheck();
            if (Memory.targetRooms[observedRooms[room.name]]) {
                Memory.targetRooms[observedRooms[room.name]].observerCheck = true;
                observer.operationPlanner(Game.rooms[observedRooms[room.name]]);
            }
            observedRooms[room.name] = undefined;
        } else {
            // Observer queries (Military scouts first)
            let scoutOperation = _.findKey(Memory.targetRooms, (t) => t && t.type === 'attack');
            if (scoutOperation && Game.map.getRoomLinearDistance(room.name, scoutOperation) <= OBSERVER_RANGE) {
                observer.observeRoom(scoutOperation);
                observedRooms[room.name] = scoutOperation;
                return;
            }
            // Observer queries
            let observerOperation = _.findKey(Memory.targetRooms, (t) => t && (!t.observerCheck || t.observerCheck + 50 < Game.time));
            if (observerOperation && Game.map.getRoomLinearDistance(room.name, observerOperation) <= OBSERVER_RANGE) {
                observer.observeRoom(observerOperation);
                observedRooms[room.name] = observerOperation;
                Memory.targetRooms[observerOperation].observerCheck = Game.time;
                return;
            }
            // Observer queries (Random)
            if (Math.random() > 0.8) {
                let target;
                let roomX = room.name.match(/\d+/g).map(Number)[0];
                let roomY = room.name.match(/\d+/g).map(Number)[1];
                let targetX = Math.abs(roomX + (Math.round(Math.random() * 20 - 10)));
                let targetY = Math.abs(roomY + (Math.round(Math.random() * 20 - 10)));
                target = room.name.replace(/[0-9]/g, '')[0] + targetX + room.name.replace(/[0-9]/g, '')[1] + targetY;
                observer.observeRoom(target);
                observedRooms[room.name] = target;
            }
        }
    }
};
