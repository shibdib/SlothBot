/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Shared remote mining route cache, scoring, and discovery helpers.
 */

const {findRoute, getRoute} = require('pathRoute');

const MINING_ROUTE_TTL = 1500;
const DEFAULT_ROUTE_MAX = 3;
const DEFAULT_PROBE_MAX = 12;
const DEFAULT_LINEAR_MAX = 4;
const DEFAULT_SCORE_ROUTE_MULT = 20;
const DEFAULT_SCORE_ROUTE_BASE = 12;
const DEFAULT_SWAMP_PENALTY = 8;
const DEFAULT_REFRESH_STAGGER = 150;
const SCORE_BORDERLINE_MARGIN = 15;

function cfg(name, fallback) {
    const v = global[name];
    return v !== undefined && v !== null ? v : fallback;
}

function miningRouteTTL() {
    return cfg('REMOTE_MINING_ROUTE_TTL', MINING_ROUTE_TTL);
}

function estimateMiningScore(routeLen, remoteIntel) {
    const mult = cfg('REMOTE_SCORE_ROUTE_MULT', DEFAULT_SCORE_ROUTE_MULT);
    const base = cfg('REMOTE_SCORE_ROUTE_BASE', DEFAULT_SCORE_ROUTE_BASE);
    const swamp = remoteIntel && remoteIntel.swampRoom ? cfg('REMOTE_SCORE_SWAMP_PENALTY', DEFAULT_SWAMP_PENALTY) : 0;
    return routeLen * mult + base + swamp;
}

function routeAcceptable(route) {
    if (!route || !route.length) return false;
    for (let i = 0; i < route.length; i++) {
        const intel = INTEL[route[i]];
        if (!intel) continue;
        if (intel.threatLevel > 1) return false;
        if (intel.roomHeat > 250) return false;
        if (intel.owner && !FRIENDLIES.includes(intel.owner) && intel.towers) return false;
    }
    return true;
}

function getMiningRouteRecord(remoteName, colonyName) {
    const intel = INTEL[remoteName];
    if (!intel || !intel.miningRoutes) return null;
    const rec = intel.miningRoutes[colonyName];
    if (!rec || rec.tick + miningRouteTTL() < Game.time) return null;
    return rec;
}

function getMiningRouteRooms(colonyName, destName) {
    const rec = getMiningRouteRecord(destName, colonyName);
    if (rec && rec.route && rec.route.length) return rec.route;
    const cached = getRoute(colonyName, destName);
    if (cached && cached !== 'failed' && cached.length) return cached;
    const route = findRoute(colonyName, destName);
    return route && route.length ? route : [];
}

function storeMiningRoute(remoteName, colonyName, route, safe) {
    if (!INTEL[remoteName]) INTEL[remoteName] = {name: remoteName, shardName: Game.shard.name};
    const intel = INTEL[remoteName];
    if (!intel.miningRoutes) intel.miningRoutes = {};
    intel.miningRoutes[colonyName] = {
        route: route.slice(),
        routeLen: route.length,
        estimateScore: estimateMiningScore(route.length, intel),
        tick: Game.time,
        safe: !!safe,
    };
}

function probeMiningRoute(colonyName, remoteName) {
    const existing = getMiningRouteRecord(remoteName, colonyName);
    if (existing) return existing;

    const route = findRoute(colonyName, remoteName);
    if (!route.length) return null;
    if (route.length > cfg('REMOTE_ROUTE_MAX', DEFAULT_ROUTE_MAX)) return null;
    if (!routeAcceptable(route)) return null;

    storeMiningRoute(remoteName, colonyName, route, true);
    return INTEL[remoteName].miningRoutes[colonyName];
}

function trackRemoteRoom(remoteName, colonyRoom) {
    const colony = colonyRoom.name || colonyRoom;
    if (!INTEL[remoteName]) INTEL[remoteName] = {name: remoteName, shardName: Game.shard.name};
    if (!INTEL[remoteName].remoteRoom) INTEL[remoteName].remoteRoom = [];
    if (INTEL[remoteName].remoteRoom.indexOf(colony) === -1) {
        INTEL[remoteName].remoteRoom.push(colony);
    }
}

function remoteIntelEligible(colonyRoom, remoteName) {
    const colony = colonyRoom.name;
    if (remoteName === colony) return false;
    if (roomStatus(remoteName) !== roomStatus(colony)) return false;
    const intel = INTEL[remoteName];
    if (!intel || !intel.sources || intel.owner || intel.obstacles) return false;
    if (intel.reservation && intel.reservation !== MY_USERNAME && intel.reservation !== 'Invader') return false;
    const isSk = !!(intel.sk || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(remoteName)));
    if (isSk && !(SK_MINING && colonyRoom.level >= SK_MINING_LEVEL)) return false;
    return true;
}

function shouldProbeNewRemotes(room) {
    const ei = room.memory.energyInfo;
    if (ei && ei.flowStressed) return false;
    if (ei && (ei.trend || 0) < -3) return false;
    return true;
}

function hasRemoteSourceDataForColony(colonyName, remoteName) {
    const intel = INTEL[remoteName];
    if (!intel || !intel.remoteSourceData) return false;
    for (let i = 0; i < intel.remoteSourceData.length; i++) {
        if (intel.remoteSourceData[i].colony === colonyName) return true;
    }
    return false;
}

function refreshStaggerDue(roomName, force) {
    if (force) return true;
    const staggerMod = cfg('REMOTE_REFRESH_STAGGER', DEFAULT_REFRESH_STAGGER);
    const stagger = ((roomName.charCodeAt(1) || 0) + (roomName.charCodeAt(4) || 0)) % staggerMod;
    return Game.time % staggerMod === stagger;
}

function sourcePickScore(sourceEntry) {
    const intel = INTEL[sourceEntry.room];
    const sources = (intel && intel.sources) || 1;
    let pick = sourceEntry.score - Math.min(6, (sources - 1) * 2);
    if (intel && intel.reservation !== MY_USERNAME) pick += 8;
    return pick;
}

function shouldSkipRemotePrune(colonyRoom, remoteName) {
    if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) return true;
    if (!INTEL[remoteName]) return true;
    if (INTEL[remoteName].threatLevel > 1) return true;
    const isSk = !!(INTEL[remoteName].sk || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(remoteName)));
    if (isSk && !(SK_MINING && colonyRoom.level >= SK_MINING_LEVEL)) return true;
    if (INTEL[remoteName].level || !INTEL[remoteName].sources) return true;
    if (INTEL[remoteName].reservation && ![MY_USERNAME, 'Invader'].includes(INTEL[remoteName].reservation)) return true;
    if (INTEL[remoteName].roomHeat > 250) return true;
    if (INTEL[remoteName].obstacles) return true;
    return false;
}

function pruneRoomRemoteTargets(colonyName, colonyRoom) {
    const targets = ROOM_REMOTE_TARGETS[colonyName];
    if (!targets || !targets.length) return;
    ROOM_REMOTE_TARGETS[colonyName] = targets.filter(s =>
        s.score <= REMOTE_DISTANCE_MAX && !shouldSkipRemotePrune(colonyRoom, s.room)
    );
}

function getCandidateRemotesForProbe(colonyRoom) {
    const colony = colonyRoom.name;
    const seen = new Set();
    const ordered = [];

    const add = (rName, priority) => {
        if (seen.has(rName) || !remoteIntelEligible(colonyRoom, rName)) return;
        seen.add(rName);
        ordered.push({room: rName, priority});
    };

    for (const s of (ROOM_REMOTE_TARGETS[colony] || [])) add(s.room, 0);

    for (const roomName in INTEL) {
        const intel = INTEL[roomName];
        if (!intel || !intel.remoteSourceData) continue;
        for (const sd of intel.remoteSourceData) {
            if (sd.colony === colony) add(roomName, 1);
        }
    }

    const linearMax = cfg('REMOTE_LINEAR_MAX', DEFAULT_LINEAR_MAX);
    const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
    const unowned = idx && idx.unownedSources ? [...idx.unownedSources] : [];
    const pool = [];

    for (let i = 0; i < unowned.length; i++) {
        const rName = unowned[i];
        if (seen.has(rName)) continue;
        if (!remoteIntelEligible(colonyRoom, rName)) continue;
        if (Game.map.getRoomLinearDistance(colony, rName) > linearMax) continue;
        const intel = INTEL[rName];
        pool.push({
            room: rName,
            sources: intel.sources || 1,
            linear: Game.map.getRoomLinearDistance(colony, rName),
            stale: !intel.cached || intel.cached + 5000 < Game.time ? 1 : 0,
        });
    }

    pool.sort((a, b) => {
        if (b.sources !== a.sources) return b.sources - a.sources;
        if (a.linear !== b.linear) return a.linear - b.linear;
        return b.stale - a.stale;
    });

    const probeMax = cfg('REMOTE_ROUTE_PROBE_MAX', DEFAULT_PROBE_MAX);
    const slots = Math.max(0, probeMax - ordered.length);
    let cursor = colonyRoom.memory.remoteProbeCursor || 0;
    if (pool.length && slots > 0) {
        for (let i = 0; i < slots; i++) {
            add(pool[(cursor + i) % pool.length].room, 10 + pool[(cursor + i) % pool.length].linear);
        }
        colonyRoom.memory.remoteProbeCursor = (cursor + slots) % pool.length;
    }

    ordered.sort((a, b) => a.priority - b.priority);
    return ordered.map(c => c.room);
}

function bootstrapRemoteRoomOnVision(room) {
    if (room.controller && room.controller.my) return;
    if (!room.sources.length) return;
    const roomIntel = INTEL[room.name];
    if (!roomIntel || roomIntel.owner) return;
    if (roomIntel.remoteRoom && roomIntel.remoteRoom.length) return;

    const colony = findClosestOwnedRoom(room.name, false, 4);
    if (!colony || colony === room.name) return;

    const rec = getMiningRouteRecord(room.name, colony) || probeMiningRoute(colony, room.name);
    if (!rec || !rec.safe) return;

    trackRemoteRoom(room.name, colony);
}

function maybeRefreshRemoteIntel(rName) {
    const visRoom = Game.rooms[rName];
    if (!visRoom) return;
    const intel = INTEL[rName];
    if (intel && intel.microUpdate + 150 >= Game.time) return;
    visRoom.cacheRoomIntel();
}

function calculateRemoteSourceScore(room, source, colonyName) {
    if (!Game.rooms[colonyName] || !Game.rooms[colonyName].memory) return Infinity;

    const max = REMOTE_DISTANCE_MAX;
    const rec = getMiningRouteRecord(room.name, colonyName);
    let estimate = rec ? rec.estimateScore : null;
    if (estimate === null) {
        const route = getMiningRouteRooms(colonyName, room.name);
        if (!route.length) return Infinity;
        estimate = estimateMiningScore(route.length, INTEL[room.name]);
    }

    const roomVisible = !!Game.rooms[room.name];
    if (!roomVisible && estimate < max - SCORE_BORDERLINE_MARGIN) return estimate;

    const colony = Game.rooms[colonyName];
    const target = colony.storage
        || (colony.memory.bunkerHub
            ? new RoomPosition(colony.memory.bunkerHub.x, colony.memory.bunkerHub.y, colonyName)
            : new RoomPosition(25, 25, colonyName));

    const route = getMiningRouteRooms(colonyName, room.name);
    const options = route.length ? {route, range: 1} : {range: 1};
    const pathResult = source.pos.shibMove(target, options);
    if (!pathResult || pathResult.incomplete || typeof pathResult.cost !== 'number') return Infinity;
    return Math.ceil(pathResult.cost / 2);
}

function getActiveRemoteRooms(colonyRoom, shouldSkipRemote, deps = {}) {
    const colony = colonyRoom.name;
    const rooms = new Set();
    const max = REMOTE_DISTANCE_MAX;

    for (const s of (ROOM_REMOTE_TARGETS[colony] || [])) {
        if (s.score <= max && !shouldSkipRemote(colonyRoom, s.room)) rooms.add(s.room);
    }

    const cached = deps.cachedRemotes || [];
    for (let i = 0; i < cached.length; i++) {
        if (!shouldSkipRemote(colonyRoom, cached[i])) rooms.add(cached[i]);
    }

    const liveRemotes = deps.liveRemoteRooms;
    if (liveRemotes) {
        for (const r of liveRemotes) {
            if (!shouldSkipRemote(colonyRoom, r)) rooms.add(r);
        }
    }

    return [...rooms];
}

function shouldProcessRemote(colonyRoom, remoteName, deps) {
    const colony = colonyRoom.name;
    const max = REMOTE_DISTANCE_MAX;
    if (deps.shouldSkipRemote(colonyRoom, remoteName)) return false;

    if ((ROOM_REMOTE_TARGETS[colony] || []).some(s => s.room === remoteName && s.score <= max)) return true;
    if (deps.getCreepCount(undefined, 'remoteHarvester', remoteName)) return true;
    if (deps.getCreepCount(undefined, 'reserver', remoteName)) return true;
    if (deps.countQueuedRole(colony, 'remoteHarvester', remoteName)) return true;
    if (deps.countQueuedRole(colony, 'reserver', remoteName)) return true;

    const rec = getMiningRouteRecord(remoteName, colony);
    return !!(rec && rec.safe && rec.estimateScore <= max);
}

module.exports = {
    estimateMiningScore,
    routeAcceptable,
    getMiningRouteRecord,
    getMiningRouteRooms,
    storeMiningRoute,
    probeMiningRoute,
    trackRemoteRoom,
    remoteIntelEligible,
    shouldProbeNewRemotes,
    hasRemoteSourceDataForColony,
    refreshStaggerDue,
    sourcePickScore,
    pruneRoomRemoteTargets,
    getCandidateRemotesForProbe,
    bootstrapRemoteRoomOnVision,
    maybeRefreshRemoteIntel,
    calculateRemoteSourceScore,
    getActiveRemoteRooms,
    shouldProcessRemote,
};