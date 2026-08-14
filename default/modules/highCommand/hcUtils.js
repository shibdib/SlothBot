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

function scoreTarget(roomName, type, attackedOwners = null, warPriorityByUser = null) {
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

    // Strength gap Ã— distance â€” strong distant targets become very unattractive,
    // strong close targets stay viable (they're real neighbors we need to manage).
    const strengthGap = userStrength(r.owner) - (global.MY_STRENGTH || MAX_LEVEL);
    if (strengthGap > 0) score += strengthGap * distance * 8;

    if (HOLD_SECTOR && myRoomInSectorCheck(roomName)) score -= 150;
    if (!THREATS.includes(r.owner) && (r.level || 0) < 4) score += 100;
    score += Math.max(0, (Game.time - (r.cached || 0)) / 100);

    // WAR_TARGETS gradient â€” subtract this room owner's priority so higher-priority targets win.
    if (warPriorityByUser && r.owner) {
        score -= warPriorityByUser[r.owner] || 0;
    }

    if (attackedOwners && attackedOwners.has(r.owner)) score += 250;

    return score;
}


function checkForNap(user) {
    if (!global.LOAN_CHECK || !ALLIANCE_DATA || !NAP_ALLIANCE.length || _.includes(ENEMIES, user)) return false;

    try {
        const LOANData = JSON.parse(ALLIANCE_DATA);
        for (const allianceKey of Object.keys(LOANData)) {
            if (allianceKey.includes(user) && (_.includes(NAP_ALLIANCE, allianceKey) || AVOID_ATTACKING_ALLIANCES)) {
                return true;
            }
        }
    } catch (e) {
        return false;
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
    if (towerCount > 3) return false;
    if (towerCount >= 3) return MAX_LEVEL >= 8;
    if (towerCount >= 2) return MAX_LEVEL >= 7;
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

};