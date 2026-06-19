/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Room planner tick orchestration.

 */


const {tickTracker} = require('planState');

const {buildMissingStructures, buildAuxiliaryStructures} = require('planLayout');

const {findHub, findLabHub, findTowerHub} = require('planHub');

const {planOwnedRoomRoads} = require('planOwnedRoads');

function getNextRoom() {
    const rooms = MY_ROOMS.map(name => Game.rooms[name]).filter(r => r);
    if (!rooms.length) return null;

    const lastIndex = tickTracker.lastRoom ? MY_ROOMS.indexOf(tickTracker.lastRoom) : -1;
    return rooms[(lastIndex + 1) % rooms.length] || rooms[0];
}

function shouldRunAtAll() {
    let overallLastRun = tickTracker['lastTick'] || 0;
    return overallLastRun < Game.time;
}

function shouldRunLayout(lastRun) {
    return !lastRun.task || lastRun.task === 'auxiliary';
}

function shouldRunAuxiliary(lastRun) {
    return !lastRun.task || lastRun.task === 'layout';
}


function buildRoom() {

    if (!shouldRunAtAll()) return;

    let room = getNextRoom();
    if (!room) return;

    tickTracker['lastTick'] = Game.time + 1;
    tickTracker['lastRoom'] = room.name;

    let lastRun = tickTracker[room.name] || {};

    // Ensure the room has a bunker hub
    if (room.memory.bunkerHub && room.memory.bunkerHub.x) {
        // Check if bunker layout needs to be built
        if (shouldRunLayout(lastRun)) {
            buildMissingStructures(room, room.controller.level);
            lastRun.task = 'layout';
        }
        // Check if auxiliary buildings need to be built
        else if (shouldRunAuxiliary(lastRun)) {
            buildAuxiliaryStructures(room);
            lastRun.task = 'auxiliary';
        }

        if (room.storage) planOwnedRoomRoads(room);
    } else {
        // Find hub if not already found
        findHub(room);
    }

    if (room.memory.bunkerHub && room.memory.bunkerHub.x) {
        if (!room.memory.labHub) findLabHub(room);
        if (!room.memory.towerHubs) findTowerHub(room);
    }

    // Update tick tracker
    tickTracker[room.name] = lastRun;

}


module.exports = {

    buildRoom,

};