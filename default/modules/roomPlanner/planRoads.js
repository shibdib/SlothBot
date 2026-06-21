/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Owned-room roads: bunker layout + continuous connector paths to exits, sources,
 * controller, and mineral (full pave for half-move). Paths attach to the nearest
 * existing road tile so routes reuse the network instead of hub spines.
 */

const {bunkerTemplate} = require('planTemplates');
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
const PLAN_CACHE = {};
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
    owned: {wall: 255, swamp: 40, plain: 45, road: 1, container: 50},
    remote: {wall: 225, swamp: 25, plain: 5, road: 1, container: 15},
};

const TARGET_PRIORITY = {
    controller: 0,
    source: 1,
    mineral: 2,
    other: 3,
    exit: 4,
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
}

function clearRoomPathCache(roomName, profile = 'owned') {
    delete getCacheStore(profile)[roomName];
}

function buildCostMatrix(roomName, profile = 'owned') {
    const store = MATRIX_CACHE[profile] || (MATRIX_CACHE[profile] = {});
    const cached = store[roomName];
    if (cached && cached.tick === Game.time) return cached.matrix.clone();

    const costs = PROFILE_COSTS[profile];
    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) matrix.set(x, y, costs.wall);
            else if (tile === TERRAIN_MASK_SWAMP) matrix.set(x, y, costs.swamp);
            else matrix.set(x, y, costs.plain);
        }
    }

    const pathRoom = Game.rooms[roomName];
    if (pathRoom) {
        for (const structure of pathRoom.structures) {
            if (structure.structureType === STRUCTURE_ROAD) {
                matrix.set(structure.pos.x, structure.pos.y, costs.road);
            } else if (structure.structureType === STRUCTURE_CONTAINER) {
                matrix.set(structure.pos.x, structure.pos.y, costs.container);
            } else if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                matrix.set(structure.pos.x, structure.pos.y, costs.wall);
            }
        }
        for (const site of pathRoom.constructionSites) {
            if (site.structureType === STRUCTURE_ROAD) {
                matrix.set(site.pos.x, site.pos.y, costs.road);
            }
        }
    }

    store[roomName] = {matrix, tick: Game.time};
    return matrix.clone();
}

function searchOnMatrix(from, to, matrix) {
    const begin = from instanceof RoomPosition ? from : from.pos;
    const target = to instanceof RoomPosition ? to : to.pos;
    const result = PathFinder.search(begin, {pos: target, range: 1}, {
        heuristicWeight: 1.1,
        maxRooms: 1,
        roomCallback: () => matrix,
    });
    if (result.incomplete || !result.path.length) return null;
    return result.path;
}

function findRoadPath(room, from, to, profile = 'owned') {
    const begin = from instanceof RoomPosition ? from : from.pos;
    const target = to instanceof RoomPosition ? to : to.pos;

    const cached = getCachedPath(room, begin, target, profile);
    if (cached) return cached;

    const matrix = buildCostMatrix(room.name, profile);
    const path = searchOnMatrix(begin, target, matrix);
    if (!path) return null;

    cachePath(room, begin, target, path, profile);
    return path;
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

function isExitPos(pos) {
    return pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49;
}

function getRoadOrigin(room) {
    if (room.hub && !room.hub.checkForWall() && !room.hub.checkForImpassible(true)) return room.hub;
    if (room.spawns[0]) return room.spawns[0].pos;
    return null;
}

function getLayoutRoadTiles(room) {
    const tiles = new Set();
    if (!room.hub || room.memory.dynamicLayout) return tiles;

    for (const entry of bunkerTemplate) {
        if (entry.structureType !== STRUCTURE_ROAD) continue;
        for (const offset of entry.pos) {
            tiles.add(getPosKey({x: room.hub.x + offset.x, y: room.hub.y + offset.y}));
        }
    }
    return tiles;
}

function classifyTarget(room, pos) {
    if (room.controller && pos.inRangeTo(room.controller, 1)) return TARGET_PRIORITY.controller;
    for (const source of room.sources) {
        if (pos.inRangeTo(source, 1)) return TARGET_PRIORITY.source;
    }
    if (room.mineral && pos.inRangeTo(room.mineral, 1)) return TARGET_PRIORITY.mineral;
    if (isExitPos(pos)) return TARGET_PRIORITY.exit;
    return TARGET_PRIORITY.other;
}

function getRoadTargets(room) {
    const targets = [];
    const seen = new Set();
    const add = (pos) => {
        if (!pos) return;
        const k = getPosKey(pos);
        if (seen.has(k)) return;
        seen.add(k);
        targets.push(pos);
    };

    if (room.controller) {
        const controllerContainer = global.resolveControllerContainer(room);
        add(controllerContainer ? controllerContainer.pos : room.controller.pos);
    }

    for (const source of room.sources) {
        const container = resolveSourceContainer(source, room);
        add(container ? container.pos : source.pos);
    }

    if (room.mineral) {
        const extractorContainer = Game.getObjectById(room.memory.extractorContainer);
        add(extractorContainer ? extractorContainer.pos : room.mineral.pos);
    }

    const neighboring = Game.map.describeExits(room.name);
    if (neighboring) {
        for (const direction in EXIT_DIRS) {
            if (!neighboring[direction]) continue;
            const exits = room.find(EXIT_DIRS[direction]);
            if (exits.length) add(exits[Math.floor((exits.length - 1) / 2)]);
        }
    }

    return targets;
}

function sortTargets(room, origin, targets) {
    return targets.slice().sort((a, b) => {
        const pa = classifyTarget(room, a);
        const pb = classifyTarget(room, b);
        if (pa !== pb) return pa - pb;
        return origin.getRangeTo(a) - origin.getRangeTo(b);
    });
}

function nearestNetworkPos(target, network, roomName) {
    let best = null;
    let bestRange = Infinity;
    for (const key of network) {
        const parts = key.split('x');
        const pos = new RoomPosition(Number(parts[0]), Number(parts[1]), roomName);
        const range = target.getRangeTo(pos);
        if (range < bestRange) {
            bestRange = range;
            best = pos;
        }
    }
    return best;
}

function markPlannedOnMatrix(matrix, key, roomName) {
    const parts = key.split('x');
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    matrix.set(x, y, PROFILE_COSTS.owned.road);
}

function buildConnectorData(room, layout) {
    const network = new Set(layout);
    const origin = getRoadOrigin(room);
    if (origin) network.add(getPosKey(origin));

    const connector = new Set();
    const matrix = buildCostMatrix(room.name, 'owned');
    const roadCost = PROFILE_COSTS.owned.road;

    for (const key of network) markPlannedOnMatrix(matrix, key, room.name);

    const anchorPos = origin || (room.spawns[0] && room.spawns[0].pos);
    if (!anchorPos) return {connector};

    const targets = sortTargets(room, anchorPos, getRoadTargets(room));

    for (const target of targets) {
        const anchor = nearestNetworkPos(target, network, room.name);
        if (!anchor) continue;

        const path = searchOnMatrix(anchor, target, matrix);
        if (!path) continue;

        for (const step of path) {
            if ((step.roomName || room.name) !== room.name) continue;
            const k = getPosKey(step);
            network.add(k);
            matrix.set(step.x, step.y, roadCost);
            if (!layout.has(k)) connector.add(k);
        }
    }

    return {connector};
}

function getConnectorRoadTiles(room) {
    const layout = getLayoutRoadTiles(room);
    return buildConnectorData(room, layout).connector;
}

function getRoadPlan(room) {
    const cached = PLAN_CACHE[room.name];
    if (cached && cached.tick === Game.time) return cached.plan;

    const layout = getLayoutRoadTiles(room);
    const {connector} = buildConnectorData(room, layout);
    const desired = new Set([...layout, ...connector]);

    const missing = [];
    let complete = true;
    for (const key of desired) {
        const parts = key.split('x');
        const pos = new RoomPosition(Number(parts[0]), Number(parts[1]), room.name);
        if (isRoadSatisfied(pos)) continue;
        complete = false;
        if (isRoadPlaceable(pos)) missing.push(pos);
    }

    const plan = {
        layout,
        connector,
        desired,
        missing,
        complete,
        targetCount: getRoadTargets(room).length,
    };
    PLAN_CACHE[room.name] = {tick: Game.time, plan};
    return plan;
}

function getDesiredRoadTiles(room) {
    return getRoadPlan(room).desired;
}

function evaluateRoadPlan(room) {
    const plan = getRoadPlan(room);
    return {
        layout: plan.layout,
        connector: plan.connector,
        missing: plan.missing,
        complete: plan.complete,
        stats: {
            targetCount: plan.targetCount,
            connectorTileCount: plan.connector.size,
            desiredTiles: plan.desired.size,
            failedPaths: 0,
        },
        connectorRequired: plan.targetCount > 0,
        connectorMissing: false,
    };
}

function isRoadPlanComplete(room) {
    return getRoadPlan(room).complete;
}

function diffRoadTiles(room, desired) {
    const missing = [];
    let complete = true;
    for (const key of desired) {
        const parts = key.split('x');
        const pos = new RoomPosition(Number(parts[0]), Number(parts[1]), room.name);
        if (isRoadSatisfied(pos)) continue;
        complete = false;
        if (isRoadPlaceable(pos)) missing.push(pos);
    }
    return {missing, complete};
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

    const {missing, complete} = getRoadPlan(room);

    let placed = 0;
    for (const pos of missing) {
        if (placed >= maxThisTick) break;
        if (tryCreateConstructionSite(pos, STRUCTURE_ROAD) === OK) {
            placed++;
            delete PLAN_CACHE[room.name];
        }
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
    getRoadPlan,
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