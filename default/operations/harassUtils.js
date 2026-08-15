/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Shared threat-remote pool helpers for harassment operations.
 */

function isThreatUser(user) {
    if (global.isHarassOwner) return global.isHarassOwner(user);
    if (!user || FRIENDLIES.includes(user) || NO_DIRECT_ATTACKS.includes(user)) return false;
    if (THREATS && THREATS.includes(user)) return true;
    const war = global.WAR_TARGETS;
    if (war) {
        for (let i = 0; i < war.length; i++) {
            if (war[i] && war[i].user === user) return true;
        }
    }
    return false;
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
    const idx = global.getIntelIndexes ? global.getIntelIndexes() : null;
    if (idx && idx.harassRemotes) {
        const remotes = [];
        for (const rName of idx.harassRemotes) {
            if (!visited.includes(rName)) remotes.push(rName);
        }
        return remotes;
    }

    const remotes = [];
    for (const rName in INTEL) {
        if (isValidHarassRemote(rName, visited)) remotes.push(rName);
    }
    return remotes;
}

module.exports = {
    collectThreatRemotes,
};