/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Room planner tick orchestration.
 */

const {tickTracker} = require('planState');
const {isColonyEarlyRush} = require('bodyHelpers');

const {buildMissingStructures, buildAuxiliaryStructures, hasPendingLayoutStructures} = require('planLayout');

const {findHub, findLabHub, findTowerHub} = require('planHub');

const {planOwnedRoomRoads} = require('planRoads');
const {getExtensionDeficit} = require('planExtensions');

function getNextRoom() {
    const rooms = MY_ROOMS.map(name => Game.rooms[name]).filter(r => r);
    if (!rooms.length) return null;

    const needsExtensions = rooms.filter(r =>
        r.controller && r.controller.my && r.controller.level >= 2 &&
        r.memory.bunkerHub && r.memory.bunkerHub.x && getExtensionDeficit(r) > 0
    );
    if (needsExtensions.length) {
        return needsExtensions[Game.time % needsExtensions.length];
    }

    const earlyRush = rooms.filter(r => isColonyEarlyRush(r) && r.memory.bunkerHub && r.memory.bunkerHub.x);
    if (earlyRush.length) {
        return earlyRush[Game.time % earlyRush.length];
    }

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

    const earlyRush = isColonyEarlyRush(room);
    tickTracker['lastTick'] = earlyRush ? Game.time : Game.time + 1;
    tickTracker['lastRoom'] = room.name;

    let lastRun = tickTracker[room.name] || {};

    // Ensure the room has a bunker hub
    if (room.memory.bunkerHub && room.memory.bunkerHub.x) {
        if (!room.memory.towerHubs) findTowerHub(room);
        if (!room.memory.labHub) findLabHub(room);

        if (earlyRush || shouldRunLayout(lastRun)) {
            buildMissingStructures(room, room.controller.level);
            if (!earlyRush) lastRun.task = 'layout';
        }
        if (earlyRush || shouldRunAuxiliary(lastRun)) {
            buildAuxiliaryStructures(room);
            if (!earlyRush) lastRun.task = 'auxiliary';
        }

        if (room.storage) {
            planOwnedRoomRoads(room, {layoutPending: hasPendingLayoutStructures(room)});
        }
    } else {
        // Find hub if not already found
        findHub(room);
    }

    // Update tick tracker
    tickTracker[room.name] = lastRun;

}


module.exports = {

    buildRoom,

};