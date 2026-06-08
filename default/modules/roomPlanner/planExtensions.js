/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Dynamic and source-adjacent extension placement.

 */


const {extensionPositionCache} = require('planState');

const {coreTemplate} = require('planTemplates');

function buildSourceExtensions(room) {
    const hub = room.hub;

    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        if (!container) continue;

        // Must have a confirmed link before placing â€” link builder picks its own tile first
        const link = source.memory.link ? Game.getObjectById(source.memory.link) : null;
        if (!link) {
            // Skip if link is mid-build (don't block the in-progress site)
            const linkSite = container.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)
                .find(s => s.structureType === STRUCTURE_LINK);
            if (linkSite) continue;
            // No link and no site â€” link hasn't been built for this source yet, skip
            continue;
        }

        // Collect open neighbors of the container (potential extension sites + access tiles)
        const candidates = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const x = container.pos.x + dx, y = container.pos.y + dy;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                const pos = new RoomPosition(x, y, room.name);
                if (pos.checkForWall()) continue;
                if (pos.isEqualTo(source.pos)) continue;         // source tile
                if (pos.isEqualTo(link.pos)) continue;           // link tile
                if (pos.checkForAllStructure() || pos.checkForConstructionSites()) continue;
                candidates.push(pos);
            }
        }

        // Reserve one open neighbor pathable to the hub so haulers can still reach the container
        let reserved = null;
        if (hub && candidates.length > 0) {
            reserved = _.min(candidates, p => p.getRangeTo(hub));
        }

        for (const pos of candidates) {
            if (reserved && pos.isEqualTo(reserved)) continue;
            if (hub && pos.getRangeTo(hub) <= 5) continue;   // hub cluster handles its own
            if (pos.createConstructionSite(STRUCTURE_EXTENSION) === OK) return true;
        }
    }
    return false;
}


function getExtensionPositions(room) {
    if (extensionPositionCache[room.name]) return extensionPositionCache[room.name];
    // Warm the module cache from Memory after a global reset
    if (room.memory.dynamicExtensionsPacked) {
        extensionPositionCache[room.name] = room.memory.dynamicExtensionsPacked.map(n => ({
            x: n % 50,
            y: Math.floor(n / 50)
        }));
        return extensionPositionCache[room.name];
    }
    return generateExtensionPositions(room);
}

function generateExtensionPositions(room) {
    const hub = room.hub;
    const excluded = new Set([`${hub.x},${hub.y}`]);
    for (const entry of coreTemplate) {
        for (const {x, y} of entry.pos) excluded.add(`${hub.x + x},${hub.y + y}`);
    }
    const terrain = Game.map.getRoomTerrain(room.name);
    const positions = [], visited = new Set([`${hub.x},${hub.y}`]);
    const queue = [{x: hub.x, y: hub.y}];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    while (queue.length && positions.length < 100) {
        const {x, y} = queue.shift();
        for (const [dx, dy] of dirs) {
            const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
            if (visited.has(key) || nx < 2 || nx > 47 || ny < 2 || ny > 47) continue;
            visited.add(key);
            // Don't propagate BFS through terrain walls â€” otherwise expansion tunnels
            // through walls and places extensions on tiles that are far from the hub by path
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            queue.push({x: nx, y: ny});
            if (excluded.has(key)) continue;
            // Checkerboard: only use even-parity tiles so every extension is surrounded by
            // non-extension tiles on all 4 cardinal directions â€” guarantees no pathing blockage
            if ((nx + ny) % 2 !== 0) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (pos.checkForImpassible()) continue;
            if (pos.isNearTo(room.controller)) continue;
            const src = pos.findClosestByRange(FIND_SOURCES);
            if (src && pos.isNearTo(src)) continue;
            positions.push({x: nx, y: ny});
        }
    }
    extensionPositionCache[room.name] = positions;
    room.memory.dynamicExtensionsPacked = positions.map(p => p.x + p.y * 50);
    if (room.memory.dynamicExtensions) room.memory.dynamicExtensions = undefined; // clean up old format
    log.a(`${room.name} generated ${positions.length} dynamic extension positions`);
    return positions;
}

function placeExtensionsDynamically(room) {
    const positions = getExtensionPositions(room);
    const needed = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
    const existing = room.extensions.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_EXTENSION).length;
    if (existing >= needed) return false;
    for (const {x, y} of positions) {
        const result = new RoomPosition(x, y, room.name).createConstructionSite(STRUCTURE_EXTENSION);
        if (result === OK) return true;
        if (result === ERR_FULL) return false;
        if (result === ERR_RCL_NOT_ENOUGH) return false;
    }
    return false;
}

module.exports = {

    buildSourceExtensions,

    placeExtensionsDynamically,

};