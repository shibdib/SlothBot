/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Shared body-generation helpers, per-tick caches, and route/hauler utilities.
 */

const {findRoute} = require('pathRoute');
const {getMiningRouteRooms} = require('remoteMining');

let _cacheTick = -1;
let _roadsBuiltCache = {};
let _haulersBySource = {};
let _haulersScanned = false;
let _siegeDuoCache = {};
let _roleDestCache = {};

function ensureTickCaches() {
    if (_cacheTick === Game.time) return;
    _cacheTick = Game.time;
    _roadsBuiltCache = {};
    _haulersBySource = {};
    _haulersScanned = false;
    _siegeDuoCache = {};
    _roleDestCache = {};
}

function colonyRoadsBuilt(roomName) {
    ensureTickCaches();
    if (!Object.prototype.hasOwnProperty.call(_roadsBuiltCache, roomName)) {
        // C2: owned rooms use plan.layers.roads.extra.complete (via getRoadsBuiltFlag).
        // Remotes still resolve through INTEL inside getRoadsBuiltFlag.
        try {
            _roadsBuiltCache[roomName] = !!require('planUtils').getRoadsBuiltFlag(roomName);
        } catch (e) {
            _roadsBuiltCache[roomName] = !!(INTEL[roomName] && INTEL[roomName].roadsBuilt);
        }
    }
    return _roadsBuiltCache[roomName];
}

function isSkRoom(roomName) {
    return !!(INTEL[roomName] && INTEL[roomName].sk)
        || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(roomName));
}

function stableCreepInfoKey(creepInfo) {
    if (!creepInfo) return '';
    const other = creepInfo.other || {};
    const misc = creepInfo.misc || {};
    return [
        creepInfo.destination || '',
        creepInfo.operation || '',
        creepInfo.assignment || other.assignment || '',
        other.source || '',
        other.remoteRoom || '',
        other.distanceToHub || '',
        other.haulUrgent ? 'urgent' : '',
        Math.round(other.harvestRate || 0),
        other.power || '',
        misc.waitFor || '',
        (misc.boosts || []).slice().sort().join('+'),
        creepInfo.military ? 'mil' : '',
    ].join('|');
}

function maxBodyNonMoveParts(halfMove) {
    return Math.floor(50 / (1 + (halfMove ? 0.5 : 1.0)));
}

const CRITICAL_BUILD_STRUCTURE_TYPES = [
    STRUCTURE_SPAWN, STRUCTURE_EXTENSION, STRUCTURE_STORAGE, STRUCTURE_CONTAINER,
    STRUCTURE_LINK, STRUCTURE_TERMINAL, STRUCTURE_TOWER, STRUCTURE_LAB,
    STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN,
];

function roomHasCriticalBuildSites(room) {
    if (!room || !room.constructionSites || !room.constructionSites.length) return false;
    return _.some(room.constructionSites, s => CRITICAL_BUILD_STRUCTURE_TYPES.includes(s.structureType));
}

function ownedSpawnCount(room) {
    if (!room) return 1;
    if (global.roomMySpawns) {
        const mine = global.roomMySpawns(room);
        if (mine && mine.length) return mine.length;
    }
    const spawns = room.spawns || [];
    let n = 0;
    for (let i = 0; i < spawns.length; i++) {
        try {
            if (spawns[i] && spawns[i].my) n++;
        } catch (e) {
            // ignore broken spawn objects
        }
    }
    return Math.max(1, n);
}

function creepRoleInRoom(room, role) {
    const creeps = room && room.myCreeps;
    if (!creeps || !creeps.length) return false;
    for (let i = 0; i < creeps.length; i++) {
        const mem = creeps[i] && creeps[i].memory;
        if (mem && mem.role === role) return true;
    }
    return false;
}

function roomUsesDedicatedHauler(room) {
    return !!(room && (room.storage || (room.memory && room.memory.protoStorage)));
}

/**
 * Energy a recovering room can actually assemble: one spawn's auto-regen
 * (300). Extra spawns are not a refill source without a hauler.
 */
function recoverySpawnEnergy(room) {
    const capacity = (room && room.energyCapacityAvailable) || SPAWN_ENERGY_CAPACITY;
    return Math.min(capacity, SPAWN_ENERGY_CAPACITY);
}

/** Haulers refill extensions. A shuttle only counts if energy is already above regen. */
function roomHasExtensionFiller(room) {
    if (!room) return false;
    if (creepRoleInRoom(room, 'hauler')) return true;
    if (roomUsesDedicatedHauler(room)) return false;
    if (!creepRoleInRoom(room, 'shuttle')) return false;
    const regen = recoverySpawnEnergy(room);
    return (room.energyAvailable || 0) > regen + 100;
}

/**
 * Room cannot grow energy past spawn regen. Used for body caps, reboot
 * flags, and "skip this queue item" — not for waiting on extensions.
 */
function roomNeedsSpawnReboot(room, creepInfo) {
    if (!room) return false;
    if (creepInfo && creepInfo.other && creepInfo.other.reboot) return true;
    if (room.myCreeps && room.myCreeps.length <= 3) return true;
    if (roomHasExtensionFiller(room)) return false;
    const regen = recoverySpawnEnergy(room);
    const capacity = room.energyCapacityAvailable || 0;
    return capacity > regen + 50;
}

function roomSpawnEnergyStuck(room) {
    return roomNeedsSpawnReboot(room);
}

function roomInSpawnRecovery(room, creepInfo) {
    return roomNeedsSpawnReboot(room, creepInfo);
}

function isColonyEarlyRush(room) {
    if (!room || !room.controller || !room.controller.my) return false;
    return !room.storage && room.controller.level <= 5;
}

function harvesterWorkCapUnlocked(room) {
    if (!room) return false;
    if (room.controller && room.controller.level >= 2) return true;
    return (room.energyCapacityAvailable || 0) >= 550;
}

function clampWorkCarryPair(work, carry, maxNonMove) {
    work = Math.floor(work) || 1;
    carry = Math.floor(carry) || 1;
    if (work + carry <= maxNonMove) return {work, carry};
    const scale = maxNonMove / (work + carry);
    work = Math.max(1, Math.floor(work * scale));
    carry = Math.max(1, Math.floor(carry * scale));
    while (work + carry > maxNonMove && carry > 1) carry--;
    while (work + carry > maxNonMove && work > 1) work--;
    return {work, carry};
}

function routeRoomNames(route) {
    if (!route || !route.length) return [];
    if (typeof route[0] === 'string') return route;
    return route.map(step => step.room);
}

function routeHasBuiltRoads(colonyName, destName, options = {}) {
    if (!colonyName || !destName || !colonyRoadsBuilt(colonyName)) return false;

    let rooms;
    if (!options.forceVanillaRoute) {
        rooms = getMiningRouteRooms(colonyName, destName);
    }
    if (!rooms || !rooms.length) {
        // Default: never live Game.map.findRoute here — that undoes remoteMining's
        // empire probe budget and spikes spawn/body/hauler ticks on cache miss.
        // Opt-in only: forceVanillaRoute / usePathRoute for rare explicit callers.
        if (!(options.forceVanillaRoute || options.usePathRoute)) {
            return false;
        }
        const route = findRoute(
            colonyName,
            destName,
            options.pathRouteOpts || (options.usePathRoute ? {shortest: true} : {})
        );
        rooms = routeRoomNames(route);
    }
    if (!rooms.length) return false;
    return rooms.every(roomName => INTEL[roomName] && INTEL[roomName].roadsBuilt);
}

function getHaulersBySource() {
    ensureTickCaches();
    if (_haulersScanned) return _haulersBySource;
    _haulersScanned = true;

    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (c.my && c.memory.role === 'remoteHauler' && c.memory.other && c.memory.other.source) {
            const sid = c.memory.other.source;
            if (!_haulersBySource[sid]) _haulersBySource[sid] = [];
            _haulersBySource[sid].push(c);
        }
    }
    return _haulersBySource;
}

function countQueuedHaulersForSource(roomName, sourceId) {
    const queue = CREEP_QUEUES[roomName];
    if (!queue) return 0;
    let n = 0;
    for (const key in queue) {
        const entry = queue[key];
        if (entry.role === 'remoteHauler' && entry.other && entry.other.source === sourceId) n++;
    }
    return n;
}

function creepBodyHas(c, part) {
    const body = c && c.body;
    if (!body) return false;
    for (let i = 0; i < body.length; i++) {
        if (body[i].type === part) return true;
    }
    return false;
}

function getSiegeDuoUnpaired(dest) {
    ensureTickCaches();
    if (_siegeDuoCache[dest]) return _siegeDuoCache[dest];

    let unpairedHealers = 0;
    let unpairedAttackers = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || c.memory.role !== 'siegeDuo' || c.memory.destination !== dest) continue;
        if (c.memory.partner && Game.getObjectById(c.memory.partner)) continue;
        if (creepBodyHas(c, ATTACK)) unpairedAttackers++;
        else if (creepBodyHas(c, HEAL)) unpairedHealers++;
    }

    _siegeDuoCache[dest] = {unpairedHealers, unpairedAttackers};
    return _siegeDuoCache[dest];
}

function countRoleForDestination(dest, role, operation) {
    ensureTickCaches();
    const key = `${role || ''}|${dest || ''}|${operation || ''}`;
    if (_roleDestCache[key] !== undefined) return _roleDestCache[key];
    let n = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my) continue;
        const r = c.memory.oldRole || c.memory.role;
        if (role && r !== role) continue;
        if (dest && c.memory.destination !== dest) continue;
        if (operation && c.memory.operation !== operation) continue;
        n++;
    }
    _roleDestCache[key] = n;
    return n;
}

module.exports = {
    CRITICAL_BUILD_STRUCTURE_TYPES,
    colonyRoadsBuilt,
    isSkRoom,
    stableCreepInfoKey,
    maxBodyNonMoveParts,
    clampWorkCarryPair,
    roomHasCriticalBuildSites,
    roomUsesDedicatedHauler,
    roomHasExtensionFiller,
    roomNeedsSpawnReboot,
    roomSpawnEnergyStuck,
    roomInSpawnRecovery,
    recoverySpawnEnergy,
    isColonyEarlyRush,
    harvesterWorkCapUnlocked,
    routeHasBuiltRoads,
    getHaulersBySource,
    countQueuedHaulersForSource,
    creepBodyHas,
    getSiegeDuoUnpaired,
    countRoleForDestination,
};