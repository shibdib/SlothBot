/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Layout pending diagnostics only (A5).
 *
 * Tick path: computeLayoutPending / hasPendingLayoutStructures.
 * Placement: plan* act + siteBudget via orchestrator or planner.ensure* console.
 *
 * Removed (A5): buildMissingStructures, buildFromLayout, buildAuxiliaryStructures
 * (bypassed siteBudget soft-reserves). Use:
 *   planner.ensureSpawn / ensureExtensions / ensureCore / ensureEconomy /
 *   ensureRoads / ensureRamparts / ensureAnchors
 */

const {bunkerTemplate, coreTemplate} = require('planTemplates');
const {getExtensionDeficit} = require('planGeomExtensions');

function getStructureCounts(room) {
    const counts = {};
    const structures = room.structures || [];
    for (let i = 0; i < structures.length; i++) {
        const t = structures[i].structureType;
        counts[t] = (counts[t] || 0) + 1;
    }
    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const t = sites[i].structureType;
        counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
}

const LAYOUT_SKIP_TYPES = [STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD];

/**
 * True when bunker/core stamp types (or dynamic specials) are still under RCL cap.
 * @param {Room} room
 * @returns {boolean}
 */
function hasPendingLayoutStructures(room) {
    if (!room || !room.controller) return false;
    const existingCounts = getStructureCounts(room);
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const skipTypes = room.memory.dynamicLayout
        ? LAYOUT_SKIP_TYPES.concat([STRUCTURE_EXTENSION])
        : LAYOUT_SKIP_TYPES;
    const level = room.controller.level;
    for (let i = 0; i < tmpl.length; i++) {
        const s = tmpl[i];
        if (skipTypes.indexOf(s.structureType) !== -1) continue;
        const allowed = CONTROLLER_STRUCTURES[s.structureType]
            ? CONTROLLER_STRUCTURES[s.structureType][level]
            : 0;
        if (allowed > (existingCounts[s.structureType] || 0)) return true;
    }
    // Dynamic rooms also need factory / power spawn / nuker / observer (not in core stamps).
    if (room.memory.dynamicLayout && level >= 7) {
        const specials = [STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN, STRUCTURE_NUKER, STRUCTURE_OBSERVER];
        for (let i = 0; i < specials.length; i++) {
            const type = specials[i];
            const allowed = CONTROLLER_STRUCTURES[type] ? CONTROLLER_STRUCTURES[type][level] || 0 : 0;
            if (allowed > (existingCounts[type] || 0)) return true;
        }
    }
    return false;
}

/**
 * Whether low-priority site consumers (roads / barriers) should leave slots for layout.
 * Only meaningful once storage exists (roads gated on storage); requires incomplete
 * layout stamps and a large extension deficit.
 * @param {Room} room
 * @returns {boolean}
 */
function computeLayoutPending(room) {
    if (!room || !room.storage) return false;
    // Tick cache — orchestrator + roads + ramparts each used to re-count structures.
    if (room._layoutPendingTick === Game.time) return !!room._layoutPending;
    try {
        const level = room.controller && room.controller.level;
        if (!level || level < 2) {
            room._layoutPending = false;
            room._layoutPendingTick = Game.time;
            return false;
        }
        room._layoutPending = hasPendingLayoutStructures(room) && getExtensionDeficit(room) > 5;
        room._layoutPendingTick = Game.time;
        return room._layoutPending;
    } catch (e) {
        room._layoutPending = false;
        room._layoutPendingTick = Game.time;
        return false;
    }
}

module.exports = {
    hasPendingLayoutStructures,
    computeLayoutPending,
};
