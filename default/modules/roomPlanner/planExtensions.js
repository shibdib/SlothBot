/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Dynamic and source-adjacent extension placement.

 */


const {extensionPositionCache, dynamicLayoutCache} = require('planState');

const {coreTemplate} = require('planTemplates');

const {invalidateRampartSpots} = require('planRamparts');
const {canPlaceConstructionSite, tryCreateConstructionSite} = require('planUtils');

function unpackPackedTiles(packed) {
    return packed.map(n => ({x: n % 50, y: Math.floor(n / 50)}));
}

function packTiles(tiles) {
    return tiles.map(p => p.x + p.y * 50);
}

function buildCoreExcluded(hub) {
    const excluded = new Set([`${hub.x},${hub.y}`]);
    for (const entry of coreTemplate) {
        for (const {x, y} of entry.pos) excluded.add(`${hub.x + x},${hub.y + y}`);
    }
    return excluded;
}

function computeDynamicLayoutTiles(room) {
    if (dynamicLayoutCache[room.name]) return dynamicLayoutCache[room.name];

    if (room.memory.dynamicExtensionsPacked && room.memory.dynamicCorridorPacked) {
        const layout = {
            extensions: unpackPackedTiles(room.memory.dynamicExtensionsPacked),
            corridors: unpackPackedTiles(room.memory.dynamicCorridorPacked),
        };
        dynamicLayoutCache[room.name] = layout;
        extensionPositionCache[room.name] = layout.extensions;
        return layout;
    }

    const hub = room.hub;
    const excluded = buildCoreExcluded(hub);
    const terrain = Game.map.getRoomTerrain(room.name);
    const extensions = [];
    const corridors = [];
    const extensionKeys = new Set();
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
                        extensionKeys.add(key);
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

function placeExtensionsDynamically(room) {
    const positions = getExtensionPositions(room);
    const needed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
    const existing = room.extensions.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_EXTENSION).length;
    if (existing >= needed) return false;
    for (const {x, y} of positions) {
        if (!canPlaceConstructionSite(room)) return false;
        const result = tryCreateConstructionSite(new RoomPosition(x, y, room.name), STRUCTURE_EXTENSION);
        if (result === OK) {
            invalidateRampartSpots(room);
            return true;
        }
        if (result === ERR_FULL) return false;
        if (result === ERR_RCL_NOT_ENOUGH) return false;
    }
    return false;
}

module.exports = {

    buildSourceExtensions,

    placeExtensionsDynamically,

    getExtensionPositions,

    getCorridorPositions,

};