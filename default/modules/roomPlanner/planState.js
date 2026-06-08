/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
Module-level mutable state for the room planner.
 */

const tickTracker = {};
const linkTracker = {};
const extensionPositionCache = {}; // module-level — never hits Memory serialization

const quadTraps = {};

module.exports = {
    tickTracker,
    linkTracker,
    extensionPositionCache,
    quadTraps,
};
