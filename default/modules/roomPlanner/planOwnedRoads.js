/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Owned-room road planning: desired tile set, site placement, cleanup, completion.
 */

const {bunkerTemplate} = require('planTemplates');
const {getExtensionPositions} = require('planExtensions');
const {
    setRoadsBuiltFlag,
    resolveSourceContainer,
    canPlaceConstructionSite,
    tryCreateConstructionSite
} = require('planUtils');
const {findRoadPath} = require('planRoadPaths');

const MAX_SITES_PER_TICK = 5;
const CLEANUP_COOLDOWN = 5000;

const ROAD_CONNECT_TYPES = new Set([
    STRUCTURE_EXTENSION,
    STRUCTURE_SPAWN,
    STRUCTURE_TOWER,
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_LAB,
    STRUCTURE_LINK,
    STRUCTURE_EXTRACTOR,
]);

const BUNKER_LAYOUT_ROAD_TYPES = new Set([
    STRUCTURE_EXTENSION,
    STRUCTURE_SPAWN,
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_LINK,
]);

const EXIT_DIRS = {
    '1': FIND_EXIT_TOP,
    '3': FIND_EXIT_RIGHT,
    '5': FIND_EXIT_BOTTOM,
    '7': FIND_EXIT_LEFT,
};

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

function getMiddleExitTile(room, exitConstant) {
    const exits = room.find(exitConstant);
    if (!exits.length) return undefined;
    return exits[Math.floor((exits.length - 1) / 2)];
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

function isRoadSatisfied(pos) {
    if (pos.checkForRoad()) return true;
    const site = pos.checkForConstructionSites();
    return !!(site && site.structureType === STRUCTURE_ROAD);
}

function getLayout(room) {
    return room.memory.dynamicLayout ? null : bunkerTemplate;
}

function addLayoutRoadTiles(tiles, room, layout) {
    if (!layout || !room.hub) return;
    for (const entry of layout) {
        if (entry.structureType !== STRUCTURE_ROAD) continue;
        for (const offset of entry.pos) {
            tiles.add(tileKey(room.hub.x + offset.x, room.hub.y + offset.y));
        }
    }
}

function collectStructureTargets(room, layout) {
    const seen = new Set();
    const targets = [];
    const add = (pos) => {
        if (!pos) return;
        const key = tileKey(pos.x, pos.y);
        if (seen.has(key)) return;
        seen.add(key);
        targets.push(pos);
    };

    const skipType = (type) => layout && BUNKER_LAYOUT_ROAD_TYPES.has(type);

    for (const structure of room.structures) {
        if (!ROAD_CONNECT_TYPES.has(structure.structureType) || skipType(structure.structureType)) continue;
        add(structure.pos);
    }
    for (const site of room.constructionSites) {
        if (!ROAD_CONNECT_TYPES.has(site.structureType) || skipType(site.structureType)) continue;
        add(site.pos);
    }
    if (room.memory.dynamicLayout) {
        for (const {x, y} of getExtensionPositions(room)) {
            add(new RoomPosition(x, y, room.name));
        }
    }
    return targets;
}

function getConnectorTargets(room) {
    const layout = getLayout(room);
    const targets = collectStructureTargets(room, layout);

    for (const source of room.sources) {
        const container = resolveSourceContainer(source, room);
        if (container) targets.push(container.pos);
        else targets.push(source.pos);
    }

    const controllerContainer = global.resolveControllerContainer(room);
    if (controllerContainer) targets.push(controllerContainer.pos);
    else if (room.controller) targets.push(room.controller.pos);

    const neighboring = Game.map.describeExits(room.name);
    if (neighboring) {
        for (const direction in EXIT_DIRS) {
            if (!neighboring[direction]) continue;
            const exitTile = getMiddleExitTile(room, EXIT_DIRS[direction]);
            if (exitTile) targets.push(exitTile);
        }
    }

    if (room.level >= 6) {
        const extractorContainer = Game.getObjectById(room.memory.extractorContainer);
        if (extractorContainer) targets.push(extractorContainer.pos);
        else if (room.mineral) targets.push(room.mineral.pos);
    }

    return targets;
}

function addPathTiles(tiles, room, origin, target) {
    const path = findRoadPath(room, origin, target, 'owned');
    if (!path) return;
    for (const point of path) {
        if ((point.roomName || room.name) !== room.name) continue;
        tiles.add(tileKey(point.x, point.y));
    }
}

function addRampartPatrolTiles(tiles, room) {
    if (room.level < 7) return;
    if (ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]) {
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (ramparts) {
            for (const p of ramparts) {
                const pos = new RoomPosition(p.x, p.y, room.name);
                if (pos.checkForRampart()) tiles.add(tileKey(p.x, p.y));
            }
        }
    }
    for (const rampart of room.ramparts) {
        tiles.add(tileKey(rampart.pos.x, rampart.pos.y));
    }
}

function getDesiredRoadTiles(room) {
    const tiles = new Set();
    const layout = getLayout(room);
    const origin = getRoadOrigin(room);

    addLayoutRoadTiles(tiles, room, layout);

    if (origin) {
        for (const target of getConnectorTargets(room)) {
            addPathTiles(tiles, room, origin, target);
        }
    }

    addRampartPatrolTiles(tiles, room);
    return tiles;
}

function diffRoadTiles(room, desired) {
    const missing = [];
    let complete = true;
    for (const key of desired) {
        const [x, y] = key.split('x').map(Number);
        const pos = new RoomPosition(x, y, room.name);
        if (isRoadSatisfied(pos)) continue;
        complete = false;
        if (isRoadPlaceable(pos)) missing.push(pos);
    }
    return {missing, complete};
}

function isRoadPlanComplete(room) {
    return diffRoadTiles(room, getDesiredRoadTiles(room)).complete;
}

function countRoadSites(room) {
    let n = 0;
    for (const site of room.constructionSites) {
        if (site.structureType === STRUCTURE_ROAD) n++;
    }
    return n;
}

function createRoadSite(pos, room) {
    if (pos.roomName !== room.name || !Game.rooms[pos.roomName]) return ERR_INVALID_ARGS;
    if (!isRoadPlaceable(pos)) return ERR_INVALID_TARGET;
    return tryCreateConstructionSite(pos, STRUCTURE_ROAD);
}

function placeRoadSites(room, missing) {
    let placed = 0;
    for (const pos of missing) {
        if (placed >= MAX_SITES_PER_TICK) break;
        if (!canPlaceConstructionSite(room)) break;
        const result = createRoadSite(pos, room);
        if (result === OK) placed++;
        else if (result === ERR_FULL) break;
    }
    return placed;
}

function cleanupStrayRoads(room, desired) {
    const lastReset = Memory.lastGlobalReset;
    if (lastReset && lastReset + CLEANUP_COOLDOWN > Game.time) return;
    for (const road of room.roads) {
        if (!desired.has(tileKey(road.pos.x, road.pos.y))) road.destroy();
    }
}

function cleanupRoadsOnImpassible(room) {
    const bad = _.filter(room.impassibleStructures, s => s.pos.checkForRoad());
    if (!bad.length) return;
    const {clearRoomPathCache} = require('planRoadPaths');
    clearRoomPathCache(room.name, 'owned');
    bad.forEach(s => s.pos.checkForRoad().destroy());
}

function planOwnedRoomRoads(room) {
    if (!room.storage || !room.spawns.length || room.level < ROAD_LEVEL) {
        setRoadsBuiltFlag(room, undefined);
        return false;
    }
    if (Memory.pauseOwnedRoads && Memory.pauseOwnedRoads > Game.time) return false;

    cleanupRoadsOnImpassible(room);

    const desired = getDesiredRoadTiles(room);
    const {missing, complete} = diffRoadTiles(room, desired);
    const placed = placeRoadSites(room, missing);

    if (complete) cleanupStrayRoads(room, desired);
    setRoadsBuiltFlag(room, complete ? true : undefined);

    return placed > 0;
}

module.exports = {
    planOwnedRoomRoads,
    getRoadOrigin,
    getDesiredRoadTiles,
    isRoadPlanComplete,
    diffRoadTiles,
    cleanupRoadsOnImpassible,
};