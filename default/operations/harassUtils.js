/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Shared threat-remote pool helpers for harassment operations.
 */

function isThreatUser(user) {
    return !!(user && THREATS.includes(user) && !NO_DIRECT_ATTACKS.includes(user) && !FRIENDLIES.includes(user));
}

function adjacentThreatOwned(roomName) {
    for (const neighbor of Object.values(Game.map.describeExits(roomName) || {})) {
        const intel = INTEL[neighbor];
        if (!intel || !isThreatUser(intel.owner)) continue;
        if (intel.safemode && intel.safemode > Game.time) continue;
        return true;
    }
    return false;
}

function isValidHarassRemote(roomName, visited = []) {
    if (visited.includes(roomName)) return false;
    const intel = INTEL[roomName];
    if (!intel) return false;
    if (intel.owner) return false;
    if (intel.towers) return false;
    if (intel.safemode && intel.safemode > Game.time) return false;
    if (Object.values(Game.map.describeExits(roomName) || {}).length <= 1) return false;
    return adjacentThreatOwned(roomName);
}

function collectThreatRemotes(visited = []) {
    const remotes = [];
    for (const r of Object.values(INTEL)) {
        if (!r?.name) continue;
        if (isValidHarassRemote(r.name, visited)) remotes.push(r.name);
    }
    return remotes;
}

module.exports = {
    isThreatUser,
    isValidHarassRemote,
    collectThreatRemotes,
};