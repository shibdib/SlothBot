/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Per-creep path serialization and caching.

 */


const profiler = require('tools.profiler');
const {STATE_STUCK} = require('pathState');
const {getPathKey, hashRoomStructures, reverseDirection, getShibMove} = require('pathUtils');
const {directionBetween} = require('pathFormation');

const PATH_CACHE_TTL = 25;
const PATH_CACHE_MAX = 300;

function prunePathCache() {
    const cache = CACHE.PATH_CACHE;
    if (!cache) return;
    const keys = Object.keys(cache);
    if (keys.length <= PATH_CACHE_MAX) return;
    keys.sort((a, b) => (cache[a].tick || 0) - (cache[b].tick || 0));
    const drop = keys.length - PATH_CACHE_MAX;
    for (let i = 0; i < drop; i++) delete cache[keys[i]];
}

function serializePath(startPos, path) {

    let serialized = '';

    for (const position of path) {
        if (PATHING_DEBUG && position.roomName === startPos.roomName) {
            const colors = ["orange", "blue", "green", "red", "yellow", "black", "gray", "purple"];
            const hash = (startPos.x * 50 + startPos.y) % colors.length;
            const color = colors[hash];
            new RoomVisual(position.roomName).line(position, startPos, {
                color: color,
                lineStyle: 'dashed'
            });
        }
        const dir = directionBetween(startPos, position);
        if (dir) serialized += dir;
        startPos = position;
    }
    return serialized;
}


function cachePath(creep, from, to, pathInfo) {
    if (!pathInfo.path?.length) return;
    const {pathOptions: options = {}} = pathInfo;
    const weight = options.offRoad ? 1 : options.ignoreRoads ? 2 : 3;
    const key = getPathKey(from, to, weight);
    const tick = Game.time;

    const entry = CACHE.PATH_CACHE[key] || {};
    entry.path = pathInfo.path;
    entry.key = key;
    entry.tick = tick;
    entry.structuresHash = hashRoomStructures(creep.room);
    entry.uses = (entry.uses || 0) + 1;

    if (from.roomName === to.roomName) {
        const reverseKey = getPathKey(to, from, weight);
        if (!CACHE.PATH_CACHE[reverseKey]) {
            CACHE.PATH_CACHE[reverseKey] = {
                ...entry,
                path: pathInfo.path.split('').reverse().map(reverseDirection).join(''),
                key: reverseKey
            };
        }
    }
    CACHE.PATH_CACHE[key] = entry;
    prunePathCache();
}

function getPath(creep, from, to, pathInfo) {
    const options = pathInfo?.pathOptions || {};
    const weight = options.offRoad ? 1 : options.ignoreRoads ? 2 : 3;
    const key = getPathKey(from, to, weight);
    let cached = CACHE.PATH_CACHE[key] || CACHE.PATH_CACHE[getPathKey(to, from, weight)];

    if (creep.room && cached && Game.time < cached.tick + PATH_CACHE_TTL &&
        cached.structuresHash === hashRoomStructures(creep.room) &&
        (getShibMove(creep)?.pathPosTime || 0) < STATE_STUCK) {
        cached.uses++;
        return cached.path;
    }
    return null;
}

getPath = profiler.registerFN(getPath, 'shibMove.getPath');
cachePath = profiler.registerFN(cachePath, 'shibMove.cachePath');

module.exports = {
    serializePath,
    cachePath,
    getPath,
};