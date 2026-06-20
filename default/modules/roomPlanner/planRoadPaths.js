/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Pathfinding and path cache for owned-room and remote/highway road placement.
 */

const CACHE_TTL = 5000;
const MATRIX_CACHE = {owned: {}, remote: {}};

const PROFILE_COSTS = {
    owned: {wall: Infinity, swamp: 60, plain: 20, road: 1, container: 100},
    remote: {wall: 225, swamp: 25, plain: 5, road: 1, container: 15},
};

function getPathKey(from, to) {
    return `${from.x}x${from.y}$${to.x}x${to.y}`;
}

function getCacheStore(profile) {
    if (profile === 'remote') {
        if (!global.ROAD_CACHE_REMOTE) global.ROAD_CACHE_REMOTE = {};
        return global.ROAD_CACHE_REMOTE;
    }
    if (!global.ROAD_CACHE_OWNED) global.ROAD_CACHE_OWNED = {};
    return global.ROAD_CACHE_OWNED;
}

function getCacheBucket(roomName, profile) {
    const store = getCacheStore(profile);
    if (!store[roomName]) store[roomName] = {};
    return store[roomName];
}

function getCachedPath(room, from, to, profile = 'owned') {
    const bucket = getCacheBucket(room.name, profile);
    const entry = bucket[getPathKey(from, to)];
    if (!entry || entry.tick + CACHE_TTL < Game.time) return null;
    return entry.path;
}

function cachePath(room, from, to, path, profile = 'owned') {
    const bucket = getCacheBucket(room.name, profile);
    bucket[getPathKey(from, to)] = {path, tick: Game.time};
    if (profile === 'owned') room.memory._roadCache = undefined;
}

function clearRoomPathCache(roomName, profile = 'owned') {
    delete getCacheStore(profile)[roomName];
}

function buildCostMatrix(roomName, profile = 'owned') {
    const store = MATRIX_CACHE[profile] || (MATRIX_CACHE[profile] = {});
    const cached = store[roomName];
    if (cached && cached.tick === Game.time) return cached.matrix;

    const costs = PROFILE_COSTS[profile];
    const costMatrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) {
                costMatrix.set(x, y, costs.wall);
            } else if (tile === TERRAIN_MASK_SWAMP) {
                costMatrix.set(x, y, costs.swamp);
            } else {
                costMatrix.set(x, y, costs.plain);
            }
        }
    }

    const pathRoom = Game.rooms[roomName];
    if (pathRoom) {
        for (const structure of pathRoom.structures) {
            if (structure.structureType === STRUCTURE_ROAD) {
                costMatrix.set(structure.pos.x, structure.pos.y, costs.road);
            } else if (structure.structureType === STRUCTURE_CONTAINER) {
                costMatrix.set(structure.pos.x, structure.pos.y, costs.container);
            } else if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                costMatrix.set(structure.pos.x, structure.pos.y, Infinity);
            }
        }
        for (const site of pathRoom.constructionSites) {
            if (site.structureType === STRUCTURE_ROAD) {
                costMatrix.set(site.pos.x, site.pos.y, costs.road);
            }
        }
    }

    store[roomName] = {matrix: costMatrix, tick: Game.time};
    return costMatrix;
}

function findRoadPath(room, from, to, profile = 'owned') {
    const begin = from instanceof RoomPosition ? from : from.pos;
    const target = to instanceof RoomPosition ? to : to.pos;

    const cached = getCachedPath(room, begin, target, profile);
    if (cached) return cached;

    const result = PathFinder.search(begin, {pos: target, range: 1}, {
        heuristicWeight: 0.8,
        maxRooms: 1,
        roomCallback: roomName => buildCostMatrix(roomName, profile),
    });
    if (result.incomplete || !result.path.length) return null;

    cachePath(room, begin, target, result.path, profile);
    return result.path;
}

function isInRoomBounds(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function pathTilesNeedRoads(room, points, target) {
    for (const point of points) {
        const roomName = point.roomName || room.name;
        if (roomName !== room.name) continue;
        if (!isInRoomBounds(point.x, point.y)) continue;
        const pos = new RoomPosition(point.x, point.y, roomName);
        const site = pos.checkForConstructionSites();
        if (!pos.checkForRoad() && !(site && site.structureType === STRUCTURE_ROAD)) return true;
    }

    const targetPos = target instanceof RoomPosition ? target : target.pos;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const ax = targetPos.x + dx;
            const ay = targetPos.y + dy;
            if (!isInRoomBounds(ax, ay)) continue;
            const adj = new RoomPosition(ax, ay, targetPos.roomName || room.name);
            const adjSite = adj.checkForConstructionSites();
            if (adj.checkForRoad() || (adjSite && adjSite.structureType === STRUCTURE_ROAD)) return false;
        }
    }
    return true;
}

module.exports = {
    findRoadPath,
    getPathKey,
    getCachedPath,
    cachePath,
    clearRoomPathCache,
    pathTilesNeedRoads,
    buildCostMatrix,
};