/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Dynamic and source-adjacent extension placement.
 */

const {extensionPositionCache, dynamicLayoutCache} = require('planState');

const {bunkerTemplate, coreTemplate} = require('planTemplates');

const {invalidateRampartSpots} = require('planRamparts');
const {canPlaceConstructionSite, tryCreateConstructionSite, roomConstructionSiteBudget} = require('planUtils');

const EXTENSION_BATCH_MAX = 3;

function unpackPackedTiles(packed) {
    return packed.map(n => ({x: n % 50, y: Math.floor(n / 50)}));
}

function packTiles(tiles) {
    return tiles.map(p => p.x + p.y * 50);
}

function buildLayoutExcluded(room) {
    const hub = room.memory.bunkerHub;
    if (!hub || hub.x === undefined) return new Set();
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const excluded = new Set([`${hub.x},${hub.y}`]);
    for (const entry of tmpl) {
        if (entry.structureType === STRUCTURE_EXTENSION) continue;
        for (const {x, y} of entry.pos) excluded.add(`${hub.x + x},${hub.y + y}`);
    }
    return excluded;
}

function getExtensionDeficit(room) {
    const needed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;
    const existing = room.extensions.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_EXTENSION).length;
    return Math.max(0, needed - existing);
}

function getExtensionPlacementLimit(room) {
    return Math.min(getExtensionDeficit(room), roomConstructionSiteBudget(room), EXTENSION_BATCH_MAX);
}

function clearDynamicLayoutMemory(room) {
    delete room.memory.dynamicExtensionsPacked;
    delete room.memory.dynamicCorridorPacked;
    delete dynamicLayoutCache[room.name];
    delete extensionPositionCache[room.name];
}

function classifyExtensionTile(room, pos) {
    if (pos.checkForWall()) return 'wall';
    if (pos.checkForImpassible()) return 'impassible';
    if (pos.checkForConstructionSites()) return 'site';
    if (pos.checkForAllStructure()) return 'structure';
    if (buildLayoutExcluded(room).has(`${pos.x},${pos.y}`)) return 'bunkerCore';
    if (pos.isNearTo(room.controller)) return 'nearController';
    for (const source of room.sources) {
        if (pos.isNearTo(source)) return 'nearSource';
    }
    return 'ok';
}

function countPlaceableBunkerExtensions(room) {
    const hub = room.hub;
    const entry = bunkerTemplate.find(s => s.structureType === STRUCTURE_EXTENSION);
    if (!entry || !hub) return {placeable: 0, total: 0, blocked: []};
    let placeable = 0;
    const blocked = [];
    for (const buildPos of entry.pos) {
        const pos = new RoomPosition(hub.x + buildPos.x, hub.y + buildPos.y, room.name);
        const reason = classifyExtensionTile(room, pos);
        if (reason === 'ok') placeable++;
        else if (blocked.length < 8) blocked.push({x: pos.x, y: pos.y, reason});
    }
    return {placeable, total: entry.pos.length, blocked};
}

function assessHubExtensionCapacity(room) {
    const deficit = getExtensionDeficit(room);
    if (deficit <= 0 || room.memory.dynamicLayout || !room.memory.bunkerHub) {
        return {sufficient: true, placeable: 0, fallback: 0, deficit};
    }
    const placeable = countPlaceableBunkerExtensions(room).placeable;
    const fallback = findExtensionCandidatesNearHub(room).length;
    return {
        sufficient: placeable >= deficit || (placeable + fallback) >= deficit,
        placeable,
        fallback,
        deficit,
    };
}

function auditExtensionPlacement(room) {
    const spawn = room.spawns.find(s => s.name !== 'auto') || room.spawns[0];
    const hub = room.memory.bunkerHub;
    const bunkerSlots = countPlaceableBunkerExtensions(room);
    const hubCandidates = room.memory.dynamicLayout ? [] : findExtensionCandidatesNearHub(room);
    return {
        spawn: spawn && {x: spawn.pos.x, y: spawn.pos.y, name: spawn.name},
        controller: room.controller && {x: room.controller.pos.x, y: room.controller.pos.y},
        hubToController: hub && room.controller
            ? new RoomPosition(hub.x, hub.y, room.name).getRangeTo(room.controller)
            : undefined,
        hubAlignedToSpawn: !!(spawn && hub && spawn.pos.x + 1 === hub.x && spawn.pos.y + 1 === hub.y),
        bunkerSlots,
        fallbackCandidates: hubCandidates.length,
        sampleFallback: hubCandidates.slice(0, 5).map(p => `${p.x},${p.y}`),
        hubCapacity: assessHubExtensionCapacity(room),
        batchLimit: getExtensionPlacementLimit(room),
    };
}

function findExtensionCandidatesNearHub(room) {
    const hub = room.hub;
    if (!hub) return [];
    const excluded = buildLayoutExcluded(room);
    const terrain = Game.map.getRoomTerrain(room.name);
    const extensions = [];
    const visited = new Set([`${hub.x},${hub.y}`]);
    const queue = [{x: hub.x, y: hub.y}];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

    while (queue.length && extensions.length < 100) {
        const {x, y} = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
            if (visited.has(key) || nx < 2 || nx > 47 || ny < 2 || ny > 47) continue;
            visited.add(key);
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            queue.push({x: nx, y: ny});
            if (excluded.has(key)) continue;
            if ((nx + ny) % 2 !== 0) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (classifyExtensionTile(room, pos) !== 'ok') continue;
            extensions.push({x: nx, y: ny});
        }
    }
    return extensions;
}

function computeDynamicLayoutTiles(room) {
    if (dynamicLayoutCache[room.name]) return dynamicLayoutCache[room.name];

    if (room.memory.dynamicExtensionsPacked && room.memory.dynamicCorridorPacked) {
        const extensions = unpackPackedTiles(room.memory.dynamicExtensionsPacked);
        if (!extensions.length && getExtensionDeficit(room) > 0) {
            clearDynamicLayoutMemory(room);
        } else {
            const layout = {
                extensions,
                corridors: unpackPackedTiles(room.memory.dynamicCorridorPacked),
            };
            dynamicLayoutCache[room.name] = layout;
            extensionPositionCache[room.name] = layout.extensions;
            return layout;
        }
    }

    const hub = room.hub;
    const excluded = buildLayoutExcluded(room);
    const terrain = Game.map.getRoomTerrain(room.name);
    const extensions = [];
    const corridors = [];
    const visited = new Set([`${hub.x},${hub.y}`]);
    const queue = [{x: hub.x, y: hub.y}];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

    while (queue.length && extensions.length < 100) {
        const {x, y} = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
            if (visited.has(key) || nx < 2 || nx > 47 || ny < 2 || ny > 47) continue;
            visited.add(key);
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            queue.push({x: nx, y: ny});
            if (excluded.has(key)) continue;
            let isExtension = false;
            if ((nx + ny) % 2 === 0) {
                const pos = new RoomPosition(nx, ny, room.name);
                if (!pos.checkForImpassible() && !pos.isNearTo(room.controller)) {
                    const src = pos.findClosestByRange(FIND_SOURCES);
                    if (!(src && pos.isNearTo(src))) {
                        extensions.push({x: nx, y: ny});
                        isExtension = true;
                    }
                }
            }
            if (!isExtension) corridors.push({x: nx, y: ny});
        }
    }

    const layout = {extensions, corridors};
    dynamicLayoutCache[room.name] = layout;
    extensionPositionCache[room.name] = extensions;
    room.memory.dynamicExtensionsPacked = packTiles(extensions);
    room.memory.dynamicCorridorPacked = packTiles(corridors);
    if (room.memory.dynamicExtensions) room.memory.dynamicExtensions = undefined;
    invalidateRampartSpots(room);
    log.a(`${room.name} generated ${extensions.length} dynamic extensions and ${corridors.length} corridor tiles`);
    return layout;
}

function placeExtensionsFromCandidates(room, positions, maxPlacements = 1) {
    let placed = 0;
    for (const {x, y} of positions) {
        if (placed >= maxPlacements || getExtensionDeficit(room) <= 0) break;
        if (!canPlaceConstructionSite(room)) break;
        const result = tryCreateConstructionSite(new RoomPosition(x, y, room.name), STRUCTURE_EXTENSION);
        if (result === OK) {
            placed++;
            invalidateRampartSpots(room);
        } else if (result === ERR_FULL || result === ERR_RCL_NOT_ENOUGH) {
            break;
        }
    }
    return placed;
}

function placeBunkerExtensions(room, maxPlacements = 1) {
    const hub = room.hub;
    const entry = bunkerTemplate.find(s => s.structureType === STRUCTURE_EXTENSION);
    if (!entry || !hub || getExtensionDeficit(room) <= 0) return 0;
    let placed = 0;
    for (const buildPos of entry.pos) {
        if (placed >= maxPlacements) break;
        const pos = new RoomPosition(hub.x + buildPos.x, hub.y + buildPos.y, room.name);
        if (classifyExtensionTile(room, pos) !== 'ok') continue;
        if (!canPlaceConstructionSite(room)) break;
        if (tryCreateConstructionSite(pos, STRUCTURE_EXTENSION) === OK) {
            placed++;
            invalidateRampartSpots(room);
        }
    }
    return placed;
}

function placeExtensionsFallback(room, maxPlacements = 1) {
    const positions = findExtensionCandidatesNearHub(room);
    if (!positions.length) return 0;
    const placed = placeExtensionsFromCandidates(room, positions, maxPlacements);
    if (placed) log.a(`${room.name} placed ${placed} fallback extension(s) near hub`);
    return placed;
}

function placeRoomExtensions(room) {
    const limit = getExtensionPlacementLimit(room);
    if (limit <= 0) return 0;
    if (room.memory.dynamicLayout) return placeExtensionsDynamically(room, limit);
    let placed = placeBunkerExtensions(room, limit);
    if (placed < limit && getExtensionDeficit(room) > 0) {
        placed += placeExtensionsFallback(room, limit - placed);
    }
    return placed;
}

function tryPlaceRoomExtensions(room) {
    if (getExtensionDeficit(room) <= 0) return {placed: false, reason: 'none needed'};
    const limit = getExtensionPlacementLimit(room);
    if (limit <= 0) return {placed: false, reason: 'no site budget', siteBudget: roomConstructionSiteBudget(room)};
    if (room.memory.dynamicLayout) {
        const count = placeExtensionsDynamically(room, limit);
        return {placed: count > 0, count, method: count ? 'dynamic' : 'dynamic-failed', limit};
    }
    const bunkerSlots = countPlaceableBunkerExtensions(room);
    let count = placeBunkerExtensions(room, limit);
    let method;
    if (count) method = 'bunker';
    if (count < limit && getExtensionDeficit(room) > 0) {
        const fallbackCount = placeExtensionsFallback(room, limit - count);
        if (fallbackCount) {
            count += fallbackCount;
            method = method ? 'bunker+fallback' : 'fallback';
        }
    }
    if (count) return {placed: true, count, method, limit, bunkerSlots};
    return {
        placed: false,
        method: 'failed',
        limit,
        bunkerSlots,
        fallbackCandidates: findExtensionCandidatesNearHub(room).length,
    };
}

function buildSourceExtensions(room) {
    const hub = room.hub;

    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        if (!container) continue;

        const link = source.memory.link ? Game.getObjectById(source.memory.link) : null;
        if (!link) {
            const linkSite = container.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)
                .find(s => s.structureType === STRUCTURE_LINK);
            if (linkSite) continue;
            continue;
        }

        const candidates = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const x = container.pos.x + dx, y = container.pos.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const pos = new RoomPosition(x, y, room.name);
                if (pos.checkForWall()) continue;
                if (pos.isEqualTo(source.pos)) continue;
                if (pos.isEqualTo(link.pos)) continue;
                if (pos.checkForAllStructure() || pos.checkForConstructionSites()) continue;
                candidates.push(pos);
            }
        }

        let reserved = null;
        if (hub && candidates.length > 0) {
            reserved = _.min(candidates, p => p.getRangeTo(hub));
            source.memory.accessReserved = {x: reserved.x, y: reserved.y};
        }

        for (const pos of candidates) {
            if (reserved && pos.isEqualTo(reserved)) continue;
            if (hub && pos.getRangeTo(hub) <= 5) continue;
            if (!canPlaceConstructionSite(room)) return false;
            if (tryCreateConstructionSite(pos, STRUCTURE_EXTENSION) === OK) {
                invalidateRampartSpots(room);
                return true;
            }
        }
    }
    return false;
}

function getExtensionPositions(room) {
    return computeDynamicLayoutTiles(room).extensions;
}

function getCorridorPositions(room) {
    return computeDynamicLayoutTiles(room).corridors;
}

function placeExtensionsDynamically(room, maxPlacements = 1) {
    if (getExtensionDeficit(room) <= 0) return 0;
    const positions = getExtensionPositions(room);
    if (!positions.length) {
        if (room.memory.dynamicExtensionsPacked) clearDynamicLayoutMemory(room);
        return 0;
    }
    return placeExtensionsFromCandidates(room, positions, maxPlacements);
}

module.exports = {
    buildSourceExtensions,
    placeExtensionsDynamically,
    placeBunkerExtensions,
    placeExtensionsFallback,
    placeRoomExtensions,
    tryPlaceRoomExtensions,
    getExtensionPositions,
    getCorridorPositions,
    getExtensionDeficit,
    clearDynamicLayoutMemory,
    countPlaceableBunkerExtensions,
    assessHubExtensionCapacity,
    auditExtensionPlacement,
    getExtensionPlacementLimit,
};