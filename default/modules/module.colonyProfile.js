/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Owned-room roles for logistics: core, frontier, launch, outpost.
 * Frontier is the border. Launch is a thinned set of combat pads (one per
 * hostile contact / hot outpost), never every hull room.
 * Geography (hull + hostile range + pressure) is sticky; capability is not.
 */

const {roomNameToWorld} = require('hcUtils');
const profiler = require('tools.profiler');

const ROLE_STICKY = CREEP_LIFE_TIME;
const RECOMPUTE_TTL = 50;
const HOSTILE_HOP_CAP = 8;
const FRONTIER_HOPS = 3;
const OWNED_GRAPH_RANGE = 3;
const CONTACT_RANGE = 6;
const PRESSURE_FRONTIER = 15;
const SIGHTING_WINDOW = 2000;
const LAUNCH_ENERGY_MULT = 1.25;
const FRONTIER_ENERGY_MULT = 1.15;

const ROLES = {
    core: 'core',
    frontier: 'frontier',
    launch: 'launch',
    outpost: 'outpost',
};

const VALID_ROLES = new Set([ROLES.core, ROLES.frontier, ROLES.launch, ROLES.outpost]);

let cache = {tick: -1, computedAt: -1, roomKey: '', profiles: {}};

function ownedNames() {
    return (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) || [];
}

function ownedKey(names) {
    if (!names || !names.length) return '';
    const copy = names.slice();
    copy.sort();
    return copy.join(',');
}

function isFriendlyUser(user) {
    if (!user) return true;
    if (typeof MY_USERNAME !== 'undefined' && user === MY_USERNAME) return true;
    return typeof FRIENDLIES !== 'undefined' && FRIENDLIES.includes(user);
}

function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points) {
    if (points.length <= 2) return points.slice();
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function minHostileHops(start) {
    const intelAll = typeof INTEL !== 'undefined' ? INTEL : null;
    const seen = {[start]: true};
    let frontier = [start];
    for (let hops = 1; hops <= HOSTILE_HOP_CAP; hops++) {
        const next = [];
        for (let i = 0; i < frontier.length; i++) {
            const exits = Game.map.describeExits(frontier[i]);
            if (!exits) continue;
            const neighbors = Object.values(exits);
            for (let j = 0; j < neighbors.length; j++) {
                const n = neighbors[j];
                if (seen[n]) continue;
                seen[n] = true;
                const intel = intelAll && intelAll[n];
                if (intel && intel.owner && !isFriendlyUser(intel.owner)) return hops;
                next.push(n);
            }
        }
        if (!next.length) break;
        frontier = next;
    }
    return Infinity;
}

function remotePressure(roomName, now) {
    const targets = typeof ROOM_REMOTE_TARGETS !== 'undefined' ? ROOM_REMOTE_TARGETS[roomName] : null;
    if (!targets || !targets.length) return 0;
    const intelAll = typeof INTEL !== 'undefined' ? INTEL : null;
    if (!intelAll) return 0;
    let pressure = 0;
    const seen = {};
    for (let i = 0; i < targets.length; i++) {
        const remoteName = targets[i] && targets[i].room;
        if (!remoteName || seen[remoteName]) continue;
        seen[remoteName] = true;
        const intel = intelAll[remoteName];
        if (!intel) continue;
        if (intel.threatLevel >= 3) pressure += 10;
        if (intel.lastPlayerSighting && now - intel.lastPlayerSighting < SIGHTING_WINDOW) pressure += 10;
    }
    return pressure;
}

function roomPressure(roomName, hostileHops, now) {
    const intel = typeof INTEL !== 'undefined' ? INTEL[roomName] : null;
    let pressure = 0;
    if (intel) {
        if (intel.threatLevel) pressure += intel.threatLevel * 10;
        if (intel.lastPlayerSighting && now - intel.lastPlayerSighting < SIGHTING_WINDOW) pressure += 20;
        if (intel.lastMajorAttack && now - intel.lastMajorAttack < SIGHTING_WINDOW) pressure += 15;
    }
    if (hostileHops <= 1) pressure += 30;
    else if (hostileHops <= 2) pressure += 15;
    else if (hostileHops <= 3) pressure += 5;
    pressure += remotePressure(roomName, now);
    return pressure;
}

function isLaunchCapable(room) {
    if (!room || !room.controller) return false;
    if ((room.level || 0) < 6) return false;
    if (!room.terminal) return false;
    const labs = room.labs;
    return !!(labs && labs.length);
}

function isHot(info) {
    return !!(info && (info.hops <= FRONTIER_HOPS || info.pressure >= PRESSURE_FRONTIER));
}

function spawnCount(name) {
    const room = Game.rooms[name];
    return room && room.spawns ? room.spawns.length : 0;
}

function roomLevel(name) {
    const room = Game.rooms[name];
    return room ? (room.level || 0) : 0;
}

function hopsValue(info) {
    return Number.isFinite(info && info.hops) ? info.hops : 99;
}

/** Lower hops, then higher pressure/RCL/spawns. Deterministic name tie-break. */
function betterLaunchPad(a, b, raw) {
    if (!b) return true;
    if (!a) return false;
    const ia = raw[a];
    const ib = raw[b];
    const ha = hopsValue(ia);
    const hb = hopsValue(ib);
    if (ha !== hb) return ha < hb;
    const pa = (ia && ia.pressure) || 0;
    const pb = (ib && ib.pressure) || 0;
    if (pa !== pb) return pa > pb;
    const rcla = roomLevel(a);
    const rclb = roomLevel(b);
    if (rcla !== rclb) return rcla > rclb;
    const sa = spawnCount(a);
    const sb = spawnCount(b);
    if (sa !== sb) return sa > sb;
    return a < b;
}

function pickBestPad(candidates, raw) {
    let best = null;
    for (let i = 0; i < candidates.length; i++) {
        const name = candidates[i];
        if (!raw[name] || !raw[name].capable) continue;
        if (!best || betterLaunchPad(name, best, raw)) best = name;
    }
    return best;
}

function collectHostileContacts() {
    const out = [];
    if (typeof INTEL === 'undefined' || !INTEL) return out;
    for (const name in INTEL) {
        const intel = INTEL[name];
        if (!intel || !intel.owner) continue;
        if (isFriendlyUser(intel.owner)) continue;
        const observed = intel.lastObservation || intel.cached;
        if (observed && observed + 10000 < Game.time) continue;
        const xy = roomNameToWorld(intel.name || name);
        if (!xy) continue;
        out.push({name: intel.name || name, xy});
    }
    return out;
}

/**
 * One pad per hostile contact and per hot incapable outpost, then drop
 * neighbors so a flat border is a single launch room.
 */
function selectLaunchPads(names, raw, coords, neighbors) {
    const selected = {};

    const add = (name) => {
        if (name && raw[name] && raw[name].capable) selected[name] = true;
    };

    const capable = [];
    for (let i = 0; i < names.length; i++) {
        if (raw[names[i]] && raw[names[i]].capable) capable.push(names[i]);
    }

    const hostiles = collectHostileContacts();
    for (let h = 0; h < hostiles.length; h++) {
        const dest = hostiles[h].xy;
        let best = null;
        let bestDist = Infinity;
        for (let i = 0; i < capable.length; i++) {
            const name = capable[i];
            const xy = coords[name];
            if (!xy) continue;
            const dist = manhattan(xy, dest);
            if (dist > CONTACT_RANGE) continue;
            if (dist < bestDist || (dist === bestDist && betterLaunchPad(name, best, raw))) {
                best = name;
                bestDist = dist;
            }
        }
        add(best);
    }

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const info = raw[name];
        if (!info || info.capable || !isHot(info)) continue;
        const near = neighbors[name] || [];
        add(pickBestPad(near, raw) || pickBestPad(capable, raw));
    }

    const pads = Object.keys(selected);
    pads.sort((a, b) => {
        if (betterLaunchPad(a, b, raw)) return -1;
        if (betterLaunchPad(b, a, raw)) return 1;
        return 0;
    });

    const launchSet = {};
    for (let i = 0; i < pads.length; i++) {
        const name = pads[i];
        const xy = coords[name];
        let tooClose = false;
        for (const kept in launchSet) {
            const other = coords[kept];
            if (xy && other && manhattan(xy, other) <= OWNED_GRAPH_RANGE) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) launchSet[name] = true;
    }

    if (!Object.keys(launchSet).length && capable.length) {
        let primary = null;
        for (let i = 0; i < capable.length; i++) {
            const name = capable[i];
            if (!primary) {
                primary = name;
                continue;
            }
            const hullA = !!(raw[name] && raw[name].hull);
            const hullB = !!(raw[primary] && raw[primary].hull);
            if (hullA !== hullB) {
                if (hullA) primary = name;
                continue;
            }
            if (betterLaunchPad(name, primary, raw)) primary = name;
        }
        if (primary) launchSet[primary] = true;
    }

    return launchSet;
}

function getForceRole(name) {
    const room = Game.rooms[name];
    if (room && room.memory && room.memory.forceRole && VALID_ROLES.has(room.memory.forceRole)) {
        return room.memory.forceRole;
    }
    if (Memory.forceLaunch && Memory.forceLaunch.includes(name)) return ROLES.launch;
    if (Memory.forceCore && Memory.forceCore.includes(name)) return ROLES.core;
    return null;
}

function previousProfile(name) {
    if (cache.profiles && cache.profiles[name]) return cache.profiles[name];
    const room = Game.rooms[name];
    return room && room.memory && room.memory.colonyProfile || null;
}

function applySticky(name, rawRole, now) {
    const force = getForceRole(name);
    if (force) return {role: force, stickyUntil: undefined, forced: true};

    const prev = previousProfile(name);
    const prevRole = prev && prev.role;
    const stickyUntil = prev && prev.stickyUntil;

    if (rawRole === ROLES.outpost) return {role: ROLES.outpost, stickyUntil: undefined, forced: false};

    if (rawRole === ROLES.launch || rawRole === ROLES.frontier) {
        const keep = prevRole === rawRole && stickyUntil && stickyUntil > now + 10;
        return {role: rawRole, stickyUntil: keep ? stickyUntil : now + ROLE_STICKY, forced: false};
    }

    if ((prevRole === ROLES.launch || prevRole === ROLES.frontier) && rawRole === ROLES.core
        && stickyUntil && stickyUntil > now) {
        return {role: prevRole, stickyUntil, forced: false};
    }

    return {role: rawRole, stickyUntil: undefined, forced: false};
}

function persistProfile(name, profile) {
    const room = Game.rooms[name];
    if (!room) return;
    const prev = room.memory.colonyProfile;
    const hops = Number.isFinite(profile.hostileHops) ? profile.hostileHops : undefined;
    if (prev && prev.role === profile.role && !!prev.hull === !!profile.hull
        && prev.hostileHops === hops && (prev.pressure || 0) === (profile.pressure || 0)
        && !!prev.launchEligible === !!profile.launchEligible
        && !!prev.forced === !!profile.forced) {
        return;
    }
    room.memory.colonyProfile = {
        role: profile.role,
        hull: profile.hull || undefined,
        hostileHops: hops,
        pressure: profile.pressure || undefined,
        launchEligible: profile.launchEligible || undefined,
        forced: profile.forced || undefined,
        tick: Game.time,
    };
}

function computeProfiles() {
    const names = ownedNames();
    const now = Game.time;
    const profiles = {};
    if (!names.length) return profiles;

    const points = [];
    const coords = {};
    for (let i = 0; i < names.length; i++) {
        const xy = roomNameToWorld(names[i]);
        if (!xy) continue;
        coords[names[i]] = xy;
        points.push({name: names[i], x: xy.x, y: xy.y});
    }

    const hullSet = {};
    const hullPts = convexHull(points);
    for (let i = 0; i < hullPts.length; i++) hullSet[hullPts[i].name] = true;

    const neighbors = {};
    for (let i = 0; i < names.length; i++) neighbors[names[i]] = [];
    for (let i = 0; i < names.length; i++) {
        const a = coords[names[i]];
        if (!a) continue;
        for (let j = i + 1; j < names.length; j++) {
            const b = coords[names[j]];
            if (!b) continue;
            if (manhattan(a, b) <= OWNED_GRAPH_RANGE) {
                neighbors[names[i]].push(names[j]);
                neighbors[names[j]].push(names[i]);
            }
        }
    }

    const raw = {};
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const room = Game.rooms[name];
        const hops = minHostileHops(name);
        const pressure = roomPressure(name, hops, now);
        const degree = (neighbors[name] || []).length;
        const leaf = names.length >= 3 && degree <= 1;
        const hull = !!hullSet[name] || leaf;
        const capable = isLaunchCapable(room);
        const frontier = hull || hops <= FRONTIER_HOPS || pressure >= PRESSURE_FRONTIER;
        raw[name] = {hops, pressure, hull, capable, frontier, degree};
    }

    const launchSet = selectLaunchPads(names, raw, coords, neighbors);

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const info = raw[name];
        const room = Game.rooms[name];
        const launchEligible = !!launchSet[name];
        let rawRole;
        if (!room || (room.level || 0) < 6) rawRole = ROLES.outpost;
        else if (launchEligible) rawRole = ROLES.launch;
        else if (info.frontier) rawRole = ROLES.frontier;
        else rawRole = ROLES.core;

        if (!room) {
            const prev = previousProfile(name) || {
                role: ROLES.outpost,
                hull: info.hull,
                hostileHops: info.hops,
                pressure: info.pressure,
                launchEligible: false,
                tick: now,
            };
            profiles[name] = prev;
            continue;
        }

        const sticky = applySticky(name, rawRole, now);
        const profile = {
            role: sticky.role,
            hull: info.hull,
            hostileHops: info.hops,
            pressure: info.pressure,
            launchEligible,
            stickyUntil: sticky.stickyUntil,
            forced: sticky.forced,
            tick: now,
        };
        profiles[name] = profile;
        persistProfile(name, profile);
    }

    return profiles;
}

function refreshColonyProfiles(force) {
    const names = ownedNames();
    const key = ownedKey(names);
    if (!force && cache.tick === Game.time && cache.profiles) return cache.profiles;
    if (!force && cache.computedAt > 0 && cache.computedAt + RECOMPUTE_TTL > Game.time
        && cache.roomKey === key) {
        cache.tick = Game.time;
        return cache.profiles;
    }
    const profiles = computeProfiles();
    cache = {tick: Game.time, computedAt: Game.time, roomKey: key, profiles};
    return profiles;
}

function getColonyProfiles(force) {
    return refreshColonyProfiles(force);
}

function resolveName(roomOrName) {
    if (!roomOrName) return null;
    return typeof roomOrName === 'string' ? roomOrName : roomOrName.name;
}

function getColonyProfile(roomOrName) {
    const name = resolveName(roomOrName);
    if (!name) return null;
    const profiles = refreshColonyProfiles();
    return profiles[name] || null;
}

function getColonyRole(roomOrName) {
    const profile = getColonyProfile(roomOrName);
    return (profile && profile.role) || ROLES.outpost;
}

function isLaunchRoom(roomOrName) {
    return getColonyRole(roomOrName) === ROLES.launch;
}

function isFrontierRoom(roomOrName) {
    const role = getColonyRole(roomOrName);
    return role === ROLES.frontier || role === ROLES.launch;
}

function isCoreRoom(roomOrName) {
    return getColonyRole(roomOrName) === ROLES.core;
}

function baseEnergyTarget(room) {
    if (!room || !room.controller) return 50000;
    if (room.level === 8) return 500000;
    const upgradeCost = constructionCost(room.controller.level + 1) - constructionCost(room.controller.level);
    const total = room.controller.progressTotal;
    const progressFraction = total ? room.controller.progress / total : 0;
    return Math.max(room.level * 31250, Math.min(Math.round(upgradeCost * progressFraction) * 0.7, STORAGE_CAPACITY * 0.5));
}

function energyTarget(room) {
    const base = baseEnergyTarget(room);
    const role = getColonyRole(room);
    if (role === ROLES.launch) return Math.floor(base * LAUNCH_ENERGY_MULT);
    if (role === ROLES.frontier) return Math.floor(base * FRONTIER_ENERGY_MULT);
    return base;
}

function setForceRole(roomName, role) {
    const room = Game.rooms[roomName];
    if (!room) return false;
    if (!role || role === 'auto' || role === 'clear') {
        if (room.memory.forceRole) delete room.memory.forceRole;
        if (Memory.forceLaunch) Memory.forceLaunch = Memory.forceLaunch.filter(n => n !== roomName);
        if (Memory.forceCore) Memory.forceCore = Memory.forceCore.filter(n => n !== roomName);
    } else if (!VALID_ROLES.has(role)) {
        return false;
    } else {
        room.memory.forceRole = role;
    }
    refreshColonyProfiles(true);
    return true;
}

function hopsLabel(hops) {
    return Number.isFinite(hops) ? String(hops) : '—';
}

if (typeof global !== 'undefined') {
    global.colonyRoles = function (roomName, role) {
        if (roomName && role) {
            if (!setForceRole(roomName, role)) {
                console.log(`colonyRoles: unknown role '${role}' (core|frontier|launch|outpost|auto)`);
                return;
            }
        }
        const profiles = refreshColonyProfiles(true);
        const names = Object.keys(profiles).sort();
        if (!names.length) {
            console.log('colonyRoles: no owned rooms');
            return profiles;
        }
        console.log(`  ${'room'.padEnd(10)} ${'role'.padEnd(10)} ${'hull'.padEnd(5)} ${'hops'.padStart(4)} ${'prs'.padStart(4)} ${'eligible'.padEnd(8)} sticky`);
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const p = profiles[name];
            const sticky = p.stickyUntil && p.stickyUntil > Game.time ? String(p.stickyUntil - Game.time) : '';
            const forced = p.forced ? ' forced' : '';
            const hull = p.hull ? 'yes' : 'no';
            const eligible = p.launchEligible ? 'yes' : 'no';
            console.log(`  ${name.padEnd(10)} ${String(p.role).padEnd(10)} ${hull.padEnd(5)} ${hopsLabel(p.hostileHops).padStart(4)} ${String(p.pressure || 0).padStart(4)} ${eligible.padEnd(8)} ${sticky}${forced}`);
        }
        return profiles;
    };
}

profiler.registerObject({
    refreshColonyProfiles,
    computeProfiles,
}, 'ColonyProfile');

module.exports = {
    ROLES,
    refreshColonyProfiles,
    getColonyProfiles,
    getColonyProfile,
    getColonyRole,
    isLaunchRoom,
    isFrontierRoom,
    isCoreRoom,
    energyTarget,
    baseEnergyTarget,
    setForceRole,
};
