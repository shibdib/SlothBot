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
    let observer = _.filter(room.structures, (s) => s.structureType === STRUCTURE_OBSERVER)[0];
    if (observer) {
        if (observedRooms[room.name] && Game.rooms[observedRooms[room.name]]) {
            Game.rooms[observedRooms[room.name]].cacheRoomIntel();
            if (Game.map.getRoomLinearDistance(observedRooms[room.name], room.name) <= 2) Game.rooms[observedRooms[room.name]].invaderCheck();
            if (Memory.targetRooms[observedRooms[room.name]]) {
                Memory.targetRooms[observedRooms[room.name]].observerCheck = true;
                observer.operationPlanner(Game.rooms[observedRooms[room.name]]);
            }
        }
        // Observer queries (Military scouts first)
        let scoutOperation = _.findKey(Memory.targetRooms, (t) => t && t.type === 'attack');
        if (scoutOperation && Game.map.getRoomLinearDistance(room.name, scoutOperation) <= OBSERVER_RANGE) {
            observer.observeRoom(scoutOperation);
            observedRooms[room.name] = scoutOperation;
            return;
        }
        // Observer queries (Level 0's)
        let observerOperation = _.findKey(Memory.targetRooms, (t) => t && t.level === 0 && (!t.observerCheck || t.observerCheck + 20 < Game.time));
        if (observerOperation && Game.map.getRoomLinearDistance(room.name, observerOperation) <= OBSERVER_RANGE) {
            observer.observeRoom(observerOperation);
            observedRooms[room.name] = observerOperation;
            Memory.targetRooms[observerOperation].observerCheck = Game.time;
            return;
        }
        // Observer queries (Claim scouts)
        let claimScoutOperation = _.findKey(Memory.targetRooms, (t) => t && t.type === 'claimScout');
        if (claimScoutOperation && Game.map.getRoomLinearDistance(room.name, claimScoutOperation) <= OBSERVER_RANGE) {
            observer.observeRoom(claimScoutOperation);
            observedRooms[room.name] = claimScoutOperation;
            return;
        }
        // Observer queries (Random)
        let target;
        let roomX = room.name.match(/\d+/g).map(Number)[0];
        let roomY = room.name.match(/\d+/g).map(Number)[1];
        let targetX = Math.abs(roomX + (Math.round(Math.random() * 20 - 10)));
        let targetY = Math.abs(roomY + (Math.round(Math.random() * 20 - 10)));
        target = room.name.replace(/[0-9]/g, '')[0] + targetX + room.name.replace(/[0-9]/g, '')[1] + targetY;
        observer.observeRoom(target);
        observedRooms[room.name] = target;
    }
};
