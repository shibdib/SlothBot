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

    // Only hard-prioritize rooms that still need a spawn *site*.
    // A room with a spawn site under construction used to monopolize the planner
    // forever via needsOwnSpawn, starving every other room's extensions.
    const needsSpawnSiteOnly = rooms.filter(needsSpawnSite);
    if (needsSpawnSiteOnly.length) return pickRoundRobin(needsSpawnSiteOnly);

    // Soft work: towers + extensions share one queue so neither starves cross-room.
    // (Previously any single tower-deficit room blocked all extension-only rooms.)
    const needsSoftLayout = rooms.filter(r => {
        if (!r.controller || !r.controller.my || !hasBunkerHub(r)) return false;
        if (getTowerDeficit(r) > 0) return true;
        if (r.controller.level >= 2 && getExtensionDeficit(r) > 0) return true;
        // Incomplete spawn structure still wants layout turns, but not exclusively.
        if (needsOwnSpawn(r)) return true;
        return false;
    });
    if (needsSoftLayout.length) return pickRoundRobin(needsSoftLayout);

    const earlyRush = rooms.filter(r => isColonyEarlyRush(r) && hasBunkerHub(r));
    if (earlyRush.length) return pickRoundRobin(earlyRush);

    const lastIndex = tickTracker.lastRoom ? rooms.findIndex(r => r.name === tickTracker.lastRoom) : -1;
    return rooms[(lastIndex + 1) % rooms.length] || rooms[0];
}

function runRoomLayout(room, lastRun, earlyRush) {
    if (!room.memory.towerHubs) findTowerHub(room);
    if (!room.memory.labHub) findLabHub(room);

    // Spawnless rooms always run full layout this tick (no auxiliary alternation).
    // Large extension deficit: always run layout so wipe/rebuild is not stuck on aux turns.
    const extDeficit = room.controller && room.controller.level >= 2
        ? getExtensionDeficit(room)
        : 0;
    const forceLayout = earlyRush || needsOwnSpawn(room) || extDeficit > 5;

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
    // Incomplete perimeters every tick (not only when this room is the layout target).
    // Gaps otherwise linger for thousands of ticks with multi-room round-robin.
    try {
        require('planRamparts').ensureAllIncompletePerimeters();
    } catch (e) {
        if (typeof log !== 'undefined' && log.e) {
            log.e(`ensureAllIncompletePerimeters failed: ${e && e.stack ? e.stack : e}`, 'PLANNER');
        }
        if (typeof Memory !== 'undefined') {
            Memory._perimeterEnsureError = {
                tick: Game.time,
                error: (e && e.message) || String(e),
                stack: e && e.stack ? String(e.stack).slice(0, 400) : undefined,
            };
        }
    }

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