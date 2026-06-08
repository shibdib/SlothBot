/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Military operation planning and target selection.

 */


const state = require('hcState');

const {siegeLevel, siegeFeasibility, scoreTarget, checkForNap} = require('hcUtils');

const {setTarget} = require('hcTargets');

function militaryOperations() {
    // Manual operations
    if (MANUAL_OPERATIONS.length) {
        for (const op of MANUAL_OPERATIONS) {
            if (!Memory.targetRooms[op.room]) {
                Memory.targetRooms[op.room] = {
                    tick: Game.time,
                    type: op.type || 'guard',
                    level: op.level || 1,
                    priority: op.priority || PRIORITIES.high,
                    waveLimit: MAX_LEVEL,
                    manual: true
                };
            }
        }
        for (const key in Memory.targetRooms) {
            if (Memory.targetRooms[key].manual && !MANUAL_OPERATIONS.find(o => o.room === key)) {
                delete Memory.targetRooms[key];
            }
        }
    }

    // Pre-compute WAR_TARGETS lookups â€” used in candidate filtering and scoring.
    const warPriorityByUser = {};
    for (const t of WAR_TARGETS) warPriorityByUser[t.user] = t.priority;
    const warTargetUsers = new Set(Object.keys(warPriorityByUser));

    // Count active operations + attacked owners in one pass
    let activeStrongholds = 0, activeNonSiege = 0, activeSiege = 0;
    const attackedOwners = new Set();

    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op) continue;
        if (op.type === 'stronghold') activeStrongholds++;
        else if (op.type === 'roomDenial' || op.dDay) activeSiege++;
        else activeNonSiege++;
        if (INTEL[key]?.owner) attackedOwners.add(INTEL[key].owner);
    }

    // Strongholds
    if (!state.OFFENSIVE_ALLOWED && state.OPERATION_LIMIT <= 0) return;

    if (state.OPERATION_LIMIT > 0 && activeStrongholds < state.OPERATION_LIMIT) {
        let best = null, bestScore = Infinity;
        for (const r of Object.values(INTEL)) {
            if (!r?.sk || !r.towers || !r.name || Memory.targetRooms[r.name]) continue;
            if (!r.invaderCore || r.invaderCore + CREEP_LIFE_TIME <= Game.time) continue;
            if (!siegeLevel(r.towers) || !myRoomInSectorCheck(r.name)) continue;
            if ((r.lastOperation || 0) + ATTACK_COOLDOWN >= Game.time) continue;

            const score = scoreTarget(r.name, 'stronghold', attackedOwners, warPriorityByUser);
            if (score < bestScore) {
                bestScore = score;
                best = r;
            }
        }
        if (best) setTarget(best.name, 'stronghold', 1);
    }

    if (!OFFENSIVE_OPERATIONS || !state.OFFENSIVE_ALLOWED) return;

    // Candidate filter is permissive on strength â€” guards/harass against a stronger user are
    // fine. The strict siege-only feasibility check happens in the siege block below.
    const strengthCeiling = (global.MY_STRENGTH || MAX_LEVEL) + 2;
    const candidates = Object.values(INTEL).filter(r =>
        r?.name && !Memory.targetRooms[r.name] && r.owner && !r.sk &&
        !FRIENDLIES.includes(r.owner) && !Memory.nonCombatRooms.includes(r.name) &&
        !checkForNap(r.owner) && userStrength(r.owner) <= strengthCeiling &&
        (r.lastOperation || 0) + ATTACK_COOLDOWN < Game.time &&
        warTargetUsers.has(r.owner)
    );

    if (!candidates.length) return;

    // Pre-compute exits once
    const candidateExits = new Map();
    for (const r of candidates) {
        const neighbors = Object.values(Game.map.describeExits(r.name));
        const guardRemotes = neighbors.filter(n => !INTEL[n] || !INTEL[n].user || INTEL[n].user === r.owner);
        const denialHasRemote = neighbors.some(n => !INTEL[n] || !INTEL[n].owner || INTEL[n].owner === r.owner);
        candidateExits.set(r.name, {
            singleRemote: guardRemotes.length === 1 ? guardRemotes[0] : null,
            hasRemote: denialHasRemote
        });
    }

    // Guard operations
    if (activeNonSiege < state.OPERATION_LIMIT) {
        let bestGuard = null, bestGuardScore = Infinity, bestGuardRemote = null;
        for (const r of candidates) {
            const exits = candidateExits.get(r.name);
            if (!exits.singleRemote) continue;

            let score = scoreTarget(r.name, 'guard', attackedOwners, warPriorityByUser);
            const remoteIntel = INTEL[exits.singleRemote];
            if (remoteIntel?.sources > 1) score -= 50; // prefer rich remotes

            if (score < bestGuardScore) {
                bestGuardScore = score;
                bestGuard = r;
                bestGuardRemote = exits.singleRemote;
            }
        }
        if (bestGuard) {
            setTarget(bestGuardRemote, 'guard');
            attackedOwners.add(bestGuard.owner);
        }
    }

    // Remote denial
    if (activeNonSiege < state.OPERATION_LIMIT) {
        let bestDenial = null, bestDenialScore = Infinity;
        for (const r of candidates) {
            if (!candidateExits.get(r.name).hasRemote) continue;
            const score = scoreTarget(r.name, 'remoteDenial', attackedOwners, warPriorityByUser);
            if (score < bestDenialScore) {
                bestDenialScore = score;
                bestDenial = r;
            }
        }
        if (bestDenial) setTarget(bestDenial.name, 'remoteDenial');
    }

    // Siege operations
    if (activeSiege < state.SIEGE_LIMIT) {
        const siegeCooldown = ATTACK_COOLDOWN * 2;
        let bestNoTower = null, bestNoTowerScore = Infinity;
        let bestTower = null, bestTowerScore = Infinity;

        for (const r of candidates) {
            if (r.safemode > Game.time || (r.lastSiege || 0) + siegeCooldown >= Game.time) continue;

            // No direct attacks check
            if (NO_DIRECT_ATTACKS.includes(r.owner)) continue;

            // Siege feasibility â€” combines relative strength and rampart depth. Lets us siege
            // a strong-RCL-but-naked room and skip a turtle. Negative = outmatched.
            if (siegeFeasibility(r) < -1.0) continue;

            let score = scoreTarget(r.name, 'roomDenial', null, warPriorityByUser);
            if (attackedOwners.has(r.owner)) score -= 100; // escalation bonus

            if (!r.towers) {
                if (score < bestNoTowerScore) {
                    bestNoTowerScore = score;
                    bestNoTower = r;
                }
            } else if (siegeLevel(r.towers)) {
                if (score < bestTowerScore) {
                    bestTowerScore = score;
                    bestTower = r;
                }
            }
        }

        if (bestNoTower) setTarget(bestNoTower.name, 'guard');
        if (bestTower && activeSiege + (bestNoTower ? 1 : 0) < state.SIEGE_LIMIT) {
            setTarget(bestTower.name, 'roomDenial', bestTower.towers <= 2 ? 3 : 4);
        }
    } else if (!state.SIEGE_LIMIT && state.lastNoSiegeWarning + 5000 < Game.time) {
        state.lastNoSiegeWarning = Game.time;
        log.a('No combat-ready rooms â€” siege operations disabled.', 'HIGH COMMAND: ');
    }
}

module.exports = {

    militaryOperations,

};