/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Tick-path room hygiene only (A2).
 * Hostile-structure scrub + stale link memory ids.
 * Placement (economy / ramparts / layout) lives in plan* act + siteBudget.
 */

const {safeStructureOwner} = require('planUtils');

/**
 * Clear controller/hub link memory when the object is gone.
 * @param {Room} room
 */
function clearStaleLinkMemory(room) {
    if (!room || !room.memory) return;
    if (room.memory.controllerLink && !Game.getObjectById(room.memory.controllerLink)) {
        room.memory.controllerLink = undefined;
    }
    if (room.memory.hubLink && !Game.getObjectById(room.memory.hubLink)) {
        room.memory.hubLink = undefined;
    }
}

/**
 * @param {Structure} structure
 * @param {Room} room
 * @returns {boolean}
 */
function isBadStructure(structure, room) {
    const owner = safeStructureOwner(structure);
    if (!owner) return false;
    const level = room.controller && room.controller.level;
    if (level >= 6) {
        return owner !== MY_USERNAME;
    }
    if (level >= 4) {
        return owner !== MY_USERNAME && structure.structureType !== STRUCTURE_TERMINAL;
    }
    return false;
}

/**
 * Destroy hostile structures (same gates as former planAuxiliary).
 * @param {Room} room
 * @returns {number} destroyed count
 */
function removeBadStructures(room) {
    if (!room) return 0;
    let removed = 0;
    const structures = room.structures || [];
    for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (!isBadStructure(s, room)) continue;
        try {
            if (s.destroy && s.destroy() === OK) removed++;
        } catch (e) { /* ignore */
        }
    }
    return removed;
}

/**
 * Opportunistic hostile scrub (10% of calls — parity with V1 aux).
 * @param {Room} room
 * @param {{force?: boolean}} [options]
 * @returns {{scrubbed: number, linksCleared: boolean}}
 */
function performCleanup(room, options) {
    const opts = options || {};
    clearStaleLinkMemory(room);
    let scrubbed = 0;
    if (opts.force || Math.random() > 0.9) {
        scrubbed = removeBadStructures(room);
    }
    return {scrubbed, linksCleared: true};
}

/**
 * Full tick hygiene pass used by the orchestrator AUXILIARY phase.
 * @param {Room} room
 * @param {{force?: boolean}} [options]
 */
function roomHygiene(room, options) {
    return performCleanup(room, options);
}

module.exports = {
    clearStaleLinkMemory,
    isBadStructure,
    removeBadStructures,
    performCleanup,
    roomHygiene,
};
