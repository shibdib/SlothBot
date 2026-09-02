/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Planner anchors (Phase 3A): core hub, tower hubs, lab hub + tower placement.
 *
 * Geometry absorbed from former planHub (shim deleted — A1). Tower construction
 * sites always go through planSiteBudget.
 *
 * C4–C5: plan.anchors is sole write target for hub/towers/lab.
 * Reads: getHub / getTowerHubs / getLabHub (legacy fallback for old Memory).
 * Dual-write of anchor coords to bunkerHub/towerHubs/labHub removed (C5).
 */

const {coreTemplate, bunkerTemplate, labTemplate, hubLinkOffset} = require('planTemplates');

const {
    getUndefendedExits,
    determineTowerDamage,
    isCoreHubTileValid,
    isNearAnyMineral,
    safeStructureOwner,
    countRoomConstructionSitesOfType,
    countRoomConstructionSites,
    canPlaceConstructionSite,
    roomConstructionSiteBudget,
} = require('planUtils');

const {
    assessHubExtensionCapacity,
    clearDynamicLayoutMemory,
    countPlaceableBunkerExtensionsAt,
} = require('planGeomExtensions');

const {
    ensurePlan,
    getPlan,
    pushFailure,
    FailureCodes,
    getHub,
    getTowerHubs,
    getLabHub,
    isValidHub,
    syncToLegacy,
} = require('planDoc');
const siteBudget = require('planSiteBudget');
const {isPlannerShadow} = require('planFlag');

const LAB_HUB_SEARCH_COOLDOWN = 500;
const LAB_HUB_SEARCH_CPU_RESERVE = 10;
const LAB_HUB_PATH_MAX_OPS = 4000;
const HUB_EXTENSION_VALIDATE_COOLDOWN = 500;
const TOWER_HUB_MIN_DIST = 6;
const TOWER_HUB_MAX_DIST = 10;
const TOWER_LAYOUT_VERSION = 1;
const MAX_TOWER_HUBS = 6;
const TOWER_HUB_SEPARATION = 4;
const LAB_HUB_INPUT_INDICES = [0, 1];

// ---------------------------------------------------------------------------
// Plan doc dual-write
// ---------------------------------------------------------------------------

function isValidXY(p) {
    return isValidHub(p);
}

/**
 * Mirror legacy keys into plan (or plan→legacy when V2). Prefer ensurePlan resync.
 * Safe to call after direct legacy writes.
 */
function syncAnchorsToPlan(room) {
    if (!room || !room.memory) return null;
    return ensurePlan(room, {resync: true});
}

/**
 * Commit hub to plan (C5: no bunkerHub dual-write).
 * Legacy bunkerHub only if plan doc cannot be created (should be rare).
 */
function commitCoreHub(room, hub, options) {
    if (!isValidXY(hub)) return false;
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (plan) {
        plan.anchors.hub = {x: hub.x, y: hub.y};
        if (options && options.dynamicLayout) plan.mode = 'dynamic';
        plan.meta.authority = 'plan';
        // Packs only — anchors stay plan-only (C5).
        syncToLegacy(room, plan);
    } else {
        room.memory.bunkerHub = {x: hub.x, y: hub.y};
    }
    if (options && options.dynamicLayout) room.memory.dynamicLayout = true;
    room._hub = undefined;
    return true;
}

function commitTowerHubs(room, hubs) {
    const list = (hubs || []).filter(isValidXY).map(t => ({x: t.x, y: t.y})).slice(0, MAX_TOWER_HUBS);
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (plan) {
        plan.anchors.towers = list.map(t => ({x: t.x, y: t.y}));
        plan.meta.layoutVersions = plan.meta.layoutVersions || {};
        plan.meta.layoutVersions.towers = TOWER_LAYOUT_VERSION;
        plan.meta.authority = 'plan';
        syncToLegacy(room, plan);
    } else {
        room.memory.towerHubs = list;
    }
    // Version gate still on memory for clearance/reset consumers.
    room.memory.towerLayoutVersion = TOWER_LAYOUT_VERSION;
    if (typeof ROOM_RAMPART_SPOTS !== 'undefined') {
        ROOM_RAMPART_SPOTS[room.name] = undefined;
    }
    return list;
}

function commitLabHub(room, lab, partial) {
    if (!isValidXY(lab)) return false;
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (plan) {
        plan.anchors.lab = {x: lab.x, y: lab.y};
        plan.anchors.labPartial = !!partial;
        plan.meta.authority = 'plan';
        syncToLegacy(room, plan);
    } else {
        room.memory.labHub = {x: lab.x, y: lab.y};
        if (partial) room.memory.labHubPartial = true;
        else delete room.memory.labHubPartial;
    }
    delete room.memory.labHubSearchFailed;
    return true;
}

/** Effective bunker hub (plan first). */
function resolveHub(room) {
    return getHub(room);
}

/** Effective tower hubs (plan first). */
function resolveTowerHubs(room) {
    return getTowerHubs(room);
}

/** Effective lab hub (plan first). */
function resolveLabHub(room) {
    return getLabHub(room);
}

// ---------------------------------------------------------------------------
// Core hub search
// ---------------------------------------------------------------------------

function validateHubExtensionCapacity(room) {
    if (room.memory.dynamicLayout) return true;
    if (!room.controller || room.controller.level < 2) return true;
    // Cooldown first so thrash cannot re-run full assess every tick even if assess throws.
    if (room.memory.hubExtensionValidateTick && room.memory.hubExtensionValidateTick > Game.time) {
        return true;
    }
    room.memory.hubExtensionValidateTick = Game.time + HUB_EXTENSION_VALIDATE_COOLDOWN;

    let capacity;
    try {
        capacity = assessHubExtensionCapacity(room);
    } catch (e) {
        if (typeof log !== 'undefined' && log.e) {
            log.e(room.name + ' hub extension assess failed: ' + ((e && e.message) || e), 'PLANNER');
        }
        return true; // keep hub; retry after cooldown
    }
    if (!capacity || capacity.sufficient) return true;

    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' hub supports ' + capacity.placeable + ' bunker + ' + capacity.fallback
            + ' fallback slots but needs ' + capacity.deficit + ' extensions - switching to dynamic layout.');
    }
    clearDynamicLayoutMemory(room);
    return findCoreHub(room);
}

function hubLinkTileBuildable(room, hub) {
    if (!room || !hub) return false;
    const x = hub.x + hubLinkOffset.x;
    const y = hub.y + hubLinkOffset.y;
    if (x < 1 || x > 48 || y < 1 || y > 48) return false;
    return Game.map.getRoomTerrain(room.name).get(x, y) !== TERRAIN_MASK_WALL;
}

function isOpenHubTile(room, x, y) {
    if (x < 2 || x > 47 || y < 2 || y > 47) return false;
    return Game.map.getRoomTerrain(room.name).get(x, y) !== TERRAIN_MASK_WALL;
}

function pickHubNearSpawn(room, spawn) {
    if (!room || !spawn) return null;
    const sx = spawn.pos.x;
    const sy = spawn.pos.y;
    const preferred = [
        {x: sx + 1, y: sy + 1}, {x: sx - 1, y: sy + 1},
        {x: sx + 1, y: sy - 1}, {x: sx - 1, y: sy - 1},
        {x: sx, y: sy + 1}, {x: sx + 1, y: sy},
        {x: sx - 1, y: sy}, {x: sx, y: sy - 1},
    ];
    for (let i = 0; i < preferred.length; i++) {
        const p = preferred[i];
        if (isOpenHubTile(room, p.x, p.y) && hubLinkTileBuildable(room, p)) {
            return {hub: p, dynamic: false};
        }
    }
    for (let i = 0; i < preferred.length; i++) {
        const p = preferred[i];
        if (isOpenHubTile(room, p.x, p.y)) return {hub: p, dynamic: true};
    }
    return null;
}

function isValidHubPosition(pos, room, sources) {
    if (!isOpenHubTile(room, pos.x, pos.y)) return false;
    if (!hubLinkTileBuildable(room, pos)) return false;
    const layoutTemplate = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    for (let t = 0; t < layoutTemplate.length; t++) {
        const type = layoutTemplate[t];
        for (let i = 0; i < type.pos.length; i++) {
            const s = type.pos[i];
            const sp = new RoomPosition(pos.x + s.x, pos.y + s.y, room.name);
            if (sp.x < 1 || sp.x > 48 || sp.y < 1 || sp.y > 48) return false;
            if (sp.checkForImpassible()) return false;
            if (sp.isNearTo(room.controller)) return false;
            if (isNearAnyMineral(sp, room, 1)) return false;
            if (sources.some(src => sp.isNearTo(src))) return false;
        }
    }
    return true;
}

function findCoreHub(room) {
    let bestPos = null;
    let bestScore = Infinity;
    for (let x = 3; x <= 46; x++) {
        for (let y = 3; y <= 46; y++) {
            const hub = new RoomPosition(x, y, room.name);
            if (hub.checkForImpassible()) continue;
            if (!hubLinkTileBuildable(room, hub)) continue;
            let valid = true;
            outer: for (let e = 0; e < coreTemplate.length; e++) {
                const entry = coreTemplate[e];
                for (let p = 0; p < entry.pos.length; p++) {
                    const dx = entry.pos[p].x;
                    const dy = entry.pos[p].y;
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
    commitCoreHub(room, bestPos, {dynamicLayout: true});
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' cannot fit full bunker — using dynamic layout at (' + bestPos.x + ', ' + bestPos.y + ')');
    }
    return true;
}

function findHub(room, isHubCheck) {
    // Plan-first hub (C5: no legacy hydrate).
    const resolved = resolveHub(room);
    if (resolved && room.controller && room.controller.owner
        && room.controller.owner.username === MY_USERNAME) {
        if (!isHubCheck) validateHubExtensionCapacity(room);
        return true;
    }

    if (!isHubCheck) {
        // Shadow canary: never mass-destroy foreign structures; hub recovery memory is OK.
        if (!isPlannerShadow(room)) {
            const structures = room.structures || [];
            for (let i = 0; i < structures.length; i++) {
                const s = structures[i];
                if (s instanceof OwnedStructure && safeStructureOwner(s) === MY_USERNAME) continue;
                try {
                    s.destroy();
                } catch (e) { /* ignore */
                }
            }
        }

        const spawn = room.spawns && (room.spawns.find(s => s.name !== 'auto') || room.spawns[0]);
        let recovered = null;
        let recoveredDynamic = false;
        let recoveredFrom = null;
        if (room.terminal) {
            recovered = {x: room.terminal.pos.x + 1, y: room.terminal.pos.y};
            recoveredFrom = 'terminal';
        } else if (room.storage) {
            recovered = {x: room.storage.pos.x - 1, y: room.storage.pos.y};
            recoveredFrom = 'storage';
        } else if (spawn) {
            const near = pickHubNearSpawn(room, spawn);
            if (near) {
                recovered = near.hub;
                recoveredDynamic = near.dynamic;
                recoveredFrom = 'spawn';
            }
        }
        if (recovered && isOpenHubTile(room, recovered.x, recovered.y)) {
            if (!hubLinkTileBuildable(room, recovered)) recoveredDynamic = true;
            commitCoreHub(room, {x: recovered.x, y: recovered.y}, recoveredDynamic ? {dynamicLayout: true} : undefined);
            if (typeof log !== 'undefined' && log.a) {
                log.a(room.name + ' hub recovered from ' + recoveredFrom
                    + (recoveredDynamic ? ' (dynamic)' : '') + '.');
            }
            validateHubExtensionCapacity(room);
            return true;
        }
    }

    const sources = room.find(FIND_SOURCES);
    const possiblePos = [];

    for (let y = 10; y <= 40; y++) {
        for (let x = 10; x <= 40; x++) {
            const pos = new RoomPosition(x, y, room.name);
            if (pos.checkForImpassible()) continue;
            if (!isValidHubPosition(pos, room, sources)) continue;
            if (isHubCheck) return true;
            possiblePos.push({x, y});
        }
    }

    if (possiblePos.length) {
        for (let i = 0; i < possiblePos.length; i++) {
            const p = possiblePos[i];
            p.placeable = countPlaceableBunkerExtensionsAt(room, p.x, p.y).placeable;
        }
        const maxPlaceable = _.max(possiblePos, 'placeable').placeable;
        const tier = possiblePos.filter(p => p.placeable === maxPlaceable);
        const extEntry = bunkerTemplate.find(s => s.structureType === STRUCTURE_EXTENSION);
        const extensionTotal = extEntry && extEntry.pos ? extEntry.pos.length : 0;
        if (typeof log !== 'undefined' && log.a) {
            log.a(room.name + ' hub search: ' + possiblePos.length + ' candidates, best extension fit '
                + maxPlaceable + '/' + extensionTotal);
        }
        const choice = _.min(tier, p => {
            const pos = new RoomPosition(p.x, p.y, room.name);
            const sourceDist = pos.getRangeTo(_.min(sources, s => pos.getRangeTo(s))) * 2;
            const controllerDist = pos.getRangeTo(room.controller) * 1.5;
            const edgeBonus = Math.min(p.x, 49 - p.x, p.y, 49 - p.y) * 0.3;
            return sourceDist + controllerDist - edgeBonus;
        });
        commitCoreHub(room, {x: choice.x, y: choice.y});
        if (typeof log !== 'undefined' && log.a) {
            log.a('Hub at (' + choice.x + ', ' + choice.y + ') in ' + room.name
                + ' — ' + choice.placeable + ' bunker extension slots');
        }
        return true;
    }

    if (isHubCheck) return false;
    if (findCoreHub(room)) return true;
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' has been abandoned due to being unable to find a suitable layout.');
    }
    return false;
}

function hubCheck(room) {
    return findHub(room, true);
}

function ensureCoreHub(room, options) {
    const opts = options || {};
    if (opts.hubCheck) {
        const ok = hubCheck(room);
        const hub = resolveHub(room);
        return {
            ok: !!ok,
            hub,
            existed: !!hub,
            source: 'hubCheck',
        };
    }

    const before = resolveHub(room);
    const existed = !!before;

    if (existed) {
        // Existing hub: capacity validate only (cooldown inside). No re-search / mass-destroy
        // unless the hub-link tile is a terrain wall and the room has not committed storage.
        findHub(room);
        let after = resolveHub(room);
        const hubUnusable = after && !room.storage && !room.terminal
            && (!isOpenHubTile(room, after.x, after.y) || !hubLinkTileBuildable(room, after));
        if (hubUnusable) {
            if (typeof log !== 'undefined' && log.a) {
                log.a(room.name + ' hub (' + after.x + ',' + after.y
                    + ') is unusable (wall hub or hub-link); re-searching dynamic hub.');
            }
            if (!findCoreHub(room)) {
                const spawn = room.spawns && (room.spawns.find(s => s.name !== 'auto') || room.spawns[0]);
                const near = pickHubNearSpawn(room, spawn);
                if (near) commitCoreHub(room, near.hub, {dynamicLayout: true});
            }
            after = resolveHub(room);
        }
        syncAnchorsToPlan(room);
        const switched = after && before
            && (after.x !== before.x || after.y !== before.y);
        return {
            ok: !!after,
            hub: after,
            existed: true,
            source: switched ? 'hub-link-wall' : 'existing',
            switched: switched || undefined,
            validateCooldownUntil: room.memory.hubExtensionValidateTick || null,
        };
    }

    const ok = findHub(room);
    syncAnchorsToPlan(room);
    const hub = resolveHub(room);
    if (!ok || !hub) {
        const plan = getPlan(room);
        if (plan) {
            pushFailure(plan, {
                code: FailureCodes.NO_HUB,
                layer: 'spawn',
                detail: {reason: 'findHub failed'},
                tick: Game.time,
                source: 'planAnchors.ensureCoreHub',
            });
        }
        return {ok: false, hub: null, existed: false, source: 'search'};
    }
    return {
        ok: true,
        hub,
        existed: false,
        source: 'search',
    };
}

// ---------------------------------------------------------------------------
// Lab hub search
// ---------------------------------------------------------------------------

function recoverLabHubFromLabs(room) {
    const active = (room.labs || []).filter(l => !l.isActive || l.isActive());
    for (let i = 0; i < active.length; i++) {
        const lab = active[i];
        const partner = active.find(l => l.id !== lab.id && l.pos.x === lab.pos.x && l.pos.y === lab.pos.y + 1);
        if (partner) {
            commitLabHub(room, {x: lab.pos.x, y: lab.pos.y}, true);
            if (typeof log !== 'undefined' && log.a) {
                log.a('Lab hub recovered from built pair at (' + lab.pos.x + ',' + lab.pos.y + ') in ' + room.name);
            }
            return true;
        }
    }
    if (active.length === 1) {
        commitLabHub(room, {x: active[0].pos.x, y: active[0].pos.y}, true);
        return true;
    }
    return false;
}

function labSearchCpuExceeded() {
    if (typeof Game === 'undefined' || !Game.cpu || !Game.cpu.getUsed) return false;
    const limit = Game.cpu.tickLimit || 500;
    return Game.cpu.getUsed() > limit - LAB_HUB_SEARCH_CPU_RESERVE;
}

function isLabBlockingStructureType(structureType, allowWalls) {
    if (structureType === STRUCTURE_ROAD || structureType === STRUCTURE_RAMPART) return false;
    if (allowWalls && structureType === STRUCTURE_WALL) return false;
    return true;
}

function addWorldBlockedTiles(room, blocked, allowWalls) {
    // Match placeLabs / checkForAllStructure: anything except road + rampart blocks.
    // Walls are destroyable at place time, so the fallback pass may ignore them.
    const structs = room.structures || [];
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (!s || !s.pos) continue;
        if (!isLabBlockingStructureType(s.structureType, allowWalls)) continue;
        blocked.add(s.pos.x + ',' + s.pos.y);
    }
    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const s = sites[i];
        if (!s || !s.pos) continue;
        if (!isLabBlockingStructureType(s.structureType, allowWalls)) continue;
        blocked.add(s.pos.x + ',' + s.pos.y);
    }
}

function buildLabSearchContext(room, allowWalls) {
    const hubXY = resolveHub(room);
    if (!hubXY) return null;
    const bunkerHub = new RoomPosition(hubXY.x, hubXY.y, room.name);
    const terrain = Game.map.getRoomTerrain(room.name);
    const sources = room.sources || [];
    const controller = room.controller;
    const bunkerTmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const blocked = new Set();
    for (let e = 0; e < bunkerTmpl.length; e++) {
        const entry = bunkerTmpl[e];
        for (let p = 0; p < entry.pos.length; p++) {
            const dx = entry.pos[p].x;
            const dy = entry.pos[p].y;
            blocked.add((bunkerHub.x + dx) + ',' + (bunkerHub.y + dy));
        }
    }
    addWorldBlockedTiles(room, blocked, !!allowWalls);
    if (controller) blocked.add(controller.pos.x + ',' + controller.pos.y);
    if (room.mineral) blocked.add(room.mineral.pos.x + ',' + room.mineral.pos.y);
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (s && s.pos) blocked.add(s.pos.x + ',' + s.pos.y);
    }

    let minDx = 0, maxDx = 0, minDy = 0, maxDy = 0;
    const tplSet = new Set();
    for (let i = 0; i < labTemplate.length; i++) {
        const dx = labTemplate[i].x;
        const dy = labTemplate[i].y;
        tplSet.add(dx + ',' + dy);
        if (dx < minDx) minDx = dx;
        if (dx > maxDx) maxDx = dx;
        if (dy < minDy) minDy = dy;
        if (dy > maxDy) maxDy = dy;
    }
    const labPerimeter = labTemplate.map(function (tile) {
        const dx = tile.x;
        const dy = tile.y;
        const out = [];
        for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
                if (!ox && !oy) continue;
                const px = dx + ox;
                const py = dy + oy;
                if (!tplSet.has(px + ',' + py)) out.push({x: px, y: py});
            }
        }
        return out;
    });

    const sourceXY = [];
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (s && s.pos) sourceXY.push({x: s.pos.x, y: s.pos.y});
    }
    const mineralXY = room.mineral && room.mineral.pos
        ? {x: room.mineral.pos.x, y: room.mineral.pos.y}
        : null;

    return {
        bunkerHub,
        terrain,
        sourceXY,
        mineralXY,
        controllerXY: controller ? {x: controller.pos.x, y: controller.pos.y} : null,
        blocked,
        labPerimeter,
        allowWalls: !!allowWalls,
        xMin: Math.max(2, 1 - minDx),
        xMax: Math.min(47, 48 - maxDx),
        yMin: Math.max(2, 1 - minDy),
        yMax: Math.min(47, 48 - maxDy),
    };
}

function isLabTileValid(ctx, cx, cy, index) {
    const terrain = ctx.terrain;
    const blocked = ctx.blocked;
    const labPerimeter = ctx.labPerimeter;
    const dx = labTemplate[index].x;
    const dy = labTemplate[index].y;
    const tx = cx + dx;
    const ty = cy + dy;
    if (tx < 1 || tx > 48 || ty < 1 || ty > 48) return false;
    if (terrain.get(tx, ty) === TERRAIN_MASK_WALL) return false;
    if (blocked.has(tx + ',' + ty)) return false;
    const controllerXY = ctx.controllerXY;
    if (controllerXY && Math.abs(tx - controllerXY.x) <= 1 && Math.abs(ty - controllerXY.y) <= 1) {
        return false;
    }
    const sources = ctx.sourceXY;
    for (let i = 0; i < sources.length; i++) {
        const s = sources[i];
        if (Math.abs(tx - s.x) <= 1 && Math.abs(ty - s.y) <= 1) return false;
    }
    const mineralXY = ctx.mineralXY;
    if (mineralXY && Math.abs(tx - mineralXY.x) <= 1 && Math.abs(ty - mineralXY.y) <= 1) {
        return false;
    }
    const perim = labPerimeter[index];
    for (let i = 0; i < perim.length; i++) {
        const ax = cx + perim[i].x;
        const ay = cy + perim[i].y;
        if (ax < 1 || ax > 48 || ay < 1 || ay > 48) continue;
        if (terrain.get(ax, ay) === TERRAIN_MASK_WALL) continue;
        return true;
    }
    return false;
}

function labStampFullValid(ctx, cx, cy) {
    for (let i = 0; i < labTemplate.length; i++) {
        if (!isLabTileValid(ctx, cx, cy, i)) return false;
    }
    return true;
}

function labStampMinValid(ctx, cx, cy) {
    if (!isLabTileValid(ctx, cx, cy, LAB_HUB_INPUT_INDICES[0])) return 0;
    if (!isLabTileValid(ctx, cx, cy, LAB_HUB_INPUT_INDICES[1])) return 0;
    let extraCount = 0;
    for (let i = LAB_HUB_INPUT_INDICES[1] + 1; i < labTemplate.length; i++) {
        if (isLabTileValid(ctx, cx, cy, i)) extraCount++;
    }
    return extraCount;
}

function forEachChebyshevRing(hubX, hubY, range, xMin, xMax, yMin, yMax, fn) {
    if (range <= 0) {
        if (hubX >= xMin && hubX <= xMax && hubY >= yMin && hubY <= yMax) fn(hubX, hubY);
        return;
    }
    const yTop = hubY - range;
    const yBot = hubY + range;
    for (let x = hubX - range; x <= hubX + range; x++) {
        if (x < xMin || x > xMax) continue;
        if (yTop >= yMin && yTop <= yMax) fn(x, yTop);
        if (yBot !== yTop && yBot >= yMin && yBot <= yMax) fn(x, yBot);
    }
    for (let y = hubY - range + 1; y <= hubY + range - 1; y++) {
        if (y < yMin || y > yMax) continue;
        const xLeft = hubX - range;
        const xRight = hubX + range;
        if (xLeft >= xMin && xLeft <= xMax) fn(xLeft, y);
        if (xRight !== xLeft && xRight >= xMin && xRight <= xMax) fn(xRight, y);
    }
}

function pathToLabHubOk(ctx, candidate) {
    const result = PathFinder.search(
        ctx.bunkerHub,
        {pos: new RoomPosition(candidate.x, candidate.y, ctx.bunkerHub.roomName), range: 1},
        {maxRooms: 1, maxOps: LAB_HUB_PATH_MAX_OPS}
    );
    if (result.incomplete) return false;
    return result.path.length <= candidate.score * 2 + 8;
}

function pickLabHubCandidate(ctx, candidates, preferExtraLabs) {
    if (!candidates.length) return {chosen: null, walkable: false};
    if (preferExtraLabs) {
        candidates.sort((a, b) => (b.extraCount - a.extraCount) || (a.score - b.score));
    } else {
        candidates.sort((a, b) => a.score - b.score);
    }
    const probe = Math.min(candidates.length, 8);
    for (let i = 0; i < probe; i++) {
        const c = candidates[i];
        if (pathToLabHubOk(ctx, c)) return {chosen: c, walkable: true};
    }
    return {chosen: candidates[0], walkable: false};
}

/**
 * Walk Chebyshev rings from the bunker hub so a valid stamp far from the core
 * is still found. Prefers a walkable hub over a closer disconnected pocket.
 * Cheap occupancy (no per-tile checkForImpassible) so the full room finishes.
 */
function searchLabHubByRing(ctx, minProduction) {
    const hubX = ctx.bunkerHub.x;
    const hubY = ctx.bunkerHub.y;
    const maxRange = Math.max(
        Math.max(hubX - ctx.xMin, ctx.xMax - hubX),
        Math.max(hubY - ctx.yMin, ctx.yMax - hubY)
    );
    let fallback = null;
    for (let r = 0; r <= maxRange; r++) {
        if (labSearchCpuExceeded()) {
            return {chosen: null, incomplete: true};
        }
        const ring = [];
        forEachChebyshevRing(hubX, hubY, r, ctx.xMin, ctx.xMax, ctx.yMin, ctx.yMax, function (cx, cy) {
            if (minProduction) {
                const extraCount = labStampMinValid(ctx, cx, cy);
                if (!extraCount) return;
                ring.push({x: cx, y: cy, score: r, extraCount});
            } else if (labStampFullValid(ctx, cx, cy)) {
                ring.push({x: cx, y: cy, score: r});
            }
        });
        if (!ring.length) continue;
        const pick = pickLabHubCandidate(ctx, ring, !!minProduction);
        if (pick.walkable && pick.chosen) {
            return {chosen: pick.chosen, incomplete: false};
        }
        if (!fallback && pick.chosen) fallback = pick.chosen;
    }
    return {chosen: fallback, incomplete: false};
}

function commitFoundLabHub(room, chosen, partial) {
    commitLabHub(room, chosen, partial);
    if (typeof log !== 'undefined' && log.a) {
        if (partial) {
            const extra = chosen.extraCount ? ', ' + chosen.extraCount + ' extra slot(s)' : '';
            log.a('Lab hub (partial) placed at (' + chosen.x + ',' + chosen.y + ') for ' + room.name
                + ', range ' + chosen.score + ' from bunker hub' + extra);
        } else {
            log.a('Lab hub (full) placed at (' + chosen.x + ',' + chosen.y + ') for ' + room.name
                + ', range ' + chosen.score + ' from bunker hub');
        }
    }
    return true;
}

function findLabHub(room) {
    if (resolveLabHub(room).hub) return true;
    if (!resolveHub(room)) return false;
    if (room.memory.labHubSearchFailed && room.memory.labHubSearchFailed > Game.time) return false;

    if (recoverLabHubFromLabs(room)) return true;

    const passes = [false, true];
    for (let p = 0; p < passes.length; p++) {
        const ctx = buildLabSearchContext(room, passes[p]);
        if (!ctx) return false;

        let result = searchLabHubByRing(ctx, false);
        if (result.incomplete) {
            if (typeof log !== 'undefined' && log.a) {
                log.a('Lab hub search in ' + room.name + ' hit CPU reserve; retry next visit.');
            }
            return false;
        }
        if (result.chosen) return commitFoundLabHub(room, result.chosen, false);

        result = searchLabHubByRing(ctx, true);
        if (result.incomplete) {
            if (typeof log !== 'undefined' && log.a) {
                log.a('Lab hub search in ' + room.name + ' hit CPU reserve; retry next visit.');
            }
            return false;
        }
        if (result.chosen) return commitFoundLabHub(room, result.chosen, true);
    }

    room.memory.labHubSearchFailed = Game.time + LAB_HUB_SEARCH_COOLDOWN;
    if (typeof log !== 'undefined' && log.a) {
        log.a('Cannot find a lab hub in ' + room.name + ' (retry in ' + LAB_HUB_SEARCH_COOLDOWN + ' ticks).');
    }
    return false;
}

function ensureLabHub(room) {
    if (!resolveHub(room)) {
        return {ok: false, lab: null, reason: 'no_hub'};
    }
    const existing = resolveLabHub(room);
    if (existing.hub) {
        // C5: no legacy hydrate — plan/read path is enough.
        return {
            ok: true,
            lab: existing.hub,
            partial: existing.partial,
            reason: 'existing',
        };
    }

    const result = findLabHub(room);
    syncAnchorsToPlan(room);
    const lab = resolveLabHub(room);
    if (!lab.hub) {
        return {ok: false, lab: null, reason: result === false ? 'search_failed' : 'pending'};
    }
    return {
        ok: true,
        lab: lab.hub,
        partial: lab.partial,
        reason: 'search',
    };
}

// ---------------------------------------------------------------------------
// Tower hubs
// ---------------------------------------------------------------------------

function cheby(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function selectTowerHubs(room) {
    const coreHub = resolveHub(room);
    if (!coreHub) {
        return {hubs: [], reason: 'no_hub'};
    }

    const hubX = coreHub.x;
    const hubY = coreHub.y;
    const neighboring = Game.map.describeExits(room.name);
    const dirToFind = {'1': FIND_EXIT_TOP, '3': FIND_EXIT_RIGHT, '5': FIND_EXIT_BOTTOM, '7': FIND_EXIT_LEFT};
    const undefendedExits = getUndefendedExits(room.name);

    const threatPoints = [];
    const allExitTiles = [];
    for (const dir in dirToFind) {
        if (!neighboring[dir]) continue;
        if (undefendedExits.includes(dirToFind[dir])) continue;
        const exits = room.find(dirToFind[dir]);
        if (!exits.length) continue;
        for (let i = 0; i < exits.length; i++) allExitTiles.push(exits[i]);
        threatPoints.push(
            exits[Math.floor(exits.length * 0.25)],
            exits[Math.floor(exits.length * 0.5)],
            exits[Math.floor(exits.length * 0.75)]
        );
    }

    if (!threatPoints.length) {
        return {hubs: [], reason: 'no_threat_exits'};
    }

    const terrain = Game.map.getRoomTerrain(room.name);
    const srcPos = (room.sources || []).map(s => s.pos);
    const ctrlPos = room.controller.pos;
    const minPos = room.mineral ? room.mineral.pos : null;

    const candidates = [];
    for (let x = 4; x <= 45; x++) {
        for (let y = 4; y <= 45; y++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            const hubDist = cheby(x, y, hubX, hubY);
            if (hubDist < TOWER_HUB_MIN_DIST || hubDist > TOWER_HUB_MAX_DIST) continue;
            if (srcPos.some(p => cheby(x, y, p.x, p.y) < 3)) continue;
            if (cheby(x, y, ctrlPos.x, ctrlPos.y) < 3) continue;
            if (minPos && cheby(x, y, minPos.x, minPos.y) < 3) continue;
            let minEdge = Infinity;
            for (let i = 0; i < allExitTiles.length; i++) {
                const e = allExitTiles[i];
                const d = cheby(x, y, e.x, e.y);
                if (d < minEdge) minEdge = d;
            }
            if (minEdge < 5) continue;

            let score = 0;
            for (let i = 0; i < threatPoints.length; i++) {
                const tp = threatPoints[i];
                score += determineTowerDamage(cheby(x, y, tp.x, tp.y));
            }
            candidates.push({x, y, score});
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    const selected = [];
    for (let i = 0; i < candidates.length; i++) {
        if (selected.length >= MAX_TOWER_HUBS) break;
        const c = candidates[i];
        let ok = true;
        for (let j = 0; j < selected.length; j++) {
            if (cheby(c.x, c.y, selected[j].x, selected[j].y) < TOWER_HUB_SEPARATION) {
                ok = false;
                break;
            }
        }
        if (ok) selected.push({x: c.x, y: c.y});
    }

    return {hubs: selected, candidateCount: candidates.length};
}

function recoverTowerHubsFromWorld(room) {
    const positions = [];
    const seen = new Set();
    const add = (x, y) => {
        const key = x + ',' + y;
        if (seen.has(key)) return;
        seen.add(key);
        positions.push({x, y});
    };

    const towers = room.towers || [];
    for (let i = 0; i < towers.length; i++) add(towers[i].pos.x, towers[i].pos.y);

    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        if (sites[i].structureType === STRUCTURE_TOWER) add(sites[i].pos.x, sites[i].pos.y);
    }
    return positions.slice(0, MAX_TOWER_HUBS);
}

/** Expand the perimeter wrap to new tower hubs without tearing down the current seal. */
function refreshPerimeterAfterTowerHubs(room) {
    if (!room || !room.controller || room.controller.level < (typeof BUNKER_LEVEL === 'number' ? BUNKER_LEVEL : 6)) {
        return;
    }
    try {
        require('planRamparts').recalculateRampartsForRoom(room, undefined, {destroyOffPlan: false});
    } catch (e) { /* optional */
    }
}

function ensureTowerHubs(room, options) {
    const opts = options || {};
    if (!resolveHub(room)) {
        return {ok: false, hubs: [], reason: 'no_hub'};
    }

    if (!opts.forceSearch) {
        const existing = resolveTowerHubs(room);
        if (existing.length) {
            // C5: no legacy hydrate — plan is enough for readers.
            return {ok: true, hubs: existing.slice(), reason: 'existing'};
        }
    }

    if (!opts.forceSearch) {
        const recovered = recoverTowerHubsFromWorld(room);
        if (recovered.length) {
            commitTowerHubs(room, recovered);
            refreshPerimeterAfterTowerHubs(room);
            if (typeof log !== 'undefined' && log.a) {
                log.a(room.name + ': recovered ' + recovered.length + ' tower hub(s) from existing towers', 'PLANNER');
            }
            return {ok: true, hubs: recovered, reason: 'recovered'};
        }
    }

    const selected = selectTowerHubs(room);
    commitTowerHubs(room, selected.hubs);
    refreshPerimeterAfterTowerHubs(room);
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ': ' + selected.hubs.length + ' tower hubs placed (anchors)', 'PLANNER');
    }
    return {
        ok: true,
        hubs: selected.hubs.slice(),
        reason: selected.reason || 'search',
        candidateCount: selected.candidateCount,
    };
}

/** Legacy name — ensure tower hubs exist (writes memory). */
function findTowerHub(room, options) {
    ensureTowerHubs(room, options || {});
}

function ensureAllAnchors(room, options) {
    const opts = options || {};
    const hub = ensureCoreHub(room);
    if (!hub.ok) {
        return {ok: false, hub, towers: null, lab: null};
    }
    const towers = ensureTowerHubs(room, {forceSearch: !!opts.forceTowerSearch});
    const lab = ensureLabHub(room);
    return {ok: true, hub, towers, lab};
}

// ---------------------------------------------------------------------------
// Tower placement (siteBudget only)
// ---------------------------------------------------------------------------

function getTowerDeficit(room) {
    if (!room.controller || !room.controller.my) return 0;
    if (room._towerDeficitTick === Game.time) return room._towerDeficit;
    const hubs = resolveTowerHubs(room);
    let n = 0;
    if (hubs && hubs.length) {
        const allowed = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
        const current = (room.towers ? room.towers.length : 0)
            + countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER);
        n = Math.max(0, allowed - current);
    }
    room._towerDeficit = n;
    room._towerDeficitTick = Game.time;
    return n;
}

function invalidateRoomCaches(room) {
    if (room._invalidateStructureCaches) room._invalidateStructureCaches();
    room._constructionSites = undefined;
    room._constructionSites_ts = undefined;
    room._extDeficitTick = undefined;
    room._towerDeficitTick = undefined;
    room._needsSpawnSiteTick = undefined;
    room._needsCriticalCoreTick = undefined;
}

/**
 * Free a tower hub tile for STRUCTURE_TOWER (parity with spawn clearSpawnTile).
 * V1 only removed idle rampart/wall/road sites; extensions on the tile blocked forever.
 * Chunk 6: also remove other wrong-type idle sites and soft obstacles (extension/container).
 * @returns {boolean} true if anything was removed/destroyed
 */
function clearTowerHubBlockers(room, pos) {
    let changed = false;

    const sites = pos.lookFor ? pos.lookFor(LOOK_CONSTRUCTION_SITES) : [];
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if (site.structureType === STRUCTURE_TOWER) continue;
        // Keep progressed non-extension sites (expensive to re-queue).
        if (site.progress && site.structureType !== STRUCTURE_EXTENSION) continue;
        try {
            site.remove();
            changed = true;
        } catch (e) { /* ignore */
        }
    }

    const structs = pos.lookFor ? pos.lookFor(LOOK_STRUCTURES) : [];
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (s.structureType === STRUCTURE_TOWER) continue;
        if (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_ROAD) continue;
        // Soft obstacles only — do not destroy storage/terminal/spawn on a bad hub tile.
        if (s.structureType !== STRUCTURE_EXTENSION && s.structureType !== STRUCTURE_CONTAINER
            && s.structureType !== STRUCTURE_WALL) {
            continue;
        }
        try {
            if (s.destroy() === OK) {
                changed = true;
                if (typeof log !== 'undefined' && log.a) {
                    log.a(room.name + ': cleared ' + s.structureType + ' on tower hub ('
                        + pos.x + ',' + pos.y + ')', 'PLANNER');
                }
            }
        } catch (e) { /* ignore */
        }
    }

    if (changed) invalidateRoomCaches(room);
    return changed;
}

function placeTowerSites(room, maxPerCall) {
    const limit = maxPerCall === undefined ? 1 : maxPerCall;
    const attempts = [];
    let placed = 0;

    if (!room.controller || !room.controller.my) {
        return {placed: 0, attempts, code: FailureCodes.RCL_GATE};
    }

    const hubs = resolveTowerHubs(room);
    if (!hubs || !hubs.length) {
        return {placed: 0, attempts, code: FailureCodes.PLAN_EMPTY};
    }

    const allowed = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller.level] || 0;
    const shadow = isPlannerShadow(room);

    for (let n = 0; n < limit; n++) {
        if (getTowerDeficit(room) <= 0) break;

        const req = siteBudget.request(room, 'towers', 1);
        if (req.allowed < 1) {
            attempts.push({ok: false, code: req.code, budget: true});
            const plan = getPlan(room);
            if (plan && req.code) {
                pushFailure(plan, {
                    code: req.code,
                    layer: 'towers',
                    detail: req,
                    tick: Game.time,
                    source: 'planAnchors.placeTowerSites',
                });
            }
            break;
        }

        let didPlace = false;
        for (let i = 0; i < Math.min(hubs.length, allowed); i++) {
            const x = hubs[i].x;
            const y = hubs[i].y;
            const pos = new RoomPosition(x, y, room.name);
            // Shadow: never remove blocking sites (world mutate).
            if (!shadow) clearTowerHubBlockers(room, pos);
            if (pos.checkForAllStructure && pos.checkForAllStructure()) continue;
            if (pos.checkForConstructionSites && pos.checkForConstructionSites()) continue;

            if (shadow) {
                attempts.push({ok: true, shadow: true, x, y});
                placed++;
                didPlace = true;
                break;
            }

            const res = siteBudget.tryPlace(room, 'towers', pos, STRUCTURE_TOWER);
            attempts.push({ok: res.ok, result: res.result, code: res.code, x, y, shadow: res.shadow});
            if (res.ok) {
                placed++;
                didPlace = true;
                break;
            }
            if (res.code === FailureCodes.SITE_BUDGET_GLOBAL
                || res.code === FailureCodes.SITE_BUDGET_ROOM
                || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
                break;
            }
        }
        if (!didPlace) break;
    }

    return {placed, shadow: shadow || undefined, attempts};
}

/** Legacy API: number of sites placed. */
function placeTowerSitesUpToDeficit(room, maxPerCall) {
    return placeTowerSites(room, maxPerCall).placed || 0;
}

/** Legacy API: place one tower site if possible. */
function buildTowersFromHubs(room) {
    return placeTowerSites(room, 1).placed > 0;
}

function auditTowerHubTiles(room) {
    const hubs = resolveTowerHubs(room);
    const level = room.controller && room.controller.level;
    const allowed = level ? CONTROLLER_STRUCTURES[STRUCTURE_TOWER][level] : 0;
    const terrain = Game.map.getRoomTerrain(room.name);
    const lastSiteError = room.memory.plannerLastSiteError;
    return {
        rcl: level,
        allowed,
        current: (room.towers ? room.towers.length : 0)
            + countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER),
        siteBudget: roomConstructionSiteBudget(room),
        canPlace: canPlaceConstructionSite(room),
        totalSites: countRoomConstructionSites(room.name),
        hubs: hubs.map(function (h) {
            const x = h.x;
            const y = h.y;
            const pos = new RoomPosition(x, y, room.name);
            const structure = pos.checkForAllStructure && pos.checkForAllStructure();
            const site = pos.checkForConstructionSites && pos.checkForConstructionSites();
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
            tick: lastSiteError.tick,
            age: Game.time - lastSiteError.tick,
            structureType: lastSiteError.structureType,
            result: lastSiteError.result,
        },
    };
}

// ---------------------------------------------------------------------------
// Tower layout reset (always budgeted place)
// ---------------------------------------------------------------------------

function getLiveTowerStructures(room) {
    invalidateRoomCaches(room);
    if (room.__nativeFind) {
        try {
            return room.__nativeFind(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}}) || [];
        } catch (e) { /* fall through */
        }
    }
    return room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}});
}

function getLiveTowerSites(room) {
    invalidateRoomCaches(room);
    if (room.__nativeFind) {
        try {
            return room.__nativeFind(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_TOWER}}) || [];
        } catch (e) { /* fall through */
        }
    }
    return room.find(FIND_CONSTRUCTION_SITES, {filter: {structureType: STRUCTURE_TOWER}});
}

function wipeTowersInRoom(room) {
    let towers = 0;
    let sites = 0;
    let failed = 0;

    const liveTowers = getLiveTowerStructures(room);
    for (let i = 0; i < liveTowers.length; i++) {
        try {
            if (liveTowers[i].destroy() === OK) towers++;
        } catch (e) {
            failed++;
        }
    }

    const liveSites = getLiveTowerSites(room);
    for (let i = 0; i < liveSites.length; i++) {
        try {
            liveSites[i].remove();
            sites++;
        } catch (e) {
            failed++;
        }
    }

    invalidateRoomCaches(room);
    return {towers, sites, failed};
}

function resetTowerLayoutForRoom(room) {
    if (!room || !room.controller || !room.controller.my) {
        return {roomName: room && room.name, skipped: true, reason: 'not owned'};
    }
    if (!resolveHub(room)) {
        return {roomName: room.name, skipped: true, reason: 'no hub'};
    }
    // Shadow canary: refuse destructive wipe (console must go live first).
    if (isPlannerShadow(room)) {
        return {
            roomName: room.name,
            skipped: true,
            reason: 'shadow',
            hint: "planner.enable(['" + room.name + "']) without shadow, or reset after disable shadow",
        };
    }

    const wiped = wipeTowersInRoom(room);
    const oldTowerHubs = resolveTowerHubs(room).length;
    delete room.memory.towerHubs;
    const planDoc = getPlan(room);
    if (planDoc && planDoc.anchors) {
        planDoc.anchors.towers = [];
    }

    ensureTowerHubs(room, {forceSearch: true});
    const newTowerHubs = resolveTowerHubs(room).length;

    syncAnchorsToPlan(room);
    const res = placeTowerSites(room, getTowerDeficit(room));
    const towerSitesPlaced = (res && res.placed) || 0;

    let ramparts = null;
    try {
        ramparts = require('planRamparts').recalculateRampartsForRoom(room);
    } catch (e) {
        ramparts = {error: (e && e.message) || String(e)};
    }

    room.memory.towerLayoutVersion = TOWER_LAYOUT_VERSION;
    if (typeof log !== 'undefined' && log.a) {
        log.a(room.name + ' tower layout reset: destroyed ' + wiped.towers + ' tower(s), '
            + wiped.sites + ' site(s), hubs ' + oldTowerHubs + '->' + newTowerHubs
            + ', placed ' + towerSitesPlaced + ' site(s) [budget], ramparts '
            + (ramparts && ramparts.spots != null ? ramparts.spots : '?') + ' spot(s)');
    }

    return {
        roomName: room.name,
        wiped,
        oldTowerHubs,
        newTowerHubs,
        towerHubs: room.memory.towerHubs,
        towerSitesPlaced,
        towerPlacePath: 'budget',
        ramparts,
        towerLayoutVersion: TOWER_LAYOUT_VERSION,
    };
}

function queueTowerLayoutReset(roomNames) {
    const pending = (Memory.towerLayoutResetQueue || []).slice();
    const seen = new Set(pending);
    let added = 0;
    const list = Array.isArray(roomNames) ? roomNames : (roomNames ? [roomNames] : []);
    for (let i = 0; i < list.length; i++) {
        const name = list[i];
        if (!name || seen.has(name)) continue;
        seen.add(name);
        pending.push(name);
        added++;
    }
    if (pending.length) Memory.towerLayoutResetQueue = pending;
    else delete Memory.towerLayoutResetQueue;
    return {queued: pending.length, added};
}

/** Drop no-vision queue entries after this many consecutive misses. */
const TOWER_RESET_NO_VISION_MAX = 50;

function processTowerLayoutResetQueue() {
    const queue = Memory.towerLayoutResetQueue;
    if (!queue || !queue.length) return null;

    const roomName = queue.shift();
    const room = Game.rooms[roomName];
    if (!room) {
        // Temporary no-vision: requeue at end; drop after many misses.
        if (!Memory._plannerTowerResetMiss) Memory._plannerTowerResetMiss = {};
        const misses = (Memory._plannerTowerResetMiss[roomName] || 0) + 1;
        Memory._plannerTowerResetMiss[roomName] = misses;
        if (misses < TOWER_RESET_NO_VISION_MAX) {
            queue.push(roomName);
        } else {
            delete Memory._plannerTowerResetMiss[roomName];
        }
        if (queue.length) Memory.towerLayoutResetQueue = queue;
        else delete Memory.towerLayoutResetQueue;
        return {
            roomName,
            error: 'no vision',
            requeued: misses < TOWER_RESET_NO_VISION_MAX,
            misses,
            remaining: queue.length,
        };
    }

    if (Memory._plannerTowerResetMiss) {
        delete Memory._plannerTowerResetMiss[roomName];
    }
    if (!queue.length) delete Memory.towerLayoutResetQueue;
    else Memory.towerLayoutResetQueue = queue;

    const result = resetTowerLayoutForRoom(room);
    result.remaining = queue.length;
    return result;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function inspectAnchors(room) {
    const plan = getPlan(room);
    const validateUntil = room.memory.hubExtensionValidateTick || 0;
    const labFailUntil = room.memory.labHubSearchFailed || 0;
    const resolved = {
        hub: resolveHub(room),
        towers: resolveTowerHubs(room),
        lab: resolveLabHub(room),
    };
    return {
        room: room.name,
        legacy: {
            bunkerHub: room.memory.bunkerHub || null,
            dynamicLayout: !!room.memory.dynamicLayout,
            towerHubs: room.memory.towerHubs || null,
            labHub: room.memory.labHub || null,
            labHubPartial: !!room.memory.labHubPartial,
            towerLayoutVersion: room.memory.towerLayoutVersion,
        },
        plan: plan ? {
            mode: plan.mode,
            anchors: plan.anchors,
            authority: plan.meta && plan.meta.authority,
        } : null,
        /** Effective anchors used for placement (plan first). */
        resolved,
        hubValid: !!resolved.hub,
        hubValidate: {
            cooldownUntil: validateUntil || null,
            onCooldown: validateUntil > Game.time,
            remaining: validateUntil > Game.time ? validateUntil - Game.time : 0,
            period: HUB_EXTENSION_VALIDATE_COOLDOWN,
        },
        labSearch: {
            failedUntil: labFailUntil || null,
            onCooldown: labFailUntil > Game.time,
            remaining: labFailUntil > Game.time ? labFailUntil - Game.time : 0,
        },
        towerLayout: {
            version: room.memory.towerLayoutVersion,
            target: TOWER_LAYOUT_VERSION,
            stale: room.memory.towerLayoutVersion !== TOWER_LAYOUT_VERSION,
            resetQueue: typeof Memory !== 'undefined' ? (Memory.towerLayoutResetQueue || []) : [],
            pendingReset: typeof Memory !== 'undefined'
                && Array.isArray(Memory.towerLayoutResetQueue)
                && Memory.towerLayoutResetQueue.indexOf(room.name) !== -1,
        },
        towerDeficit: getTowerDeficit(room),
        canPlace: canPlaceConstructionSite(room),
        towerSites: countRoomConstructionSitesOfType(room.name, STRUCTURE_TOWER),
        towersBuilt: room.towers ? room.towers.length : 0,
        hubTiles: auditTowerHubTiles(room),
    };
}

module.exports = {
    TOWER_LAYOUT_VERSION,
    TOWER_HUB_MIN_DIST,
    TOWER_HUB_MAX_DIST,
    MAX_TOWER_HUBS,
    HUB_EXTENSION_VALIDATE_COOLDOWN,
    // Dual-write / plan-first
    syncAnchorsToPlan,
    commitCoreHub,
    commitTowerHubs,
    commitLabHub,
    resolveHub,
    resolveTowerHubs,
    resolveLabHub,
    // Hub
    findHub,
    hubCheck,
    findCoreHub,
    ensureCoreHub,
    validateHubExtensionCapacity,
    // Lab
    findLabHub,
    ensureLabHub,
    // Towers
    selectTowerHubs,
    recoverTowerHubsFromWorld,
    ensureTowerHubs,
    findTowerHub,
    ensureAllAnchors,
    getTowerDeficit,
    placeTowerSites,
    placeTowerSitesUpToDeficit,
    buildTowersFromHubs,
    auditTowerHubTiles,
    clearTowerHubBlockers,
    resetTowerLayoutForRoom,
    queueTowerLayoutReset,
    processTowerLayoutResetQueue,
    inspectAnchors,
};
