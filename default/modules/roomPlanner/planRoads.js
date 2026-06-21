/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Road pathfinding, caching (owned + remote), and owned-room road placement.
 */

const {bunkerTemplate, coreTemplate} = require('planTemplates');
const {getCorridorPositions} = require('planExtensions');
const {
    setRoadsBuiltFlag,
    resolveSourceContainer,
    getPosKey,
    isRoadSatisfied,
    isRoadPlaceable,
    roomConstructionSiteBudget,
    tryCreateConstructionSite,
} = require('planUtils');

const CACHE_TTL = 5000;
const MATRIX_CACHE = {owned: {}, remote: {}};
const MAX_ROAD_SITES_PER_TICK = 5;
const MAX_ROAD_SITES_QUEUED = 6;
const LAYOUT_SITE_RESERVE = 3;

const EXIT_DIRS = {
    '1': FIND_EXIT_TOP,
    '3': FIND_EXIT_RIGHT,
    '5': FIND_EXIT_BOTTOM,
    '7': FIND_EXIT_LEFT,
};

const PROFILE_COSTS = {
    owned: {wall: 255, swamp: 60, plain: 20, road: 1, container: 100},
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
                costMatrix.set(structure.pos.x, structure.pos.y, costs.wall);
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
        if (!isRoadSatisfied(pos)) return true;
    }

    const targetPos = target instanceof RoomPosition ? target : target.pos;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const ax = targetPos.x + dx;
            const ay = targetPos.y + dy;
            if (!isInRoomBounds(ax, ay)) continue;
            const adj = new RoomPosition(ax, ay, targetPos.roomName || room.name);
            if (isRoadSatisfied(adj)) return false;
        }
    }
    return true;
}

function isWalkableOrigin(pos) {
    return pos && !pos.checkForWall() && !pos.checkForImpassible(true);
}

function getLayoutRoadOrigins(room) {
    const origins = [];
    if (!room.hub) return origins;

    if (room.memory.dynamicLayout) {
        for (const {x, y} of getCorridorPositions(room)) {
            const pos = new RoomPosition(x, y, room.name);
            if (isWalkableOrigin(pos)) origins.push(pos);
        }
        return origins;
    }

    for (const entry of bunkerTemplate) {
        if (entry.structureType !== STRUCTURE_ROAD) continue;
        for (const offset of entry.pos) {
            const pos = new RoomPosition(room.hub.x + offset.x, room.hub.y + offset.y, room.name);
            if (isWalkableOrigin(pos)) origins.push(pos);
        }
    }
    return origins;
}

function nearestToHub(room, positions) {
    if (!positions.length) return null;
    let best = positions[0];
    let bestRange = room.hub.getRangeTo(best);
    for (let i = 1; i < positions.length; i++) {
        const range = room.hub.getRangeTo(positions[i]);
        if (range < bestRange) {
            bestRange = range;
            best = positions[i];
        }
    }
    return best;
}

function getRoadOrigin(room) {
    if (room.hub) {
        if (isWalkableOrigin(room.hub)) return room.hub;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const pos = new RoomPosition(room.hub.x + dx, room.hub.y + dy, room.name);
                if (isWalkableOrigin(pos)) return pos;
            }
        }

        const layoutRoad = nearestToHub(room, getLayoutRoadOrigins(room));
        if (layoutRoad) return layoutRoad;

        for (let r = 2; r <= 6; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const pos = new RoomPosition(room.hub.x + dx, room.hub.y + dy, room.name);
                    if (isWalkableOrigin(pos)) return pos;
                }
            }
        }
    }
    return room.spawns[0] || null;
}

function getMiddleExitTile(room, exitConstant) {
    const exits = room.find(exitConstant);
    if (!exits.length) return null;
    return exits[Math.floor((exits.length - 1) / 2)];
}

function getRoadTargets(room) {
    const targets = [];
    const seen = new Set();
    const add = (pos) => {
        if (!pos) return;
        const key = getPosKey(pos);
        if (seen.has(key)) return;
        seen.add(key);
        targets.push(pos);
    };

    for (const tower of room.towers) add(tower.pos);
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) {
            add(new RoomPosition(x, y, room.name));
        }
    }

    for (const source of room.sources) {
        const container = resolveSourceContainer(source, room);
        add(container ? container.pos : source.pos);
    }

    const controllerContainer = global.resolveControllerContainer(room);
    if (controllerContainer) add(controllerContainer.pos);
    else if (room.controller) add(room.controller.pos);

    if (room.level >= 6) {
        const extractorContainer = Game.getObjectById(room.memory.extractorContainer);
        if (extractorContainer) add(extractorContainer.pos);
        else if (room.mineral) add(room.mineral.pos);
    }

    const neighboring = Game.map.describeExits(room.name);
    if (neighboring) {
        for (const direction in EXIT_DIRS) {
            if (!neighboring[direction]) continue;
            add(getMiddleExitTile(room, EXIT_DIRS[direction]));
        }
    }

    return targets;
}

function getHubPadTiles(room) {
    const tiles = new Set();
    if (!room.hub) return tiles;

    const coreKeys = new Set();
    for (const entry of coreTemplate) {
        for (const {x, y} of entry.pos) {
            coreKeys.add(getPosKey({x: room.hub.x + x, y: room.hub.y + y}));
        }
    }

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const key of coreKeys) {
        const [cx, cy] = key.split('x').map(Number);
        for (const [dx, dy] of dirs) {
            const neighbor = getPosKey({x: cx + dx, y: cy + dy});
            if (!coreKeys.has(neighbor)) tiles.add(neighbor);
        }
    }
    return tiles;
}

function getLayoutRoadTiles(room) {
    const tiles = new Set();
    if (!room.hub) return tiles;

    if (room.memory.dynamicLayout) {
        for (const {x, y} of getCorridorPositions(room)) tiles.add(getPosKey({x, y}));
        for (const key of getHubPadTiles(room)) tiles.add(key);
        return tiles;
    }

    for (const entry of bunkerTemplate) {
        if (entry.structureType !== STRUCTURE_ROAD) continue;
        for (const offset of entry.pos) {
            tiles.add(getPosKey({x: room.hub.x + offset.x, y: room.hub.y + offset.y}));
        }
    }
    return tiles;
}

function getConnectorRoadTiles(room, stats) {
    const tiles = new Set();
    const origin = getRoadOrigin(room);
    if (!origin) {
        if (stats) stats.failedPaths = getRoadTargets(room).length;
        return tiles;
    }
    if (stats) {
        stats.origin = {x: origin.x, y: origin.y};
        stats.originImpassible = !isWalkableOrigin(origin);
    }

    const targets = getRoadTargets(room);
    let failedPaths = 0;
    for (const target of targets) {
        const path = findRoadPath(room, origin, target, 'owned');
        if (!path) {
            failedPaths++;
            continue;
        }
        for (const step of path) {
            if ((step.roomName || room.name) !== room.name) continue;
            tiles.add(getPosKey(step));
        }
    }
    if (stats) {
        stats.targetCount = targets.length;
        stats.failedPaths = failedPaths;
        stats.connectorTileCount = tiles.size;
    }
    return tiles;
}

function missingTiles(room, tileSets) {
    const missing = [];
    let complete = true;
    const seen = new Set();

    for (const set of tileSets) {
        for (const key of set) {
            if (seen.has(key)) continue;
            seen.add(key);
            const [x, y] = key.split('x').map(Number);
            const pos = new RoomPosition(x, y, room.name);
            if (isRoadSatisfied(pos)) continue;
            complete = false;
            if (isRoadPlaceable(pos)) missing.push(pos);
        }
    }
    return {missing, complete};
}

function getDesiredRoadTiles(room) {
    const connector = getConnectorRoadTiles(room);
    const layout = getLayoutRoadTiles(room);
    return new Set([...connector, ...layout]);
}

function evaluateRoadPlan(room) {
    const layout = getLayoutRoadTiles(room);
    const stats = {};
    const connector = getConnectorRoadTiles(room, stats);
    const {missing, complete} = missingTiles(room, [connector, layout]);
    const connectorRequired = stats.targetCount > 0;
    const connectorMissing = connectorRequired && connector.size === 0;
    return {
        layout,
        connector,
        missing,
        complete: complete && !connectorMissing,
        stats,
        connectorRequired,
        connectorMissing,
    };
}

function isRoadPlanComplete(room) {
    return evaluateRoadPlan(room).complete;
}

function diffRoadTiles(room, desired) {
    return missingTiles(room, [desired]);
}

function countRoadConstructionSites(room) {
    let count = 0;
    for (const site of room.constructionSites) {
        if (site.structureType === STRUCTURE_ROAD) count++;
    }
    return count;
}

function roadPlacementLimit(room, layoutPending) {
    const roadSites = countRoadConstructionSites(room);
    if (layoutPending && roadSites >= MAX_ROAD_SITES_QUEUED) return 0;

    const reserve = layoutPending ? LAYOUT_SITE_RESERVE : 1;
    const budget = roomConstructionSiteBudget(room);
    return Math.min(MAX_ROAD_SITES_PER_TICK, Math.max(0, budget - reserve));
}

function planOwnedRoomRoads(room, options = {}) {
    if (!room.storage || !room.spawns.length || room.level < ROAD_LEVEL) {
        setRoadsBuiltFlag(room, undefined);
        return false;
    }
    if (Memory.pauseOwnedRoads && Memory.pauseOwnedRoads > Game.time) return false;

    const maxThisTick = roadPlacementLimit(room, !!options.layoutPending);
    if (maxThisTick === 0) return false;

    const {missing, complete, connectorMissing} = evaluateRoadPlan(room);
    if (connectorMissing) {
        setRoadsBuiltFlag(room, undefined);
        return false;
    }

    let placed = 0;
    for (const pos of missing) {
        if (placed >= maxThisTick) break;
        if (tryCreateConstructionSite(pos, STRUCTURE_ROAD) === OK) placed++;
    }

    setRoadsBuiltFlag(room, complete ? true : undefined);
    return placed > 0;
}

module.exports = {
    findRoadPath,
    getPathKey,
    getCachedPath,
    cachePath,
    clearRoomPathCache,
    pathTilesNeedRoads,
    buildCostMatrix,
    planOwnedRoomRoads,
    roadBuilder: planOwnedRoomRoads,
    getRoadOrigin,
    getDesiredRoadTiles,
    isRoadPlanComplete,
    layoutRoadsComplete: isRoadPlanComplete,
    hasPendingRoadWork: room => !isRoadPlanComplete(room),
    diffRoadTiles,
    evaluateRoadPlan,
    getConnectorRoadTiles,
    getLayoutRoadTiles,
    getRoadTargets,
    roadPlacementLimit,
    countRoadConstructionSites,
};