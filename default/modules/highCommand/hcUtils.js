/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Scoring, diplomacy, and siege feasibility helpers.

 */


function intelOwner(intel) {
    if (!intel) return undefined;
    return intel.owner || intel.user;
}


function rampartLevelEquivalent(intel) {
    if (!intel || !intel.rampartMedHP) return 0;
    return Math.min(intel.rampartMedHP / 100000000, 1.5);
}

// Positive = we should be able to siege, negative = outmatched. Compares relative composite
// strength and bakes in rampart depth so a strong-RCL-but-naked target stays feasible.
function siegeFeasibility(r) {
    const myStrength = global.MY_STRENGTH || MAX_LEVEL;
    return myStrength - userStrength(r.owner) - rampartLevelEquivalent(r);
}

function scoreTarget(roomName, type, warPriorityByUser = null) {
    const r = INTEL[roomName];
    if (!r) return Infinity;

    let score = 0;
    const distance = findClosestOwnedRoom(roomName, true);

    score += distance * 20;

    if (THREATS.includes(r.owner)) score -= 200;
    if (type === 'roomDenial') {
        score += (r.level || 0) * 10 + (r.towers || 0) * 100;
        // Prefer brittle siege targets. Curve spans real-world rampart depths:
        // 30M = +9, 100M = +30, 300M = +90 (cap). Among siegeable rooms, picks the thinner one.
        if (r.rampartMedHP) {
            score += Math.min(r.rampartMedHP / 10000000, 30) * 3;
        }
    } else {
        score += (r.level || 0) * 30 + (r.towers || 0) * 100;
    }

    // Strength gap × distance — strong distant targets become very unattractive,
    // strong close targets stay viable (they're real neighbors we need to manage).
    const strengthGap = userStrength(r.owner) - (global.MY_STRENGTH || MAX_LEVEL);
    if (strengthGap > 0) score += strengthGap * distance * 8;

    if (HOLD_SECTOR && myRoomInSectorCheck(roomName)) score -= 150;
    score += Math.max(0, (Game.time - (r.cached || 0)) / 100);

    // WAR_TARGETS gradient — subtract this room owner's priority so higher-priority targets win.
    if (warPriorityByUser && r.owner) {
        score -= warPriorityByUser[r.owner] || 0;
    }

    return score;
}


function getAllianceData() {
    if (typeof ALLIANCE_DATA === 'undefined' || !ALLIANCE_DATA) return null;
    if (typeof ALLIANCE_DATA === 'object') return ALLIANCE_DATA;
    try {
        return JSON.parse(ALLIANCE_DATA);
    } catch (e) {
        return null;
    }
}

function checkForNap(user) {
    if (!user || !global.LOAN_CHECK || !ALLIANCE_DATA) return false;
    if (ENEMIES && ENEMIES.includes(user)) return false;
    const avoidAll = !!AVOID_ATTACKING_ALLIANCES;
    if (!avoidAll && !(NAP_ALLIANCE && NAP_ALLIANCE.length)) return false;

    const LOANData = getAllianceData();
    if (!LOANData) return false;

    const keys = Object.keys(LOANData);
    for (let i = 0; i < keys.length; i++) {
        const allianceKey = keys[i];
        if (!avoidAll && !NAP_ALLIANCE.includes(allianceKey)) continue;
        const members = LOANData[allianceKey];
        if (Array.isArray(members) && members.includes(user)) return true;
    }
    return false;
}

function getPriority(room) {
    const range = findClosestOwnedRoom(room, true);
    if (range <= 1) return PRIORITIES.priority;
    if (range <= 3) return PRIORITIES.urgent;
    if (range <= 5) return PRIORITIES.high;
    if (range <= 10) return PRIORITIES.medium;
    return PRIORITIES.secondary;
}


function siegeLevel(towerCount) {
    if (towerCount >= 3) return MAX_LEVEL >= 8;
    if (towerCount >= 2) return MAX_LEVEL >= 7;
    return MAX_LEVEL >= 6;
}

// Strongholds: 1-tower at RCL 6+, 2–3 towers only at RCL 8. Four-plus is a
// different fight and is not opened automatically.
function strongholdSiegeLevel(towerCount) {
    const n = towerCount || 0;
    if (n < 1 || n > 3) return false;
    if (n >= 2) return MAX_LEVEL >= 8;
    return MAX_LEVEL >= 6;
}

/** World already grouped these this tick. Fallback walks Game.creeps only if World is missing. */
function getMilitaryCreeps() {
    const world = typeof global !== 'undefined' ? global.world : null;
    if (world && world.militaryCreeps) return world.militaryCreeps;
    const out = [];
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (c.my && (c.memory.military || !c.memory.colony)) out.push(c);
    }
    return out;
}

module.exports = {

    intelOwner,

    getMilitaryCreeps,

    rampartLevelEquivalent,

    siegeFeasibility,

    scoreTarget,

    checkForNap,

    getPriority,

    siegeLevel,

    strongholdSiegeLevel,

};