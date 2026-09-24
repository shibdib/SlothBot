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
const ABANDON_COOLDOWN = 300;
const CLAIMER_LOG_MAX = 80;
const CLAIMER_STUCK_TICKS = 40;
const CLAIMER_EMAIL_EVENTS = {
    gone: 1, suicide: 1, abort: 1, recycle: 1, stuck: 1,
    claim: 1, noReactor: 1, noFn: 1
};

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
    const tryFind = (fn) => {
        try {
            const found = fn();
            return found && found.length ? found : null;
        } catch (e) {
            return null;
        }
    };
    const byConst = tryFind(() => {
        const c = typeof FIND_REACTORS !== 'undefined' ? FIND_REACTORS : 10051;
        return room.find(c);
    });
    if (byConst) return byConst;
    const look = typeof LOOK_REACTORS !== 'undefined' ? LOOK_REACTORS : 'reactor';
    const byLook = tryFind(() => {
        const hits = room.lookForAtArea(look, 0, 0, 49, 49, true) || [];
        const out = [];
        for (let i = 0; i < hits.length; i++) {
            const obj = hits[i][look] || hits[i].reactor;
            if (obj) out.push(obj);
        }
        return out;
    });
    if (byLook) return byLook;
    const type = reactorType();
    if (room.structures) {
        const fromStruct = room.structures.filter(s => s.structureType === type);
        if (fromStruct.length) return fromStruct;
    }
    if (room.reactor) return [room.reactor];
    return [];
}

function reactorPos(roomName) {
    const rec = Memory.season && Memory.season.reactors && Memory.season.reactors[roomName];
    if (rec && rec.x != null && rec.y != null) return new RoomPosition(rec.x, rec.y, roomName);
    return new RoomPosition(25, 25, roomName);
}

function errName(code) {
    if (code === OK) return 'OK';
    if (code === ERR_NOT_OWNER) return 'ERR_NOT_OWNER';
    if (code === ERR_BUSY) return 'ERR_BUSY';
    if (code === ERR_INVALID_TARGET) return 'ERR_INVALID_TARGET';
    if (code === ERR_NOT_IN_RANGE) return 'ERR_NOT_IN_RANGE';
    if (code === ERR_NO_BODYPART) return 'ERR_NO_BODYPART';
    if (code === ERR_TIRED) return 'ERR_TIRED';
    return String(code);
}

function nearbyThreatNote(room, x, y) {
    if (!room || x == null) return '';
    const bits = [];
    if (room.invaderCore) bits.push('core');
    const creeps = room.creeps || [];
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        const owner = c.owner && c.owner.username;
        if (!owner || owner === MY_USERNAME) continue;
        if (Math.max(Math.abs(c.pos.x - x), Math.abs(c.pos.y - y)) > 5) continue;
        bits.push(owner + '@' + c.pos.x + ',' + c.pos.y);
    }
    return bits.join(',');
}

function claimerNote(creep, event, extra) {
    extra = extra || {};
    const mem = getSeasonMemory();
    if (!mem.claimerLog) mem.claimerLog = [];
    const rec = {
        t: Game.time,
        e: event,
        n: (creep && creep.name) || extra.n,
        r: (creep && creep.room && creep.room.name) || extra.r,
        x: creep && creep.pos ? creep.pos.x : extra.x,
        y: creep && creep.pos ? creep.pos.y : extra.y,
        ttl: creep ? creep.ticksToLive : extra.ttl,
        hp: creep ? creep.hits : extra.hp,
        dest: (creep && creep.memory && creep.memory.destination) || extra.dest
    };
    for (const k in extra) {
        if (rec[k] === undefined) rec[k] = extra[k];
    }
    mem.claimerLog.push(rec);
    if (mem.claimerLog.length > CLAIMER_LOG_MAX) {
        mem.claimerLog.splice(0, mem.claimerLog.length - CLAIMER_LOG_MAX);
    }
    const loc = (typeof roomLink === 'function' && rec.r) ? roomLink(rec.r) : (rec.r || '?');
    const bits = [
        rec.n || '?',
        event,
        loc,
        rec.x != null ? (rec.x + ',' + rec.y) : '',
        rec.ttl != null ? ('ttl=' + rec.ttl) : '',
        rec.hp != null ? ('hp=' + rec.hp) : '',
        rec.dest ? ('dest=' + rec.dest) : '',
        extra.msg || extra.how || extra.code || extra.threat || ''
    ].filter(Boolean);
    const line = bits.join(' ');
    if (typeof log !== 'undefined' && log.a) log.a(line, 'RX:');
    if (CLAIMER_EMAIL_EVENTS[event] && typeof Game !== 'undefined' && Game.notify) {
        Game.notify('RX ' + line, 30);
    }
    return rec;
}

function trackClaimers() {
    const mem = getSeasonMemory();
    if (!mem.claimerWatch) mem.claimerWatch = {};
    const live = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory || c.memory.role !== 'reactorClaimer') continue;
        live[name] = true;
        const prev = mem.claimerWatch[name];
        const roomChanged = !!(prev && prev.room && prev.room !== c.room.name);
        if (!prev) {
            const parts = [];
            if (c.body) {
                for (let i = 0; i < c.body.length; i++) parts.push(c.body[i].type[0]);
            }
            claimerNote(c, 'spawn', {
                colony: c.memory.colony,
                body: parts.join(''),
                spawning: !!c.spawning
            });
        } else if (roomChanged) {
            const intel = typeof INTEL !== 'undefined' ? INTEL[c.room.name] : undefined;
            claimerNote(c, 'room', {
                from: prev.room,
                sk: !!(intel && intel.sk),
                threat: nearbyThreatNote(c.room, c.pos.x, c.pos.y)
            });
        } else if (c.memory.destination && c.room.name !== c.memory.destination) {
            const stuck = (prev.stuck || 0) + 1;
            if (stuck === CLAIMER_STUCK_TICKS) {
                claimerNote(c, 'stuck', {
                    threat: nearbyThreatNote(c.room, c.pos.x, c.pos.y),
                    msg: 'same room ' + CLAIMER_STUCK_TICKS + 't'
                });
            }
            if (prev) prev.stuck = stuck;
        }
        mem.claimerWatch[name] = {
            room: c.room.name,
            x: c.pos.x,
            y: c.pos.y,
            ttl: c.ticksToLive,
            hp: c.hits,
            dest: c.memory.destination,
            tick: Game.time,
            stuck: (!prev || roomChanged) ? 0 : (prev.stuck || 0)
        };
    }
    for (const name in mem.claimerWatch) {
        if (live[name]) continue;
        const last = mem.claimerWatch[name];
        let how = 'missing';
        if (last && last.ttl != null && last.ttl <= 2) how = 'aged';
        const vis = last && last.room && Game.rooms[last.room];
        if (vis) {
            try {
                const tombs = vis.find(FIND_TOMBSTONES) || [];
                for (let i = 0; i < tombs.length; i++) {
                    const creep = tombs[i].creep;
                    if (creep && creep.name === name) {
                        how = last && last.ttl <= 2 ? 'aged-tomb' : 'tomb';
                        last.hp = creep.hits;
                        break;
                    }
                }
            } catch (e) { /* find can throw off-vision */
            }
        }
        claimerNote(null, 'gone', {
            n: name,
            r: last && last.room,
            x: last && last.x,
            y: last && last.y,
            ttl: last && last.ttl,
            hp: last && last.hp,
            dest: last && last.dest,
            how,
            threat: vis ? nearbyThreatNote(vis, last.x, last.y) : '',
            msg: how
        });
        delete mem.claimerWatch[name];
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

        stampThoriumIntel(room, intel);

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
    const hungry = store == null || store < REACTOR_STORE_TARGET;
    // Extractors unlock at RCL 6. Haulers before that idle with empty stores.
    const canMine = (typeof MAX_LEVEL !== 'undefined' ? MAX_LEVEL : 0) >= 6;
    const armed = intel.armedHostile && (Game.time - intel.armedHostile < CREEP_LIFE_TIME);
    const hostile = !!(armed || (intel.threatLevel && intel.threatLevel > 0));

    const prev = Memory.auxiliaryTargets[target];
    Memory.auxiliaryTargets[target] = {
        tick: Game.time,
        type: 'reactor',
        // PRIORITIES.high (6) sat behind remotes (4) and then *6 as siege.
        // Feed needs to actually leave the spawn at RCL 6.
        priority: PRIORITIES.priority,
        claim: !mine,
        haulers: (mine && canMine) ? (emergency ? 3 : (hungry ? 2 : 1)) : 0,
        // Standing longbow on claim and feed; duo if the room is contested.
        guards: hostile ? 2 : 1,
        feeder: mem.feederRoom,
        store: store,
        capacity: cap
    };
    if (prev && prev.type === 'reactor') {
        if (prev.assignedRoom) Memory.auxiliaryTargets[target].assignedRoom = prev.assignedRoom;
        if (prev.assignedAt) Memory.auxiliaryTargets[target].assignedAt = prev.assignedAt;
    }

    // Old path wrote a targetRooms guard that spawnGlobal never queued
    // (aux reactor overwrites the same key). Drop leftover auto-guards so
    // they do not count against military op limits.
    const existing = Memory.targetRooms && Memory.targetRooms[target];
    if (existing && existing.type === 'guard' && !existing.manual && !existing.camping) {
        delete Memory.targetRooms[target];
    }
}

function seasonHubCount(gcl, ownedCount) {
    if (ownedCount <= 0) return 0;
    if (gcl <= 1 || ownedCount === 1) return 1;
    const want = gcl >= 6 ? 3 : 2;
    return Math.min(ownedCount, gcl, want);
}

function hubScore(room, reactor) {
    const rcl = (room.controller && room.controller.level) || room.level || 0;
    let score = rcl * 1000 + roomNorthValue(room.name) * 50;
    if (room.terminal) score += 800;
    if (room.storage) score += 400;
    if (rcl >= 7) score += 200;
    if (reactor) {
        const dist = Game.map.getRoomLinearDistance(room.name, reactor);
        if (Number.isFinite(dist)) score -= dist * 80;
    }
    return score;
}

function classifySeasonRooms() {
    const mem = getSeasonMemory();
    const owned = typeof MY_ROOMS !== 'undefined' ? MY_ROOMS.slice() : [];
    const gcl = (Game.gcl && Game.gcl.level) || owned.length;
    const hubN = seasonHubCount(gcl, owned.length);
    const reactor = mem.targetReactor;
    const ranked = [];
    for (let i = 0; i < owned.length; i++) {
        const room = Game.rooms[owned[i]];
        if (!room || !room.controller || !room.controller.my) continue;
        ranked.push({name: owned[i], score: hubScore(room, reactor)});
    }
    ranked.sort((a, b) => b.score - a.score);
    const hubs = [];
    for (let i = 0; i < ranked.length && hubs.length < hubN; i++) hubs.push(ranked[i].name);
    const harvest = [];
    for (let i = 0; i < ranked.length; i++) {
        if (hubs.indexOf(ranked[i].name) === -1) harvest.push(ranked[i].name);
    }
    mem.hubs = hubs;
    mem.harvest = harvest;
    mem.hubCount = hubN;
    let feeder;
    if (reactor) {
        let bestD = Infinity;
        for (let i = 0; i < hubs.length; i++) {
            const room = Game.rooms[hubs[i]];
            if (!room || !room.terminal) continue;
            const d = Game.map.getRoomLinearDistance(hubs[i], reactor);
            if (d < bestD) {
                bestD = d;
                feeder = hubs[i];
            }
        }
    }
    if (!feeder) {
        for (let i = 0; i < hubs.length; i++) {
            const room = Game.rooms[hubs[i]];
            if (room && room.terminal) {
                feeder = hubs[i];
                break;
            }
        }
    }
    mem.feederRoom = feeder
        || (reactor ? (closestOwned(reactor, 6) || closestOwned(reactor, 4) || closestOwned(reactor, 1)) : undefined);
}

function roomThoriumStored(room) {
    const t = thoriumType();
    let n = 0;
    if (room.storage) n += room.storage.store[t] || 0;
    if (room.terminal) n += room.terminal.store[t] || 0;
    const containers = room.containers || [];
    for (let i = 0; i < containers.length; i++) n += containers[i].store[t] || 0;
    const drops = room.find(FIND_DROPPED_RESOURCES) || [];
    for (let i = 0; i < drops.length; i++) {
        if (drops[i].resourceType === t) n += drops[i].amount || 0;
    }
    return n;
}

function colonyCarryingThorium(roomName) {
    const t = thoriumType();
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.store) continue;
        if ((c.store[t] || 0) <= 0) continue;
        if (c.memory.colony === roomName || c.room.name === roomName) return true;
    }
    return false;
}

function harvestRoomDry(room) {
    const intel = typeof INTEL !== 'undefined' ? INTEL[room.name] : undefined;
    if (!intel || intel.thoriumAmount == null) return false;
    if (intel.thoriumAmount > 0) return false;
    const node = room.thorium;
    if (node && node.mineralAmount > 0) return false;
    if (roomThoriumStored(room) > 0) return false;
    if (colonyCarryingThorium(room.name)) return false;
    return true;
}

function maybeAbandonDepleted() {
    const mem = getSeasonMemory();
    if ((mem.lastAbandon || 0) + ABANDON_COOLDOWN > Game.time) return;
    if (Game.cpu.bucket != null && Game.cpu.bucket < 500) return;
    const hubs = mem.hubs || [];
    const harvest = mem.harvest || [];
    if (!harvest.length) return;
    const owned = typeof MY_ROOMS !== 'undefined' ? MY_ROOMS.length : 0;
    const hubN = mem.hubCount || 2;
    if (owned <= hubN) return;

    for (let i = 0; i < harvest.length; i++) {
        const room = Game.rooms[harvest[i]];
        if (!room || !room.controller || !room.controller.my) continue;
        if (hubs.indexOf(room.name) !== -1) continue;
        if (room.controller.safeMode) continue;
        if (room.hostileCreeps && room.hostileCreeps.length) continue;
        if (!harvestRoomDry(room)) continue;
        log.a(`${roomLink(room.name)} thorium gone — unclaiming harvest room (hubs ${hubs.join(',')})`, 'SEASON:');
        if (typeof abandonRoom === 'function') abandonRoom(room, true);
        mem.lastAbandon = Game.time;
        return;
    }
}

function shouldStarveHubUpgraders(room) {
    if (!isSeason() || !room || !room.controller) return false;
    const mem = Memory.season;
    if (!mem || !mem.hubs || mem.hubs.indexOf(room.name) === -1) return false;
    if (room.controller.level < 6) return false;
    const owned = typeof MY_ROOMS !== 'undefined' ? MY_ROOMS : [];
    for (let i = 0; i < owned.length; i++) {
        if (owned[i] === room.name) continue;
        const other = Game.rooms[owned[i]];
        if (!other || !other.controller || !other.controller.my) continue;
        if (other.controller.level >= 6) continue;
        const amt = (typeof INTEL !== 'undefined' && INTEL[owned[i]] && INTEL[owned[i]].thoriumAmount);
        const node = other.thorium && other.thorium.mineralAmount;
        if ((amt != null && amt > 0) || (node > 0)) return true;
    }
    return false;
}

function isSeasonHub(roomName) {
    const hubs = Memory.season && Memory.season.hubs;
    return !!(hubs && hubs.indexOf(roomName) !== -1);
}

function seasonForceClaimOk(roomName) {
    if (!isSeason() || !roomName) return true;
    const intel = typeof INTEL !== 'undefined' ? INTEL[roomName] : undefined;
    if (intel && intel.thoriumAmount === 0) return false;
    return true;
}

function run() {
    if (!isSeason()) return;

    const mem = getSeasonMemory();
    scanVisibleRooms();
    trackClaimers();

    if (!mem.scanTick || mem.scanTick + SCAN_INTERVAL <= Game.time) {
        if (Game.cpu.bucket >= 50) pickTargetReactor();
        classifySeasonRooms();
        setOperations();
        maybeAbandonDepleted();
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

/**
 * Persist remaining Thorium on INTEL. `null`/missing = never observed;
 * `0` = looked and the deposit is gone. Claim scoring must not treat
 * unknown as empty.
 */
function stampThoriumIntel(room, intel) {
    if (!isSeason() || !room || !intel) return intel;
    const t = thoriumType();
    let amount = 0;
    const thorium = room.thorium;
    if (thorium) amount = thorium.mineralAmount || 0;
    else {
        const minerals = room.find(FIND_MINERALS) || [];
        for (let i = 0; i < minerals.length; i++) {
            if (minerals[i].mineralType === t) amount += minerals[i].mineralAmount || 0;
        }
    }
    intel.thoriumAmount = amount;
    return intel;
}

function isPossibleClaimIntel(intel) {
    if (!intel || intel.owner) return false;
    if (intel.obstacles) return false;
    return !!(intel.hubCheck || intel.sources === 2);
}

function needsThoriumIntel(intel) {
    if (!isSeason()) return false;
    if (!intel) return true;
    if (intel.thoriumAmount != null) return false;
    return isPossibleClaimIntel(intel);
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
    reactorPos,
    claimerNote,
    errName,
    planThoriumTransfers,
    getFeederKeep,
    shouldStarveHubUpgraders,
    isSeasonHub,
    seasonForceClaimOk,
    seasonHubCount,
    stampThoriumIntel,
    needsThoriumIntel,
    isPossibleClaimIntel,
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
