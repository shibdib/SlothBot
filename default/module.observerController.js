/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by rober on 5/16/2017.
 */
let observedRooms = {};

module.exports.observerControl = function (room) {
    let observer = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_OBSERVER);
    if (!observer) return;

    if (observedRooms[room.name] && Game.rooms[observedRooms[room.name]]) {
        // Handle manual observation
        handleManualObservation(room, observer);
    } else {
        // Handle new observation requests
        handleNewObservationRequest(room, observer);
    }
};

function handleManualObservation(room, observer) {
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
}

function handleNewObservationRequest(room, observer) {
    // Manual query observation
    if (Memory.observeRoom && isWithinObserverRange(room, Memory.observeRoom)) {
        observer.observeRoom(Memory.observeRoom);
        observedRooms[room.name] = Memory.observeRoom;
        return;
    }

    // Scout operation observation
    let scoutOperation = findScoutOperation();
    if (scoutOperation && isWithinObserverRange(room, scoutOperation)) {
        observer.observeRoom(scoutOperation);
        observedRooms[room.name] = scoutOperation;
        return;
    }

    // Regular observer query
    let observerOperation = findObserverOperation();
    if (observerOperation && isWithinObserverRange(room, observerOperation)) {
        Memory.targetRooms[observerOperation].observerCheck = Game.time;
        observer.observeRoom(observerOperation);
        observedRooms[room.name] = observerOperation;
        return;
    }

    // Random observation query
    performRandomObservation(room, observer);
}

function isWithinObserverRange(room, targetRoom) {
    return Game.map.getRoomLinearDistance(room.name, targetRoom) <= OBSERVER_RANGE;
}

function findScoutOperation() {
    return _.findKey(Memory.targetRooms, (t) => t && t.type === 'scout');
}

function findObserverOperation() {
    return _.findKey(Memory.targetRooms, (t) => t && (!t.observerCheck || t.observerCheck + 50 < Game.time));
}

function performRandomObservation(room, observer) {
    let attempts = 0;
    while (attempts < 10) {
        let targetRoom = generateRandomRoom(room);
        if (isValidRandomRoom(targetRoom)) {
            observer.observeRoom(targetRoom);
            observedRooms[room.name] = targetRoom;
            break;
        }
        attempts++;
    }
}

function generateRandomRoom(room) {
    let [roomX, roomY] = room.name.match(/\d+/g).map(Number);
    let [eW, nS] = room.name.replace(/[0-9]/g, '').split('');

    let targetX = roomX + getRandomOffset();
    let targetY = roomY + getRandomOffset();

    // Handle direction changes
    if (targetX < 0) {
        targetX *= -1;
        eW = toggleDirection(eW);
    }
    if (targetY < 0) {
        targetY *= -1;
        nS = toggleDirection(nS);
    }

    return `${eW}${targetX}${nS}${targetY}`;
}

function getRandomOffset() {
    return Math.floor(Math.random() * 11) * (Math.round(Math.random()) ? 1 : -1);
}

function toggleDirection(direction) {
    return direction === 'E' ? 'W' : 'E';
}

function isValidRandomRoom(targetRoom) {
    return !(INTEL[targetRoom] && INTEL[targetRoom].tick < Game.time - 50) && roomStatus(targetRoom) !== 'closed';
}

