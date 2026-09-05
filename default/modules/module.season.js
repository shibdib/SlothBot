/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Season 11 — Thorium Reactors (Season 5 rules + northern density skew).
 * No-op on persistent-world / MMO shards.
 */

const profiler = require('tools.profiler');

const REACTOR_STORE_EMERGENCY = 100;
const REACTOR_STORE_TARGET = 800;
const FEEDER_KEEP = 2000;
const THORIUM_SEND_MIN = 100;
const SCAN_INTERVAL = 10;
const REACTOR_INTEL_TTL = CREEP_LIFE_TIME;

function isSeason() {
    return !!(typeof IS_SEASON !== 'undefined' ? IS_SEASON : (Game.shard && Game.shard.name === 'shardSeason'));
}

function thoriumType() {
    return typeof RESOURCE_THORIUM !== 'undefined' ? RESOURCE_THORIUM : 'T';
}

function reactorType() {
    return typeof STRUCTURE_REACTOR !== 'undefined' ? STRUCTURE_REACTOR : 'reactor';
}

function reactorCapacity() {
    return typeof REACTOR_THORIUM_CAPACITY !== 'undefined' ? REACTOR_THORIUM_CAPACITY : 1000;
}

function getSeasonMemory() {
    if (!Memory.season) Memory.season = {};
    return Memory.season;
}

function findReactors(room) {
    if (!room) return [];
    const findConst = typeof FIND_REACTORS !== 'undefined' ? FIND_REACTORS : 10051;
    try {
        return room.find(findConst) || [];
    } catch (e) {
        return [];
    }
}

function parseRoomXY(roomName) {
    if (!roomName) return null;
    const nsIndex = roomName.indexOf('N') !== -1 ? roomName.indexOf('N') : roomName.indexOf('S');
    if (nsIndex < 2) return null;
    const x = parseInt(roomName.slice(1, nsIndex), 10);
    const y = parseInt(roomName.slice(nsIndex + 1), 10);
    if (isNaN(x) || isNaN(y)) return null;
    return {ew: roomName[0], ns: roomName[nsIndex], x, y};
}

function sectorCenterName(roomName) {
    const parsed = parseRoomXY(roomName);
    if (!parsed) return null;
    const cx = Math.floor(parsed.x / 10) * 10 + 5;
    const cy = Math.floor(parsed.y / 10) * 10 + 5;
    return parsed.ew + cx + parsed.ns + cy;
}

function nearbySectorCenters(roomName, sectorHops = 1) {
    const parsed = parseRoomXY(roomName);
    if (!parsed) return [];
    const cx = Math.floor(parsed.x / 10) * 10 + 5;
    const cy = Math.floor(parsed.y / 10) * 10 + 5;
    const out = [];
    for (let dx = -sectorHops; dx <= sectorHops; dx++) {
        for (let dy = -sectorHops; dy <= sectorHops; dy++) {
            const x = cx + dx * 10;
            const y = cy + dy * 10;
            if (x < 0 || y < 0) continue;
            out.push(parsed.ew + x + parsed.ns + y);
        }
    }
    return out;
}

function roomNorthValue(roomName) {
    const parsed = parseRoomXY(roomName);
    if (!parsed) return 0;
    return parsed.ns === 'N' ? parsed.y : -parsed.y;
}

function scanVisibleRooms() {
    const mem = getSeasonMemory();
    if (!mem.reactors) mem.reactors = {};
    const t = thoriumType();

    for (const name in Game.rooms) {
        const room = Game.rooms[name];
        const reactors = findReactors(room);
        if (reactors.length) {
            const r = reactors[0];
            mem.reactors[name] = {
                id: r.id,
                owner: r.owner && r.owner.username,
                my: !!r.my,
                store: (r.store && r.store[t]) || 0,
                continuousWork: r.continuousWork || 0,
                x: r.pos.x,
                y: r.pos.y,
                tick: Game.time
            };
        }

        const intel = INTEL[name];
        if (!intel) continue;

        const minerals = room.find(FIND_MINERALS);
        let amount = 0;
        for (let i = 0; i < minerals.length; i++) {
            if (minerals[i].mineralType === t) amount += minerals[i].mineralAmount || 0;
        }
        intel.thoriumAmount = amount;

        if (reactors.length) {
            const r = reactors[0];
            intel.reactor = true;
            intel.reactorOwner = r.owner && r.owner.username;
            intel.reactorMy = !!r.my;
            intel.reactorStore = (r.store && r.store[t]) || 0;
            intel.reactorWork = r.continuousWork || 0;
        }
    }

    for (const roomName in mem.reactors) {
        if (mem.reactors[roomName].tick + REACTOR_INTEL_TTL < Game.time) {
            delete mem.reactors[roomName];
        }
    }
}

function closestOwned(roomName, minLevel) {
    if (typeof findClosestOwnedRoom !== 'function') return null;
    const name = findClosestOwnedRoom(roomName, false, minLevel || 1);
    if (name && name !== Infinity) return name;
    return findClosestOwnedRoom(roomName) || null;
}

function closestOwnedDist(roomName) {
    if (typeof findClosestOwnedRoom !== 'function') return Infinity;
    const dist = findClosestOwnedRoom(roomName, true);
    return Number.isFinite(dist) ? dist : Infinity;
}

function pickTargetReactor() {
    const mem = getSeasonMemory();
    const known = mem.reactors || {};
    const candidates = new Set(Object.keys(known));

    const owned = typeof MY_ROOMS !== 'undefined' ? MY_ROOMS : [];
    for (let i = 0; i < owned.length; i++) {
        const centers = nearbySectorCenters(owned[i], 2);
        for (let j = 0; j < centers.length; j++) candidates.add(centers[j]);
    }

    let best = null;
    let bestScore = -Infinity;

    for (const roomName of candidates) {
        if (typeof roomStatus === 'function' && roomStatus(roomName) === 'closed') continue;
        const dist = closestOwnedDist(roomName);
        if (dist > 18) continue;

        const rec = known[roomName] || {};
        const intel = (typeof INTEL !== 'undefined' && INTEL[roomName]) || {};
        const my = rec.my || intel.reactorMy;
        const owner = rec.owner || intel.reactorOwner;
        const store = rec.store != null ? rec.store : intel.reactorStore;
        const work = rec.continuousWork || intel.reactorWork || 0;

        if (owner && typeof FRIENDLIES !== 'undefined' && FRIENDLIES.includes(owner) && !my) continue;

        let score = 2000 - dist * 50;
        score += roomNorthValue(roomName) * 20;

        if (my) {
            score += 8000 + Math.min(work, 50000) / 20;
            if (store != null && store < REACTOR_STORE_EMERGENCY) score += 4000;
        } else if (!owner) {
            score += 2500;
        } else {
            score += 800;
        }

        if (score > bestScore) {
            bestScore = score;
            best = roomName;
        }
    }

    mem.targetReactor = best || undefined;
    // Terminals (and extractors) unlock at RCL 6. Prefer a feeder that can
    // receive empire Thorium; fall back only if nothing that high exists.
    mem.feederRoom = best ? (closestOwned(best, 6) || closestOwned(best, 4) || closestOwned(best, 1)) : undefined;
}

function ensureIntelStub(roomName) {
    if (typeof INTEL === 'undefined' || !roomName) return;
    if (!INTEL[roomName]) {
        INTEL[roomName] = {name: roomName, reactor: true, cached: Game.time};
    } else if (!INTEL[roomName].reactor) {
        INTEL[roomName].reactor = true;
    }
}

function setOperations() {
    const mem = getSeasonMemory();
    const target = mem.targetReactor;
    if (!target) return;

    ensureIntelStub(target);
    if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};

    const rec = (mem.reactors || {})[target] || {};
    const intel = (typeof INTEL !== 'undefined' && INTEL[target]) || {};
    const mine = !!(rec.my || intel.reactorMy);
    const store = rec.store != null ? rec.store : intel.reactorStore;
    const emergency = mine && store != null && store < REACTOR_STORE_EMERGENCY;
    const cap = reactorCapacity();
    const hungry = !mine || store == null || store < REACTOR_STORE_TARGET;
    // Extractors unlock at RCL 6. Haulers before that idle with empty stores.
    const canMine = (typeof MAX_LEVEL !== 'undefined' ? MAX_LEVEL : 0) >= 6;
    const armed = intel.armedHostile && (Game.time - intel.armedHostile < CREEP_LIFE_TIME);
    const hostile = !!(armed || (intel.threatLevel && intel.threatLevel > 0));

    Memory.auxiliaryTargets[target] = {
        tick: Game.time,
        type: 'reactor',
        priority: (emergency || hostile) ? PRIORITIES.urgent : PRIORITIES.high,
        claim: !mine,
        haulers: canMine ? (emergency ? 3 : (hungry ? 2 : 1)) : 0,
        // Standing longbow on claim and feed; duo if the room is contested.
        guards: hostile ? 2 : 1,
        feeder: mem.feederRoom,
        store: store,
        capacity: cap
    };

    // Old path wrote a targetRooms guard that spawnGlobal never queued
    // (aux reactor overwrites the same key). Drop leftover auto-guards so
    // they do not count against military op limits.
    const existing = Memory.targetRooms && Memory.targetRooms[target];
    if (existing && existing.type === 'guard' && !existing.manual && !existing.camping) {
        delete Memory.targetRooms[target];
    }
}

function run() {
    if (!isSeason()) return;

    const mem = getSeasonMemory();
    scanVisibleRooms();

    if (!mem.scanTick || mem.scanTick + SCAN_INTERVAL <= Game.time) {
        if (Game.cpu.bucket >= 50) pickTargetReactor();
        setOperations();
        mem.scanTick = Game.time;
    }
}

function planThoriumTransfers(transfers, profiles) {
    if (!isSeason() || !transfers || !profiles) return;
    const mem = Memory.season;
    const feeder = mem && mem.feederRoom;
    if (!feeder) return;
    const t = thoriumType();
    const dest = Game.rooms[feeder];
    if (!dest || !dest.terminal) return;
    const destFree = dest.terminal.store.getFreeCapacity(t);
    if (destFree < THORIUM_SEND_MIN) return;

    for (let i = 0; i < profiles.length; i++) {
        const name = profiles[i].name;
        if (name === feeder) continue;
        const room = Game.rooms[name];
        if (!room || !room.terminal) continue;
        const have = room.terminal.store[t] || 0;
        if (have < THORIUM_SEND_MIN) continue;
        const amount = Math.min(have, destFree, 5000);
        if (amount < THORIUM_SEND_MIN) continue;
        transfers.push({
            from: name,
            to: feeder,
            resource: t,
            amount,
            kind: 'urgent',
            score: 20000 + amount
        });
    }
}

function getFeederKeep(roomName) {
    const feeder = Memory.season && Memory.season.feederRoom;
    if (feeder && roomName === feeder) return FEEDER_KEEP;
    return 0;
}

profiler.registerFN(run, 'season.run');

module.exports = {
    run,
    isSeason,
    findReactors,
    planThoriumTransfers,
    getFeederKeep,
    thoriumType,
    reactorType,
    reactorCapacity,
    sectorCenterName,
    nearbySectorCenters,
    roomNorthValue,
    REACTOR_STORE_EMERGENCY,
    REACTOR_STORE_TARGET,
    FEEDER_KEEP
};
