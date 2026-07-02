/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Owned-room roads: bunker layout + connectors to controller, sources, mineral,
 * and exit centers. Reuses built roads, road sites, and planned tiles via a
 * per-room cost matrix kept in the module heap.
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
const {getMiningRouteRooms} = require('remoteMining');

const COSTS = {
    owned: {wall: 255, swamp: 75, plain: 45, road: 1, container: 50},
    remote: {wall: 225, swamp: 25, plain: 5, road: 1, container: 15},
};

const PATH_CACHE_TTL = 5000;
const PLAN_CACHE = Object.create(null);
const MATRIX_HEAP = {owned: Object.create(null), remote: Object.create(null)};

const MAX_ROAD_SITES_PER_TICK = 5;
const MAX_ROAD_SITES_QUEUED = 6;
const LAYOUT_SITE_RESERVE = 3;

const EXIT_DIRS = {
    '1': FIND_EXIT_TOP,
    '3': FIND_EXIT_RIGHT,
    '5': FIND_EXIT_BOTTOM,
    '7': FIND_EXIT_LEFT,
};

const TARGET_ORDER = {controller: 0, source: 1, mineral: 2, exit: 3};

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
    if (!entry || entry.tick + PATH_CACHE_TTL < Game.time) return null;
    return entry.path;
}

function cachePath(room, from, to, path, profile = 'owned') {
    const bucket = getCacheBucket(room.name, profile);
    bucket[getPathKey(from, to)] = {path, tick: Game.time};
}

function clearRoomPathCache(roomName, profile = 'owned') {
    delete getCacheStore(profile)[roomName];
}

function roomStructureFingerprint(roomName) {
    const room = Game.rooms[roomName];
    if (!room) return '0';
    let roads = 0;
    let sites = 0;
    for (const s of room.structures) {
        if (s.structureType === STRUCTURE_ROAD) roads++;
    }
    for (const s of room.constructionSites) {
        if (s.structureType === STRUCTURE_ROAD) sites++;
    }
    return `${roads}x${sites}`;
}

function getHeapEntry(roomName, profile) {
    const store = MATRIX_HEAP[profile];
    if (!store[roomName]) {
        store[roomName] = {fingerprint: null, matrix: null, planned: new Set()};
    }
    return store[roomName];
}

function buildTerrainMatrix(roomName, profile) {
    const costs = COSTS[profile];
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

    const room = Game.rooms[roomName];
    if (!room) return matrix;

    for (const s of room.structures) {
        if (s.structureType === STRUCTURE_ROAD) matrix.set(s.pos.x, s.pos.y, costs.road);
        else if (s.structureType === STRUCTURE_CONTAINER) matrix.set(s.pos.x, s.pos.y, costs.container);
        else if (_.includes(OBSTACLE_OBJECT_TYPES, s.structureType)) matrix.set(s.pos.x, s.pos.y, costs.wall);
    }
    for (const site of room.constructionSites) {
        if (site.structureType === STRUCTURE_ROAD) matrix.set(site.pos.x, site.pos.y, costs.road);
    }
    return matrix;
}

function markTileOnMatrix(matrix, key, profile) {
    const parts = key.split('x');
    matrix.set(Number(parts[0]), Number(parts[1]), COSTS[profile].road);
}

function ensureRoomMatrix(roomName, profile = 'owned') {
    const entry = getHeapEntry(roomName, profile);
    const fingerprint = roomStructureFingerprint(roomName);
    if (entry.fingerprint !== fingerprint || !entry.matrix) {
        entry.matrix = buildTerrainMatrix(roomName, profile);
        entry.fingerprint = fingerprint;
        for (const key of entry.planned) markTileOnMatrix(entry.matrix, key, profile);
    }
    return entry.matrix;
}

function markPlannedTile(roomName, profile, key) {
    const entry = getHeapEntry(roomName, profile);
    entry.planned.add(key);
    if (entry.matrix) markTileOnMatrix(entry.matrix, key, profile);
}

function clearRoomMatrixCache(roomName, profile = 'owned') {
    const entry = MATRIX_HEAP[profile] && MATRIX_HEAP[profile][roomName];
    if (entry) {
        entry.fingerprint = null;
        entry.matrix = null;
    }
}

function buildCostMatrix(roomName, profile = 'owned') {
    return ensureRoomMatrix(roomName, profile).clone();
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

function pathTilesNeedRoads(room, points, target) {
    for (const point of points) {
        if ((point.roomName || room.name) !== room.name) continue;
        if (point.x < 0 || point.x > 49 || point.y < 0 || point.y > 49) continue;
        const pos = new RoomPosition(point.x, point.y, room.name);
        if (!isRoadSatisfied(pos)) return true;
    }

    const targetPos = target instanceof RoomPosition ? target : target && target.pos;
    if (!targetPos) return true;

    const roomName = targetPos.roomName || room.name;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const x = targetPos.x + dx;
            const y = targetPos.y + dy;
            if (x < 0 || x > 49 || y < 0 || y > 49) continue;
            const adj = new RoomPosition(x, y, roomName);
            if (isRoadSatisfied(adj)) return false;
        }
    }
    return true;
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
    if (room.controller && pos.inRangeTo(room.controller, 1)) return 'controller';
    for (const source of room.sources) {
        if (pos.inRangeTo(source, 1)) return 'source';
    }
    if (room.mineral && pos.inRangeTo(room.mineral, 1)) return 'mineral';
    if (pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49) return 'exit';
    return 'other';
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

    if (room.memory.labHub) {
        const labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
        add(labHub);
    }

    return targets;
}

function sortTargets(room, origin, targets) {
    return targets.slice().sort((a, b) => {
        const pa = TARGET_ORDER[classifyTarget(room, a)] ?? 9;
        const pb = TARGET_ORDER[classifyTarget(room, b)] ?? 9;
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

function buildConnectorTiles(room, layout) {
    const network = new Set(layout);
    const origin = getRoadOrigin(room);
    if (origin) network.add(getPosKey(origin));

    const connector = new Set();
    const matrix = ensureRoomMatrix(room.name, 'owned').clone();
    const roadCost = COSTS.owned.road;

    for (const key of network) {
        markTileOnMatrix(matrix, key, 'owned');
        markPlannedTile(room.name, 'owned', key);
    }

    const anchorPos = origin || (room.spawns[0] && room.spawns[0].pos);
    if (!anchorPos) return connector;

    for (const target of sortTargets(room, anchorPos, getRoadTargets(room))) {
        const anchor = nearestNetworkPos(target, network, room.name);
        if (!anchor || anchor.getRangeTo(target) <= 1) continue;

        const path = searchOnMatrix(anchor, target, matrix);
        if (!path) continue;

        for (const step of path) {
            if ((step.roomName || room.name) !== room.name) continue;
            const key = getPosKey(step);
            const pos = new RoomPosition(step.x, step.y, room.name);
            network.add(key);
            markTileOnMatrix(matrix, key, 'owned');
            if (!isRoadSatisfied(pos)) markPlannedTile(room.name, 'owned', key);
            if (!layout.has(key) && !isRoadSatisfied(pos)) connector.add(key);
        }
    }

    return connector;
}

function clearRoomPlanCache(roomName) {
    delete PLAN_CACHE[roomName];
}

function getRoadPlan(room) {
    const cached = PLAN_CACHE[room.name];
    if (cached && cached.tick === Game.time) return cached.plan;

    const layout = getLayoutRoadTiles(room);
    const connector = buildConnectorTiles(room, layout);
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
        connectorMissing: plan.missing.length > 0,
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

const MAX_ROAD_SITES_REMOTE = 2;
const VERIFY_CACHE_TTL = 50;
const VERIFY_CACHE = Object.create(null);
const NEEDS_WORK_CACHE = Object.create(null);
const REMOTE_PLAN_CACHE = Object.create(null);

function canPlaceRemoteRoadSite(room) {
    if (countRoadConstructionSites(room) >= MAX_ROAD_SITES_REMOTE) return false;
    return roomConstructionSiteBudget(room) > 0;
}

function getExitCenter(room, targetRoomName) {
    const dir = Game.map.findExit(room.name, targetRoomName);
    if (dir === ERR_NO_PATH || dir === ERR_INVALID_ARGS) return null;
    const tiles = room.find(dir);
    if (!tiles.length) return null;
    return tiles[Math.round(tiles.length / 2)];
}

function getRouteNeighborRooms(roomName, colony) {
    const exits = Game.map.describeExits(roomName);
    if (!exits) return [];

    const remotes = (ROOM_REMOTE_TARGETS[colony] || []).map(s => s.room);
    const onRoute = new Set([colony, ...remotes]);
    for (const remote of remotes) {
        const route = getMiningRouteRooms(colony, remote);
        for (let i = 0; i < route.length; i++) onRoute.add(route[i]);
    }

    const neighbors = [];
    for (const neighbor of Object.values(exits)) {
        if (onRoute.has(neighbor)) neighbors.push(neighbor);
    }
    return neighbors;
}

function getRemoteRoadTargets(room, colony, context = {}) {
    if (context.type === 'transit' && context.remote) {
        const route = getMiningRouteRooms(colony, context.remote);
        if (!route.length) return [];
        const idx = route.indexOf(room.name);
        if (idx < 0) return [];

        const prevRoom = idx === 0 ? colony : route[idx - 1];
        const nextRoom = idx === route.length - 1 ? context.remote : route[idx + 1];
        const enter = getExitCenter(room, prevRoom);
        const exit = getExitCenter(room, nextRoom);
        if (!enter || !exit) return [];
        return [enter, exit];
    }

    const targets = [];
    const seen = new Set();
    const add = (pos) => {
        if (!pos) return;
        const key = getPosKey(pos);
        if (seen.has(key)) return;
        seen.add(key);
        targets.push(pos);
    };

    add(getExitCenter(room, colony));

    for (const source of room.sources) {
        const container = resolveSourceContainer(source, room);
        add(container ? container.pos : source.pos);
    }

    if (room.controller) add(room.controller.pos);

    const intel = INTEL[room.name];
    if (intel && intel.sk) {
        const mineral = room.mineral || room.find(FIND_MINERALS)[0];
        if (mineral) add(mineral.pos);
    }

    for (const neighbor of getRouteNeighborRooms(room.name, colony)) {
        add(getExitCenter(room, neighbor));
    }

    return targets;
}

function sortRemoteTargets(room, origin, targets) {
    return targets.slice().sort((a, b) => {
        const pa = TARGET_ORDER[classifyTarget(room, a)] ?? 9;
        const pb = TARGET_ORDER[classifyTarget(room, b)] ?? 9;
        if (pa !== pb) return pa - pb;
        if (origin) return origin.getRangeTo(a) - origin.getRangeTo(b);
        return 0;
    });
}

function addPathTilesNeedingRoads(room, path, needed) {
    for (const point of path) {
        if ((point.roomName || room.name) !== room.name) continue;
        const pos = new RoomPosition(point.x, point.y, room.name);
        if (!isRoadSatisfied(pos)) needed.add(getPosKey(pos));
    }
}

function buildRemoteRoadTiles(room, colony, context = {}) {
    const needed = new Set();
    const targets = getRemoteRoadTargets(room, colony, context);
    if (!targets.length) return needed;

    if (context.type === 'transit') {
        const path = findRoadPath(room, targets[0], targets[1], 'remote');
        if (path) addPathTilesNeedingRoads(room, path, needed);
        return needed;
    }

    const network = new Set();
    const matrix = ensureRoomMatrix(room.name, 'remote').clone();

    for (const road of room.roads) {
        const key = getPosKey(road.pos);
        network.add(key);
        markTileOnMatrix(matrix, key, 'remote');
    }

    const anchor = targets[0];
    if (anchor) {
        network.add(getPosKey(anchor));
        markTileOnMatrix(matrix, getPosKey(anchor), 'remote');
    }

    for (const target of sortRemoteTargets(room, anchor, targets.slice(1))) {
        const networkAnchor = nearestNetworkPos(target, network, room.name);
        if (!networkAnchor || networkAnchor.getRangeTo(target) <= 1) continue;

        const path = searchOnMatrix(networkAnchor, target, matrix);
        if (!path) continue;

        for (const step of path) {
            const key = getPosKey(step);
            network.add(key);
            markTileOnMatrix(matrix, key, 'remote');
            const pos = new RoomPosition(step.x, step.y, room.name);
            if (!isRoadSatisfied(pos)) needed.add(key);
        }
    }

    return needed;
}

function verifyCacheKey(roomName, colony, context) {
    return `${roomName}|${colony}|${context.type || 'remote'}|${context.remote || ''}`;
}

function clearRemoteRoadPlanCache(roomName) {
    const prefix = `${roomName}|`;
    for (const key of Object.keys(REMOTE_PLAN_CACHE)) {
        if (key.startsWith(prefix)) delete REMOTE_PLAN_CACHE[key];
    }
}

function clearRemoteRoadVerifyCache(roomName) {
    clearRemoteRoadPlanCache(roomName);
    const prefix = `${roomName}|`;
    for (const key of Object.keys(VERIFY_CACHE)) {
        if (key.startsWith(prefix)) delete VERIFY_CACHE[key];
    }
    for (const key of Object.keys(NEEDS_WORK_CACHE)) {
        if (key.startsWith(prefix)) delete NEEDS_WORK_CACHE[key];
    }
}

function getRemoteRoadPlan(room, colony, context = {}) {
    const cacheKey = verifyCacheKey(room.name, colony, context);
    const cached = REMOTE_PLAN_CACHE[cacheKey];
    if (cached && cached.tick === Game.time) return cached.plan;

    const targets = getRemoteRoadTargets(room, colony, context);
    const desired = buildRemoteRoadTiles(room, colony, context);
    const missing = [];
    let planValid = targets.length > 0;

    if (context.type === 'transit' && targets.length >= 2) {
        planValid = !!(getCachedPath(room, targets[0], targets[1], 'remote')
            || findRoadPath(room, targets[0], targets[1], 'remote'));
    }

    let complete = false;
    if (planValid) {
        complete = true;
        for (const key of desired) {
            const parts = key.split('x');
            const pos = new RoomPosition(Number(parts[0]), Number(parts[1]), room.name);
            complete = false;
            if (isRoadPlaceable(pos)) missing.push(pos);
        }
    }

    const plan = {targets, desired, missing, complete};
    REMOTE_PLAN_CACHE[cacheKey] = {tick: Game.time, plan};
    return plan;
}

function isRemoteRoadPlanComplete(room, colony, context = {}) {
    const plan = getRemoteRoadPlan(room, colony, context);
    return plan.complete && countRoadConstructionSites(room) === 0;
}

function syncRemoteRoadBuiltFlag(room, colony, context = {}) {
    const intel = INTEL[room.name];
    if (!intel) return;
    if (isRemoteRoadPlanComplete(room, colony, context)) {
        setRoadsBuiltFlag(room, true);
        intel.roadCount = room.roads.length;
    } else if (intel.roadsBuilt) {
        setRoadsBuiltFlag(room, undefined);
        delete intel.roadCount;
    }
}

function remoteRoomRoadPathsComplete(room, colony, context = {}, options = {}) {
    const cacheKey = verifyCacheKey(room.name, colony, context);
    if (!options.force) {
        const cached = VERIFY_CACHE[cacheKey];
        if (cached && cached.tick + VERIFY_CACHE_TTL > Game.time) return cached.complete;
    }

    const complete = isRemoteRoadPlanComplete(room, colony, context);
    VERIFY_CACHE[cacheKey] = {tick: Game.time, complete};
    return complete;
}

function isColonyRoadRoom(roomName, colony) {
    if (roomName === colony) return null;
    const targets = ROOM_REMOTE_TARGETS[colony] || [];
    if (targets.some(s => s.room === roomName)) return {type: 'remote'};
    for (const s of targets) {
        const route = getMiningRouteRooms(colony, s.room);
        if (route.length && route.includes(roomName)) {
            return {type: 'transit', remote: s.room};
        }
    }
    return null;
}

function getColonyRoadRooms(colony) {
    const targets = ROOM_REMOTE_TARGETS[colony] || [];
    const rooms = [];
    const seen = new Set();

    const add = (roomName, priority) => {
        if (seen.has(roomName) || roomName === colony) return;
        const intel = INTEL[roomName];
        if (!intel || intel.owner) return;
        seen.add(roomName);
        rooms.push({room: roomName, priority: priority || 50});
    };

    for (const s of targets) add(s.room, s.score);

    const remotes = _.uniq(targets.map(s => s.room));
    for (const remote of remotes) {
        const route = getMiningRouteRooms(colony, remote);
        for (let i = 0; i < route.length; i++) {
            const r = route[i];
            if (r === colony || r === remote) continue;
            add(r, 20 + i);
        }
    }
    return _.sortBy(rooms, 'priority');
}

function roomNeedsRoadWorkByName(roomName, colony) {
    const intel = INTEL[roomName];
    if (!intel || intel.owner) return false;
    const context = isColonyRoadRoom(roomName, colony);
    if (!context) return false;
    const room = Game.rooms[roomName];
    if (room) return remoteRoomNeedsRoadWork(room, colony, context);
    return !intel.roadsBuilt;
}

function getColonyRoadWorkRooms(colony) {
    return getColonyRoadRooms(colony).filter(entry => roomNeedsRoadWorkByName(entry.room, colony));
}

function getUnfinishedRoadRooms(colony) {
    return getColonyRoadWorkRooms(colony);
}

function colonyNeedsRoadWork(colony) {
    return getColonyRoadWorkRooms(colony).length > 0;
}

function pickRoadWorkRoom(colony, creepId) {
    const work = getColonyRoadWorkRooms(colony);
    if (!work.length) return null;
    let hash = 0;
    if (creepId) {
        for (let i = 0; i < creepId.length; i++) hash += creepId.charCodeAt(i);
    }
    return work[hash % work.length].room;
}

function roadBuildersNeeded(colony) {
    const remotes = _.uniq((ROOM_REMOTE_TARGETS[colony] || []).map(s => s.room));
    if (!remotes.length || !colonyNeedsRoadWork(colony)) return 0;
    return Math.min(3, Math.max(1, remotes.length));
}

function tryPlaceNextRemoteRoad(room, colony, context = {}) {
    const plan = getRemoteRoadPlan(room, colony, context);
    for (const pos of plan.missing) {
        if (!canPlaceRemoteRoadSite(room)) return false;
        if (tryCreateConstructionSite(pos, STRUCTURE_ROAD) === OK) {
            clearRemoteRoadVerifyCache(room.name);
            return true;
        }
    }
    return false;
}

function remoteRoomNeedsRoadWork(room, colony, context = {}) {
    const cacheKey = verifyCacheKey(room.name, colony, context) + '|work';
    const cached = NEEDS_WORK_CACHE[cacheKey];
    if (cached && cached.tick + VERIFY_CACHE_TTL > Game.time) return cached.needsWork;

    let needsWork = countRoadConstructionSites(room) > 0;
    if (!needsWork) {
        for (const road of room.roads) {
            if (road.hits < road.hitsMax * 0.75) {
                needsWork = true;
                break;
            }
        }
    }
    if (!needsWork) {
        const plan = getRemoteRoadPlan(room, colony, context);
        needsWork = plan.missing.length > 0;
    }

    NEEDS_WORK_CACHE[cacheKey] = {tick: Game.time, needsWork};
    return needsWork;
}

function roadPlacementLimit(room, layoutPending) {
    const roadSites = countRoadConstructionSites(room);
    if (layoutPending && roadSites >= MAX_ROAD_SITES_QUEUED) return 0;

    const reserve = layoutPending ? LAYOUT_SITE_RESERVE : 1;
    const budget = roomConstructionSiteBudget(room);
    return Math.min(MAX_ROAD_SITES_PER_TICK, Math.max(0, budget - reserve));
}

function collectRoomRoadStructures(roomOrName) {
    const room = typeof roomOrName === 'string' ? Game.rooms[roomOrName] : roomOrName;
    const roomName = room ? room.name : (typeof roomOrName === 'string' ? roomOrName : null);
    const seen = new Set();
    const roads = [];
    const add = (s) => {
        if (!s || s.structureType !== STRUCTURE_ROAD || seen.has(s.id)) return;
        if (roomName && s.pos.roomName !== roomName) return;
        seen.add(s.id);
        roads.push(s);
    };

    if (room) {
        if (room.__nativeFind) {
            try {
                (room.__nativeFind(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_ROAD}}) || []).forEach(add);
            } catch (e) { /* corrupt room */
            }
        }
        try {
            room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_ROAD}}).forEach(add);
        } catch (e) { /* corrupt room */
        }
        try {
            room.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_ROAD}}).forEach(add);
        } catch (e) { /* corrupt room */
        }
        if (room.roads && room.roads.length) room.roads.forEach(add);
        if (room.structures) room.structures.filter(s => s.structureType === STRUCTURE_ROAD).forEach(add);
    }

    if (Game.structures) {
        for (const id in Game.structures) {
            add(Game.structures[id]);
        }
    }

    return roads;
}

function getRoomRoadStructures(room) {
    if (!room) return [];
    return collectRoomRoadStructures(room);
}

function clearOwnedRoomRoadCaches(roomName) {
    clearRoomPlanCache(roomName);
    clearRoomMatrixCache(roomName, 'owned');
    clearRoomMatrixCache(roomName, 'remote');
    clearRoomPathCache(roomName, 'owned');
    clearRoomPathCache(roomName, 'remote');
    if (global.ROAD_CACHE_OWNED) delete global.ROAD_CACHE_OWNED[roomName];
    if (global.ROAD_CACHE_REMOTE) delete global.ROAD_CACHE_REMOTE[roomName];
    if (INTEL[roomName]) {
        delete INTEL[roomName].roadsBuilt;
        delete INTEL[roomName].roadCount;
    }
    clearRemoteRoadVerifyCache(roomName);
}

function clearOwnedRoomRoadNetwork(roomOrName) {
    const roomName = typeof roomOrName === 'string' ? roomOrName : roomOrName && roomOrName.name;
    if (!roomName) return {destroyed: 0, failed: 0, sites: 0, complete: true};

    const room = Game.rooms[roomName];
    let destroyed = 0;
    let failed = 0;
    let sites = 0;

    const roads = collectRoomRoadStructures(roomName);
    for (const road of roads) {
        if (road.destroy() === OK) destroyed++;
        else failed++;
    }

    if (room) {
        const seenSites = new Set();
        const siteLists = [];
        if (room.__nativeFind) {
            try {
                siteLists.push(room.__nativeFind(FIND_MY_CONSTRUCTION_SITES) || []);
            } catch (e) { /* corrupt room */
            }
        }
        try {
            siteLists.push(room.find(FIND_MY_CONSTRUCTION_SITES));
        } catch (e) { /* corrupt room */
        }
        if (room.constructionSites) siteLists.push(room.constructionSites);
        for (const site of _.flatten(siteLists)) {
            if (!site || site.structureType !== STRUCTURE_ROAD || seenSites.has(site.id)) continue;
            seenSites.add(site.id);
            if (site.remove() === OK) sites++;
        }
    }

    delete MATRIX_HEAP.owned[roomName];
    clearOwnedRoomRoadCaches(roomName);

    return {destroyed, failed, sites, roadsFound: roads.length, roomName};
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
            markPlannedTile(room.name, 'owned', getPosKey(pos));
            clearRoomPlanCache(room.name);
            clearRoomMatrixCache(room.name, 'owned');
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
    clearRoomMatrixCache,
    clearRoomPlanCache,
    clearOwnedRoomRoadCaches,
    clearOwnedRoomRoadNetwork,
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
    getConnectorRoadTiles: room => getRoadPlan(room).connector,
    getLayoutRoadTiles,
    getRoadTargets,
    roadPlacementLimit,
    countRoadConstructionSites,
    getRoomRoadStructures,
    canPlaceRemoteRoadSite,
    getRemoteRoadTargets,
    getRemoteRoadPlan,
    isRemoteRoadPlanComplete,
    syncRemoteRoadBuiltFlag,
    clearRemoteRoadPlanCache,
    clearRemoteRoadVerifyCache,
    remoteRoomRoadPathsComplete,
    isColonyRoadRoom,
    getColonyRoadRooms,
    getColonyRoadWorkRooms,
    getUnfinishedRoadRooms,
    colonyNeedsRoadWork,
    pickRoadWorkRoom,
    roadBuildersNeeded,
    tryPlaceNextRemoteRoad,
    remoteRoomNeedsRoadWork,
    roomNeedsRoadWorkByName,
};