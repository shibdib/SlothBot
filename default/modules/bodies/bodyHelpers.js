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

function ensureTickCaches() {
    if (_cacheTick === Game.time) return;
    _cacheTick = Game.time;
    _roadsBuiltCache = {};
    _haulersBySource = {};
    _haulersScanned = false;
    _siegeDuoCache = {};
}

function colonyRoadsBuilt(roomName) {
    ensureTickCaches();
    if (!Object.prototype.hasOwnProperty.call(_roadsBuiltCache, roomName)) {
        _roadsBuiltCache[roomName] = !!(INTEL[roomName] && INTEL[roomName].roadsBuilt);
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
        const route = options.usePathRoute || options.forceVanillaRoute
            ? findRoute(colonyName, destName, options.pathRouteOpts || {shortest: true})
            : findRoute(colonyName, destName);
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

function getSiegeDuoUnpaired(dest) {
    ensureTickCaches();
    if (_siegeDuoCache[dest]) return _siegeDuoCache[dest];

    let unpairedHealers = 0;
    let unpairedAttackers = 0;
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || c.memory.role !== 'siegeDuo' || c.memory.destination !== dest) continue;
        if (c.memory.partner && Game.getObjectById(c.memory.partner)) continue;
        if (c.hasActiveBodyparts(ATTACK)) unpairedAttackers++;
        else if (c.hasActiveBodyparts(HEAL)) unpairedHealers++;
    }

    _siegeDuoCache[dest] = {unpairedHealers, unpairedAttackers};
    return _siegeDuoCache[dest];
}

module.exports = {
    CRITICAL_BUILD_STRUCTURE_TYPES,
    colonyRoadsBuilt,
    isSkRoom,
    stableCreepInfoKey,
    maxBodyNonMoveParts,
    clampWorkCarryPair,
    roomHasCriticalBuildSites,
    routeHasBuiltRoads,
    getHaulersBySource,
    countQueuedHaulersForSource,
    getSiegeDuoUnpaired,
};