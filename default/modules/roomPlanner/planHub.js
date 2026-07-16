/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Hub, lab hub, and tower hub discovery.

 */


const {coreTemplate, bunkerTemplate, labTemplate, labHubPairTemplate} = require('planTemplates');

const LAB_HUB_SEARCH_COOLDOWN = 500;

const {getUndefendedExits, determineTowerDamage, isCoreHubTileValid, safeStructureOwner} = require('planUtils');

const {
    assessHubExtensionCapacity,
    clearDynamicLayoutMemory,
    countPlaceableBunkerExtensionsAt
} = require('planExtensions');

const HUB_EXTENSION_VALIDATE_COOLDOWN = 500;
const TOWER_HUB_MIN_DIST = 6;
const TOWER_HUB_MAX_DIST = 10;
const TOWER_LAYOUT_VERSION = 1;

function validateHubExtensionCapacity(room) {
    if (room.memory.dynamicLayout) return true;
    if (!room.controller || room.controller.level < 2) return true;
    if (room.memory.hubExtensionValidateTick && room.memory.hubExtensionValidateTick > Game.time) return true;

    room.memory.hubExtensionValidateTick = Game.time + HUB_EXTENSION_VALIDATE_COOLDOWN;

    const capacity = assessHubExtensionCapacity(room);
    if (capacity.sufficient) return true;

    log.a(`${room.name} hub supports ${capacity.placeable} bunker + ${capacity.fallback} fallback slots but needs ${capacity.deficit} extensions - switching to dynamic layout.`);
    clearDynamicLayoutMemory(room);
    return findCoreHub(room);
}
function findHub(room, hubCheck = undefined) {
    if (room.controller.owner && room.controller.owner.username === MY_USERNAME && room.memory.bunkerHub && room.memory.bunkerHub.x && room.memory.bunkerHub.y) {
        if (!hubCheck) validateHubExtensionCapacity(room);
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
            validateHubExtensionCapacity(room);
            return true;
        } else if (room.storage) {
            room.memory.bunkerHub = {x: room.storage.pos.x - 1, y: room.storage.pos.y};
            log.a(`${room.name} hub recovered from storage.`);
            validateHubExtensionCapacity(room);
            return true;
        } else if (spawn) {
            room.memory.bunkerHub = {x: spawn.pos.x + 1, y: spawn.pos.y + 1};
            log.a(`${room.name} hub recovered from spawn.`);
            validateHubExtensionCapacity(room);
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
        for (const p of possiblePos) {
            p.placeable = countPlaceableBunkerExtensionsAt(room, p.x, p.y).placeable;
        }
        const maxPlaceable = _.max(possiblePos, 'placeable').placeable;
        const tier = possiblePos.filter(p => p.placeable === maxPlaceable);
        const extensionTotal = bunkerTemplate.find(s => s.structureType === STRUCTURE_EXTENSION).pos.length;
        log.a(`${room.name} hub search: ${possiblePos.length} candidates, best extension fit ${maxPlaceable}/${extensionTotal}`);
        const choice = _.min(tier, p => {
            const pos = new RoomPosition(p.x, p.y, room.name);
            const sourceDist = pos.getRangeTo(_.min(sources, s => pos.getRangeTo(s))) * 2;
            const controllerDist = pos.getRangeTo(room.controller) * 1.5;
            const edgeBonus = Math.min(p.x, 49 - p.x, p.y, 49 - p.y) * 0.3;
            return sourceDist + controllerDist - edgeBonus;
        });
        room.memory.bunkerHub = {x: choice.x, y: choice.y};
        log.a(`Hub at (${choice.x}, ${choice.y}) in ${room.name} — ${choice.placeable} bunker extension slots`);
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
                if (room.mineral && sp.isNearTo(room.mineral)) return false;
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

function recoverLabHubFromLabs(room) {
    const active = room.labs.filter(l => !l.isActive || l.isActive());
    for (const lab of active) {
        const partner = active.find(l => l.id !== lab.id && l.pos.x === lab.pos.x && l.pos.y === lab.pos.y + 1);
        if (partner) {
            room.memory.labHub = {x: lab.pos.x, y: lab.pos.y};
            room.memory.labHubPartial = true;
            delete room.memory.labHubSearchFailed;
            log.a(`Lab hub recovered from built pair at (${lab.pos.x},${lab.pos.y}) in ${room.name}`);
            return true;
        }
    }
    if (active.length === 1) {
        room.memory.labHub = {x: active[0].pos.x, y: active[0].pos.y};
        room.memory.labHubPartial = true;
        delete room.memory.labHubSearchFailed;
        return true;
    }
    return false;
}

function buildLabSearchContext(room) {
    const bunkerHub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
    const terrain = Game.map.getRoomTerrain(room.name);
    const sources = room.sources;
    const controller = room.controller;
    const bunkerTmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const bunkerOccupied = new Set();
    for (const entry of bunkerTmpl) {
        for (const {x: dx, y: dy} of entry.pos) {
            bunkerOccupied.add((bunkerHub.x + dx) + ',' + (bunkerHub.y + dy));
        }
    }

    let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
    const tplSet = new Set();
    for (const {x: dx, y: dy} of labTemplate) {
        tplSet.add(dx + ',' + dy);
        if (dx < minDx) minDx = dx;
        if (dx > maxDx) maxDx = dx;
        if (dy < minDy) minDy = dy;
        if (dy > maxDy) maxDy = dy;
    }
    const labPerimeter = labTemplate.map(({x: dx, y: dy}) => {
        const out = [];
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            if (!ox && !oy) continue;
            const px = dx + ox, py = dy + oy;
            if (!tplSet.has(px + ',' + py)) out.push({x: px, y: py});
        }
        return out;
    });

    return {
        bunkerHub,
        terrain,
        sources,
        controller,
        bunkerOccupied,
        labPerimeter,
        xMin: Math.max(2, 1 - minDx),
        xMax: Math.min(47, 48 - maxDx),
        yMin: Math.max(2, 1 - minDy),
        yMax: Math.min(47, 48 - maxDy),
    };
}

const LAB_HUB_INPUT_INDICES = [0, 1];

function isLabTileValid(ctx, cx, cy, index) {
    const {bunkerHub, terrain, sources, controller, bunkerOccupied, labPerimeter} = ctx;
    const {x: dx, y: dy} = labTemplate[index];
    const tx = cx + dx, ty = cy + dy;
    if (terrain.get(tx, ty) === TERRAIN_MASK_WALL) return false;
    if (bunkerOccupied.has(tx + ',' + ty)) return false;
    if (Math.abs(tx - controller.pos.x) <= 1 && Math.abs(ty - controller.pos.y) <= 1) return false;
    for (const s of sources) {
        if (Math.abs(tx - s.pos.x) <= 1 && Math.abs(ty - s.pos.y) <= 1) return false;
    }
    if (new RoomPosition(tx, ty, bunkerHub.roomName).checkForImpassible()) return false;
    for (const {x: px, y: py} of labPerimeter[index]) {
        const ax = cx + px, ay = cy + py;
        if (ax < 1 || ax > 48 || ay < 1 || ay > 48) continue;
        if (terrain.get(ax, ay) === TERRAIN_MASK_WALL) continue;
        return true;
    }
    return false;
}

function searchLabHubAnchors(ctx, requiredIndices) {
    const {xMin, xMax, yMin, yMax, bunkerHub} = ctx;
    const candidates = [];

    for (let cx = xMin; cx <= xMax; cx++) {
        for (let cy = yMin; cy <= yMax; cy++) {
            if (!requiredIndices.every(i => isLabTileValid(ctx, cx, cy, i))) continue;
            const dxHub = Math.abs(cx - bunkerHub.x), dyHub = Math.abs(cy - bunkerHub.y);
            candidates.push({x: cx, y: cy, score: Math.max(dxHub, dyHub)});
        }
    }
    return candidates;
}

// Hub pair (reaction inputs) plus at least one output lab — minimum for runReaction.
function searchLabHubAnchorsMinProduction(ctx) {
    const {xMin, xMax, yMin, yMax, bunkerHub} = ctx;
    const outputIndices = [];
    for (let i = LAB_HUB_INPUT_INDICES[1] + 1; i < labTemplate.length; i++) outputIndices.push(i);
    const candidates = [];

    for (let cx = xMin; cx <= xMax; cx++) {
        for (let cy = yMin; cy <= yMax; cy++) {
            if (!LAB_HUB_INPUT_INDICES.every(i => isLabTileValid(ctx, cx, cy, i))) continue;
            let extraCount = 0;
            for (const i of outputIndices) {
                if (isLabTileValid(ctx, cx, cy, i)) extraCount++;
            }
            if (!extraCount) continue;
            const dxHub = Math.abs(cx - bunkerHub.x), dyHub = Math.abs(cy - bunkerHub.y);
            candidates.push({x: cx, y: cy, score: Math.max(dxHub, dyHub), extraCount});
        }
    }
    return candidates;
}

function pickLabHubCandidate(ctx, candidates, preferExtraLabs = false) {
    if (!candidates.length) return null;
    const {bunkerHub} = ctx;
    if (preferExtraLabs) {
        candidates.sort((a, b) => (b.extraCount - a.extraCount) || (a.score - b.score));
    } else {
        candidates.sort((a, b) => a.score - b.score);
    }
    let chosen = null;
    const probe = Math.min(candidates.length, 8);
    for (let i = 0; i < probe; i++) {
        const c = candidates[i];
        const result = PathFinder.search(bunkerHub,
            {pos: new RoomPosition(c.x, c.y, bunkerHub.roomName), range: 1},
            {maxRooms: 1, maxOps: 2000});
        if (result.incomplete) continue;
        if (result.path.length <= c.score * 2 + 4) {
            chosen = c;
            break;
        }
    }
    return chosen || candidates[0];
}

function commitLabHub(room, chosen, partial) {
    room.memory.labHub = {x: chosen.x, y: chosen.y};
    if (partial) room.memory.labHubPartial = true;
    else delete room.memory.labHubPartial;
    delete room.memory.labHubSearchFailed;
    const layout = partial ? 'partial (3+ labs)' : 'full';
    const extra = chosen.extraCount ? `, ${chosen.extraCount} extra slot(s)` : '';
    log.a(`Lab hub (${layout}) placed at (${chosen.x},${chosen.y}) for ${room.name}, range ${chosen.score} from bunker hub${extra}`);
}

function findLabHub(room) {
    if (room.memory.labHub && room.memory.labHub.x && room.memory.labHub.y) return;
    if (!room.memory.bunkerHub || !room.memory.bunkerHub.x) return false;
    if (room.memory.labHubSearchFailed && room.memory.labHubSearchFailed > Game.time) return false;

    if (recoverLabHubFromLabs(room)) return true;

    const ctx = buildLabSearchContext(room);
    const fullIndices = labTemplate.map((_, i) => i);

    let chosen = pickLabHubCandidate(ctx, searchLabHubAnchors(ctx, fullIndices));
    if (chosen) {
        commitLabHub(room, chosen, false);
        return true;
    }

    chosen = pickLabHubCandidate(ctx, searchLabHubAnchorsMinProduction(ctx), true);
    if (chosen) {
        commitLabHub(room, chosen, true);
        return true;
    }

    room.memory.labHubSearchFailed = Game.time + LAB_HUB_SEARCH_COOLDOWN;
    log.a(`Cannot find a lab hub in ${room.name} (retry in ${LAB_HUB_SEARCH_COOLDOWN} ticks).`);
    return false;
}


const {
    canPlaceConstructionSite,
    tryCreateConstructionSite,
    countRoomConstructionSites,
    countRoomConstructionSitesOfType,
    maxConstructionSitesPerRoom,
} = require('planUtils');

function isTowerHubTile(room, x, y) {
    const hubs = room.memory.towerHubs;
    if (!hubs || !hubs.length) return false;
    return hubs.some(h => h.x === x && h.y === y);
}

function clearTowerHubBlockers(room, pos) {
    const site = pos.checkForConstructionSites();
    if (!site || site.progress) return false;
    if (![STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD].includes(site.structureType)) return false;
    try {
        site.remove();
        invalidateRoomStructureCaches(room);
        return true;
    } catch (e) {
        return false;
    }
}

function auditTowerHubTiles(room) {
    const hubs = room.memory.towerHubs || [];
    const level = room.controller && room.controller.level;
    const allowed = level ? CONTROLLER_STRUCTURES[STRUCTURE_TOWER][level] : 0;
    const {roomConstructionSiteBudget, canPlaceConstructionSite} = require('planUtils');
    const terrain = Game.map.getRoomTerrain(room.name);
    const lastSiteError = room.memory.plannerLastSiteError;
    return {
        rcl: level,
        allowed,
        current: room.towers.length + countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER),
        siteBudget: roomConstructionSiteBudget(room),
        canPlace: canPlaceConstructionSite(room),
        totalSites: countRoomConstructionSites(room.name),
        hubs: hubs.map(({x, y}) => {
            const pos = new RoomPosition(x, y, room.name);
            const structure = pos.checkForAllStructure();
            const site = pos.checkForConstructionSites();
            return {
                x,
                y,
                terrain: terrain.get(x, y) === TERRAIN_MASK_WALL ? 'wall' : 'clear',
                structure: structure && structure.structureType,
                site: site && site.structureType,
                siteProgress: site && site.progress,
                blocked: !!(structure || site),
            };
        }),
        lastSiteError: lastSiteError && {
            ...lastSiteError,
            age: Game.time - lastSiteError.tick,
        },
    };
}

function getTowerDeficit(room) {
    if (!room.controller || !room.controller.my) return 0;
    const hubs = room.memory.towerHubs;
    if (!hubs || !hubs.length) return 0;
    const allowed = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
    const current = room.towers.length +
        countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER);
    return Math.max(0, allowed - current);
}

function placeTowerSitesUpToDeficit(room, maxPerCall) {
    const limit = maxPerCall === undefined ? 1 : maxPerCall;
    let placed = 0;
    for (let i = 0; i < limit; i++) {
        if (getTowerDeficit(room) <= 0) break;
        const before = countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER);
        if (!buildTowersFromHubs(room)) break;
        const after = countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER);
        if (after <= before) break;
        placed++;
    }
    return placed;
}

// Places towers from the stored hub list up to the RCL-gated maximum.
// Called each build tick; only creates one site at a time.
function buildTowersFromHubs(room) {
    const hubs = room.memory.towerHubs;
    if (!hubs || !hubs.length) return false;
    const allowed = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level];
    const current = room.towers.length +
        countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER);
    if (current >= allowed || !canPlaceConstructionSite(room)) return false;
    for (const {x, y} of hubs.slice(0, allowed)) {
        const pos = new RoomPosition(x, y, room.name);
        clearTowerHubBlockers(room, pos);
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


function invalidateRoomStructureCaches(room) {
    if (room._invalidateStructureCaches) room._invalidateStructureCaches();
    room._constructionSites = undefined;
    room._constructionSites_ts = undefined;
}

function getLiveTowerStructures(room) {
    invalidateRoomStructureCaches(room);
    if (room.__nativeFind) {
        try {
            return room.__nativeFind(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}}) || [];
        } catch (e) {
        }
    }
    return room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}});
}

function getLiveTowerSites(room) {
    invalidateRoomStructureCaches(room);
    if (room.__nativeFind) {
        try {
            return room.__nativeFind(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_TOWER}}) || [];
        } catch (e) {
        }
    }
    return room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_TOWER}});
}

function wipeTowersInRoom(room) {
    let towers = 0;
    let sites = 0;
    let failed = 0;

    for (const tower of getLiveTowerStructures(room)) {
        try {
            if (tower.destroy() === OK) towers++;
        } catch (e) {
            failed++;
        }
    }

    for (const site of getLiveTowerSites(room)) {
        try {
            site.remove();
            sites++;
        } catch (e) {
            failed++;
        }
    }

    invalidateRoomStructureCaches(room);
    return {towers, sites, failed};
}

function resetTowerLayoutForRoom(room) {
    if (!room.controller || !room.controller.my) {
        return {roomName: room.name, skipped: true, reason: 'not owned'};
    }
    if (!room.memory.bunkerHub || !room.memory.bunkerHub.x) {
        return {roomName: room.name, skipped: true, reason: 'no hub'};
    }

    const wiped = wipeTowersInRoom(room);
    const oldTowerHubs = room.memory.towerHubs ? room.memory.towerHubs.length : 0;
    delete room.memory.towerHubs;

    findTowerHub(room, {forceSearch: true});
    const newTowerHubs = room.memory.towerHubs ? room.memory.towerHubs.length : 0;

    const towerSitesPlaced = placeTowerSitesUpToDeficit(room, getTowerDeficit(room));

    const {recalculateRampartsForRoom} = require('planRamparts');
    const ramparts = recalculateRampartsForRoom(room);

    room.memory.towerLayoutVersion = TOWER_LAYOUT_VERSION;
    log.a(`${room.name} tower layout reset: destroyed ${wiped.towers} tower(s), ${wiped.sites} site(s), hubs ${oldTowerHubs}->${newTowerHubs}, placed ${towerSitesPlaced} site(s), ramparts ${ramparts.spots} spot(s)`);

    return {
        roomName: room.name,
        wiped,
        oldTowerHubs,
        newTowerHubs,
        towerHubs: room.memory.towerHubs,
        towerSitesPlaced,
        ramparts,
    };
}

function queueTowerLayoutReset(roomNames) {
    const pending = (Memory.towerLayoutResetQueue || []).slice();
    const seen = new Set(pending);
    let added = 0;
    for (const name of roomNames) {
        if (!name || seen.has(name)) continue;
        seen.add(name);
        pending.push(name);
        added++;
    }
    if (pending.length) Memory.towerLayoutResetQueue = pending;
    else delete Memory.towerLayoutResetQueue;
    return {queued: pending.length, added};
}

function processTowerLayoutResetQueue() {
    const queue = Memory.towerLayoutResetQueue;
    if (!queue || !queue.length) return null;

    const roomName = queue.shift();
    if (!queue.length) delete Memory.towerLayoutResetQueue;
    else Memory.towerLayoutResetQueue = queue;

    const room = Game.rooms[roomName];
    if (!room) {
        return {roomName, error: 'no vision', remaining: queue.length};
    }
    return resetTowerLayoutForRoom(room);
}

function recoverTowerHubsFromTowers(room) {
    const positions = [];
    const seen = new Set();
    const add = (x, y) => {
        const key = x + ',' + y;
        if (seen.has(key)) return;
        seen.add(key);
        positions.push({x, y});
    };
    for (const tower of getLiveTowerStructures(room)) add(tower.pos.x, tower.pos.y);
    for (const site of getLiveTowerSites(room)) add(site.pos.x, site.pos.y);
    if (!positions.length) return false;
    room.memory.towerHubs = positions.slice(0, 6);
    ROOM_RAMPART_SPOTS[room.name] = undefined;
    log.a(`${room.name}: recovered ${room.memory.towerHubs.length} tower hub(s) from existing towers`);
    return true;
}

function findTowerHub(room, options) {
    const {forceSearch = false} = options || {};
    if (!room.memory.bunkerHub || !room.memory.bunkerHub.x) return;
    if (room.memory.towerHubs && room.memory.towerHubs.length) return;
    if (!forceSearch && recoverTowerHubsFromTowers(room)) return;


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
            if (hubDist < TOWER_HUB_MIN_DIST || hubDist > TOWER_HUB_MAX_DIST) continue;
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

    getTowerDeficit,

    placeTowerSitesUpToDeficit,

    auditTowerHubTiles,

    resetTowerLayoutForRoom,

    queueTowerLayoutReset,

    processTowerLayoutResetQueue,

    TOWER_LAYOUT_VERSION,

};