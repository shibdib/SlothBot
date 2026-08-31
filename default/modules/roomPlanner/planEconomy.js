/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Planner V2 economy aux layer (PR8): sources, controller, links, labs, mineral.
 *
 * Economy placement (A4: V1 planSources/planLinks/planStructures removed).
 * Placement goes through planSiteBudget (layers: sources, controller, links,
 * labs, mineral).
 *
 * Chunk 5 parity notes (intentional V2 deltas vs V1):
 *   - All act paths use siteBudget (shadow-safe; soft priority).
 *   - Remote exit links only at RCL8 (V1 comment said RCL8; code had no gate).
 *   - Second source link only at RCL7+ (matches V1 comment; V1 relied on link cap).
 *   - Controller-within-5-of-hub: skip controller-link *requirement* so hub/source2
 *     can proceed (V1 returned false forever and stalled later links).
 *   - In-progress higher-priority link site stops lower steps same tick (V1 return true).
 *   - Source within 2 of controller: one shared link (harvest dump + upgrade);
 *     controller container keeps off the shared-link tile.
 */

const {labTemplate} = require('planTemplates');
const {
    findBestContainerPos,
    isControllerContainerPos,
    resolveControllerContainer,
    hasControllerContainerSite,
    controllerContainersAdjacent,
    resolveSourceContainer,
    hasSourceContainerSite,
    isControllerLinkPos,
    isControllerAreaLink,
    isControllerNeighborSource,
    getControllerNeighborSource,
    hasSharedSourceControllerLink,
    isSharedLinkReserveTile,
    shouldSkipControllerContainer,
} = require('planUtils');
const {invalidateRampartSpots} = require('planGeomRamparts');

const {ensurePlan, getPlan, pushFailure, FailureCodes, packTiles} = require('planDoc');
const siteBudget = require('planSiteBudget');
const {isPlannerShadow} = require('planFlag');

const MAX_SITES_PER_SUBPHASE = 1;

/**
 * Drop idle low-priority sites so a source/controller container can place.
 * Mirrors freeSiteSlotsForExtensions but never touches layout stamps
 * (spawn/tower/extension/storage/terminal) or other container/link sites.
 * @param {Room} room
 * @param {number} want
 * @returns {number} sites removed
 */
function freeSiteSlotsForContainers(room, want) {
    if (want <= 0 || isPlannerShadow(room)) return 0;
    if (siteBudget.canPlaceConstructionSite(room)) return 0;

    let freed = 0;
    const removeSites = (sites) => {
        for (let i = 0; i < sites.length; i++) {
            if (freed >= want) break;
            const site = sites[i];
            try {
                if (site.remove() === OK) freed++;
            } catch (e) { /* ignore */
            }
        }
    };

    const sites = room.constructionSites || [];
    // Prefer idle roads / barriers — they re-queue; containers must not wait forever.
    const preferIdle = [STRUCTURE_ROAD, STRUCTURE_WALL, STRUCTURE_RAMPART];
    for (let t = 0; t < preferIdle.length; t++) {
        if (freed >= want) break;
        const type = preferIdle[t];
        removeSites(sites.filter(s => s.structureType === type && !s.progress));
    }
    // Lightly progressed barriers only if still stuck (same idea as extensions).
    if (freed < want) {
        const barriers = sites
            .filter(s =>
                (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART)
                && s.progress > 0
                && s.progress < Math.max(1, (s.progressTotal || 1) * 0.25))
            .sort((a, b) => a.progress - b.progress);
        removeSites(barriers);
    }

    if (freed) {
        try {
            const {invalidateRoomConstructionSiteCache} = require('planUtils');
            invalidateRoomConstructionSiteCache(room);
        } catch (e) { /* ignore */
        }
        if (room._invalidateStructureCaches) room._invalidateStructureCaches();
        if (typeof log !== 'undefined' && log.a) {
            log.a(`${room.name} removed ${freed} site(s) to free slots for containers`, 'PLANNER');
        }
    }
    return freed;
}

function tryPlace(room, layer, pos, structureType) {
    if (isPlannerShadow(room)) {
        return {ok: true, shadow: true, result: OK};
    }
    let req = siteBudget.request(room, layer, 1);
    if (req.allowed < 1) {
        // One reclaim pass for container layers only — layout must not starve economy.
        if (layer === 'controller' || layer === 'sources') {
            const freed = freeSiteSlotsForContainers(room, 1);
            if (freed > 0) {
                req = siteBudget.request(room, layer, 1);
            }
        }
    }
    if (req.allowed < 1) {
        const plan = getPlan(room);
        if (plan && req.code) {
            pushFailure(plan, {
                code: req.code,
                layer,
                detail: {structureType, x: pos.x, y: pos.y},
                tick: Game.time,
                source: 'planEconomy',
            });
        }
        return {ok: false, code: req.code || FailureCodes.SITE_BUDGET_ROOM, result: ERR_FULL};
    }
    return siteBudget.tryPlace(room, layer, pos, structureType);
}

function noteLayerTile(room, layerName, pos) {
    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (!plan || !plan.layers || !plan.layers[layerName]) return;
    const layer = plan.layers[layerName];
    const packed = layer.packed && layer.packed.length ? layer.packed.slice() : [];
    const key = pos.x + pos.y * 50;
    if (packed.indexOf(key) === -1) packed.push(key);
    layer.packed = packed;
    layer.rev = (layer.rev || 0) + 1;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function placeSourceContainers(room) {
    // V1 sourceBuilder uses room.controller.level >= 3
    if (!room.controller || room.controller.level < 3) {
        return {placed: 0, reason: 'rcl'};
    }
    let placed = 0;
    const details = [];
    const sources = room.sources || [];

    for (let i = 0; i < sources.length; i++) {
        if (placed >= MAX_SITES_PER_SUBPHASE) break;
        const source = sources[i];
        const existing = resolveSourceContainer(source, room, true);
        if (existing) {
            // V1 always wrote distanceToHub when missing (assumes hub). Guard hub.
            if (!source.memory.distanceToHub && room.hub) {
                try {
                    source.memory.distanceToHub = source.pos.findPathTo(room.hub).length;
                } catch (e) { /* ignore */
                }
            }
            details.push({source: source.id, status: 'have'});
            continue;
        }
        // V1: site present → skip this source, try next (does not place another).
        // With MAX_SITES=1 and return-after-place, same: do not place a second site.
        if (hasSourceContainerSite(source)) {
            details.push({source: source.id, status: 'site', busy: true});
            // Stop: V1 would have returned false from this source and tried next
            // only if no site; if all have sites, nothing places. If one has site
            // and another needs place, V1 continues the loop — allow continue.
            continue;
        }
        const containerSite = findBestContainerPos(source);
        if (!containerSite || containerSite.checkForConstructionSites()) {
            details.push({source: source.id, status: 'no-pos'});
            continue;
        }
        const res = tryPlace(room, 'sources', containerSite, STRUCTURE_CONTAINER);
        if (res.ok) {
            placed++;
            noteLayerTile(room, 'sources', containerSite);
            details.push({
                source: source.id,
                status: res.shadow ? 'shadow' : 'placed',
                x: containerSite.x,
                y: containerSite.y
            });
            // V1 returns after first successful place
            break;
        }
        details.push({source: source.id, status: 'fail', code: res.code});
        break;
    }
    return {placed, details};
}

// ---------------------------------------------------------------------------
// Controller container
// ---------------------------------------------------------------------------

/**
 * Candidate tiles for a controller container.
 * Intentionally ignores creeps and soft blockers — roads/extensions are reclaimed
 * at pick time. Old logic used checkForImpassible() which excluded any tile with an
 * upgrader or road-adjacent path site, so containers never placed while roads built.
 * @param {Room} room
 * @returns {RoomPosition[]}
 */
function getControllerPlacementPositions(room) {
    const possibles = [];
    const seen = new Set();
    const add = (x, y) => {
        if (x < 1 || x > 48 || y < 1 || y > 48) return;
        const key = x + ',' + y;
        if (seen.has(key)) return;
        const pos = new RoomPosition(x, y, room.name);
        if (!isControllerContainerPos(pos, room)) return;
        if (pos.checkForWall && pos.checkForWall()) return;
        seen.add(key);
        possibles.push(pos);
    };

    const link = Game.getObjectById(room.memory.controllerLink);
    if (link) {
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (!xOff && !yOff) continue;
                add(link.pos.x + xOff, link.pos.y + yOff);
            }
        }
    }
    if (!possibles.length && room.controller) {
        for (let xOff = -2; xOff <= 2; xOff++) {
            for (let yOff = -2; yOff <= 2; yOff++) {
                if (!xOff && !yOff) continue;
                add(room.controller.pos.x + xOff, room.controller.pos.y + yOff);
            }
        }
    }
    return possibles;
}

/**
 * Sort candidates: closer to hub first (path length), prefer range-1 to controller.
 * @param {Room} room
 * @param {RoomPosition[]} positions
 * @returns {RoomPosition[]}
 */
function sortControllerContainerPositions(room, positions) {
    const hub = room.hub;
    const controller = room.controller;
    return positions.slice().sort((a, b) => {
        if (controller) {
            const ra = a.getRangeTo(controller);
            const rb = b.getRangeTo(controller);
            if (ra !== rb) return ra - rb;
        }
        if (!hub) return 0;
        try {
            return a.findPathTo(hub).length - b.findPathTo(hub).length;
        } catch (e) {
            return a.getRangeTo(hub) - b.getRangeTo(hub);
        }
    });
}

/**
 * Classify a tile for controller-container placement.
 * @returns {{
 *   status: 'ready'|'have'|'hard'|'soft',
 *   freeRoadSite?: boolean,
 *   freeExtension?: boolean,
 *   freeRoad?: boolean,
 *   hardType?: string
 * }}
 */
function classifyControllerContainerTile(pos) {
    const structures = pos.lookFor(LOOK_STRUCTURES) || [];
    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES) || [];

    for (let i = 0; i < structures.length; i++) {
        const t = structures[i].structureType;
        if (t === STRUCTURE_CONTAINER) return {status: 'have'};
        if (t === STRUCTURE_RAMPART) continue;
        if (t === STRUCTURE_ROAD) continue; // soft — prefer other tiles first
        if (t === STRUCTURE_EXTENSION) continue; // soft — reclaim
        return {status: 'hard', hardType: t};
    }
    for (let i = 0; i < sites.length; i++) {
        const t = sites[i].structureType;
        if (t === STRUCTURE_CONTAINER) return {status: 'have'};
        if (t === STRUCTURE_ROAD || t === STRUCTURE_RAMPART || t === STRUCTURE_EXTENSION) continue;
        return {status: 'hard', hardType: 'site:' + t};
    }

    const hasRoadSite = sites.some(s => s.structureType === STRUCTURE_ROAD);
    const hasExtSite = sites.some(s => s.structureType === STRUCTURE_EXTENSION);
    const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);
    const hasExt = structures.some(s => s.structureType === STRUCTURE_EXTENSION);

    if (!hasRoadSite && !hasExtSite && !hasRoad && !hasExt) {
        return {status: 'ready'};
    }
    return {
        status: 'soft',
        freeRoadSite: hasRoadSite,
        freeExtension: hasExt || hasExtSite,
        freeRoad: hasRoad,
    };
}

/**
 * Clear reclaimable blockers so a container site can be created.
 * @param {Room} room
 * @param {RoomPosition} pos
 * @param {{allowDestroyRoad?: boolean}} opts
 * @returns {{ok: boolean, already?: boolean, destroyed?: number, removedSites?: number}}
 */
function freeTileForControllerContainer(room, pos, opts) {
    const allowDestroyRoad = !!(opts && opts.allowDestroyRoad);
    let destroyed = 0;
    let removedSites = 0;

    const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES) || [];
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if (site.structureType === STRUCTURE_CONTAINER) {
            return {ok: true, already: true, destroyed, removedSites};
        }
        if (site.structureType === STRUCTURE_ROAD
            || site.structureType === STRUCTURE_EXTENSION
            || site.structureType === STRUCTURE_RAMPART) {
            if (!isPlannerShadow(room)) {
                try {
                    if (site.remove() === OK) removedSites++;
                } catch (e) { /* ignore */
                }
            }
            continue;
        }
        return {ok: false, destroyed, removedSites};
    }

    const structures = pos.lookFor(LOOK_STRUCTURES) || [];
    for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (s.structureType === STRUCTURE_CONTAINER) {
            return {ok: true, already: true, destroyed, removedSites};
        }
        if (s.structureType === STRUCTURE_RAMPART) continue;
        if (s.structureType === STRUCTURE_EXTENSION) {
            if (!isPlannerShadow(room)) {
                try {
                    if (s.destroy() === OK) destroyed++;
                } catch (e) {
                    return {ok: false, destroyed, removedSites};
                }
            }
            continue;
        }
        if (s.structureType === STRUCTURE_ROAD) {
            if (!allowDestroyRoad) return {ok: false, destroyed, removedSites, needRoadDestroy: true};
            if (!isPlannerShadow(room)) {
                try {
                    if (s.destroy() === OK) destroyed++;
                } catch (e) {
                    return {ok: false, destroyed, removedSites};
                }
            }
            continue;
        }
        return {ok: false, destroyed, removedSites};
    }
    return {ok: true, destroyed, removedSites};
}

/**
 * Pick a build tile, reclaiming road sites / stray extensions as needed.
 * Built roads are only destroyed if no non-road tile exists.
 * @param {Room} room
 * @param {RoomPosition[]} positions
 * @returns {{pos: RoomPosition, reclaimed?: object}|null}
 */
function pickFromGroup(room, positions, allowDestroyRoad) {
    if (!allowDestroyRoad) {
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const cls = classifyControllerContainerTile(pos);
            if (cls.status === 'have') return {pos, already: true};
            if (cls.status === 'ready') return {pos};
        }
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            const cls = classifyControllerContainerTile(pos);
            if (cls.status !== 'soft') continue;
            if (cls.freeRoad && !cls.freeRoadSite && !cls.freeExtension) continue;
            const freed = freeTileForControllerContainer(room, pos, {allowDestroyRoad: false});
            if (freed.already) return {pos, already: true, reclaimed: freed};
            if (freed.ok) return {pos, reclaimed: freed};
        }
        return null;
    }
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const cls = classifyControllerContainerTile(pos);
        if (cls.status === 'hard') continue;
        if (cls.status === 'have') return {pos, already: true};
        const freed = freeTileForControllerContainer(room, pos, {allowDestroyRoad: true});
        if (freed.already) return {pos, already: true, reclaimed: freed};
        if (freed.ok) return {pos, reclaimed: freed};
    }
    return null;
}

function pickContainerBuildPos(room, positions) {
    const sorted = sortControllerContainerPositions(room, positions);
    if (!sorted.length) return null;

    const preferred = [];
    const reserved = [];
    for (let i = 0; i < sorted.length; i++) {
        if (isSharedLinkReserveTile(sorted[i], room)) reserved.push(sorted[i]);
        else preferred.push(sorted[i]);
    }

    // Keep the shared-link tile free unless it is the only remaining candidate.
    const groups = preferred.length ? [preferred, reserved] : [reserved];
    for (let g = 0; g < groups.length; g++) {
        const picked = pickFromGroup(room, groups[g], false);
        if (picked) return picked;
    }
    for (let g = 0; g < groups.length; g++) {
        const picked = pickFromGroup(room, groups[g], true);
        if (picked) return picked;
    }
    return null;
}

function placeControllerContainer(room) {
    // Use controller RCL — room.level is energy-capacity tier and is wrong for gates.
    const level = room.controller ? room.controller.level
        : (room.level != null ? room.level : 0);
    const controllerLink = Game.getObjectById(room.memory.controllerLink);

    const sharedLink = hasSharedSourceControllerLink(room);
    if ((level === 8 && controllerLink) || (sharedLink && level >= 5)) {
        const legacy = resolveControllerContainer(room);
        if (legacy && legacy.store && legacy.store.getUsedCapacity() === 0
            && !isPlannerShadow(room)) {
            try {
                legacy.destroy();
            } catch (e) { /* ignore */
            }
            room.memory.controllerContainer = undefined;
        }
        return {placed: 0, reason: sharedLink ? 'shared-source-link' : 'rcl8-link'};
    }

    if (level < 2 || level >= 8) return {placed: 0, reason: 'rcl', level};

    if (room.memory.controllerLink && !controllerLink) {
        room.memory.controllerLink = undefined;
    }

    if (resolveControllerContainer(room, true)) return {placed: 0, reason: 'have'};
    if (hasControllerContainerSite(room)) return {placed: 0, reason: 'site'};
    // Adjacent container that failed resolve (e.g. no .store) — still treat as present.
    if (controllerContainersAdjacent(room).length) return {placed: 0, reason: 'adjacent'};

    const candidates = getControllerPlacementPositions(room);
    if (!candidates.length) {
        return {placed: 0, reason: 'no-candidates', level};
    }

    const picked = pickContainerBuildPos(room, candidates);
    if (!picked || !picked.pos) {
        return {
            placed: 0,
            reason: 'no-pos',
            candidates: candidates.length,
            sample: candidates.slice(0, 5).map(p => ({
                x: p.x,
                y: p.y,
                cls: classifyControllerContainerTile(p),
            })),
        };
    }
    if (picked.already) {
        return {placed: 0, reason: 'have', x: picked.pos.x, y: picked.pos.y};
    }

    const buildPos = picked.pos;
    const res = tryPlace(room, 'controller', buildPos, STRUCTURE_CONTAINER);
    if (res.ok) {
        noteLayerTile(room, 'controller', buildPos);
        return {
            placed: 1,
            x: buildPos.x,
            y: buildPos.y,
            shadow: res.shadow,
            reclaimed: picked.reclaimed,
        };
    }
    return {
        placed: 0,
        reason: 'fail',
        code: res.code,
        result: res.result,
        x: buildPos.x,
        y: buildPos.y,
        reclaimed: picked.reclaimed,
    };
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

function adjacentPositions(pos) {
    const out = [];
    if (!pos) return out;
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (!xOff && !yOff) continue;
            const x = pos.x + xOff;
            const y = pos.y + yOff;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            out.push(new RoomPosition(x, y, pos.roomName));
        }
    }
    return out;
}

function scoreControllerLinkCandidate(pos, room, sourceContainer) {
    let score = 0;
    const range = pos.getRangeTo(room.controller);
    if (range === 2) score += 30;
    else if (range === 3) score += 15;
    else if (range === 1) score += 8;
    if (sourceContainer && pos.isNearTo(sourceContainer)) score += 80;
    if (pos.countOpenTerrainAround) score += pos.countOpenTerrainAround(true, true) || 0;
    if (pos.isNearTo(room.controller)) score -= 4;
    return score;
}

function bindNeighborSourceToLink(room, link) {
    const source = getControllerNeighborSource(room);
    if (!source || !link || !link.pos) return false;
    const container = resolveSourceContainer(source, room, false)
        || Game.getObjectById(source.memory && source.memory.container);
    if (container && link.pos.isNearTo(container)) {
        source.memory.link = link.id;
        return true;
    }
    return false;
}

function linkTileBlocked(pos) {
    return !!(pos.checkForWall && pos.checkForWall())
        || !!(pos.checkForAllStructure && pos.checkForAllStructure());
}

function collectControllerLinkCandidates(room, sourceContainer, allowNearController) {
    const seen = new Set();
    const list = [];
    const add = (pos) => {
        if (!pos) return;
        const key = pos.x + ',' + pos.y;
        if (seen.has(key)) return;
        if (linkTileBlocked(pos)) return;
        if (!isControllerLinkPos(pos, room)) return;
        if (pos.isNearTo(room.controller) && !allowNearController) return;
        seen.add(key);
        list.push(pos);
    };

    if (sourceContainer) {
        const around = adjacentPositions(sourceContainer.pos || sourceContainer);
        for (let i = 0; i < around.length; i++) add(around[i]);
    }
    const controllerContainer = resolveControllerContainer(room);
    const base = controllerContainer || room.controller;
    const range = controllerContainer ? 1 : 2;
    if (base && base.pos) {
        for (let xOff = -range; xOff <= range; xOff++) {
            for (let yOff = -range; yOff <= range; yOff++) {
                if (!xOff && !yOff) continue;
                const x = base.pos.x + xOff;
                const y = base.pos.y + yOff;
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                add(new RoomPosition(x, y, room.name));
            }
        }
    }
    list.sort((a, b) => scoreControllerLinkCandidate(b, room, sourceContainer)
        - scoreControllerLinkCandidate(a, room, sourceContainer));
    return list;
}

function neighborSourceContainer(room) {
    const source = getControllerNeighborSource(room);
    if (!source) return null;
    return resolveSourceContainer(source, room, false)
        || Game.getObjectById(source.memory && source.memory.container)
        || null;
}

function buildSourceLink(room, source) {
    // Prefer resolve (syncs memory) — V1 only used source.memory.container and
    // skipped links after wipe/stale memory even when a container existed.
    const sourceContainer = resolveSourceContainer(source, room, true)
        || Game.getObjectById(source.memory && source.memory.container);
    if (!sourceContainer) return {ok: false, reason: 'no-container'};

    if (source.memory.link && source.memory.link === room.memory.hubLink) {
        source.memory.link = undefined;
    }
    const existingLink = sourceContainer.pos.findInRange(room.links, 1)
        .find(l => l.id !== room.memory.hubLink);
    if (existingLink) {
        source.memory.link = existingLink.id;
        if (isControllerNeighborSource(source, room) && isControllerLinkPos(existingLink.pos, room)) {
            room.memory.controllerLink = existingLink.id;
            return {ok: false, reason: 'shared-controller'};
        }
        return {ok: false, reason: 'have'};
    }

    const shared = isControllerNeighborSource(source, room);
    const ctrlLink = Game.getObjectById(room.memory.controllerLink);
    if (shared && ctrlLink && ctrlLink.pos.isNearTo(sourceContainer)) {
        source.memory.link = ctrlLink.id;
        return {ok: false, reason: 'shared-controller'};
    }

    const site = _.find(
        sourceContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1),
        s => s.structureType === STRUCTURE_LINK
    );
    // Neighbor source: pull a site that cannot serve as the controller link so
    // the shared tile can be sited instead.
    if (site && shared && !isControllerLinkPos(site.pos, room) && !isPlannerShadow(room)) {
        try {
            site.remove();
        } catch (e) { /* ignore */
        }
    } else if (site) {
        // V1 returns true on in-progress site → stop lower-priority link steps.
        return {ok: false, reason: 'site', busy: true};
    }

    if (room.hub && sourceContainer.pos.getRangeTo(room.hub) <= 8) {
        return {ok: false, reason: 'near-hub'};
    }

    const around = adjacentPositions(sourceContainer.pos);
    const scored = [];
    for (let i = 0; i < around.length; i++) {
        const position = around[i];
        if (linkTileBlocked(position)) continue;
        if (!shared && room.controller && position.isNearTo(room.controller)) continue;
        let score = position.countOpenTerrainAround ? (position.countOpenTerrainAround(true, true) || 0) : 0;
        if (shared && isControllerLinkPos(position, room)) {
            score += 100 + scoreControllerLinkCandidate(position, room, sourceContainer);
        }
        scored.push({position, score});
    }
    scored.sort((a, b) => b.score - a.score);

    for (let i = 0; i < scored.length; i++) {
        const position = scored[i].position;
        const res = tryPlace(room, 'links', position, STRUCTURE_LINK);
        if (res.ok) {
            try {
                invalidateRampartSpots(room);
            } catch (e) { /* optional */
            }
            noteLayerTile(room, 'links', position);
            const kind = shared && isControllerLinkPos(position, room) ? 'shared' : 'source';
            return {ok: true, x: position.x, y: position.y, shadow: res.shadow, kind};
        }
        if (res.code === FailureCodes.SITE_BUDGET_ROOM
            || res.code === FailureCodes.SITE_BUDGET_GLOBAL
            || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
            return {ok: false, reason: 'no-budget', code: res.code};
        }
    }
    return {ok: false, reason: 'no-pos'};
}

/**
 * True when controller (or its container base) is close enough to hub that a
 * dedicated controller link is skipped (V1 used range > 5 to place).
 * @param {Room} room
 * @param {number} level
 */
function isControllerLinkSkippedNearHub(room, level) {
    if (!room.hub || !room.controller) return false;
    const controllerContainer = resolveControllerContainer(room);
    const base = level === 8 ? room.controller : (controllerContainer || room.controller);
    if (!base || !base.pos) return false;
    return base.pos.getRangeTo(room.hub) <= 5;
}

function placeLinks(room) {
    const level = room.level != null ? room.level : (room.controller && room.controller.level);
    if (level < 5) return {placed: 0, reason: 'rcl'};
    if (!room.hub) return {placed: 0, reason: 'no-hub'};
    // Caller (placeEconomy / V1 aux) gates on storage; keep defensive no-op note only.

    const linkLimit = CONTROLLER_STRUCTURES[STRUCTURE_LINK][level] || 0;
    const currentLinks = (room.links ? room.links.length : 0) +
        (room.constructionSites || []).filter(s => s.structureType === STRUCTURE_LINK).length;
    const details = [];
    let placed = 0;
    const skipControllerNearHub = isControllerLinkSkippedNearHub(room, level);

    const sortedSources = _.sortBy(room.sources || [], s => -(room.hub ? s.pos.getRangeTo(room.hub) : 0));
    const neighborSource = getControllerNeighborSource(room);
    const shareWithNeighbor = !!(neighborSource && !skipControllerNearHub);

    function deferNeighborSourceLink(source) {
        return shareWithNeighbor && source && neighborSource && source.id === neighborSource.id;
    }

    // 1. Farthest source link (defer the controller-adjacent source so one shared
    // link can sit next to both instead of two links on opposite sides).
    if (placed < MAX_SITES_PER_SUBPHASE && currentLinks + placed < linkLimit && sortedSources.length > 0) {
        if (deferNeighborSourceLink(sortedSources[0])) {
            details.push({step: 'source0', reason: 'defer-shared'});
        } else {
            const r = buildSourceLink(room, sortedSources[0]);
            details.push(Object.assign({step: 'source0'}, r));
            if (r.ok) placed++;
            // V1: in-progress site → return true (do not place lower-priority links this tick)
            if (r.busy) {
                return {placed, details, reason: 'source0-site'};
            }
        }
    }

    // 2. Controller link
    if (placed < MAX_SITES_PER_SUBPHASE) {
        const rememberedControllerLink = Game.getObjectById(room.memory.controllerLink);
        if (!rememberedControllerLink || !isControllerAreaLink(rememberedControllerLink, room)) {
            if (room.memory.controllerLink) room.memory.controllerLink = undefined;
            const existingLink = room.controller
                ? room.controller.pos.findInRange(room.links, 3)
                    .filter(l => isControllerAreaLink(l, room) && l.id !== room.memory.hubLink)
                    .sort((a, b) => {
                        const srcCont = neighborSourceContainer(room);
                        const sa = srcCont && a.pos.isNearTo(srcCont) ? 0 : 1;
                        const sb = srcCont && b.pos.isNearTo(srcCont) ? 0 : 1;
                        if (sa !== sb) return sa - sb;
                        return a.pos.getRangeTo(room.controller) - b.pos.getRangeTo(room.controller);
                    })[0]
                : null;
            if (existingLink) {
                room.memory.controllerLink = existingLink.id;
                bindNeighborSourceToLink(room, existingLink);
                details.push({step: 'controller', reason: 'found'});
            } else {
                room.memory.controllerLink = undefined;
                if (skipControllerNearHub) {
                    // V1 returned false forever here; V2 skips requirement so hub/source2 proceed.
                    details.push({step: 'controller', reason: 'near-hub-skip'});
                } else {
                    const srcCont = neighborSourceContainer(room);
                    let site = null;
                    if (srcCont) {
                        site = _.find(
                            srcCont.pos.findInRange(FIND_CONSTRUCTION_SITES, 1),
                            s => s.structureType === STRUCTURE_LINK && isControllerLinkPos(s.pos, room)
                        );
                    }
                    if (!site) {
                        const controllerContainer = resolveControllerContainer(room);
                        const base = level === 8 ? room.controller : controllerContainer || room.controller;
                        const range = room.controller && base && base.id === room.controller.id ? 2 : 1;
                        if (base && base.pos) {
                            site = _.find(
                                base.pos.findInRange(FIND_CONSTRUCTION_SITES, range),
                                s => s.structureType === STRUCTURE_LINK && isControllerLinkPos(s.pos, room)
                            );
                        }
                    }
                    if (site) {
                        details.push({step: 'controller', reason: 'site', busy: true});
                        return {placed, details, reason: 'controller-site'};
                    }

                    let candidates = collectControllerLinkCandidates(room, srcCont, false);
                    if (!candidates.length && shareWithNeighbor) {
                        candidates = collectControllerLinkCandidates(room, srcCont, true);
                    }
                    for (let i = 0; i < candidates.length; i++) {
                        if (placed >= MAX_SITES_PER_SUBPHASE) break;
                        const position = candidates[i];
                        const res = tryPlace(room, 'links', position, STRUCTURE_LINK);
                        if (res.ok) {
                            placed++;
                            noteLayerTile(room, 'links', position);
                            if (shareWithNeighbor && srcCont && position.isNearTo(srcCont)) {
                                details.push({
                                    step: 'controller',
                                    status: 'placed',
                                    x: position.x,
                                    y: position.y,
                                    shadow: res.shadow,
                                    kind: 'shared',
                                });
                            } else {
                                details.push({
                                    step: 'controller',
                                    status: 'placed',
                                    x: position.x,
                                    y: position.y,
                                    shadow: res.shadow,
                                });
                            }
                            break;
                        }
                        if (res.code === FailureCodes.SITE_BUDGET_ROOM
                            || res.code === FailureCodes.SITE_BUDGET_GLOBAL
                            || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
                            details.push({step: 'controller', reason: 'no-budget'});
                            break;
                        }
                    }
                }
            }
        } else {
            const srcCont = neighborSourceContainer(room);
            if (shareWithNeighbor && srcCont && !rememberedControllerLink.pos.isNearTo(srcCont)) {
                const better = room.controller.pos.findInRange(room.links, 3)
                    .filter(l => isControllerAreaLink(l, room) && l.id !== room.memory.hubLink
                        && l.pos.isNearTo(srcCont))[0];
                if (better) {
                    room.memory.controllerLink = better.id;
                    bindNeighborSourceToLink(room, better);
                    details.push({step: 'controller', reason: 'retarget-shared'});
                } else {
                    bindNeighborSourceToLink(room, rememberedControllerLink);
                }
            } else {
                bindNeighborSourceToLink(room, rememberedControllerLink);
            }
        }
    }

    // Need a controller link (or near-hub skip) before hub / secondary / remote.
    if (!room.memory.controllerLink && !skipControllerNearHub) {
        if (shareWithNeighbor && placed < 1 && currentLinks < linkLimit) {
            const r = buildSourceLink(room, neighborSource);
            details.push(Object.assign({step: 'source-shared-fallback'}, r));
            if (r.ok) placed++;
            if (r.busy) {
                return {placed, details, reason: 'source-shared-site'};
            }
        }
        if (!room.memory.controllerLink) {
            return {placed, details, reason: placed ? undefined : 'no-controller-link'};
        }
    }

    // Neighbor source uses the controller link when it is adjacent to the
    // harvest pad; otherwise place a dedicated source link.
    if (shareWithNeighbor && neighborSource && placed < MAX_SITES_PER_SUBPHASE
        && currentLinks + placed < linkLimit) {
        const bound = neighborSource.memory.link && Game.getObjectById(neighborSource.memory.link);
        if (!bound) {
            const r = buildSourceLink(room, neighborSource);
            details.push(Object.assign({step: 'source-neighbor'}, r));
            if (r.ok) placed++;
            if (r.busy) {
                return {placed, details, reason: 'source-neighbor-site'};
            }
        }
    }

    // 3. Hub link (dynamic only ad hoc; bunker stamp owns (0,1))
    if (placed < MAX_SITES_PER_SUBPHASE && (!room.memory.hubLink || !Game.getObjectById(room.memory.hubLink))) {
        const hubLinkPos = new RoomPosition(room.hub.x, room.hub.y + 1, room.name);
        const existingLink = (hubLinkPos.lookFor(LOOK_STRUCTURES) || []).find(s => s.structureType === STRUCTURE_LINK);
        if (existingLink) {
            room.memory.hubLink = existingLink.id;
            details.push({step: 'hub', reason: 'found'});
        } else {
            const site = (hubLinkPos.lookFor(LOOK_CONSTRUCTION_SITES) || []).find(s => s.structureType === STRUCTURE_LINK);
            if (site) {
                details.push({step: 'hub', reason: 'site', busy: true});
                return {placed, details, reason: 'hub-site'};
            }
            if (room.memory.dynamicLayout) {
                const extension = (hubLinkPos.lookFor(LOOK_STRUCTURES) || []).find(s => s.structureType === STRUCTURE_EXTENSION);
                if (extension && !isPlannerShadow(room)) {
                    try {
                        extension.destroy();
                    } catch (e) { /* ignore */
                    }
                }
                const res = tryPlace(room, 'links', hubLinkPos, STRUCTURE_LINK);
                if (res.ok) {
                    placed++;
                    noteLayerTile(room, 'links', hubLinkPos);
                    details.push({step: 'hub', status: 'placed', shadow: res.shadow});
                } else {
                    details.push({step: 'hub', reason: 'fail', code: res.code});
                }
            } else {
                // Bunker: stamp places hub link via core; nothing ad hoc.
                details.push({step: 'hub', reason: 'bunker-stamp'});
            }
        }
    }

    // 4. Second source link. RCL7+ has the 4th slot; at RCL6 the slot is free when
    // the controller link is skipped (near-hub), so take it for harvest instead of waiting.
    if (placed < MAX_SITES_PER_SUBPHASE && currentLinks + placed < linkLimit && sortedSources.length > 1
        && (level >= 7 || skipControllerNearHub)) {
        if (deferNeighborSourceLink(sortedSources[1])) {
            details.push({step: 'source1', reason: 'defer-shared'});
        } else {
            const r = buildSourceLink(room, sortedSources[1]);
            details.push(Object.assign({step: 'source1'}, r));
            if (r.ok) placed++;
            if (r.busy) {
                return {placed, details, reason: 'source1-site'};
            }
        }
    }

    // 5. Remote exit links (RCL 8 only — V1 comment; V1 code had no RCL gate)
    if (placed < MAX_SITES_PER_SUBPHASE && currentLinks + placed < linkLimit && level >= 8) {
        const neighboring = Object.values(Game.map.describeExits(room.name) || {});
        for (let n = 0; n < neighboring.length && placed < MAX_SITES_PER_SUBPHASE; n++) {
            const neighbor = neighboring[n];
            const nRoom = Game.rooms[neighbor];
            const remoteHarvester = nRoom && nRoom.myCreeps
                && nRoom.myCreeps.find(c => c.memory.role === 'remoteHarvester');
            if (!remoteHarvester) continue;
            const exit = Game.map.findExit(room.name, neighbor);
            const exitTiles = room.find(exit);
            if (!exitTiles.length) continue;
            const middle = Math.round(exitTiles.length / 2);
            const startPos = exitTiles[middle];
            const existingLink = startPos.findClosestByRange(room.structures, {
                filter: s => s.structureType === STRUCTURE_LINK,
            });
            if (existingLink && existingLink.pos.getRangeTo(startPos) <= 4) continue;
            const inBuildLink = startPos.findClosestByRange(room.constructionSites, {
                filter: s => s.structureType === STRUCTURE_LINK,
            });
            if (inBuildLink && inBuildLink.pos.getRangeTo(startPos) <= 4) continue;

            outer:
                for (let xOff = -3; xOff <= 3; xOff++) {
                    for (let yOff = -3; yOff <= 3; yOff++) {
                        if (xOff === 0 && yOff === 0) continue;
                        const x = startPos.x + xOff;
                        const y = startPos.y + yOff;
                        if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                        const pos = new RoomPosition(x, y, room.name);
                        if (pos.checkForAllStructure() || pos.checkForImpassible()) continue;
                        const res = tryPlace(room, 'links', pos, STRUCTURE_LINK);
                        if (res.ok) {
                            placed++;
                            noteLayerTile(room, 'links', pos);
                            details.push({step: 'remote', status: 'placed', x, y, neighbor});
                            break outer;
                        }
                        if (res.code === FailureCodes.SITE_BUDGET_ROOM
                            || res.code === FailureCodes.SITE_BUDGET_GLOBAL
                            || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
                            break outer;
                        }
                    }
                }
        }
    }

    return {
        placed,
        details,
        skipControllerNearHub: skipControllerNearHub || undefined,
    };
}

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

function placeLabs(room) {
    // V1 labBuilder: CONTROLLER_STRUCTURES[STRUCTURE_LAB][room.level]; aux gates RCL>=6.
    const level = room.level != null ? room.level : (room.controller && room.controller.level);
    if (level < 6) return {placed: 0, reason: 'rcl'};
    // C4: plan.anchors.lab first.
    let labXY = null;
    let partial = false;
    try {
        const res = require('planDoc').getLabHub(room);
        labXY = res && res.hub;
        partial = !!(res && res.partial);
    } catch (e) {
        labXY = room.memory.labHub;
        partial = !!room.memory.labHubPartial;
    }
    if (!labXY) return {placed: 0, reason: 'no-lab-hub'};

    const builtLabs = room.labs ? room.labs.length : 0;
    const allowed = CONTROLLER_STRUCTURES[STRUCTURE_LAB][level] || 0;
    // V1: CONTROLLER_STRUCTURES[...] <= builtLabs || labInBuild → return
    if (allowed <= builtLabs) return {placed: 0, reason: 'have'};

    const labInBuild = (room.constructionSites || []).some(s => s.structureType === STRUCTURE_LAB);
    if (labInBuild) return {placed: 0, reason: 'site', busy: true};

    const labHub = new RoomPosition(labXY.x, labXY.y, room.name);
    const details = [];

    for (let i = 0; i < labTemplate.length; i++) {
        const structure = labTemplate[i];
        const pos = new RoomPosition(labHub.x + structure.x, labHub.y + structure.y, room.name);
        if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) continue;
        // V1: partial && impassible && !builtWall → skip
        if (partial && pos.checkForImpassible && pos.checkForImpassible()
            && !(pos.checkForBuiltWall && pos.checkForBuiltWall())) {
            continue;
        }
        const wall = pos.checkForBuiltWall && pos.checkForBuiltWall();
        if (wall && !isPlannerShadow(room)) {
            try {
                wall.destroy();
            } catch (e) { /* ignore */
            }
        }
        if (pos.checkForConstructionSites && pos.checkForConstructionSites()) continue;
        if (pos.checkForAllStructure && pos.checkForAllStructure()) continue;

        const res = tryPlace(room, 'labs', pos, STRUCTURE_LAB);
        if (res.ok) {
            noteLayerTile(room, 'labs', pos);
            details.push({x: pos.x, y: pos.y, status: res.shadow ? 'shadow' : 'placed'});
            return {placed: 1, details};
        }
        details.push({x: pos.x, y: pos.y, status: 'fail', code: res.code});
        if (res.code === FailureCodes.SITE_BUDGET_ROOM
            || res.code === FailureCodes.SITE_BUDGET_GLOBAL
            || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
            break;
        }
    }
    return {placed: 0, details, reason: 'no-tile'};
}

// ---------------------------------------------------------------------------
// Mineral
// ---------------------------------------------------------------------------

function placeMineral(room) {
    const level = room.level != null ? room.level : (room.controller && room.controller.level);
    // V1 mineralBuilder has no RCL gate; aux only calls at room.level >= 6.
    if (level < 6) return {placed: 0, reason: 'rcl'};
    if (!room.mineral) return {placed: 0, reason: 'no-mineral'};

    const extractor = room.extractor;
    if (!extractor) {
        if (!room.mineral.pos.checkForAllStructure() && !room.mineral.pos.checkForConstructionSites()) {
            const res = tryPlace(room, 'mineral', room.mineral.pos, STRUCTURE_EXTRACTOR);
            if (res.ok) {
                noteLayerTile(room, 'mineral', room.mineral.pos);
                return {placed: 1, kind: 'extractor', shadow: res.shadow};
            }
            return {placed: 0, kind: 'extractor', reason: 'fail', code: res.code};
        }
        return {placed: 0, reason: 'extractor-blocked'};
    }

    let extractorContainer = Game.getObjectById(room.memory.extractorContainer);
    if (!extractorContainer) {
        const near = (global.posStructuresInRange
                ? global.posStructuresInRange(extractor.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})
                : extractor.pos.findInRange(FIND_STRUCTURES, 1)
        ).find(s => s.structureType === STRUCTURE_CONTAINER);
        if (near) {
            room.memory.extractorContainer = near.id;
            return {placed: 0, reason: 'have-container'};
        }
        room.memory.extractorContainer = undefined;
        const extractorSites = global.posConstructionSitesInRange
            ? global.posConstructionSitesInRange(extractor.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})
            : extractor.pos.findInRange(FIND_CONSTRUCTION_SITES, 1);
        if (extractorSites.find(s => s.structureType === STRUCTURE_CONTAINER)) {
            return {placed: 0, reason: 'container-site'};
        }

        // V1 tries first non-impassible adjacent tile then stops; we try remaining
        // tiles when create fails for non-budget reasons (blocked/invalid tile).
        const spots = room.lookForAtArea(
            LOOK_TERRAIN,
            extractor.pos.y - 1, extractor.pos.x - 1,
            extractor.pos.y + 1, extractor.pos.x + 1,
            true
        );
        let lastFail = null;
        for (const key in spots) {
            const position = new RoomPosition(spots[key].x, spots[key].y, room.name);
            if (position.getRangeTo(extractor) !== 1 || position.checkForImpassible()) continue;
            if (position.checkForConstructionSites && position.checkForConstructionSites()) continue;
            if (position.checkForAllStructure && position.checkForAllStructure()) continue;
            const res = tryPlace(room, 'mineral', position, STRUCTURE_CONTAINER);
            if (res.ok) {
                noteLayerTile(room, 'mineral', position);
                return {placed: 1, kind: 'container', x: position.x, y: position.y, shadow: res.shadow};
            }
            lastFail = res;
            if (res.code === FailureCodes.SITE_BUDGET_ROOM
                || res.code === FailureCodes.SITE_BUDGET_GLOBAL
                || res.code === FailureCodes.BUDGET_RESERVED_FOR_HIGHER) {
                return {placed: 0, kind: 'container', reason: 'fail', code: res.code};
            }
        }
        return {
            placed: 0,
            reason: lastFail ? 'fail' : 'no-container-pos',
            code: lastFail && lastFail.code,
        };
    }
    return {placed: 0, reason: 'have'};
}

// ---------------------------------------------------------------------------
// Combined aux economy pass
// ---------------------------------------------------------------------------

/**
 * Full economy aux for a V2 room.
 * Controller container is placed before source containers when missing: RCL climb
 * (especially RCL4 upgrade) is gated harder by controller energy than by source pads,
 * and a single room site slot must not be spent on a second source while upgrade starves.
 * @param {Room} room
 */
function placeEconomy(room) {
    if (room.memory.controllerLink && !Game.getObjectById(room.memory.controllerLink)) {
        room.memory.controllerLink = undefined;
    }
    if (room.memory.hubLink && !Game.getObjectById(room.memory.hubLink)) {
        room.memory.hubLink = undefined;
    }

    // Prefer controller when both are missing (one site/tick).
    const controller = placeControllerContainer(room);
    const sources = placeSourceContainers(room);

    let mineral = {placed: 0, reason: 'no-storage'};
    let labs = {placed: 0, reason: 'no-storage'};
    let links = {placed: 0, reason: 'no-storage'};

    if (room.storage) {
        const level = room.level != null ? room.level : (room.controller && room.controller.level);
        if (level >= 6) {
            mineral = placeMineral(room);
            labs = placeLabs(room);
        }
        links = placeLinks(room);
    }

    const placed = (sources.placed || 0)
        + (controller.placed || 0)
        + (mineral.placed || 0)
        + (labs.placed || 0)
        + (links.placed || 0);

    const plan = ensurePlan(room, {resync: false}) || getPlan(room);
    if (plan) {
        plan.meta.lastEconomy = {
            tick: Game.time,
            sources: sources.placed,
            controller: controller.placed,
            controllerReason: controller.reason,
            controllerXY: controller.x != null ? {x: controller.x, y: controller.y} : undefined,
            mineral: mineral.placed,
            labs: labs.placed,
            links: links.placed,
            placed,
        };
    }

    return {
        placed,
        sources,
        controller,
        mineral,
        labs,
        links,
    };
}

/**
 * Closed set of intentional V2 vs V1 economy deltas (Chunk 5 exit checklist).
 */
const ECONOMY_PARITY_NOTES = [
    'siteBudget + shadow for all places (not planUtils.tryCreate)',
    'controller within 5 of hub: skip controller-link requirement (V1 stalled later links)',
    'second source link RCL>=7 explicit (V1 used link cap only)',
    'remote exit links RCL>=8 explicit (V1 comment only)',
    'source link uses resolveSourceContainer (V1 memory-only could miss after wipe)',
    'mineral container tries next free tile on non-budget fail (V1 first tile only)',
    'order: controller → sources → [storage] mineral → labs → links (controller first so RCL climb is not starved)',
    'missing containers: early phase before core/extensions + site-slot reclaim of idle roads/barriers',
    'source within 2 of controller: shared controller/source link; controller container avoids that tile',
];

/**
 * Dry diagnosis of controller-container readiness (no world mutates except none).
 * @param {Room} room
 */
function diagnoseControllerContainer(room) {
    if (!room || !room.controller) return {reason: 'no-controller'};
    const rcl = room.controller.level;
    if (rcl < 2 || rcl >= 8) return {reason: 'rcl', rcl};
    if (shouldSkipControllerContainer(room)) return {reason: 'shared-source-link', rcl};
    if (resolveControllerContainer(room, false)) return {reason: 'have'};
    if (hasControllerContainerSite(room)) return {reason: 'site'};
    if (controllerContainersAdjacent(room).length) return {reason: 'adjacent'};
    const candidates = getControllerPlacementPositions(room);
    const sample = candidates.slice(0, 8).map(p => ({
        x: p.x,
        y: p.y,
        range: p.getRangeTo(room.controller),
        cls: classifyControllerContainerTile(p),
    }));
    const ready = sample.filter(s => s.cls.status === 'ready').length;
    const soft = sample.filter(s => s.cls.status === 'soft').length;
    return {
        reason: candidates.length ? (ready ? 'can-place' : (soft ? 'needs-reclaim' : 'blocked')) : 'no-candidates',
        rcl,
        candidates: candidates.length,
        ready,
        soft,
        sample,
    };
}

function inspectEconomy(room) {
    const energyLevel = room.level != null ? room.level : undefined;
    const level = room.controller ? room.controller.level : energyLevel;
    const skipControllerNearHub = isControllerLinkSkippedNearHub(room, level);
    return {
        room: room.name,
        level,
        energyLevel,
        hasStorage: !!room.storage,
        skipControllerNearHub,
        neighborSource: (getControllerNeighborSource(room) || {}).id,
        sharedSourceControllerLink: hasSharedSourceControllerLink(room) || undefined,
        sources: (room.sources || []).map(s => ({
            id: s.id,
            container: s.memory && s.memory.container,
            link: s.memory && s.memory.link,
            resolvedContainer: !!(resolveSourceContainer(s, room, false)),
        })),
        controllerContainer: room.memory.controllerContainer,
        controllerLink: room.memory.controllerLink,
        hubLink: room.memory.hubLink,
        controllerContainerDiag: diagnoseControllerContainer(room),
        labHub: (() => {
            try {
                const res = require('planDoc').getLabHub(room);
                return res && res.hub;
            } catch (e) {
                return room.memory.labHub;
            }
        })(),
        labHubPartial: (() => {
            try {
                const res = require('planDoc').getLabHub(room);
                return !!(res && res.partial);
            } catch (e) {
                return !!room.memory.labHubPartial;
            }
        })(),
        labs: room.labs ? room.labs.length : 0,
        labAllowed: CONTROLLER_STRUCTURES[STRUCTURE_LAB][level] || 0,
        extractor: !!(room.extractor),
        extractorContainer: room.memory.extractorContainer,
        links: room.links ? room.links.length : 0,
        linkLimit: CONTROLLER_STRUCTURES[STRUCTURE_LINK][level] || 0,
        gates: {
            sourceContainers: level >= 3,
            controllerContainer: level >= 2 && level < 8 && !shouldSkipControllerContainer(room),
            links: level >= 5 && !!room.storage,
            mineralLabs: level >= 6 && !!room.storage,
            secondSourceLink: level >= 7,
            remoteLinks: level >= 8,
        },
        budget: {
            sources: siteBudget.available(room, 'sources'),
            controller: siteBudget.available(room, 'controller'),
            links: siteBudget.available(room, 'links'),
            labs: siteBudget.available(room, 'labs'),
            mineral: siteBudget.available(room, 'mineral'),
        },
        last: room.memory.plan && room.memory.plan.meta && room.memory.plan.meta.lastEconomy,
        parityNotes: ECONOMY_PARITY_NOTES,
    };
}

module.exports = {
    placeSourceContainers,
    placeControllerContainer,
    placeLinks,
    placeLabs,
    placeMineral,
    placeEconomy,
    inspectEconomy,
    diagnoseControllerContainer,
    isControllerLinkSkippedNearHub,
    ECONOMY_PARITY_NOTES,
};
