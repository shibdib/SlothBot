/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Planner V2 core stamps + dynamic specials (PR7).
 *
 * Plan: bunker/core template world tiles + dynamic special assignments (from planExtensions).
 * Act: siteBudget under layers `core` and `specials`.
 */

const {bunkerTemplate, coreTemplate} = require('planTemplates');
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
        : (level < 6
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
        if (have >= allowed) continue;

        const tiles = [];
        for (let p = 0; p < entry.pos.length; p++) {
            const off = entry.pos[p];
            const x = hub.x + off.x;
            const y = hub.y + off.y;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            tiles.push({x, y});
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
    if (shouldDeferDynamicSpecials(room)) {
        return {
            assignments: [],
            deferred: true,
            reason: 'extension-deficit',
            deficit: getExtensionDeficit(room),
            gate: DYNAMIC_SPECIAL_EXTENSION_DEFICIT_GATE,
        };
    }
    const assignments = getDynamicSpecialAssignments(room) || [];
    return {assignments, deferred: false, reason: assignments.length ? null : 'no-slots'};
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
        if (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_CONTAINER) {
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

    const stampPlan = computeCoreStampPlan(room);
    const specialsPlan = computeSpecialsPlan(room);
    syncCorePlanToDoc(room, stampPlan, specialsPlan);

    const attackRecovery = room.controller.level >= 5 && isAttackRecoveryMode(room);
    const shadow = isPlannerShadow(room);

    // Attack recovery: clear idle non-critical sites (critical stamps only).
    // Shadow: skip all world mutates (site.remove / perimeter place).
    if (attackRecovery && !shadow) {
        const keep = [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL, STRUCTURE_RAMPART, STRUCTURE_WALL];
        const idle = (room.constructionSites || []).filter(s => !keep.includes(s.structureType) && !s.progress);
        for (let i = 0; i < idle.length; i++) {
            try {
                idle[i].remove();
            } catch (e) { /* ignore */
            }
        }
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
                const isCriticalStamp = type === STRUCTURE_STORAGE || type === STRUCTURE_TERMINAL;
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

    if (specialsPlan.deferred || specialsPlan.reason === 'not-dynamic' || !specialsPlan.assignments.length) {
        return {
            placed: 0,
            destroyedExtensions: 0,
            details: [],
            skipped: specialsPlan.reason || (specialsPlan.deferred ? 'extension-deficit' : 'none'),
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
    inspectCore,
    MAX_CORE_SITES_PER_TICK,
    MAX_SPECIAL_SITES_PER_TICK,
};
