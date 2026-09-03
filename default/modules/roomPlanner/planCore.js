/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Planner V2 core stamps + dynamic specials (PR7).
 *
 * Plan: bunker/core template world tiles + dynamic special assignments (from planExtensions).
 * Act: siteBudget under layers `core` and `specials`.
 */

const {bunkerTemplate, coreTemplate, hubLinkOffset, reservedHubTileKeys} = require('planTemplates');
const {
    isAttackRecoveryMode,
    shouldSkipStructure,
    safeStructureMy,
} = require('planUtils');
const {
    getDynamicSpecialAssignments,
    shouldDeferDynamicSpecials,
    getExtensionDeficit,
    DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE,
    DYNAMIC_SPECIAL_SITE_TYPES,
    isHubRelativeExtensionParity,
} = require('planGeomExtensions');

const {ensurePlan, getPlan, pushFailure, FailureCodes, packTiles} = require('planDoc');
const siteBudget = require('planSiteBudget');
const {isPlannerShadow} = require('planFlag');
const {hasSpawnOrSpawnSite} = require('planActors');

const LAYOUT_SKIP_TYPES = [STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD];
/** Types owned by other V2 layers — never placed by core stamps. */
const LAYER_OWNED_TYPES = [STRUCTURE_EXTENSION, STRUCTURE_TOWER];
/** Prefer economy unlock stamps before observer/factory/etc. in the same tick. */
const CORE_PLACE_PRIORITY = {
    [STRUCTURE_STORAGE]: 100,
    [STRUCTURE_TERMINAL]: 90,
    [STRUCTURE_SPAWN]: 80,
    [STRUCTURE_LINK]: 70,
};
const MAX_CORE_SITES_PER_TICK = 3;
const MAX_SPECIAL_SITES_PER_TICK = 2;

function getStructureCounts(room) {
    const counts = {};
    const structs = room.structures || [];
    for (let i = 0; i < structs.length; i++) {
        const t = structs[i].structureType;
        counts[t] = (counts[t] || 0) + 1;
    }
    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const t = sites[i].structureType;
        counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
}

function getTemplate(room) {
    return room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
}

/**
 * Stamp entries that still need sites for this RCL (plan side).
 * @param {Room} room
 * @returns {{structureType: string, tiles: {x:number,y:number}[], needed: number, have: number}[]}
 */
function computeCoreStampPlan(room) {
    if (!room.controller) return [];
    const level = room.controller.level;
    // C4: room.hub is plan-first; getHub fallback if prototype not ready.
    const hub = room.hub || (() => {
        try {
            return require('planDoc').getHub(room);
        } catch (e) {
            return room.memory.bunkerHub;
        }
    })();
    if (!hub) return [];

    const counts = getStructureCounts(room);
    const tmpl = getTemplate(room);
    const skipTypes = room.memory.dynamicLayout
        ? LAYOUT_SKIP_TYPES.concat(LAYER_OWNED_TYPES)
        : (level < 5
            ? LAYOUT_SKIP_TYPES.concat(LAYER_OWNED_TYPES, [STRUCTURE_LINK])
            : LAYOUT_SKIP_TYPES.concat(LAYER_OWNED_TYPES));

    // Attack recovery: only critical stamps.
    let entries = tmpl.filter(s => !skipTypes.includes(s.structureType));
    if (level >= 5 && isAttackRecoveryMode(room)) {
        const keep = [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL];
        entries = tmpl.filter(s => keep.includes(s.structureType) && !LAYER_OWNED_TYPES.includes(s.structureType));
    }

    const plan = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const type = entry.structureType;
        if (shouldSkipStructure(room, entry)) continue;
        const allowed = CONTROLLER_STRUCTURES[type] ? (CONTROLLER_STRUCTURES[type][level] || 0) : 0;
        if (allowed <= 0) continue;
        const have = counts[type] || 0;

        const tiles = [];
        if (type === STRUCTURE_LINK) {
            // Hub receiver is one specific tile. Other links must not satisfy the stamp.
            const lx = hub.x + hubLinkOffset.x;
            const ly = hub.y + hubLinkOffset.y;
            if (lx < 1 || lx > 48 || ly < 1 || ly > 48) continue;
            const hubPos = new RoomPosition(lx, ly, room.name);
            const onTileStructs = hubPos.lookFor(LOOK_STRUCTURES) || [];
            let existingLink = null;
            for (let s = 0; s < onTileStructs.length; s++) {
                if (onTileStructs[s].structureType === STRUCTURE_LINK) {
                    existingLink = onTileStructs[s];
                    break;
                }
            }
            if (existingLink) {
                if (room.memory.hubLink !== existingLink.id) room.memory.hubLink = existingLink.id;
                continue;
            }
            const onTileSite = (hubPos.lookFor(LOOK_CONSTRUCTION_SITES) || [])
                .some(s => s.structureType === STRUCTURE_LINK);
            if (onTileSite) continue;
            if (have >= allowed) continue;
            tiles.push({x: lx, y: ly});
        } else {
            if (have >= allowed) continue;
            for (let p = 0; p < entry.pos.length; p++) {
                const off = entry.pos[p];
                const x = hub.x + off.x;
                const y = hub.y + off.y;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                tiles.push({x, y});
            }
        }
        if (!tiles.length) continue;
        plan.push({
            structureType: type,
            tiles,
            needed: allowed,
            have,
            deficit: allowed - have,
        });
    }
    // Storage/terminal first so a single MAX_CORE_SITES_PER_TICK batch does not
    // spend the whole tick on observer/factory while economy stays blocked.
    plan.sort((a, b) => {
        const pa = CORE_PLACE_PRIORITY[a.structureType] || 0;
        const pb = CORE_PLACE_PRIORITY[b.structureType] || 0;
        return pb - pa;
    });
    return plan;
}

/**
 * Dynamic special assignments ready for placement (plan side).
 * @param {Room} room
 */
function computeSpecialsPlan(room) {
    if (!room.memory.dynamicLayout || !room.controller) {
        return {assignments: [], deferred: false, reason: 'not-dynamic'};
    }
    const assignments = getDynamicSpecialAssignments(room) || [];
    const deferred = shouldDeferDynamicSpecials(room);
    return {
        assignments,
        deferred,
        reason: assignments.length ? (deferred ? 'extension-deficit' : null) : 'no-slots',
        deficit: deferred ? getExtensionDeficit(room) : undefined,
        gate: DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE,
    };
}

function syncCorePlanToDoc(room, stampPlan, specialsPlan) {
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (!plan || !plan.layers) return null;

    const coreTiles = [];
    for (let i = 0; i < stampPlan.length; i++) {
        const e = stampPlan[i];
        for (let t = 0; t < e.tiles.length; t++) {
            coreTiles.push(e.tiles[t]);
        }
    }
    plan.layers.core.packed = coreTiles.length ? packTiles(coreTiles) : [];
    plan.layers.core.rev = (plan.layers.core.rev || 0) + 1;
    plan.layers.core.extra = stampPlan.map(e => ({
        type: e.structureType,
        deficit: e.deficit,
        tiles: e.tiles.length,
    }));

    const specialTiles = (specialsPlan.assignments || []).map(a => ({x: a.x, y: a.y}));
    plan.layers.specials.packed = specialTiles.length ? packTiles(specialTiles) : [];
    plan.layers.specials.rev = (plan.layers.specials.rev || 0) + 1;
    plan.layers.specials.extra = {
        deferred: specialsPlan.deferred,
        reason: specialsPlan.reason,
        assignments: specialsPlan.assignments,
    };
    plan.meta.lastSyncTick = Game.time;
    return plan;
}

function tileIsFreeFor(pos, structureType) {
    if (pos.checkForWall && pos.checkForWall()) return false;
    const site = pos.checkForConstructionSites && pos.checkForConstructionSites();
    if (site) return site.structureType === structureType;
    const struct = pos.checkForAllStructure && pos.checkForAllStructure();
    // checkForAllStructure may return one structure; use look when available
    if (pos.lookFor) {
        const structs = pos.lookFor(LOOK_STRUCTURES) || [];
        for (let i = 0; i < structs.length; i++) {
            const s = structs[i];
            if (s.structureType === structureType) return false; // already built
            if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
            return false;
        }
        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES) || [];
        for (let i = 0; i < sites.length; i++) {
            if (sites[i].structureType === structureType) return false; // site exists
            return false; // wrong site blocks
        }
        return true;
    }
    if (struct) return false;
    return true;
}

const BUNKER_OBSERVER_CORNERS = [
    {x: 5, y: 5}, {x: 5, y: -5}, {x: -5, y: 5}, {x: -5, y: -5},
];

function isReservedHubTile(hub, x, y) {
    return !!(hub && reservedHubTileKeys(hub).has(`${x},${y}`));
}

function scoreObserverDest(room, pos, hub) {
    if (!pos || isReservedHubTile(hub, pos.x, pos.y)) return -1;
    if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) return -1;
    if (pos.checkForWall && pos.checkForWall()) return -1;
    const structs = pos.lookFor(LOOK_STRUCTURES) || [];
    let reclaimable = false;
    for (let i = 0; i < structs.length; i++) {
        const type = structs[i].structureType;
        if (type === STRUCTURE_OBSERVER) return 100;
        if (type === STRUCTURE_ROAD || type === STRUCTURE_RAMPART) continue;
        if (type === STRUCTURE_EXTENSION || type === STRUCTURE_CONTAINER) {
            reclaimable = true;
            continue;
        }
        return -1;
    }
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES) || [];
    for (let i = 0; i < sites.length; i++) {
        if (sites[i].structureType === STRUCTURE_OBSERVER) return 90;
        if (sites[i].structureType === STRUCTURE_ROAD || sites[i].structureType === STRUCTURE_RAMPART) continue;
        if (sites[i].structureType === STRUCTURE_EXTENSION || sites[i].structureType === STRUCTURE_CONTAINER) {
            reclaimable = true;
            continue;
        }
        return -1;
    }
    return reclaimable ? 1 : 2;
}

function nearbyDynamicObserverTiles(room, hub) {
    const tiles = [];
    const seen = reservedHubTileKeys(hub);
    const assignments = getDynamicSpecialAssignments(room) || [];
    for (let i = 0; i < assignments.length; i++) {
        const a = assignments[i];
        if (a.structureType !== STRUCTURE_OBSERVER) {
            seen.add(a.x + ',' + a.y);
            continue;
        }
        seen.add(a.x + ',' + a.y);
        tiles.push(new RoomPosition(a.x, a.y, room.name));
    }
    for (let r = 1; r <= 4; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const x = hub.x + dx;
                const y = hub.y + dy;
                const key = x + ',' + y;
                if (seen.has(key)) continue;
                seen.add(key);
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                if (!isHubRelativeExtensionParity(hub, x, y)) continue;
                tiles.push(new RoomPosition(x, y, room.name));
            }
        }
    }
    return tiles;
}

function plannedObserverPos(room) {
    const hub = room.hub;
    if (!hub) return null;
    const candidates = room.memory.dynamicLayout
        ? nearbyDynamicObserverTiles(room, hub)
        : BUNKER_OBSERVER_CORNERS.map(off => new RoomPosition(hub.x + off.x, hub.y + off.y, room.name));
    let best = null;
    let bestScore = 0;
    for (let i = 0; i < candidates.length; i++) {
        const score = scoreObserverDest(room, candidates[i], hub);
        if (score > bestScore) {
            bestScore = score;
            best = candidates[i];
        }
    }
    return best;
}

/**
 * Move the RCL8 observer off bunker (0,0) so a 0-MOVE hub manager can spawn there.
 * Finished rooms never show an observer deficit (they already have one), so the
 * normal core stamp pass will not do this on its own.
 */
function relocateHubObserver(room) {
    if (!room || !room.controller || !room.controller.my || room.controller.level < 8) {
        return {ok: false, reason: 'rcl'};
    }
    if (isPlannerShadow(room)) return {ok: false, reason: 'shadow'};
    const hub = room.hub;
    if (!hub) return {ok: false, reason: 'no-hub'};

    reclaimHubCollarTile(room, new RoomPosition(hub.x + hubLinkOffset.x, hub.y + hubLinkOffset.y, room.name), STRUCTURE_LINK);

    const dest = plannedObserverPos(room);
    if (!dest) return {ok: false, reason: 'no-dest'};

    const observer = room.observer;
    if (observer && observer.pos.x === dest.x && observer.pos.y === dest.y) {
        return {ok: true, reason: 'already'};
    }

    const freed = freeTileForSpecial(room, dest, STRUCTURE_OBSERVER);
    const destReady = freed === true || (freed && freed.already);
    if (!destReady && (!freed || freed.ok === false)) {
        return {ok: false, reason: 'dest-blocked'};
    }

    if (observer) {
        try {
            if (observer.destroy() !== OK) return {ok: false, reason: 'destroy-fail'};
            if (room._invalidateStructureCaches) room._invalidateStructureCaches();
        } catch (e) {
            return {ok: false, reason: 'destroy-fail'};
        }
        if (destReady) return {ok: true, reason: 'ready'};
    } else if (destReady) {
        return {ok: true, reason: 'already'};
    }

    const placed = dest.createConstructionSite(STRUCTURE_OBSERVER);
    if (placed === OK) {
        if (typeof log !== 'undefined' && log.a) {
            log.a(`${room.name} relocated observer off hub to (${dest.x},${dest.y})`, 'PLANNER');
        }
        return {ok: true, reason: 'placed', x: dest.x, y: dest.y};
    }
    return {ok: false, reason: 'place-fail', result: placed, x: dest.x, y: dest.y};
}

const HUB_COLLAR_RECLAIM = [STRUCTURE_EXTENSION, STRUCTURE_CONTAINER, STRUCTURE_TOWER, STRUCTURE_WALL]
    .concat(DYNAMIC_SPECIAL_SITE_TYPES);

function reclaimHubCollarTile(room, pos, keepType) {
    if (!room || !pos || !pos.lookFor || isPlannerShadow(room)) return {ok: false, reason: 'skip'};
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES) || [];
    for (let i = 0; i < sites.length; i++) {
        if (keepType && sites[i].structureType === keepType) continue;
        try {
            sites[i].remove();
        } catch (e) { /* ignore */
        }
    }
    let destroyed = 0;
    const structs = pos.lookFor(LOOK_STRUCTURES) || [];
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (keepType && s.structureType === keepType) continue;
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
        if (!HUB_COLLAR_RECLAIM.includes(s.structureType)) continue;
        try {
            if (s.destroy() !== OK) return {ok: false, destroyed, reason: 'destroy-fail', type: s.structureType};
            destroyed++;
            if (typeof log !== 'undefined' && log.a) {
                log.a(`${room.name} cleared ${s.structureType} off hub collar (${pos.x},${pos.y})`, 'PLANNER');
            }
        } catch (e) {
            return {ok: false, destroyed, reason: 'destroy-fail'};
        }
    }
    if (room._invalidateStructureCaches) room._invalidateStructureCaches();
    return {ok: true, destroyed};
}

function freeTileForSpecial(room, pos, structureType) {
    if (!pos.lookFor) return tileIsFreeFor(pos, structureType);

    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES) || [];
    for (let i = 0; i < sites.length; i++) {
        if (sites[i].structureType === structureType) return true;
        try {
            sites[i].remove();
        } catch (e) { /* ignore */
        }
    }

    let destroyed = 0;
    const structs = pos.lookFor(LOOK_STRUCTURES) || [];
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (s.structureType === structureType) return {ok: true, destroyed: 0, already: true};
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
        if (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_CONTAINER
            || (isReservedHubTile(room.hub, pos.x, pos.y)
                && (DYNAMIC_SPECIAL_SITE_TYPES.includes(s.structureType)
                    || s.structureType === STRUCTURE_TOWER
                    || s.structureType === STRUCTURE_WALL))) {
            try {
                if (s.destroy() !== OK) return {ok: false, destroyed};
                destroyed++;
            } catch (e) {
                return {ok: false, destroyed};
            }
            continue;
        }
        return {ok: false, destroyed};
    }
    return {ok: true, destroyed};
}

/**
 * Place missing core stamp structures.
 * @param {Room} room
 * @param {{max?: number}} [options]
 */
function placeCoreStamps(room, options) {
    const opts = options || {};
    const max = opts.max != null ? opts.max : MAX_CORE_SITES_PER_TICK;
    const details = [];
    let placed = 0;

    if (!room.controller || !room.controller.my) {
        return {placed: 0, details, reason: 'not-owned'};
    }
    if (!hasSpawnOrSpawnSite(room) && !(room.spawns && room.spawns.length)) {
        // Allow RCL1 bootstrap stamp path only when no empire spawn exists at all
        const anySpawn = _.find(Game.structures, s => s.structureType === STRUCTURE_SPAWN && safeStructureMy(s));
        if (!anySpawn && room.controller.level === 1) {
            // fall through — may place first spawn via stamp if actor missed
        } else if (!hasSpawnOrSpawnSite(room)) {
            return {placed: 0, details, reason: 'no-spawn-or-site'};
        }
    }

    // Source-adjacent extensions: planExtensions.placeSourceExtensions (siteBudget).

    if (!isPlannerShadow(room)) relocateHubObserver(room);
    // Core stamps place the hub receiver then skip the tile once it exists.
    // Bind memory here so a finished core (especially dynamic) still records it.
    try {
        require('planEconomy').bindHubLinkMemory(room);
    } catch (e) { /* ignore */
    }

    const stampPlan = computeCoreStampPlan(room);
    const specialsPlan = computeSpecialsPlan(room);
    syncCorePlanToDoc(room, stampPlan, specialsPlan);

    const attackRecovery = room.controller.level >= 5 && isAttackRecoveryMode(room);
    const shadow = isPlannerShadow(room);

    // Attack recovery: only critical stamps are placed (see computeCoreStampPlan).
    // Do not wipe idle roads/links/containers/extensions — later phases and the
    // global road queue immediately put the same tiles back.
    // Shadow: skip all world mutates (site.remove / perimeter place).
    if (attackRecovery && !shadow) {
        // V1 called rampartBuilder during recovery layout; recompute plan + place seal via V2.
        try {
            require('planRamparts').recalculateRampartsForRoom(room, undefined, {destroyOffPlan: false});
        } catch (e) { /* optional */
        }
        try {
            const peri = require('planRamparts').placePerimeter(room, {
                maxPlace: 3,
                allowInit: true,
                bridge: false,
            });
            if (peri && peri.placed) {
                details.push({type: 'perimeter', status: 'recovery', placed: peri.placed});
            }
        } catch (e) { /* optional */
        }
    }

    if (!stampPlan.length) {
        return {
            placed: 0,
            details,
            reason: 'none-needed',
            stampPlan,
            attackRecovery: attackRecovery || undefined,
        };
    }

    // C4: room.hub is plan-first; getHub fallback if prototype not ready.
    const hub = room.hub || (() => {
        try {
            return require('planDoc').getHub(room);
        } catch (e) {
            return room.memory.bunkerHub;
        }
    })();
    if (!hub) return {placed: 0, details, reason: 'no-hub'};

    outer:
        for (let i = 0; i < stampPlan.length; i++) {
            const entry = stampPlan[i];
            const type = entry.structureType;
            let typePlaced = 0;
            const typeHave = entry.have;

            for (let t = 0; t < entry.tiles.length; t++) {
                if (placed >= max) break outer;
                if (typeHave + typePlaced >= entry.needed) break;

                const {x, y} = entry.tiles[t];
                const pos = new RoomPosition(x, y, room.name);

                // Storage/terminal unlock roads + economy — clear extension/container
                // blockers the way dynamic specials do (live only).
                const isCriticalStamp = type === STRUCTURE_STORAGE || type === STRUCTURE_TERMINAL
                    || type === STRUCTURE_OBSERVER || type === STRUCTURE_LINK;
                if (isCriticalStamp && !shadow) {
                    const freed = freeTileForSpecial(room, pos, type);
                    if (freed && freed.already) {
                        details.push({type, x, y, status: 'ready'});
                        typePlaced++;
                        continue;
                    }
                    if (!freed || freed.ok === false) {
                        details.push({type, x, y, status: 'occupied'});
                        continue;
                    }
                } else if (!tileIsFreeFor(pos, type)) {
                    details.push({type, x, y, status: 'occupied'});
                    continue;
                }

                const req = siteBudget.request(room, 'core', 1);
                if (req.allowed < 1) {
                    details.push({type, x, y, status: 'no-budget', code: req.code});
                    const plan = getPlan(room);
                    if (plan && req.code) {
                        pushFailure(plan, {
                            code: req.code,
                            layer: 'core',
                            detail: {type, x, y},
                            tick: Game.time,
                            source: 'planCore.placeCoreStamps',
                        });
                    }
                    break outer;
                }

                if (shadow) {
                    placed++;
                    typePlaced++;
                    details.push({type, x, y, status: 'shadow'});
                    continue;
                }

                const res = siteBudget.tryPlace(room, 'core', pos, type);
                if (res.ok) {
                    placed++;
                    typePlaced++;
                    details.push({type, x, y, status: 'placed'});
                } else {
                    details.push({type, x, y, status: 'fail', result: res.result, code: res.code});
                    if (res.code === FailureCodes.SITE_BUDGET_GLOBAL
                        || res.code === FailureCodes.SITE_BUDGET_ROOM
                        || res.result === ERR_FULL) {
                        break outer;
                    }
                }
            }
        }

    // protoStorage cleanup when real storage is allowed (live only)
    if (!shadow && room.memory.protoStorage && room.controller.level >= 4) {
        const protoStorage = Game.getObjectById(room.memory.protoStorage);
        if (protoStorage) {
            try {
                protoStorage.destroy();
            } catch (e) { /* ignore */
            }
        }
        room.memory.protoStorage = undefined;
    }

    return {
        placed,
        details,
        shadow: shadow || undefined,
        stampPlan,
        attackRecovery: attackRecovery || undefined,
    };
}

/**
 * Place dynamic specials (factory / powerSpawn / nuker / observer) via siteBudget.
 * @param {Room} room
 * @param {{max?: number}} [options]
 */
function placeSpecials(room, options) {
    const opts = options || {};
    const max = opts.max != null ? opts.max : MAX_SPECIAL_SITES_PER_TICK;
    const specialsPlan = computeSpecialsPlan(room);

    if (specialsPlan.reason === 'not-dynamic' || !specialsPlan.assignments.length) {
        return {
            placed: 0,
            destroyedExtensions: 0,
            details: [],
            skipped: specialsPlan.reason || 'none',
            deficit: specialsPlan.deficit,
            gate: specialsPlan.gate,
        };
    }

    if (!room.controller || room.controller.level < 7) {
        return {placed: 0, destroyedExtensions: 0, details: [], skipped: 'rcl'};
    }

    const level = room.controller.level;
    const shadow = isPlannerShadow(room);
    let placed = 0;
    let destroyedExtensions = 0;
    const details = [];

    for (let i = 0; i < specialsPlan.assignments.length; i++) {
        if (placed >= max) break;
        const a = specialsPlan.assignments[i];
        const allowed = CONTROLLER_STRUCTURES[a.structureType]
            ? (CONTROLLER_STRUCTURES[a.structureType][level] || 0)
            : 0;
        if (allowed <= 0 || level < a.minRcl) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'rcl'});
            continue;
        }

        const have = getStructureCounts(room)[a.structureType] || 0;
        if (have >= allowed) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'have'});
            continue;
        }

        const pos = new RoomPosition(a.x, a.y, room.name);
        if (specialsPlan.deferred) {
            const hasExt = (pos.lookFor(LOOK_STRUCTURES) || [])
                .some(s => s.structureType === STRUCTURE_EXTENSION);
            if (hasExt) {
                details.push({type: a.structureType, x: a.x, y: a.y, status: 'defer-extension'});
                continue;
            }
        }

        // Shadow: never remove/destroy blockers — only report readiness.
        if (shadow) {
            if (!tileIsFreeFor(pos, a.structureType)) {
                details.push({type: a.structureType, x: a.x, y: a.y, status: 'blocked'});
                continue;
            }
            const req = siteBudget.request(room, 'specials', 1);
            if (req.allowed < 1) {
                details.push({type: a.structureType, x: a.x, y: a.y, status: 'no-budget', code: req.code});
                break;
            }
            placed++;
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'shadow'});
            continue;
        }

        const freed = freeTileForSpecial(room, pos, a.structureType);
        if (!freed || freed.ok === false) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'blocked'});
            continue;
        }
        if (freed.already) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'ready'});
            continue;
        }
        if (freed.destroyed) destroyedExtensions += freed.destroyed;

        // Correct site may already exist after free
        if (pos.lookFor) {
            const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES) || [];
            if (sites.some(s => s.structureType === a.structureType)) {
                details.push({type: a.structureType, x: a.x, y: a.y, status: 'ready'});
                continue;
            }
            const structs = pos.lookFor(LOOK_STRUCTURES) || [];
            if (structs.some(s => s.structureType === a.structureType)) {
                details.push({type: a.structureType, x: a.x, y: a.y, status: 'ready'});
                continue;
            }
        }

        const req = siteBudget.request(room, 'specials', 1);
        if (req.allowed < 1) {
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'no-budget', code: req.code});
            break;
        }

        const res = siteBudget.tryPlace(room, 'specials', pos, a.structureType);
        if (res.ok) {
            placed++;
            details.push({type: a.structureType, x: a.x, y: a.y, status: 'placed'});
            try {
                require('planGeomRamparts').invalidateRampartSpots(room);
            } catch (e) { /* optional */
            }
            if (typeof log !== 'undefined' && log.a) {
                log.a(`${room.name} dynamic special: ${a.structureType} at (${a.x},${a.y}) [v2]`, 'PLANNER');
            }
        } else {
            details.push({
                type: a.structureType,
                x: a.x,
                y: a.y,
                status: 'fail',
                result: res.result,
                code: res.code,
            });
            if (res.result === ERR_FULL || res.code === FailureCodes.SITE_BUDGET_ROOM
                || res.code === FailureCodes.SITE_BUDGET_GLOBAL) {
                break;
            }
        }
    }

    return {
        placed,
        destroyedExtensions,
        details,
        shadow: shadow || undefined,
    };
}

/**
 * Combined core + specials pass.
 * @param {Room} room
 */
function placeCoreAndSpecials(room) {
    const core = placeCoreStamps(room);
    const specials = placeSpecials(room);
    return {core, specials};
}

/**
 * @param {Room} room
 */
function inspectCore(room) {
    const stampPlan = computeCoreStampPlan(room);
    const specialsPlan = computeSpecialsPlan(room);
    return {
        room: room.name,
        dynamicLayout: !!room.memory.dynamicLayout,
        pendingStamps: stampPlan.map(e => ({
            type: e.structureType,
            deficit: e.deficit,
            tiles: e.tiles.length,
        })),
        specials: {
            deferred: specialsPlan.deferred,
            reason: specialsPlan.reason,
            assignments: specialsPlan.assignments,
            deficit: specialsPlan.deficit,
        },
        availableCore: siteBudget.available(room, 'core'),
        availableSpecials: siteBudget.available(room, 'specials'),
        counts: getStructureCounts(room),
    };
}

module.exports = {
    computeCoreStampPlan,
    computeSpecialsPlan,
    syncCorePlanToDoc,
    placeCoreStamps,
    placeSpecials,
    placeCoreAndSpecials,
    relocateHubObserver,
    inspectCore,
    MAX_CORE_SITES_PER_TICK,
    MAX_SPECIAL_SITES_PER_TICK,
};
