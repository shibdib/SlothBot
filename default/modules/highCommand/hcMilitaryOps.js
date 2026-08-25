/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Military operation planning and target selection.
 *
 * Sieges concentrate on one war-target user (sticky existing auto roomDenial,
 * else highest-priority user with a siegeable room) and fill SIEGE_LIMIT
 * against that player. Occupy / remoteDenial stay one non-siege op per user
 * and may share the focus player.
 * Strongholds stay on their own track (one at a time, never while invulnerable).
 */

const state = require('hcState');
const {
    siegeOpLevel,
    strongholdSiegeLevel,
    scoreTarget,
    checkForNap,
    roomDenialLaunchOk,
    siegeFocusOwner,
    countActiveSieges,
    warPriorityMap,
} = require('hcUtils');
const {setTarget} = require('hcTargets');
const {notifySiegeLaunch} = require('module.notifications');
const {getOpsPauseReason} = require('hcReadiness');

const SKIP_LOG_INTERVAL = 500;

function logPlanSkip(reason) {
    state.lastPlanSkip = reason;
    if ((state.lastPlanSkipTick || 0) + SKIP_LOG_INTERVAL > Game.time) return;
    state.lastPlanSkipTick = Game.time;
    log.a(`No new operations — ${reason}.`, 'HIGH COMMAND: ');
}

function clearPlanSkip() {
    state.lastPlanSkip = null;
}

function collectWarCandidates(idx, warTargetUsers, strengthCeiling) {
    const byOwner = {};
    let total = 0;
    const ct = Game.time;
    for (const user of warTargetUsers) {
        const rooms = idx.byOwner[user];
        if (!rooms) continue;
        const list = [];
        for (let i = 0; i < rooms.length; i++) {
            const r = rooms[i];
            if (!r || !r.name || Memory.targetRooms[r.name]) continue;
            if (!r.owner || r.sk) continue;
            if (FRIENDLIES.includes(r.owner)) continue;
            if (Memory.nonCombatRooms && Memory.nonCombatRooms.includes(r.name)) continue;
            if (checkForNap(r.owner)) continue;
            if (userStrength(r.owner) > strengthCeiling) continue;
            const crushNew = NEW_SPAWN_DENIAL && (r.level || 0) <= 3;
            if (!crushNew && (r.lastOperation || 0) + ATTACK_COOLDOWN >= ct) continue;
            list.push(r);
        }
        if (list.length) {
            byOwner[user] = list;
            total += list.length;
        }
    }
    return {byOwner, total};
}

function roomHasRemote(roomName, owner) {
    const exits = Game.map.describeExits(roomName);
    if (!exits) return false;
    const neighbors = Object.values(exits);
    for (let i = 0; i < neighbors.length; i++) {
        const intel = INTEL[neighbors[i]];
        if (!intel || !intel.owner) return true;
        if (intel.owner === owner) continue;
    }
    return false;
}

function pickMissionForUser(rooms, opts) {
    const {warPriorityByUser, siegeCooldown, allowSiege, allowOccupy, allowDenial} = opts;
    const ct = Game.time;

    let bestSiege = null;
    let bestSiegeScore = Infinity;
    let bestNaked = null;
    let bestNakedScore = Infinity;
    let bestDenial = null;
    let bestDenialScore = Infinity;

    for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        const noDirect = NO_DIRECT_ATTACKS.includes(r.owner);
        const safe = !(r.safemode > ct);
        const crushNew = NEW_SPAWN_DENIAL && (r.level || 0) <= 3 && !noDirect && safe;
        const siegeReady = crushNew || (safe && (r.lastSiege || 0) + siegeCooldown < ct);

        if (allowSiege && roomDenialLaunchOk(r)) {
            let score = scoreTarget(r.name, 'roomDenial', warPriorityByUser);
            if (crushNew) score -= 200;
            if (score < bestSiegeScore) {
                bestSiegeScore = score;
                bestSiege = r;
            }
        } else if (!r.towers && !noDirect && siegeReady) {
            let score = scoreTarget(r.name, 'guard', warPriorityByUser);
            if (crushNew) score -= 200;
            if (score < bestNakedScore) {
                bestNakedScore = score;
                bestNaked = r;
            }
        }

        if (allowDenial && roomHasRemote(r.name, r.owner)) {
            const score = scoreTarget(r.name, 'remoteDenial', warPriorityByUser);
            if (score < bestDenialScore) {
                bestDenialScore = score;
                bestDenial = r;
            }
        }
    }

    if (bestSiege && allowSiege) {
        return {type: 'roomDenial', room: bestSiege.name, level: siegeOpLevel(bestSiege.towers)};
    }
    if (bestNaked && allowOccupy) {
        return {type: 'guard', room: bestNaked.name, level: 1};
    }
    if (bestDenial && allowDenial) {
        return {type: 'remoteDenial', room: bestDenial.name, level: 1};
    }
    return null;
}

function removeCandidate(rooms, roomName) {
    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i] && rooms[i].name === roomName) {
            rooms.splice(i, 1);
            return;
        }
    }
}

function resolveSiegeFocus(orderedUsers, candidates, warPriorityByUser, siegeCooldown) {
    const sticky = siegeFocusOwner(warPriorityByUser);
    if (sticky) return sticky;
    for (let i = 0; i < orderedUsers.length; i++) {
        const user = orderedUsers[i].user;
        const rooms = candidates.byOwner[user];
        if (!rooms) continue;
        const pick = pickMissionForUser(rooms, {
            warPriorityByUser,
            siegeCooldown,
            allowSiege: true,
            allowOccupy: false,
            allowDenial: false,
        });
        if (pick && pick.type === 'roomDenial') return user;
    }
    return null;
}

function canLaunchNewRoomDenial(intel) {
    if (!roomDenialLaunchOk(intel)) return false;
    if (countActiveSieges() >= (state.SIEGE_LIMIT || 0)) return false;
    const focus = siegeFocusOwner(warPriorityMap());
    if (focus && intel.owner !== focus) return false;
    return true;
}

function militaryOperations() {
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
                if ((op.type || 'guard') === 'roomDenial') notifySiegeLaunch(op.room);
            }
        }
        for (const key in Memory.targetRooms) {
            if (Memory.targetRooms[key].manual && !MANUAL_OPERATIONS.find(o => o.room === key)) {
                delete Memory.targetRooms[key];
            }
        }
    }

    const idx = global.getIntelIndexes ? global.getIntelIndexes() : {byOwner: {}, strongholdActive: new Set()};

    const warPriorityByUser = warPriorityMap();
    const warTargetUsers = new Set(Object.keys(warPriorityByUser));

    let activeStrongholds = 0;
    let activeNonSiege = 0;
    let activeSiege = 0;
    let activeRemoteDenials = 0;
    const ownersWithNonSiege = new Set();

    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op) continue;
        if (op.type === 'stronghold') activeStrongholds++;
        else if (op.type === 'roomDenial' || op.dDay) activeSiege++;
        else {
            activeNonSiege++;
            if (op.type === 'remoteDenial') activeRemoteDenials++;
            if (INTEL[key] && INTEL[key].owner) ownersWithNonSiege.add(INTEL[key].owner);
        }
    }

    if (!state.ALLOW_NEW_OPS) {
        const readiness = state.EMPIRE_READINESS;
        if (readiness && readiness.canLaunchOps) {
            logPlanSkip(getOpsPauseReason(readiness) || 'cpu hold');
        }
        return;
    }
    if (!state.OFFENSIVE_ALLOWED && state.OPERATION_LIMIT <= 0) return;

    if (state.OPERATION_LIMIT > 0 && activeStrongholds < 1) {
        let best = null;
        let bestScore = Infinity;
        for (const rName of (idx.strongholdActive || [])) {
            const r = INTEL[rName];
            if (!r || !r.name || Memory.targetRooms[r.name]) continue;
            if (!r.invaderCore || r.invaderCore <= Game.time) continue;
            if (r.invaderCoreInvuln && r.invaderCoreInvuln > Game.time) continue;
            if (!strongholdSiegeLevel(r.towers) || !myRoomInSectorCheck(r.name)) continue;
            if ((r.lastOperation || 0) + ATTACK_COOLDOWN >= Game.time) continue;

            const score = scoreTarget(r.name, 'stronghold', warPriorityByUser);
            if (score < bestScore) {
                bestScore = score;
                best = r;
            }
        }
        if (best) {
            setTarget(best.name, 'stronghold', 1);
            clearPlanSkip();
        }
    }

    if (!OFFENSIVE_OPERATIONS || !state.OFFENSIVE_ALLOWED) {
        // Config-off is intentional (harass-only shards). Only log a hold when
        // offense is enabled but readiness/budget blocked it.
        if (OFFENSIVE_OPERATIONS) {
            const readiness = state.EMPIRE_READINESS;
            const note = readiness && readiness.empireCritical
                ? 'empire critical'
                : (readiness && readiness.warBudget < 0 ? `budget ${Math.round(readiness.warBudget)}` : 'offense held');
            logPlanSkip(note);
        }
        return;
    }

    const strengthCeiling = (global.MY_STRENGTH || MAX_LEVEL) + 2;
    const candidates = collectWarCandidates(idx, warTargetUsers, strengthCeiling);

    if (!candidates.total) {
        if (!warTargetUsers.size) logPlanSkip('no war targets');
        else logPlanSkip('no eligible rooms (cooldown or filtered)');
        return;
    }

    const atCapacity = activeSiege >= state.SIEGE_LIMIT && activeNonSiege >= state.OPERATION_LIMIT;
    if (atCapacity) return;

    const harassPool = idx.harassRemotes ? idx.harassRemotes.size : 0;
    const harassCoversRemotes = HARASSMENT_OPERATIONS && harassPool > 0;
    const maxRemoteDenial = HARASSMENT_OPERATIONS
        ? (REMOTE_DENIAL_MAX_WITH_HARASS || 1)
        : Math.min(REMOTE_DENIAL_MAX_WITHOUT_HARASS || 3, state.OPERATION_LIMIT);
    const siegeCooldown = ATTACK_COOLDOWN;

    const orderedUsers = [];
    for (let i = 0; i < WAR_TARGETS.length; i++) {
        const t = WAR_TARGETS[i];
        if (t && t.user) orderedUsers.push(t);
    }
    orderedUsers.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    let planned = 0;
    let considered = 0;
    const focus = resolveSiegeFocus(orderedUsers, candidates, warPriorityByUser, siegeCooldown);

    if (focus && activeSiege < state.SIEGE_LIMIT) {
        const rooms = candidates.byOwner[focus];
        if (rooms) {
            considered++;
            while (activeSiege < state.SIEGE_LIMIT) {
                const pick = pickMissionForUser(rooms, {
                    warPriorityByUser,
                    siegeCooldown,
                    allowSiege: true,
                    allowOccupy: false,
                    allowDenial: false,
                });
                if (!pick) break;
                setTarget(pick.room, pick.type, pick.level);
                removeCandidate(rooms, pick.room);
                planned++;
                activeSiege++;
            }
        }
    }

    const allowOccupy = () => activeNonSiege < state.OPERATION_LIMIT;
    const allowDenial = () => !harassCoversRemotes
        && activeRemoteDenials < maxRemoteDenial
        && activeNonSiege < state.OPERATION_LIMIT;

    const planNonSiegeForUser = (user) => {
        if (ownersWithNonSiege.has(user)) return;
        if (!allowOccupy() && !allowDenial()) return;
        const rooms = candidates.byOwner[user];
        if (!rooms) return;
        considered++;
        const pick = pickMissionForUser(rooms, {
            warPriorityByUser,
            siegeCooldown,
            allowSiege: false,
            allowOccupy: allowOccupy(),
            allowDenial: allowDenial(),
        });
        if (!pick) return;
        setTarget(pick.room, pick.type, pick.level);
        removeCandidate(rooms, pick.room);
        planned++;
        ownersWithNonSiege.add(user);
        activeNonSiege++;
        if (pick.type === 'remoteDenial') activeRemoteDenials++;
    };

    if (focus) planNonSiegeForUser(focus);
    for (let i = 0; i < orderedUsers.length; i++) {
        if (!allowOccupy() && !allowDenial()) break;
        const user = orderedUsers[i].user;
        if (user === focus) continue;
        planNonSiegeForUser(user);
    }

    if (planned) {
        clearPlanSkip();
        return;
    }
    if (considered) logPlanSkip('no matching mission (siege/occupy/remotes)');
}

module.exports = {
    militaryOperations,
    canLaunchNewRoomDenial,
};
