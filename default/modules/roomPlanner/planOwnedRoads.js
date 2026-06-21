/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Owned-room roads: layout template tiles + paths from hub to towers, sources,
 * controller, mineral, and exit centers. Self-contained — remote roads stay in planRoadPaths.js.
 */

const {bunkerTemplate, coreTemplate} = require('planTemplates');
const {getCorridorPositions} = require('planExtensions');
const {
    setRoadsBuiltFlag,
    resolveSourceContainer,
    canPlaceConstructionSite,
    tryCreateConstructionSite,
} = require('planUtils');

const MAX_SITES_PER_TICK = 5;

const EXIT_DIRS = {
    '1': FIND_EXIT_TOP,
    '3': FIND_EXIT_RIGHT,
    '5': FIND_EXIT_BOTTOM,
    '7': FIND_EXIT_LEFT,
};

const matrixCache = {room: null, tick: 0, matrix: null};

function tileKey(x, y) {
    return `${x}x${y}`;
}

function getRoadOrigin(room) {
    if (room.hub) {
        if (!room.hub.checkForImpassible(true)) return room.hub;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const pos = new RoomPosition(room.hub.x + dx, room.hub.y + dy, room.name);
                if (!pos.checkForImpassible(true)) return pos;
            }
        }
        return room.hub;
    }
    return room.spawns[0] || null;
}

function buildRoadMatrix(room) {
    if (matrixCache.room === room.name && matrixCache.tick === Game.time) return matrixCache.matrix;

    const costs = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(room.name);

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) costs.set(x, y, 255);
            else if (tile === TERRAIN_MASK_SWAMP) costs.set(x, y, 60);
            else costs.set(x, y, 20);
        }
    }

    for (const structure of room.structures) {
        if (structure.structureType === STRUCTURE_ROAD) costs.set(structure.pos.x, structure.pos.y, 1);
        else if (structure.structureType === STRUCTURE_CONTAINER) costs.set(structure.pos.x, structure.pos.y, 100);
        else if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) costs.set(structure.pos.x, structure.pos.y, 255);
    }
    for (const site of room.constructionSites) {
        if (site.structureType === STRUCTURE_ROAD) costs.set(site.pos.x, site.pos.y, 1);
    }

    matrixCache.room = room.name;
    matrixCache.tick = Game.time;
    matrixCache.matrix = costs;
    return costs;
}

function pathTiles(room, from, to) {
    const begin = from instanceof RoomPosition ? from : from.pos;
    const end = to instanceof RoomPosition ? to : to.pos;
    const result = PathFinder.search(begin, {pos: end, range: 1}, {
        heuristicWeight: 0.8,
        maxRooms: 1,
        roomCallback: () => buildRoadMatrix(room),
    });
    if (result.incomplete || !result.path.length) return [];
    return result.path.filter(p => (p.roomName || room.name) === room.name);
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
        const key = tileKey(pos.x, pos.y);
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
            coreKeys.add(tileKey(room.hub.x + x, room.hub.y + y));
        }
    }

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (const key of coreKeys) {
        const [cx, cy] = key.split('x').map(Number);
        for (const [dx, dy] of dirs) {
            const neighbor = tileKey(cx + dx, cy + dy);
            if (!coreKeys.has(neighbor)) tiles.add(neighbor);
        }
    }
    return tiles;
}

function getLayoutRoadTiles(room) {
    const tiles = new Set();
    if (!room.hub) return tiles;

    if (room.memory.dynamicLayout) {
        for (const {x, y} of getCorridorPositions(room)) tiles.add(tileKey(x, y));
        for (const key of getHubPadTiles(room)) tiles.add(key);
        return tiles;
    }

    for (const entry of bunkerTemplate) {
        if (entry.structureType !== STRUCTURE_ROAD) continue;
        for (const offset of entry.pos) {
            tiles.add(tileKey(room.hub.x + offset.x, room.hub.y + offset.y));
        }
    }
    return tiles;
}

function getConnectorRoadTiles(room) {
    const tiles = new Set();
    const origin = getRoadOrigin(room);
    if (!origin) return tiles;
    for (const target of getRoadTargets(room)) {
        for (const step of pathTiles(room, origin, target)) {
            tiles.add(tileKey(step.x, step.y));
        }
    }
    return tiles;
}

function isRoadSatisfied(pos) {
    if (pos.checkForRoad()) return true;
    const site = pos.checkForConstructionSites();
    return !!(site && site.structureType === STRUCTURE_ROAD);
}

function isRoadPlaceable(pos) {
    if (pos.checkForRoad()) return false;
    if (pos.checkForConstructionSites()) return false;
    if (pos.checkForWall() || pos.checkForImpassible(true)) return false;
    for (const s of pos.lookFor(LOOK_STRUCTURES)) {
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
        return false;
    }
    return true;
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
    const all = new Set([...connector, ...layout]);
    return all;
}

function isRoadPlanComplete(room) {
    const connector = getConnectorRoadTiles(room);
    const layout = getLayoutRoadTiles(room);
    return missingTiles(room, [connector, layout]).complete;
}

function diffRoadTiles(room, desired) {
    return missingTiles(room, [desired]);
}

function planOwnedRoomRoads(room) {
    if (!room.storage || !room.spawns.length || room.level < ROAD_LEVEL) {
        setRoadsBuiltFlag(room, undefined);
        return false;
    }
    if (Memory.pauseOwnedRoads && Memory.pauseOwnedRoads > Game.time) return false;

    const connector = getConnectorRoadTiles(room);
    const layout = getLayoutRoadTiles(room);
    const {missing, complete} = missingTiles(room, [connector, layout]);

    let placed = 0;
    for (const pos of missing) {
        if (placed >= MAX_SITES_PER_TICK) break;
        if (!canPlaceConstructionSite(room)) break;
        if (tryCreateConstructionSite(pos, STRUCTURE_ROAD) === OK) placed++;
    }

    setRoadsBuiltFlag(room, complete ? true : undefined);
    return placed > 0;
}

module.exports = {
    planOwnedRoomRoads,
    getRoadOrigin,
    getDesiredRoadTiles,
    isRoadPlanComplete,
    diffRoadTiles,
};