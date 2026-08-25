/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Module-level mutable state for the room planner.
 */

const tickTracker = {};
const extensionPositionCache = {}; // module-level -- never hits Memory serialization
const dynamicLayoutCache = {}; // {extensions, corridors} per room

const quadTraps = {};
// Walkway ramparts are derived from the seal contour and must not live in
// ROOM_RAMPART_SPOTS (that set is the leak-seal / isInBunker ring).
const walkwayCache = {};

module.exports = {
    tickTracker,
    extensionPositionCache,
    dynamicLayoutCache,
    quadTraps,
    walkwayCache,
};
