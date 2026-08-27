/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Scoring, diplomacy, and siege launch helpers.

 */


function intelOwner(intel) {
    if (!intel) return undefined;
    return intel.owner || intel.user;
}


function warPriorityMap() {
    const map = {};
    if (typeof WAR_TARGETS === 'undefined' || !WAR_TARGETS) return map;
    for (let i = 0; i < WAR_TARGETS.length; i++) {
        const t = WAR_TARGETS[i];
        if (t && t.user) map[t.user] = t.priority;
    }
    return map;
}

function countActiveSieges() {
    const targets = Memory.targetRooms;
    if (!targets) return 0;
    let n = 0;
    for (const key in targets) {
        const op = targets[key];
        if (op && (op.type === 'roomDenial' || op.dDay)) n++;
    }
    return n;
}

/** Room-level gates for opening a roomDenial. Capacity and ring are planner-side. */
function roomDenialLaunchOk(intel) {
    if (!intel || !intel.owner || !intel.towers) return false;
    if (FRIENDLIES.includes(intel.owner)) return false;
    if (NO_DIRECT_ATTACKS.includes(intel.owner)) return false;
    if (intel.safemode > Game.time) return false;
    if (!siegeLevel(intel.towers)) return false;
    const crushNew = NEW_SPAWN_DENIAL && (intel.level || 0) <= 3;
    if (!crushNew && (intel.lastSiege || 0) + ATTACK_COOLDOWN >= Game.time) return false;
    return true;
}

const SIEGE_RING = 3;

function roomSiegeLaunchable(intel) {
    if (!roomDenialLaunchOk(intel)) return false;
    const crushNew = NEW_SPAWN_DENIAL && (intel.level || 0) <= 3;
    if (!crushNew && (intel.lastOperation || 0) + ATTACK_COOLDOWN >= Game.time) return false;
    return true;
}

function ownerSet(owners) {
    if (!owners) return null;
    if (typeof owners === 'string') return new Set([owners]);
    if (owners instanceof Set) return owners;
    if (Array.isArray(owners)) return new Set(owners);
    return null;
}

function warTargetUserSet() {
    const set = new Set();
    if (typeof WAR_TARGETS === 'undefined' || !WAR_TARGETS) return set;
    for (let i = 0; i < WAR_TARGETS.length; i++) {
        const t = WAR_TARGETS[i];
        if (t && t.user) set.add(t.user);
    }
    return set;
}

function minEmpireDist(owners) {
    if (typeof INTEL === 'undefined') return Infinity;
    const set = ownerSet(owners);
    let min = Infinity;
    for (const name in INTEL) {
        const r = INTEL[name];
        if (!r || !r.owner) continue;
        if (set && !set.has(r.owner)) continue;
        const d = empireDistance(name);
        if (Number.isFinite(d) && d < min) min = d;
    }
    return min;
}

function ownerMinEmpireDist(owner) {
    return minEmpireDist(owner);
}

function inSiegeRing(roomName, dMin) {
    if (!Number.isFinite(dMin)) return true;
    const d = empireDistance(roomName);
    return Number.isFinite(d) && d <= dMin + SIEGE_RING;
}

function listAutoSieges(owners) {
    const out = [];
    const targets = Memory.targetRooms;
    if (!targets) return out;
    const set = ownerSet(owners);
    for (const key in targets) {
        const op = targets[key];
        if (!op || op.manual || op.type !== 'roomDenial') continue;
        const intel = typeof INTEL !== 'undefined' ? INTEL[key] : null;
        if (set && (!intel || !set.has(intel.owner))) continue;
        out.push({key, op, dist: empireDistance(key)});
    }
    return out;
}

function ringHasActiveSiege(owners, dMin) {
    const cap = dMin + SIEGE_RING;
    const sieges = listAutoSieges(owners);
    for (let i = 0; i < sieges.length; i++) {
        if (sieges[i].dist <= cap) return true;
    }
    return false;
}

function ringHasLaunchable(owners, dMin) {
    if (typeof INTEL === 'undefined') return false;
    const cap = dMin + SIEGE_RING;
    const set = ownerSet(owners);
    for (const name in INTEL) {
        const r = INTEL[name];
        if (!r || !r.owner || !r.name) continue;
        if (set && !set.has(r.owner)) continue;
        if (Memory.targetRooms && Memory.targetRooms[r.name]) continue;
        const d = empireDistance(r.name);
        if (!(d <= cap)) continue;
        if (roomSiegeLaunchable(r)) return true;
    }
    return false;
}

function countStretchSieges(owners, dMin) {
    const cap = dMin + SIEGE_RING;
    const sieges = listAutoSieges(owners);
    let n = 0;
    for (let i = 0; i < sieges.length; i++) {
        if (sieges[i].dist > cap) n++;
    }
    return n;
}

function allowSiegeStretch(owners, dMin) {
    if (!Number.isFinite(dMin)) return false;
    const set = ownerSet(owners);
    if (!set || !set.size) return false;
    if (ringHasActiveSiege(set, dMin) || ringHasLaunchable(set, dMin)) return false;
    return countStretchSieges(set, dMin) < 1;
}

function isClosestStretchDest(intel, dMin, owners) {
    if (!intel || !intel.name || !intel.owner) return false;
    const cap = dMin + SIEGE_RING;
    const d = empireDistance(intel.name);
    if (!(d > cap)) return false;
    const set = ownerSet(owners);
    for (const name in INTEL) {
        const r = INTEL[name];
        if (!r || !r.owner || !r.name || r.name === intel.name) continue;
        if (set && !set.has(r.owner)) continue;
        if (Memory.targetRooms && Memory.targetRooms[r.name]) continue;
        const rd = empireDistance(r.name);
        if (!(rd > cap) || rd >= d) continue;
        if (roomSiegeLaunchable(r)) return false;
    }
    return true;
}

function siegeLaunchAllowed(intel) {
    if (!roomDenialLaunchOk(intel) || !intel.name) return false;
    const warUsers = warTargetUserSet();
    if (intel.owner && !warUsers.has(intel.owner)) return false;
    const dMin = minEmpireDist(warUsers);
    if (!Number.isFinite(dMin) || inSiegeRing(intel.name, dMin)) return true;
    return allowSiegeStretch(warUsers, dMin) && isClosestStretchDest(intel, dMin, warUsers);
}

function scoreOriginMinLevel(type, intel) {
    if (type === 'stronghold') return 7;
    if (type === 'roomDenial') {
        const towers = (intel && intel.towers) || 0;
        return towers >= 2 ? 7 : 6;
    }
    if (type === 'guard' || type === 'remoteDenial') {
        if (typeof MAX_LEVEL === 'undefined') return 4;
        return Math.max(4, MAX_LEVEL - 1);
    }
    return 1;
}

function scoreOriginDistance(roomName, type) {
    return empireDistance(roomName);
}

function scoreTarget(roomName, type) {
    const r = INTEL[roomName];
    if (!r) return Infinity;

    let score = 0;
    // Rank by Manhattan hops to the empire centroid. Rooms only connect
    // N/E/S/W, so Chebyshev (linear) distance skipped cardinally-closer dests.
    const distance = scoreOriginDistance(roomName, type);

    score += distance * 200;

    if (THREATS.includes(r.owner)) score -= 200;
    if (type === 'roomDenial') {
        score += (r.level || 0) * 10 + (r.towers || 0) * 100;
        // Prefer brittle siege targets. Curve spans real-world rampart depths:
        // 30M = +9, 100M = +30, 300M = +90 (cap). Among siegeable rooms, picks the thinner one.
        if (r.rampartMedHP) {
            score += Math.min(r.rampartMedHP / 10000000, 30) * 3;
        }
    } else {
        score += (r.level || 0) * 30 + (r.towers || 0) * 100;
    }

    // Strength gap × distance — strong distant targets become very unattractive,
    // strong close targets stay viable (they're real neighbors we need to manage).
    const strengthGap = userStrength(r.owner) - (global.MY_STRENGTH || MAX_LEVEL);
    if (strengthGap > 0) score += strengthGap * distance * 8;

    if (HOLD_SECTOR && myRoomInSectorCheck(roomName)) score -= 150;
    score += Math.max(0, (Game.time - (r.cached || 0)) / 100);

    return score;
}


function getAllianceData() {
    if (typeof ALLIANCE_DATA === 'undefined' || !ALLIANCE_DATA) return null;
    if (typeof ALLIANCE_DATA === 'object') return ALLIANCE_DATA;
    try {
        return JSON.parse(ALLIANCE_DATA);
    } catch (e) {
        return null;
    }
}

function checkForNap(user) {
    if (!user || !global.LOAN_CHECK || !ALLIANCE_DATA) return false;
    if (ENEMIES && ENEMIES.includes(user)) return false;
    const avoidAll = !!AVOID_ATTACKING_ALLIANCES;
    if (!avoidAll && !(NAP_ALLIANCE && NAP_ALLIANCE.length)) return false;

    const LOANData = getAllianceData();
    if (!LOANData) return false;

    const keys = Object.keys(LOANData);
    for (let i = 0; i < keys.length; i++) {
        const allianceKey = keys[i];
        if (!avoidAll && !NAP_ALLIANCE.includes(allianceKey)) continue;
        const members = LOANData[allianceKey];
        if (Array.isArray(members) && members.includes(user)) return true;
    }
    return false;
}

function empirePriority(range) {
    const dist = Number.isFinite(range) ? range : 20;
    let p = PRIORITIES.priority + dist * 0.75;
    if (p > PRIORITIES.secondary) p = PRIORITIES.secondary;
    return Math.round(p * 10) / 10;
}

function getPriority(room, type) {
    return empirePriority(scoreOriginDistance(room, type));
}


function siegeLevel(towerCount) {
    if (towerCount >= 3) return MAX_LEVEL >= 8;
    if (towerCount >= 2) return MAX_LEVEL >= 7;
    return MAX_LEVEL >= 6;
}

function siegeOpLevel(towerCount) {
    const n = towerCount || 0;
    if (n >= 3) return 4;
    if (n === 2) return 3;
    if (n === 1) return 2;
    return 1;
}

// Strongholds: 1-tower at RCL 6+, 2–3 towers only at RCL 8. Four-plus is a
// different fight and is not opened automatically.
function strongholdSiegeLevel(towerCount) {
    const n = towerCount || 0;
    if (n < 1 || n > 3) return false;
    if (n >= 2) return MAX_LEVEL >= 8;
    return MAX_LEVEL >= 6;
}

/** World already grouped these this tick. Fallback walks Game.creeps only if World is missing. */
function getMilitaryCreeps() {
    const world = typeof global !== 'undefined' ? global.world : null;
    if (world && world.militaryCreeps) return world.militaryCreeps;
    const out = [];
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (c.my && (c.memory.military || !c.memory.colony)) out.push(c);
    }
    return out;
}

// Screeps world coords: W0 is adjacent to E0 (x = -1), N0 adjacent to S0 (y = -1).
const EMPIRE_CENTER_TTL = 3000;
const RCL8_ENERGY_CAPACITY = 12900;

function roomNameToWorld(name) {
    if (!name) return null;
    const m = /^([WE])(\d+)([NS])(\d+)$/.exec(name);
    if (!m) return null;
    let x = m[2] | 0;
    let y = m[4] | 0;
    if (m[1] === 'W') x = -x - 1;
    if (m[3] === 'N') y = -y - 1;
    return {x, y};
}

function ownedSpawnCounts() {
    const counts = {};
    for (const id in Game.spawns) {
        const s = Game.spawns[id];
        if (!s || !s.my) continue;
        const n = (s.room && s.room.name) || (s.pos && s.pos.roomName);
        if (!n) continue;
        counts[n] = (counts[n] || 0) + 1;
    }
    return counts;
}

// RCL is the base. Room power (spawns × energyCapacity vs a full RCL8 hub)
// scales it so a 3-spawn military room pulls harder than a same-RCL outpost.
function empireRoomWeight(room, spawnCount) {
    const rcl = (room.controller && room.controller.level) || room.level || 1;
    let spawns = spawnCount;
    if (spawns == null) {
        spawns = (room.spawns && room.spawns.length) || 0;
    }
    const cap = room.energyCapacityAvailable || 0;
    const roomPower = Math.max(1, spawns) * (1 + cap / RCL8_ENERGY_CAPACITY);
    return Math.max(1, rcl * roomPower);
}

function intelRoomWeight(intel) {
    const rcl = (intel && intel.level) || 1;
    const spawns = (intel && intel.spawns) || 1;
    return Math.max(1, rcl * Math.max(1, spawns));
}

function ownedRoomKey(names) {
    if (!names || !names.length) return '';
    const copy = names.slice();
    copy.sort();
    return copy.join(',');
}

function refreshEmpireCenter(force) {
    const names = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) || [];
    const key = ownedRoomKey(names);
    const mem = Memory.empireCenter;
    if (!force && mem && mem.tick != null && mem.key === key
        && Game.time - mem.tick < EMPIRE_CENTER_TTL) {
        return mem;
    }

    if (!names.length) {
        Memory.empireCenter = {x: 0, y: 0, room: null, tick: Game.time, weight: 0, key: ''};
        return Memory.empireCenter;
    }

    const spawns = ownedSpawnCounts();
    let sumX = 0;
    let sumY = 0;
    let sumW = 0;
    const coords = [];
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const xy = roomNameToWorld(name);
        if (!xy) continue;
        const room = Game.rooms[name];
        const weight = room
            ? empireRoomWeight(room, spawns[name] || 0)
            : intelRoomWeight(typeof INTEL !== 'undefined' ? INTEL[name] : null);
        sumX += xy.x * weight;
        sumY += xy.y * weight;
        sumW += weight;
        coords.push({name, xy});
    }

    if (!sumW) {
        Memory.empireCenter = {x: 0, y: 0, room: names[0], tick: Game.time, weight: 0, key};
        return Memory.empireCenter;
    }

    const x = sumX / sumW;
    const y = sumY / sumW;
    let nearest = coords[0].name;
    let nearestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        const d = Math.abs(c.xy.x - x) + Math.abs(c.xy.y - y);
        if (d < nearestD) {
            nearestD = d;
            nearest = c.name;
        }
    }

    const prevRoom = mem && mem.room;
    Memory.empireCenter = {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        room: nearest,
        tick: Game.time,
        weight: Math.round(sumW * 10) / 10,
        key,
    };
    if (prevRoom !== nearest && typeof log !== 'undefined' && log.a) {
        const label = (typeof roomLink === 'function') ? roomLink(nearest) : nearest;
        log.a(`Empire center is ${label}.`, 'HIGH COMMAND: ');
    }
    return Memory.empireCenter;
}

function getEmpireCenter() {
    if (Memory.empireCenter && Memory.empireCenter.tick != null) return Memory.empireCenter;
    return refreshEmpireCenter(true);
}

function closestOwnedManhattan(roomName) {
    const xy = roomNameToWorld(roomName);
    const names = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) || [];
    if (!xy || !names.length) return Infinity;
    let min = Infinity;
    for (let i = 0; i < names.length; i++) {
        const o = roomNameToWorld(names[i]);
        if (!o) continue;
        const d = Math.abs(xy.x - o.x) + Math.abs(xy.y - o.y);
        if (d < min) min = d;
    }
    return min;
}

// Rooms only connect via N/E/S/W exits, so hops from the centroid are
// Manhattan (|dx|+|dy|). Chebyshev (linear) treated a (3,3) diagonal as
// closer than a (4,0) cardinal even though the cardinal is 2 hops nearer.
function empireDistance(roomName) {
    const center = getEmpireCenter();
    const xy = roomNameToWorld(roomName);
    if (!center || !xy || !center.weight) return closestOwnedManhattan(roomName);
    return Math.abs(xy.x - center.x) + Math.abs(xy.y - center.y);
}

function empireLinearDistance(roomName) {
    return empireDistance(roomName);
}

if (typeof global !== 'undefined') {
    global.empireCenter = function (force) {
        const c = refreshEmpireCenter(!!force);
        if (!c || !c.weight) {
            console.log('Empire center: no owned rooms');
            return c;
        }
        console.log(`Empire center: ${c.room}  world (${c.x}, ${c.y})  weight ${c.weight}  age ${Game.time - c.tick}`);
        return c;
    };
}

module.exports = {

    intelOwner,

    getMilitaryCreeps,

    roomDenialLaunchOk,

    countActiveSieges,

    warPriorityMap,

    scoreTarget,

    checkForNap,

    getPriority,

    siegeLevel,

    siegeOpLevel,

    scoreOriginMinLevel,

    scoreOriginDistance,

    empirePriority,

    strongholdSiegeLevel,

    roomNameToWorld,

    refreshEmpireCenter,

    getEmpireCenter,

    empireDistance,

    empireLinearDistance,

    SIEGE_RING,

    minEmpireDist,

    ownerMinEmpireDist,

    inSiegeRing,

    allowSiegeStretch,

    siegeLaunchAllowed,

    listAutoSieges,

    warTargetUserSet,

};