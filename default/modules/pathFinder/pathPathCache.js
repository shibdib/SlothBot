/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Per-creep path serialization and caching.

 */


const {STATE_STUCK} = require('pathState');

const {getPathKey, hashRoomStructures, reverseDirection} = require('pathUtils');

function serializePath(startPos, path) {

    let serialized = '';

    for (const position of path) {
        if (position.roomName === startPos.roomName) {
            if (PATHING_DEBUG) {
                const colors = ["orange", "blue", "green", "red", "yellow", "black", "gray", "purple"];
                const hash = (startPos.x * 50 + startPos.y) % colors.length;
                const color = colors[hash];
                new RoomVisual(position.roomName).line(position, startPos, {
                    color: color,
                    lineStyle: 'dashed'
                });
            }
            serialized += startPos.getDirectionTo(position);
        } else {
            let exitDir;
            if (startPos.x === 49) exitDir = RIGHT;
            else if (startPos.x === 0) exitDir = LEFT;
            else if (startPos.y === 0) exitDir = TOP;
            else if (startPos.y === 49) exitDir = BOTTOM;
            if (exitDir !== undefined) serialized += exitDir;
        }
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
}

function getPath(creep, from, to, pathInfo) {
    const options = pathInfo?.pathOptions || {};
    const weight = options.offRoad ? 1 : options.ignoreRoads ? 2 : 3;
    const key = getPathKey(from, to, weight);
    let cached = CACHE.PATH_CACHE[key] || CACHE.PATH_CACHE[getPathKey(to, from, weight)];

    if (creep.room && cached && Game.time < cached.tick + 200 &&
        cached.structuresHash === hashRoomStructures(creep.room) &&
        (creep.memory._shibMove?.pathPosTime || 0) < STATE_STUCK) {
        cached.uses++;
        return cached.path;
    }
    return null;
}

module.exports = {

    serializePath,

    cachePath,

    getPath,

};