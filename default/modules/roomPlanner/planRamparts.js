/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Rampart perimeter, protection, and quad traps.

 */


const minCut = require('util.minCut');

const {extensionPositionCache, quadTraps} = require('planState');

const {bunkerTemplate, coreTemplate, protectedStructureTypes} = require('planTemplates');

const {
    isValidRampartPosition, canPlaceConstructionSite, tryCreateConstructionSite, canPlaceConstructedWall,
    filterPerimeterBarrierSpots, bridgePerimeterGaps, isPerimeterBarrierTile,
} = require('planUtils');

const PERIMETER_ORPHAN_EXIT_CLEARANCE = 5;
function clampRect(rect) {
    const min = 2;
    const max = 47;
    let x1 = Math.min(Math.max(rect.x1, min), max);
    let x2 = Math.min(Math.max(rect.x2, min), max);
    let y1 = Math.min(Math.max(rect.y1, min), max);
    let y2 = Math.min(Math.max(rect.y2, min), max);
    if (x1 > x2) {
        const t = x1;
        x1 = x2;
        x2 = t;
    }
    if (y1 > y2) {
        const t = y1;
        y1 = y2;
        y2 = t;
    }
    // minCut randomly nudges 1-thick rects and can invert them at room edges; keep at least 2 tiles.
    if (x1 === x2) {
        if (x1 > min) x1--;
        else if (x2 < max) x2++;
    }
    if (y1 === y2) {
        if (y1 > min) y1--;
        else if (y2 < max) y2++;
    }
    return {x1, y1, x2, y2};
}

function pointRect(x, y, radius = 1) {
    return clampRect({x1: x - radius, y1: y - radius, x2: x + radius, y2: y + radius});
}

function invalidateRampartSpots(room) {
    if (ROOM_RAMPART_SPOTS) ROOM_RAMPART_SPOTS[room.name] = undefined;
    quadTraps[room.name] = undefined;
}

const SOURCE_PROTECTION_RADIUS = 4;
// minCut treats x/y 1 and 48 as TO_EXIT sinks; keep protected rects inset so the cut stays buildable.
const PERIMETER_BUILD_INSET = 3;

function structureDistToEdge(x, y) {
    return Math.min(x, y, 49 - x, 49 - y);
}

function isBorderMinCutStructure(x, y) {
    return structureDistToEdge(x, y) <= PERIMETER_BUILD_INSET;
}

function pushProtectionRect(rectArray, x, y, radius = 1) {
    if (isBorderMinCutStructure(x, y)) return;
    rectArray.push(borderAwarePointRect(x, y, radius));
}

function getBorderRampartTiles(room, layout) {
    const tiles = [];
    const seen = new Set();
    const add = (x, y) => {
        if (!isBorderMinCutStructure(x, y)) return;
        const key = x + ',' + y;
        if (seen.has(key)) return;
        seen.add(key);
        tiles.push({x, y});
    };

    if (extensionPositionCache[room.name]) {
        for (const {x, y} of extensionPositionCache[room.name]) add(x, y);
    }
    for (const ext of room.extensions) add(ext.pos.x, ext.pos.y);
    for (const site of room.constructionSites) {
        if (site.structureType === STRUCTURE_EXTENSION) add(site.pos.x, site.pos.y);
    }

    const hub = room.hub;
    if (layout && hub) {
        for (const structure of layout) {
            for (const buildPos of structure.pos) {
                add(hub.x + buildPos.x, hub.y + buildPos.y);
            }
        }
    }

    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        if (container) add(container.pos.x, container.pos.y);
        const link = source.memory.link && Game.getObjectById(source.memory.link);
        if (link) add(link.pos.x, link.pos.y);
    }

    for (const tower of room.towers) add(tower.pos.x, tower.pos.y);
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) add(x, y);
    }

    return tiles;
}

function borderInsetRadius(x, y, maxRadius) {
    const distToEdge = Math.min(x, y, 49 - x, 49 - y);
    return Math.min(maxRadius, Math.max(distToEdge - PERIMETER_BUILD_INSET, 1));
}

function borderAwarePointRect(x, y, maxRadius = 1) {
    let x1 = x - maxRadius;
    let x2 = x + maxRadius;
    let y1 = y - maxRadius;
    let y2 = y + maxRadius;
    if (x - PERIMETER_BUILD_INSET < 2) x1 = Math.max(x1, x);
    if (x + PERIMETER_BUILD_INSET > 47) x2 = Math.min(x2, x);
    if (y - PERIMETER_BUILD_INSET < 2) y1 = Math.max(y1, y);
    if (y + PERIMETER_BUILD_INSET > 47) y2 = Math.min(y2, y);
    return clampRect({x1, y1, x2, y2});
}

function borderAwareBoxRect(x1, y1, x2, y2, cx, cy) {
    if (cy <= 2 + PERIMETER_BUILD_INSET) y1 = Math.max(y1, cy);
    if (cy >= 47 - PERIMETER_BUILD_INSET) y2 = Math.min(y2, cy);
    if (cx <= 2 + PERIMETER_BUILD_INSET) x1 = Math.max(x1, cx);
    if (cx >= 47 - PERIMETER_BUILD_INSET) x2 = Math.min(x2, cx);
    return clampRect({x1, y1, x2, y2});
}

function getSourceProtectionRects(room) {
    const rects = [];
    for (const source of room.sources) {
        const {x, y} = source.pos;
        const distToEdge = Math.min(x, y, 49 - x, 49 - y);
        // Source tiles are impassable; near edges only wrap container/link so the cut avoids TO_EXIT rows.
        if (distToEdge > SOURCE_PROTECTION_RADIUS) {
            pushProtectionRect(rects, x, y, borderInsetRadius(x, y, SOURCE_PROTECTION_RADIUS));
        }

        const container = Game.getObjectById(source.memory.container);
        if (container) {
            pushProtectionRect(rects, container.pos.x, container.pos.y, 1);
        }

        const link = source.memory.link && Game.getObjectById(source.memory.link);
        if (link) {
            pushProtectionRect(rects, link.pos.x, link.pos.y, 1);
        } else if (container) {
            const linkSite = container.pos.findInRange(FIND_CONSTRUCTION_SITES, 1)
                .find(s => s.structureType === STRUCTURE_LINK);
            if (linkSite) pushProtectionRect(rects, linkSite.pos.x, linkSite.pos.y, 1);
        }
    }
    return rects;
}

function getTowerProtectionRects(room) {
    const rects = [];
    const hub = room.hub;
    if (!hub) return rects;
    const towerPositions = room.towers.map(t => t.pos);
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) {
            const pos = new RoomPosition(x, y, room.name);
            if (!towerPositions.some(p => p.isEqualTo(pos))) towerPositions.push(pos);
        }
    }
    for (const tp of towerPositions) {
        pushProtectionRect(rects, tp.x, tp.y, borderInsetRadius(tp.x, tp.y, 2));
        const path = tp.findPathTo(hub, {ignoreCreeps: true, maxOps: 4000});
        for (const step of path) {
            pushProtectionRect(rects, step.x, step.y, borderInsetRadius(step.x, step.y, 2));
        }
    }
    return rects;
}

function getRampartWalkCorridors(room) {
    const keys = new Set();
    const hub = room.hub;
    if (!hub) return keys;
    const addPath = (from) => {
        const path = from.findPathTo(hub, {ignoreCreeps: true, maxOps: 4000});
        for (const step of path) keys.add(step.x + ',' + step.y);
    };
    for (const tower of room.towers) addPath(tower.pos);
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) {
            addPath(new RoomPosition(x, y, room.name));
        }
    }
    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        if (!container) continue;
        addPath(container.pos);
        if (source.memory.accessReserved) {
            keys.add(source.memory.accessReserved.x + ',' + source.memory.accessReserved.y);
        }
    }
    return keys;
}

function isOnSourcePad(pos, room) {
    for (const source of room.sources) {
        const container = Game.getObjectById(source.memory.container);
        const anchor = container ? container.pos : source.pos;
        if (pos.getRangeTo(anchor) <= 2) return true;
    }
    return false;
}


function hasBarrierUnderlay(pos) {
    return pos.lookFor(LOOK_STRUCTURES).some(s =>
        s.structureType !== STRUCTURE_RAMPART &&
        s.structureType !== STRUCTURE_WALL &&
        s.structureType !== STRUCTURE_ROAD);
}

function isNearNewPerimeterSpot(pos, newSpotSet) {
    for (const key of newSpotSet) {
        const comma = key.indexOf(',');
        const nx = Number(key.slice(0, comma));
        const ny = Number(key.slice(comma + 1));
        if (Math.max(Math.abs(pos.x - nx), Math.abs(pos.y - ny)) <= 1) return true;
    }
    return false;
}

function isOrphanedUncachedBarrier(pos, room, newSpotSet) {
    if (newSpotSet.has(`${pos.x},${pos.y}`)) return false;
    if (!isPerimeterBarrierTile(pos)) return false;
    if (isOnSourcePad(pos, room)) return false;
    if (hasBarrierUnderlay(pos)) return false;

    const exit = pos.findClosestByRange(FIND_EXIT);
    if (exit && pos.getRangeTo(exit) <= PERIMETER_ORPHAN_EXIT_CLEARANCE) return true;
    if (structureDistToEdge(pos.x, pos.y) <= PERIMETER_BUILD_INSET + 2) return true;

    const hub = room.hub;
    if (hub && pos.getRangeTo(hub) > 4 && isNearNewPerimeterSpot(pos, newSpotSet)) return true;
    return false;
}

function removeUncachedPerimeterBarriers(room, newSpotSet) {
    if (!newSpotSet || !newSpotSet.size) return 0;
    let removed = 0;

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(s.pos, room, newSpotSet)) continue;
        try {
            if (s.destroy() === OK) removed++;
        } catch (e) {
        }
    }

    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(site.pos, room, newSpotSet)) continue;
        try {
            site.remove();
            removed++;
        } catch (e) {
        }
    }

    if (removed && room.memory.quadTrapWalls && room.memory.quadTrapWalls.length) {
        const before = room.memory.quadTrapWalls.length;
        room.memory.quadTrapWalls = room.memory.quadTrapWalls.filter(p =>
            !isOrphanedUncachedBarrier(new RoomPosition(p.x, p.y, room.name), room, newSpotSet));
        if (room.memory.quadTrapWalls.length < before) quadTraps[room.name] = undefined;
    }

    return removed;
}

function removeStalePerimeterBarriers(room, oldSpotSet, newSpotSet) {
    if (!oldSpotSet || !oldSpotSet.size) return 0;
    const isStale = (x, y) => oldSpotSet.has(`${x},${y}`) && !newSpotSet.has(`${x},${y}`);
    let removed = 0;

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isStale(s.pos.x, s.pos.y)) continue;
        try {
            if (s.destroy() === OK) removed++;
        } catch (e) {
        }
    }

    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isStale(site.pos.x, site.pos.y)) continue;
        try {
            site.remove();
            removed++;
        } catch (e) {
        }
    }

    if (room.memory.quadTrapWalls && room.memory.quadTrapWalls.length) {
        const before = room.memory.quadTrapWalls.length;
        room.memory.quadTrapWalls = room.memory.quadTrapWalls.filter(p => !isStale(p.x, p.y));
        if (room.memory.quadTrapWalls.length < before) quadTraps[room.name] = undefined;
    }

    return removed;
}


function getProtectedAreaBounds(layout, room) {
    let rectArray = [];
    if (!room.hub) return rectArray;
    for (let structure of layout) {
        for (let buildPos of structure.pos) {
            const sx = buildPos.x + room.hub.x;
            const sy = buildPos.y + room.hub.y;
            pushProtectionRect(rectArray, sx, sy, 1);
        }
    }
    if (room.memory.labHub) {
        const labHub = room.memory.labHub;
        if (!isBorderMinCutStructure(labHub.x, labHub.y)) {
            rectArray.push(borderAwareBoxRect(labHub.x - 3, labHub.y - 3, labHub.x + 3, labHub.y + 3, labHub.x, labHub.y));
        }
    }
    if (room.memory.towerHubs) {
        for (const {x, y} of room.memory.towerHubs) {
            pushProtectionRect(rectArray, x, y, 1);
        }
    }
    rectArray = rectArray.concat(getTowerProtectionRects(room));
    rectArray = rectArray.concat(getSourceProtectionRects(room));
    if (extensionPositionCache[room.name]) {
        for (const {x, y} of extensionPositionCache[room.name]) {
            pushProtectionRect(rectArray, x, y, borderInsetRadius(x, y, 1));
        }
    }
    for (const ext of room.extensions) {
        pushProtectionRect(rectArray, ext.pos.x, ext.pos.y, borderInsetRadius(ext.pos.x, ext.pos.y, 1));
    }
    return rectArray.map(clampRect);
}

function shouldComputeBunkerRampartSpots(room) {
    return !!(room.controller && room.controller.level >= BUNKER_LEVEL && room.hub);
}

function auditRampartRecalc(room, layout) {
    const tmpl = layout || (room.memory.dynamicLayout ? coreTemplate : bunkerTemplate);
    const cached = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : [];
    const rectArray = room.hub ? getProtectedAreaBounds(tmpl, room) : [];
    return {
        roomName: room.name,
        controllerLevel: room.controller && room.controller.level,
        roomLevel: room.level,
        energyCapacity: room.energyCapacityAvailable,
        bunkerLevelRequired: BUNKER_LEVEL,
        hasHub: !!room.hub,
        bunkerHub: room.memory.bunkerHub,
        canCompute: shouldComputeBunkerRampartSpots(room),
        protectionRects: rectArray.length,
        cachedSpots: cached.length,
    };
}

function initializeRampartSpots(room, layout, count) {
    ROOM_RAMPART_SPOTS[room.name] = undefined;
    if (!room.hub) return count ? 0 : undefined;
    let rectArray = getProtectedAreaBounds(layout, room)
        .filter(r => r.x1 <= r.x2 && r.y1 <= r.y2);
    let bounds = {x1: 0, y1: 0, x2: 49, y2: 49};

    try {
        const rawSpots = minCut.GetCutTiles(room.name, rectArray, bounds) || [];
        const spots = bridgePerimeterGaps(room, filterPerimeterBarrierSpots(room, rawSpots));
        ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(spots);
    } catch (e) {
        log.e('MinCut Error in room ' + room.name);
        log.e(e.stack);
    }

    if (count && ROOM_RAMPART_SPOTS[room.name]) {
        return _.size(JSON.parse(ROOM_RAMPART_SPOTS[room.name]));
    }
}

function auditOrphanBarriers(room) {
    const newSpots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : null;
    if (!newSpots || !newSpots.length) {
        return {count: 0, orphans: [], reason: 'no cached perimeter spots'};
    }
    const newSpotSet = new Set(newSpots.map(p => `${p.x},${p.y}`));
    const orphans = [];

    for (const s of room.structures) {
        if (s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(s.pos, room, newSpotSet)) continue;
        orphans.push({x: s.pos.x, y: s.pos.y, kind: 'built', type: s.structureType});
    }
    for (const site of room.constructionSites) {
        if (site.structureType !== STRUCTURE_RAMPART && site.structureType !== STRUCTURE_WALL) continue;
        if (!isOrphanedUncachedBarrier(site.pos, room, newSpotSet)) continue;
        orphans.push({x: site.pos.x, y: site.pos.y, kind: 'site', type: site.structureType});
    }
    return {count: orphans.length, orphans, perimeterSpots: newSpots.length};
}

function purgeOrphanBarriers(room) {
    const audit = auditOrphanBarriers(room);
    if (!audit.orphans.length) return {removed: 0, ...audit};
    const newSpotSet = new Set(
        JSON.parse(ROOM_RAMPART_SPOTS[room.name]).map(p => `${p.x},${p.y}`)
    );
    const removed = removeUncachedPerimeterBarriers(room, newSpotSet);
    if (removed) quadTraps[room.name] = undefined;
    return {removed, ...auditOrphanBarriers(room)};
}

function recalculateRampartsForRoom(room, layout) {
    const tmpl = layout || (room.memory.dynamicLayout ? coreTemplate : bunkerTemplate);
    const oldSpots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : [];
    const oldSpotSet = new Set(oldSpots.map(p => `${p.x},${p.y}`));

    invalidateRampartSpots(room);

    if (room.memory.dynamicLayout) {
        require('planExtensions').getExtensionPositions(room);
    }

    if (shouldComputeBunkerRampartSpots(room)) {
        initializeRampartSpots(room, tmpl, false);
    }

    let newSpots = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]
        ? JSON.parse(ROOM_RAMPART_SPOTS[room.name])
        : [];
    if (!newSpots.length && oldSpots.length) {
        ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(oldSpots);
        newSpots = oldSpots;
        log.w(`${room.name} rampart regen produced 0 spots; restored ${oldSpots.length} cached spots`);
    }

    const newSpotSet = new Set(newSpots.map(p => `${p.x},${p.y}`));
    let removedBarriers = removeStalePerimeterBarriers(room, oldSpotSet, newSpotSet);
    let removedOrphans = 0;
    if (newSpotSet.size) {
        removedOrphans = removeUncachedPerimeterBarriers(room, newSpotSet);
        removedBarriers += removedOrphans;
    }

    if (removedBarriers) {
        const detail = removedOrphans
            ? ` (${removedOrphans} uncached orphan(s))`
            : '';
        log.a(`${room.name} removed ${removedBarriers} stale perimeter barrier(s) after extension layout change${detail}`);
        quadTraps[room.name] = undefined;
    }

    return {
        spots: newSpots.length,
        removedBarriers,
        removedOrphans,
        audit: auditRampartRecalc(room, tmpl),
    };
}

function rampartBuilder(room, layout = undefined, count = false) {
    // Clean old ramparts
    if (Memory.rampartVersion !== RAMPART_VERSION) {
        Memory.rampartVersion = RAMPART_VERSION;
        for (const r of MY_ROOMS) {
            const owned = Game.rooms[r];
            if (!owned) continue;
            owned.structures.filter((s) =>
                s.structureType === STRUCTURE_RAMPART || (s.structureType === STRUCTURE_ROAD && s.pos.checkForRampart())
            ).forEach((q) => q.destroy());
            owned.constructionSites.filter((s) =>
                [STRUCTURE_RAMPART, STRUCTURE_WALL].includes(s.structureType)
            ).forEach((s) => s.remove());
            if (ROOM_RAMPART_SPOTS) ROOM_RAMPART_SPOTS[r] = undefined;
        }
    }

    // Bunker
    if (room.level >= BUNKER_LEVEL && room.energyState) {
        if (handleBunkerRamparts(room, layout, count)) return true;
        if (buildProtectiveRamparts(room, layout)) return true;
    }

    // Handle quad traps â€” RCL8 only, walls capped at 20k
    if (room.level >= 8 && buildQuadTraps(room)) {
        return true;
    }

    function handleBunkerRamparts(room, layout, count) {
        if (!ROOM_RAMPART_SPOTS[room.name]) {
            return initializeRampartSpots(room, layout, count);
        } else {
            return placeRamparts(room, count);
        }
    }

    function buildProtectiveRamparts(room, layout) {
        const ramparts = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name] ? JSON.parse(ROOM_RAMPART_SPOTS[room.name]) : undefined;
        if (!ramparts || !ramparts.length) return false;
        let counter = 0;
        if (buildBorderStructureRamparts(room, layout)) return true;
        const rampartPositions = ramparts.map(p => new RoomPosition(p.x, p.y, room.name));
        const vulnerableStructures = room.structures.filter((s) =>
            protectedStructureTypes.includes(s.structureType) &&
            !s.pos.checkForRampart() &&
            !s.pos.checkForConstructionSites());
        for (const structure of vulnerableStructures) {
            if (counter >= 3) return true;
            const rangeFromRampart = structure.pos.getRangeTo(structure.pos.findClosestByRange(rampartPositions));
            const inBunker = structure.pos.isInBunker();
            if ((rangeFromRampart <= 3 && inBunker) || !inBunker) {
                if (!canPlaceConstructionSite(room)) return true;
                if (tryCreateConstructionSite(structure.pos, STRUCTURE_RAMPART) === OK) counter++;
            }
        }
        if (room.level >= SPECIAL_RAMPARTS) {
            if (PROTECT_SOURCES) {
                for (let source of room.sources) {
                    if (source.pos.isInBunker()) continue;
                    if (counter >= 3) return true;
                    if (buildRampartAround(source.pos)) counter++;
                }
            }
            if (PROTECT_MINERAL && !room.mineral.pos.isInBunker()) {
                if (counter >= 3) return true;
                if (buildRampartAround(room.mineral.pos)) counter++;
            }
            if (PROTECT_CONTROLLER && !room.controller.pos.isInBunker()) {
                if (counter >= 3) return true;
                if (buildRampartAround(room.controller.pos)) counter++;
            }
            // Handle ramparts on protected structures
            if (PROTECT_STRUCTURES && room.level >= 8) {
                for (let structure of room.structures) {
                    if (counter >= 3) return true;
                    if (protectedStructureTypes.includes(structure.structureType)) {
                        if (!structure.pos.checkForRampart() && !structure.pos.checkForConstructionSites()) {
                            if (!canPlaceConstructionSite(room)) return true;
                            if (tryCreateConstructionSite(structure.pos, STRUCTURE_RAMPART) === OK) counter++;
                        }
                    }
                }
            }
        }
        return false;
    }

    function buildBorderStructureRamparts(room, layout) {
        const tiles = getBorderRampartTiles(room, layout);
        let counter = 0;
        for (const {x, y} of tiles) {
            if (counter >= 3) return true;
            const pos = new RoomPosition(x, y, room.name);
            if (pos.checkForRampart()) continue;
            if (pos.lookFor(LOOK_CONSTRUCTION_SITES).some((s) => s.structureType === STRUCTURE_RAMPART)) continue;
            const hasStructure = pos.lookFor(LOOK_STRUCTURES).some((s) =>
                s.structureType !== STRUCTURE_ROAD &&
                s.structureType !== STRUCTURE_RAMPART &&
                s.structureType !== STRUCTURE_WALL);
            const hasSite = pos.lookFor(LOOK_CONSTRUCTION_SITES).some((s) =>
                s.structureType !== STRUCTURE_RAMPART &&
                s.structureType !== STRUCTURE_WALL);
            if (!hasStructure && !hasSite) continue;
            if (!canPlaceConstructionSite(room)) return true;
            if (tryCreateConstructionSite(pos, STRUCTURE_RAMPART) === OK) counter++;
        }
        return counter > 0;
    }

    function buildQuadTraps(room) {
        if (!quadTraps[room.name]) setQuadTraps(room);
        if (!quadTraps[room.name] || !quadTraps[room.name].length) return false;

        const QUAD_WALL_CAP = 20000;
        let counter = 0;
        const newWallPositions = room.memory.quadTrapWalls ? new Set(room.memory.quadTrapWalls.map(p => `${p.x},${p.y}`)) : new Set();

        for (const trap of quadTraps[room.name]) {
            if (counter >= 3) return true;
            const pos = new RoomPosition(trap.x, trap.y, room.name);
            if (pos.checkForWall()) continue;
            if (pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) ||
                room.sources.some(s => pos.isNearTo(s))) continue;
            if (room.towers.some(t => pos.getRangeTo(t) <= 2)) continue;
            if (room.memory.towerHubs && room.memory.towerHubs.some(h => Math.max(Math.abs(pos.x - h.x), Math.abs(pos.y - h.y)) <= 2)) continue;
            if (room.extensions.some(e => pos.getRangeTo(e) <= 1 && room.sources.some(s => e.pos.getRangeTo(s) <= 2))) continue;
            if (isOnSourcePad(pos, room)) continue;

            const isWallTile = (pos.x + pos.y) % 2 === 0;
            if (isWallTile) {
                // Skip if wall already exists at or above the cap
                const existing = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_WALL);
                if (existing && existing.hits >= QUAD_WALL_CAP) continue;
                if (existing || pos.checkForConstructionSites()) continue;
                if (!canPlaceConstructionSite(room)) return true;
                if (!canPlaceConstructedWall(pos)) continue;
                if (tryCreateConstructionSite(pos, STRUCTURE_WALL) === OK) {
                    counter++;
                    if (!newWallPositions.has(`${pos.x},${pos.y}`)) {
                        newWallPositions.add(`${pos.x},${pos.y}`);
                        if (!room.memory.quadTrapWalls) room.memory.quadTrapWalls = [];
                        room.memory.quadTrapWalls.push({x: pos.x, y: pos.y});
                    }
                }
            }
        }
        return counter > 0;
    }

    function setQuadTraps(room) {
        if (!ROOM_RAMPART_SPOTS[room.name]) return false;
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!ramparts || !ramparts.length) return;
        const hub = room.hub;
        const terrain = Game.map.getRoomTerrain(room.name);
        const trapLocations = [];

        for (const {x, y} of ramparts) {
            // Push one tile outward from the hub (away from centre)
            const dx = x === hub.x ? 0 : (x < hub.x ? -1 : 1);
            const dy = y === hub.y ? 0 : (y < hub.y ? -1 : 1);
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (pos.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType))) continue;
            trapLocations.push({x: nx, y: ny});
        }
        quadTraps[room.name] = trapLocations;
    }


    function placeRamparts(room) {
        let spots = JSON.parse(ROOM_RAMPART_SPOTS[room.name]) || [];
        if (!spots.length) {
            addExistingRampartsToSpots(room, spots);
        }
        const sanitized = bridgePerimeterGaps(room, filterPerimeterBarrierSpots(room, spots));
        const encodedSpots = JSON.stringify(sanitized);
        if (encodedSpots !== ROOM_RAMPART_SPOTS[room.name]) ROOM_RAMPART_SPOTS[room.name] = encodedSpots;
        spots = sanitized;

        let buildPositions = spots.map(p => new RoomPosition(p.x, p.y, room.name));
        let inBuild = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length;

        // Avoid exceeding 5 constructions at a time
        const corridors = getRampartWalkCorridors(room);
        let cycles = 0;
        for (let pos of buildPositions) {
            if (cycles + inBuild >= 5) return true;
            if (pos.checkForWall()) continue;
            if (!shouldBuildRampartAtPosition(pos, room, true)) continue;
            const onCorridor = corridors.has(pos.x + ',' + pos.y);
            const isWallTile = (pos.x + pos.y) % 2 === 0;
            let placed = false;
            if (isWallTile && !onCorridor && canPlaceConstructedWall(pos)) {
                if (!canPlaceConstructionSite(room)) return true;
                if (tryCreateConstructionSite(pos, STRUCTURE_WALL) === OK) {
                    cycles++;
                    placed = true;
                }
            }
            if (!placed && !pos.checkForRampart() && !pos.checkForConstructionSites() &&
                tryCreateConstructionSite(pos, STRUCTURE_RAMPART) === OK) {
                cycles++;
            }
        }
        if (cycles || inBuild) return true;
    }

    function addExistingRampartsToSpots(room, spots) {
        // Only add existing ramparts or walls once
        let existingRamparts = room.ramparts.concat(room.constructedWalls).filter(Boolean);
        existingRamparts.forEach((b) => spots.push({x: b.pos.x, y: b.pos.y}));
    }

    function shouldBuildRampartAtPosition(pos, room, forcePerimeter = false) {
        if (pos.checkForWall()) return false;
        if (pos.checkForImpassible(true)) return false;
        if (!forcePerimeter && isOnSourcePad(pos, room)) return false;
        if (pos.checkForAllStructure() && !pos.checkForRoad()) return false;

        if (forcePerimeter) {
            return !pos.checkForRampart() && !pos.checkForConstructionSites();
        }

        // General rampart check based on proximity to important structures
        if (isNearProtectedStructure(pos, room)) {
            return !pos.checkForRampart() && !pos.checkForConstructionSites();
        }

        return !pos.checkForBarrierStructure() && !pos.checkForConstructionSites();
    }

    function isNearProtectedStructure(pos, room) {
        return pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) || pos.isNearTo(pos.findClosestByRange(FIND_SOURCES));
    }

    function buildRampartAround(position) {
        // Loop through a 3x3 area around the position
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                // Skip the center position
                if (xOff === 0 && yOff === 0) continue;

                let targetPos = new RoomPosition(position.x + xOff, position.y + yOff, position.roomName);

                // Check if the position is valid for placing a rampart
                if (isValidRampartPosition(targetPos)) {
                    if (!canPlaceConstructionSite(Game.rooms[targetPos.roomName])) return false;
                    tryCreateConstructionSite(targetPos, STRUCTURE_RAMPART);
                    return true; // Stop after placing one rampart
                }
            }
        }
        return false; // Return false if no valid position was found
    }
}

module.exports = {

    rampartBuilder,

    invalidateRampartSpots,

    recalculateRampartsForRoom,

    auditRampartRecalc,

    shouldComputeBunkerRampartSpots,

    auditOrphanBarriers,

    purgeOrphanBarriers,

};