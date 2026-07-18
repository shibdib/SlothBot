/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Room planner tick orchestration.
 */

const {tickTracker} = require('planState');
const {isColonyEarlyRush} = require('bodyHelpers');

const {
    buildMissingStructures,
    buildAuxiliaryStructures,
    hasPendingLayoutStructures,
    ensureSpawnSite,
} = require('planLayout');

const {
    findHub,
    findLabHub,
    findTowerHub,
    getTowerDeficit,
    placeTowerSitesUpToDeficit,
    processTowerLayoutResetQueue
} = require('planHub');

const {planOwnedRoomRoads} = require('planRoads');
const {getExtensionDeficit} = require('planExtensions');

function hasBunkerHub(room) {
    return !!(room.memory.bunkerHub && room.memory.bunkerHub.x);
}

/** Room has a hub but no completed spawn structure. */
function needsOwnSpawn(room) {
    return !!(room.controller && room.controller.my && hasBunkerHub(room) && !(room.spawns && room.spawns.length));
}

/** Spawn structure missing AND no spawn construction site yet — urgent bootstrap. */
function needsSpawnSite(room) {
    if (!needsOwnSpawn(room)) return false;
    return !room.constructionSites.some(s => s.structureType === STRUCTURE_SPAWN);
}

function pickRoundRobin(list) {
    if (!list.length) return null;
    return list[Game.time % list.length];
}

/** All visible owned rooms — do not rely solely on MY_ROOMS (can lag a claim by 250 ticks). */
function getVisibleOwnedRooms() {
    const rooms = [];
    const seen = new Set();
    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && MY_ROOMS.length) {
        for (const name of MY_ROOMS) {
            const room = Game.rooms[name];
            if (!room || seen.has(name)) continue;
            seen.add(name);
            rooms.push(room);
        }
    }
    for (const name in Game.rooms) {
        if (seen.has(name)) continue;
        const room = Game.rooms[name];
        if (!room.controller || !room.controller.my) continue;
        seen.add(name);
        rooms.push(room);
    }
    return rooms;
}

function getNextRoom() {
    const rooms = getVisibleOwnedRooms();
    if (!rooms.length) return null;

    // Highest priority: new claims cannot place anything until a hub is found.
    // Without this, rooms that already need extensions/towers starve hub search forever.
    const needsHub = rooms.filter(r => r.controller && r.controller.my && !hasBunkerHub(r));
    if (needsHub.length) return pickRoundRobin(needsHub);

    // Cross-room bootstrap: spawnless rooms before tower/extension work elsewhere.
    // Within a room, placement order is still tower → spawn → extensions.
    const needsSpawn = rooms.filter(needsOwnSpawn);
    if (needsSpawn.length) return pickRoundRobin(needsSpawn);

    const needsTowers = rooms.filter(r =>
        hasBunkerHub(r) && getTowerDeficit(r) > 0
    );
    if (needsTowers.length) return pickRoundRobin(needsTowers);

    const needsExtensions = rooms.filter(r =>
        r.controller && r.controller.my && r.controller.level >= 2 &&
        hasBunkerHub(r) && getExtensionDeficit(r) > 0
    );
    if (needsExtensions.length) return pickRoundRobin(needsExtensions);

    const earlyRush = rooms.filter(r => isColonyEarlyRush(r) && hasBunkerHub(r));
    if (earlyRush.length) return pickRoundRobin(earlyRush);

    const lastIndex = tickTracker.lastRoom ? rooms.findIndex(r => r.name === tickTracker.lastRoom) : -1;
    return rooms[(lastIndex + 1) % rooms.length] || rooms[0];
}

function runRoomLayout(room, lastRun, earlyRush) {
    if (!room.memory.towerHubs) findTowerHub(room);
    if (!room.memory.labHub) findLabHub(room);

    // Spawnless rooms always run full layout this tick (no auxiliary alternation).
    const forceLayout = earlyRush || needsOwnSpawn(room);

    if (getTowerDeficit(room) > 0) {
        placeTowerSitesUpToDeficit(room);
    }

    // Spawn before the rest of layout work so it cannot lose the tick to extensions.
    if (needsSpawnSite(room)) {
        ensureSpawnSite(room);
    }

    if (forceLayout || shouldRunLayout(lastRun)) {
        buildMissingStructures(room, room.controller.level);
        if (!forceLayout) lastRun.task = 'layout';
    }
    if (forceLayout || shouldRunAuxiliary(lastRun)) {
        buildAuxiliaryStructures(room);
        if (!forceLayout) lastRun.task = 'auxiliary';
    }

    if (room.storage) {
        planOwnedRoomRoads(room, {layoutPending: hasPendingLayoutStructures(room)});
    }
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
    // Always allow hub bootstrap even if the throttle would skip this tick —
    // new claims must not wait on the every-other-tick layout cadence.
    const bootstrapRooms = getVisibleOwnedRooms().filter(r =>
        r.controller && r.controller.my && !hasBunkerHub(r)
    );
    if (bootstrapRooms.length) {
        const room = pickRoundRobin(bootstrapRooms);
        tickTracker['lastTick'] = Game.time;
        tickTracker['lastRoom'] = room.name;
        const lastRun = tickTracker[room.name] || {};
        findHub(room);
        if (hasBunkerHub(room)) {
            runRoomLayout(room, lastRun, true);
        }
        tickTracker[room.name] = lastRun;
        return;
    }

    // Spawn-site bootstrap: same urgency as hub — place the site immediately.
    // Once a spawn site exists, fall through to normal planner scheduling.
    const spawnBootstrapRooms = getVisibleOwnedRooms().filter(needsSpawnSite);
    if (spawnBootstrapRooms.length) {
        const room = pickRoundRobin(spawnBootstrapRooms);
        tickTracker['lastTick'] = Game.time;
        tickTracker['lastRoom'] = room.name;
        const lastRun = tickTracker[room.name] || {};
        runRoomLayout(room, lastRun, true);
        tickTracker[room.name] = lastRun;
        return;
    }

    if (!shouldRunAtAll()) return;

    if (Memory.towerLayoutResetQueue && Memory.towerLayoutResetQueue.length) {
        processTowerLayoutResetQueue();
    }

    let room = getNextRoom();
    if (!room) return;

    const earlyRush = isColonyEarlyRush(room);
    tickTracker['lastTick'] = earlyRush ? Game.time : Game.time + 1;
    tickTracker['lastRoom'] = room.name;

    let lastRun = tickTracker[room.name] || {};

    if (hasBunkerHub(room)) {
        runRoomLayout(room, lastRun, earlyRush);
    }

    tickTracker[room.name] = lastRun;
}


module.exports = {

    buildRoom,

};