/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Military operation planning and target selection.
 *
 * One mission per war-target user, first matching rule:
 *   1. Siegeable towered room → roomDenial
 *   2. Naked owned room → occupy (guard)
 *   3. Else raid remotes → remoteDenial (skipped when harassment already covers remotes)
 * Strongholds stay on their own track.
 */

const state = require('hcState');
const {siegeLevel, siegeFeasibility, scoreTarget, checkForNap} = require('hcUtils');
const {setTarget} = require('hcTargets');
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
            if ((r.lastOperation || 0) + ATTACK_COOLDOWN >= ct) continue;
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
        if (!intel || !intel.owner || intel.owner === owner) return true;
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
        const siegeReady = safe && (r.lastSiege || 0) + siegeCooldown < ct;

        if (r.towers && !noDirect && siegeReady && siegeLevel(r.towers) && siegeFeasibility(r) >= -1) {
            const score = scoreTarget(r.name, 'roomDenial', null, warPriorityByUser);
            if (score < bestSiegeScore) {
                bestSiegeScore = score;
                bestSiege = r;
            }
        } else if (!r.towers && !noDirect && siegeReady) {
            const score = scoreTarget(r.name, 'guard', null, warPriorityByUser);
            if (score < bestNakedScore) {
                bestNakedScore = score;
                bestNaked = r;
            }
        }

        if (allowDenial && roomHasRemote(r.name, r.owner)) {
            const score = scoreTarget(r.name, 'remoteDenial', null, warPriorityByUser);
            if (score < bestDenialScore) {
                bestDenialScore = score;
                bestDenial = r;
            }
        }
    }

    if (bestSiege && allowSiege) {
        return {type: 'roomDenial', room: bestSiege.name, level: bestSiege.towers <= 2 ? 3 : 4};
    }
    if (bestNaked && allowOccupy) {
        return {type: 'guard', room: bestNaked.name, level: 1};
    }
    if (bestDenial && allowDenial) {
        return {type: 'remoteDenial', room: bestDenial.name, level: 1};
    }
    return null;
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
            }
        }
        for (const key in Memory.targetRooms) {
            if (Memory.targetRooms[key].manual && !MANUAL_OPERATIONS.find(o => o.room === key)) {
                delete Memory.targetRooms[key];
            }
        }
    }

    const idx = global.getIntelIndexes ? global.getIntelIndexes() : {byOwner: {}, strongholdActive: new Set()};

    const warPriorityByUser = {};
    for (const t of WAR_TARGETS) warPriorityByUser[t.user] = t.priority;
    const warTargetUsers = new Set(Object.keys(warPriorityByUser));

    let activeStrongholds = 0;
    let activeNonSiege = 0;
    let activeSiege = 0;
    let activeRemoteDenials = 0;
    const attackedOwners = new Set();

    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op) continue;
        if (op.type === 'stronghold') activeStrongholds++;
        else if (op.type === 'roomDenial' || op.dDay) activeSiege++;
        else {
            activeNonSiege++;
            if (op.type === 'remoteDenial') activeRemoteDenials++;
        }
        if (INTEL[key] && INTEL[key].owner) attackedOwners.add(INTEL[key].owner);
    }

    if (!state.ALLOW_NEW_OPS) {
        const readiness = state.EMPIRE_READINESS;
        if (readiness && readiness.canLaunchOps) {
            logPlanSkip(getOpsPauseReason(readiness) || 'cpu hold');
        }
        return;
    }
    if (!state.OFFENSIVE_ALLOWED && state.OPERATION_LIMIT <= 0) return;

    if (state.OPERATION_LIMIT > 0 && activeStrongholds < state.OPERATION_LIMIT) {
        let best = null;
        let bestScore = Infinity;
        for (const rName of (idx.strongholdActive || [])) {
            const r = INTEL[rName];
            if (!r || !r.name || Memory.targetRooms[r.name]) continue;
            if (!r.invaderCore || r.invaderCore <= Game.time) continue;
            if (!siegeLevel(r.towers) || !myRoomInSectorCheck(r.name)) continue;
            if ((r.lastOperation || 0) + ATTACK_COOLDOWN >= Game.time) continue;

            const score = scoreTarget(r.name, 'stronghold', attackedOwners, warPriorityByUser);
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
    const siegeCooldown = ATTACK_COOLDOWN * 2;

    const orderedUsers = [];
    for (let i = 0; i < WAR_TARGETS.length; i++) {
        const t = WAR_TARGETS[i];
        if (t && t.user) orderedUsers.push(t);
    }
    orderedUsers.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    let planned = 0;
    let considered = 0;
    for (let i = 0; i < orderedUsers.length; i++) {
        const user = orderedUsers[i].user;
        if (attackedOwners.has(user)) continue;
        const rooms = candidates.byOwner[user];
        if (!rooms) continue;
        considered++;

        const allowSiege = activeSiege < state.SIEGE_LIMIT;
        const allowOccupy = activeNonSiege < state.OPERATION_LIMIT;
        const allowDenial = !harassCoversRemotes
            && activeRemoteDenials < maxRemoteDenial
            && activeNonSiege < state.OPERATION_LIMIT;
        if (!allowSiege && !allowOccupy && !allowDenial) break;

        const pick = pickMissionForUser(rooms, {
            warPriorityByUser,
            siegeCooldown,
            allowSiege,
            allowOccupy,
            allowDenial,
        });
        if (!pick) continue;

        setTarget(pick.room, pick.type, pick.level);
        planned++;
        attackedOwners.add(user);
        if (pick.type === 'roomDenial') activeSiege++;
        else {
            activeNonSiege++;
            if (pick.type === 'remoteDenial') activeRemoteDenials++;
        }
    }

    if (planned) {
        clearPlanSkip();
        return;
    }
    if (considered) logPlanSkip('no matching mission (siege/occupy/remotes)');
}

module.exports = {
    militaryOperations,
};
