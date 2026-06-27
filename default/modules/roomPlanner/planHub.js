/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Hub, lab hub, and tower hub discovery.

 */


const {coreTemplate, bunkerTemplate, labTemplate} = require('planTemplates');

const {getUndefendedExits, determineTowerDamage, isCoreHubTileValid, safeStructureOwner} = require('planUtils');

function findHub(room, hubCheck = undefined) {
    if (room.controller.owner && room.controller.owner.username === MY_USERNAME && room.memory.bunkerHub && room.memory.bunkerHub.x && room.memory.bunkerHub.y) {
        return true;
    }

    // hubCheck is a read-only probe for expansion scoring â€” never modify the room
    if (!hubCheck) {
        // Destroy non-owned structures so the room is clear for the new layout
        room.structures.forEach(s => {
            if (s instanceof OwnedStructure && safeStructureOwner(s) === MY_USERNAME) return;
            try {
                s.destroy();
            } catch (e) {
            }
        });

        // Recover hub from already-placed key structures (respects dynamic layout too)
        const spawn = room.spawns.find(s => s.name !== 'auto');
        if (room.terminal) {
            room.memory.bunkerHub = {x: room.terminal.pos.x + 1, y: room.terminal.pos.y};
            log.a(`${room.name} hub recovered from terminal.`);
            return true;
        } else if (room.storage) {
            room.memory.bunkerHub = {x: room.storage.pos.x - 1, y: room.storage.pos.y};
            log.a(`${room.name} hub recovered from storage.`);
            return true;
        } else if (spawn) {
            room.memory.bunkerHub = {x: spawn.pos.x + 1, y: spawn.pos.y + 1};
            log.a(`${room.name} hub recovered from spawn.`);
            return true;
        }
    }

    // Pre-cache source positions to avoid per-tile API calls inside the validation loop
    const sources = room.find(FIND_SOURCES);

    const possiblePos = [];

    primary:
        for (let y = 10; y <= 40; y++) {
            for (let x = 10; x <= 40; x++) {
                const pos = new RoomPosition(x, y, room.name);
                if (pos.checkForImpassible()) continue;
                if (!isValidHubPosition(pos, room, sources)) continue primary;
                if (hubCheck) return true;
                possiblePos.push({x, y});
            }
        }

    if (possiblePos.length) {
        log.a(`${room.name} hub search complete â€” ${possiblePos.length} candidates`);
        const choice = _.min(possiblePos, p => {
            const pos = new RoomPosition(p.x, p.y, room.name);
            const sourceDist = pos.getRangeTo(_.min(sources, s => pos.getRangeTo(s))) * 2;
            const controllerDist = pos.getRangeTo(room.controller) * 1.5;
            const edgeBonus = Math.min(p.x, 49 - p.x, p.y, 49 - p.y) * 0.3;
            return sourceDist + controllerDist - edgeBonus;
        });
        room.memory.bunkerHub = {x: choice.x, y: choice.y};
        log.a(`Hub at (${choice.x}, ${choice.y}) in ${room.name}`);
        return true;
    } else {
        return handleNoValidPosition(room, hubCheck);
    }

    function isValidHubPosition(pos, room, sources) {
        const layoutTemplate = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
        for (const type of layoutTemplate) {
            for (const s of type.pos) {
                const sp = new RoomPosition(pos.x + s.x, pos.y + s.y, room.name);
                if (sp.x < 1 || sp.x > 48 || sp.y < 1 || sp.y > 48) return false;
                if (sp.checkForImpassible()) return false;
                if (sp.isNearTo(room.controller)) return false;
                if (sources.some(src => sp.isNearTo(src))) return false;
            }
        }
        return true;
    }

    function handleNoValidPosition(room, hubCheck) {
        if (hubCheck) return false;
        if (findCoreHub(room)) return true;
        log.a(room.name + ' has been abandoned due to being unable to find a suitable layout.');
        return false;
    }
}

function findLabHub(room) {
    if (room.memory.labHub && room.memory.labHub.x && room.memory.labHub.y) return;
    if (!room.memory.bunkerHub || !room.memory.bunkerHub.x) return false;

    // Recover from existing labs after a memory wipe
    const labs = room.labs;
    if (labs.length) {
        room.memory.labHub = {x: labs[0].pos.x, y: labs[0].pos.y};
        return true;
    }

    const bunkerHub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    const terrain = Game.map.getRoomTerrain(room.name);
    const sources = room.sources;
    const controller = room.controller;

    // Mark every tile occupied by the bunker (or core, in dynamic layout) so labs don't overlap
    const bunkerTmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const bunkerOccupied = new Set();
    for (const entry of bunkerTmpl) {
        for (const {x: dx, y: dy} of entry.pos) {
            bunkerOccupied.add((bunkerHub.x + dx) + ',' + (bunkerHub.y + dy));
        }
    }

    // Lab template bounding box and a perimeter set (tiles adjacent to â‰¥1 lab, not in template)
    let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
    const tplSet = new Set();
    for (const {x: dx, y: dy} of labTemplate) {
        tplSet.add(dx + ',' + dy);
        if (dx < minDx) minDx = dx;
        if (dx > maxDx) maxDx = dx;
        if (dy < minDy) minDy = dy;
        if (dy > maxDy) maxDy = dy;
    }
    // Per-lab perimeter map â€” each lab must have â‰¥1 walkable perimeter neighbor so creeps can boost
    const labPerimeter = labTemplate.map(({x: dx, y: dy}) => {
        const out = [];
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            if (!ox && !oy) continue;
            const px = dx + ox, py = dy + oy;
            if (!tplSet.has(px + ',' + py)) out.push({x: px, y: py});
        }
        return out;
    });

    const candidates = [];
    const xMin = Math.max(2, 1 - minDx), xMax = Math.min(47, 48 - maxDx);
    const yMin = Math.max(2, 1 - minDy), yMax = Math.min(47, 48 - maxDy);

    outer:
        for (let cx = xMin; cx <= xMax; cx++) {
            for (let cy = yMin; cy <= yMax; cy++) {
                // Validate every template tile
                for (let i = 0; i < labTemplate.length; i++) {
                    const {x: dx, y: dy} = labTemplate[i];
                    const tx = cx + dx, ty = cy + dy;
                    if (terrain.get(tx, ty) === TERRAIN_MASK_WALL) continue outer;
                    if (bunkerOccupied.has(tx + ',' + ty)) continue outer;
                    if (Math.abs(tx - controller.pos.x) <= 1 && Math.abs(ty - controller.pos.y) <= 1) continue outer;
                    for (const s of sources) {
                        if (Math.abs(tx - s.pos.x) <= 1 && Math.abs(ty - s.pos.y) <= 1) continue outer;
                    }
                    if (new RoomPosition(tx, ty, room.name).checkForImpassible()) continue outer;
                    // Each lab needs at least one walkable perimeter tile for creep access
                    let accessible = false;
                    for (const {x: px, y: py} of labPerimeter[i]) {
                        const ax = cx + px, ay = cy + py;
                        if (ax < 1 || ax > 48 || ay < 1 || ay > 48) continue;
                        if (terrain.get(ax, ay) === TERRAIN_MASK_WALL) continue;
                        accessible = true;
                        break;
                    }
                    if (!accessible) continue outer;
                }
                const dxHub = Math.abs(cx - bunkerHub.x), dyHub = Math.abs(cy - bunkerHub.y);
                candidates.push({x: cx, y: cy, score: Math.max(dxHub, dyHub)});
            }
        }

    if (!candidates.length) {
        log.a('Cannot find a lab hub in ' + room.name + '.');
        return false;
    }

    // Sort by Chebyshev to bunker hub, then path-verify the top few to reject "other side of wall" picks
    candidates.sort((a, b) => a.score - b.score);
    let chosen = null;
    const probe = Math.min(candidates.length, 8);
    for (let i = 0; i < probe; i++) {
        const c = candidates[i];
        const result = PathFinder.search(bunkerHub,
            {pos: new RoomPosition(c.x, c.y, room.name), range: 1},
            {maxRooms: 1, maxOps: 2000});
        if (result.incomplete) continue;
        if (result.path.length <= c.score * 2 + 4) {
            chosen = c;
            break;
        }
    }
    if (!chosen) chosen = candidates[0]; // fallback â€” better than no labs

    room.memory.labHub = {x: chosen.x, y: chosen.y};
    log.a(`Lab hub placed at (${chosen.x},${chosen.y}) for ${room.name}, range ${chosen.score} from bunker hub`);
    return true;
}


const {canPlaceConstructionSite, tryCreateConstructionSite} = require('planUtils');

// Places towers from the stored hub list up to the RCL-gated maximum.
// Called each build tick; only creates one site at a time.
function buildTowersFromHubs(room) {
    const hubs = room.memory.towerHubs;
    if (!hubs || !hubs.length) return false;
    const allowed = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level];
    const current = room.towers.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_TOWER).length;
    if (current >= allowed || !canPlaceConstructionSite(room)) return false;
    for (const {x, y} of hubs.slice(0, allowed)) {
        const pos = new RoomPosition(x, y, room.name);
        if (!pos.checkForAllStructure() && !pos.checkForConstructionSites()) {
            if (tryCreateConstructionSite(pos, STRUCTURE_TOWER) === OK) {
                const {invalidateRampartSpots} = require('planRamparts');
                invalidateRampartSpots(room);
                return true;
            }
        }
    }
    return false;
}


function findTowerHub(room) {
    if (!room.memory.bunkerHub || !room.memory.bunkerHub.x) return;
    // Clear existing towers so we reposition from scratch
    room.towers.forEach(t => t.destroy());
    room.constructionSites.filter(s => s.structureType === STRUCTURE_TOWER && !s.progress).forEach(t => t.remove());

    const hubX = room.memory.bunkerHub.x, hubY = room.memory.bunkerHub.y;
    const neighboring = Game.map.describeExits(room.name);
    const dirToFind = {'1': FIND_EXIT_TOP, '3': FIND_EXIT_RIGHT, '5': FIND_EXIT_BOTTOM, '7': FIND_EXIT_LEFT};
    const undefendedExits = getUndefendedExits(room.name);

    // Sample three points per exit edge for multi-angle coverage scoring
    const threatPoints = [], allExitTiles = [];
    for (const dir in dirToFind) {
        if (!neighboring[dir]) continue;
        if (undefendedExits.includes(dirToFind[dir])) continue;
        const exits = room.find(dirToFind[dir]);
        if (!exits.length) continue;
        allExitTiles.push(...exits);
        threatPoints.push(
            exits[Math.floor(exits.length * 0.25)],
            exits[Math.floor(exits.length * 0.5)],
            exits[Math.floor(exits.length * 0.75)]
        );
    }

    if (!threatPoints.length) {
        room.memory.towerHubs = [];
        return;
    }

    // Pre-compute obstacle data for fast per-tile checks (no API calls in the inner loop)
    const terrain = Game.map.getRoomTerrain(room.name);
    const srcPos = room.sources.map(s => s.pos);
    const ctrlPos = room.controller.pos;
    const minPos = room.mineral ? room.mineral.pos : null;
    const cheby = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

    const candidates = [];
    for (let x = 4; x <= 45; x++) {
        for (let y = 4; y <= 45; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            const hubDist = cheby(x, y, hubX, hubY);
            if (hubDist < 6 || hubDist > 23) continue;                     // not inside core, not too far out
            if (srcPos.some(p => cheby(x, y, p.x, p.y) < 3)) continue;    // away from sources
            if (cheby(x, y, ctrlPos.x, ctrlPos.y) < 3) continue;           // away from controller
            if (minPos && cheby(x, y, minPos.x, minPos.y) < 3) continue;   // away from mineral
            const minEdge = allExitTiles.reduce((m, e) => Math.min(m, cheby(x, y, e.x, e.y)), Infinity);
            if (minEdge < 5) continue;                                      // not exposed at edge

            // Total damage across all threat entry points â€” rewards positions that cover every exit
            const score = threatPoints.reduce((sum, tp) => sum + determineTowerDamage(cheby(x, y, tp.x, tp.y)), 0);
            candidates.push({x, y, score});
        }
    }

    // Sort best coverage first, then greedily select up to 6 with minimum 4-tile separation
    candidates.sort((a, b) => b.score - a.score);
    const selected = [];
    for (const c of candidates) {
        if (selected.length >= 6) break;
        if (selected.every(s => cheby(c.x, c.y, s.x, s.y) >= 4)) selected.push({x: c.x, y: c.y});
    }

    room.memory.towerHubs = selected;
    // Force rampart recomputation â€” perimeter must now wrap the new tower positions
    ROOM_RAMPART_SPOTS[room.name] = undefined;
    log.a(`${room.name}: ${selected.length} tower hubs placed`);
}


function findCoreHub(room) {
    let bestPos = null, bestScore = Infinity;
    for (let x = 3; x <= 46; x++) {
        for (let y = 3; y <= 46; y++) {
            const hub = new RoomPosition(x, y, room.name);
            if (hub.checkForImpassible()) continue;
            let valid = true;
            outer: for (const entry of coreTemplate) {
                for (const {x: dx, y: dy} of entry.pos) {
                    if (!isCoreHubTileValid(new RoomPosition(x + dx, y + dy, room.name), room)) {
                        valid = false;
                        break outer;
                    }
                }
            }
            if (!valid) continue;
            const src = hub.findClosestByRange(FIND_SOURCES);
            const sourceDist = src ? hub.getRangeTo(src) * 2 : 0;
            if (sourceDist < 6) continue;
            const controllerDist = hub.getRangeTo(room.controller) * 1.5;
            if (controllerDist < 4) continue;
            const edgeBonus = Math.min(x, 49 - x, y, 49 - y) * 0.3;
            const score = sourceDist + controllerDist - edgeBonus;
            if (score < bestScore) {
                bestScore = score;
                bestPos = {x, y};
            }
        }
    }
    if (!bestPos) return false;
    room.memory.bunkerHub = bestPos;
    room.memory.dynamicLayout = true;
    log.a(`${room.name} cannot fit full bunker â€” using dynamic layout at (${bestPos.x}, ${bestPos.y})`);
    return true;
}

module.exports = {

    findHub(room) {

        return findHub(room);

    },

    hubCheck(room) {

        return findHub(room, true);

    },

    findLabHub,

    findTowerHub,

    buildTowersFromHubs,

};