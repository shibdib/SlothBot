/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Empire-wide energy and combat readiness for operation gating.
 */

const STRESS_STRESSED_RATIO = 0.5;
const STRESS_CRITICAL_RATIO = 0.75;
const STOCKPILE_COMBAT_READY_RATIO = 0.8;
const FLOW_TREND_STRESS = -2;
const STICKY_CR_TTL = 50;
const SIEGE_CANCEL_WINDOW = 5000;
const SIEGE_CANCEL_PENALTY_EACH = 0.2;
const SIEGE_CANCEL_PENALTY_MAX = 0.75;
const WAR_BUDGET_OFFENSE_MIN = 0;

const OP_TIER = {
    HARASS: 'harass',
    DENIAL: 'denial',
    SIEGE: 'siege',
};

let _readinessCache = {tick: -1, readiness: null};

function matureRoomLevel() {
    if (typeof MAX_LEVEL === 'undefined') return 4;
    return Math.max(4, MAX_LEVEL - 1);
}

function harassRoomLevel() {
    if (typeof MAX_LEVEL === 'undefined') return 4;
    return Math.max(4, MAX_LEVEL - 2);
}

function roomStockpileRatio(room) {
    const diag = room.energyDiag;
    if (!diag || !diag.stockTarget) return 0;
    return (diag.stockEnergy || 0) / diag.stockTarget;
}

function roomHasCombatStockpile(room) {
    return room.level >= matureRoomLevel() && roomStockpileRatio(room) >= STOCKPILE_COMBAT_READY_RATIO;
}

function roomMilitaryFlowSpare(room) {
    const ei = room.energyInfo;
    if (!ei) return 0;
    if (typeof ei.flowSpare === 'number') return ei.flowSpare;
    const diag = room.energyDiag;
    const military = diag && diag.militarySpawnExpense || 0;
    return (ei.spareIncome || 0) + military;
}

function roomFlowStressed(room) {
    const ei = room.energyInfo;
    if (!ei) return false;
    if ((room.energyState || 0) >= 2) return false;
    if (roomHasCombatStockpile(room)) return false;
    if (typeof ei.flowStressed === 'boolean') return ei.flowStressed;
    const flowSpare = roomMilitaryFlowSpare(room);
    return flowSpare < 0 || ei.trend < FLOW_TREND_STRESS;
}

function isLiveCombatReadyRaw(room) {
    if (room.level < matureRoomLevel()) return false;
    const energyState = room.energyState || 0;
    if (energyState >= 2) return true;
    if (energyState >= 1) {
        if (roomHasCombatStockpile(room)) return true;
        return !roomFlowStressed(room);
    }
    return false;
}

function applyStickyCombatReady(room, rawReady) {
    const heap = global.roomHeap ? global.roomHeap(room.name) : room.memory;
    if (!heap.readinessSticky) heap.readinessSticky = {};
    const sticky = heap.readinessSticky;
    if (rawReady) {
        // Refresh only when missing or near expiry (heap — not serialized).
        if (!sticky.combatReady || !sticky.until || sticky.until < Game.time + 10) {
            sticky.combatReady = true;
            sticky.until = Game.time + STICKY_CR_TTL;
        }
        return true;
    }
    if (sticky.combatReady && sticky.until > Game.time && (room.energyState || 0) >= 1) return true;
    if (sticky.until <= Game.time && sticky.combatReady) delete sticky.combatReady;
    return false;
}

function isLiveCombatReady(room) {
    return applyStickyCombatReady(room, isLiveCombatReadyRaw(room));
}

function isLiveAuxReady(room) {
    if (room.level < matureRoomLevel()) return false;
    const energyState = room.energyState || 0;
    if (energyState >= 1) return true;
    return room.level === 8 && !roomFlowStressed(room);
}

function isRoomStruggling(room) {
    return (room.energyState || 0) < 1;
}

function combatReadyWeight(room) {
    if (room.level >= 8) return 2;
    if (room.level >= 7) return 1;
    return 0;
}

function getOpTier(opMemory, entry = {}) {
    if (entry.operation === 'harass') return OP_TIER.HARASS;
    if (!opMemory) return OP_TIER.DENIAL;
    if (opMemory.type === 'scout' || entry.role === 'scout') return OP_TIER.HARASS;
    if (opMemory.type === 'roomDenial' || opMemory.type === 'stronghold') return OP_TIER.SIEGE;
    return OP_TIER.DENIAL;
}

function isRoomReadyForTier(room, tier) {
    if (!room) return false;
    if (tier === OP_TIER.HARASS) {
        if (room.level < harassRoomLevel()) return false;
        if (isRoomStruggling(room)) return false;
        return isLiveAuxReady(room) || (room.energyState || 0) >= 1;
    }
    if (tier === OP_TIER.DENIAL) return isLiveCombatReady(room);
    if (tier === OP_TIER.SIEGE) {
        // RCL floor is computeOpLevelTarget (1 tower → 6, 2+ → 7). Using
        // isLiveCombatReady here reimposed matureRoomLevel (usually 7).
        if (roomMilitaryFlowSpare(room) < 0) return false;
        if (isRoomStruggling(room)) return false;
        if ((room.energyState || 0) >= 1) return true;
        return roomHasCombatStockpile(room);
    }
    return isLiveCombatReady(room);
}

function getCombatReadyFailReason(room) {
    if (isLiveCombatReady(room)) return null;
    if (room.level < matureRoomLevel()) return 'rcl';
    const energyState = room.energyState || 0;
    if (energyState < 1) return 'stock';
    if (!roomHasCombatStockpile(room) && roomFlowStressed(room)) return 'flow';
    return 'stock';
}

function recordSiegeCancellation() {
    if (!global.SIEGE_CANCEL_LOG) global.SIEGE_CANCEL_LOG = [];
    global.SIEGE_CANCEL_LOG.push(Game.time);
    while (global.SIEGE_CANCEL_LOG.length > 30) global.SIEGE_CANCEL_LOG.shift();
    invalidateReadinessCache();
}

function getSiegeLimitMultiplier() {
    const log = global.SIEGE_CANCEL_LOG || [];
    let recent = 0;
    const cutoff = Game.time - SIEGE_CANCEL_WINDOW;
    for (let i = log.length - 1; i >= 0; i--) {
        if (log[i] < cutoff) break;
        recent++;
    }
    const penalty = Math.min(SIEGE_CANCEL_PENALTY_MAX, recent * SIEGE_CANCEL_PENALTY_EACH);
    return Math.max(0.25, 1 - penalty);
}

function invalidateReadinessCache() {
    _readinessCache.tick = -1;
}

function computeEmpireReadiness() {
    let total = 0;
    let combatReady = 0;
    let weightedCombatReady = 0;
    let auxReady = 0;
    let rcl7CombatReady = 0;
    let weightedRcl7CombatReady = 0;
    let struggling = 0;
    let invisible = 0;
    let warBudget = 0;

    const minLevel = matureRoomLevel();

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        let controllerMy = false;
        try {
            controllerMy = !!(room && room.controller && room.controller.my);
        } catch (e) {
            controllerMy = false;
        }
        if (!room || !room.controller || !controllerMy) {
            invisible++;
            continue;
        }

        if (room.level < minLevel) continue;

        total++;

        if (isLiveCombatReady(room)) {
            combatReady++;
            const weight = combatReadyWeight(room);
            weightedCombatReady += weight;
            warBudget += roomMilitaryFlowSpare(room);
            if (room.level >= 7) {
                rcl7CombatReady++;
                weightedRcl7CombatReady += weight;
            }
        }
        if (isLiveAuxReady(room)) auxReady++;
        if (isRoomStruggling(room)) struggling++;
    }

    const minCombatReady = 1;
    const canLaunchOps = combatReady >= minCombatReady;
    const strugglingRatio = total ? struggling / total : 0;
    const empireStressed = total > 0 && strugglingRatio >= STRESS_STRESSED_RATIO;
    const empireCritical = total > 0 && strugglingRatio >= STRESS_CRITICAL_RATIO;
    const siegeLimitMultiplier = getSiegeLimitMultiplier();

    return {
        total,
        combatReady,
        weightedCombatReady,
        auxReady,
        rcl7CombatReady,
        weightedRcl7CombatReady,
        struggling,
        invisible,
        minCombatReady,
        canLaunchOps,
        strugglingRatio,
        empireStressed,
        empireCritical,
        warBudget,
        siegeLimitMultiplier,
    };
}

function getEmpireReadiness(force) {
    if (!force && _readinessCache.tick === Game.time && _readinessCache.readiness) {
        return _readinessCache.readiness;
    }
    const readiness = computeEmpireReadiness();
    _readinessCache = {tick: Game.time, readiness};
    return readiness;
}

function auxiliaryLimit(readiness, stressed) {
    if (readiness.auxReady <= 0) return 0;
    if (stressed) return 1;
    return Math.min(3, Math.max(1, readiness.auxReady));
}

function warBudgetScale(budget) {
    if (budget >= 12) return 1;
    if (budget >= WAR_BUDGET_OFFENSE_MIN) return 0.85;
    if (budget >= -5) return 0.6;
    return 0.35;
}

const TICK_CPU_WINDOW = 25;
const MILITARY_BUCKET_MIN = 2000;
const MILITARY_CPU_RATIO = 0.95;
const tickCpuSamples = [];

function noteTickCpu(used) {
    const value = used != null ? used : (typeof Game !== 'undefined' && Game.cpu ? Game.cpu.getUsed() : 0);
    tickCpuSamples.push(value);
    if (tickCpuSamples.length > TICK_CPU_WINDOW) tickCpuSamples.shift();
}

function averageTickCpu() {
    if (!tickCpuSamples.length) {
        return typeof Game !== 'undefined' && Game.cpu ? Game.cpu.getUsed() : 0;
    }
    let sum = 0;
    for (let i = 0; i < tickCpuSamples.length; i++) sum += tickCpuSamples[i];
    return sum / tickCpuSamples.length;
}

/**
 * Whether the empire can absorb another owned room (or equivalent new work).
 * Uses rolling tick CPU, bucket, and rooms already in CPU-emergency remotes-off.
 * @returns {{ok: boolean, reason?: string, avg?: number, spare?: number, need?: number}}
 */
function canSpareCpuForRoom() {
    const limit = (typeof Game !== 'undefined' && Game.cpu && Game.cpu.limit) || 20;
    const bucket = (typeof Game !== 'undefined' && Game.cpu && Game.cpu.bucket) || 0;
    const bucketMax = typeof BUCKET_MAX !== 'undefined' ? BUCKET_MAX : 10000;
    const rooms = (typeof MY_ROOMS !== 'undefined' && MY_ROOMS && MY_ROOMS.length) ? MY_ROOMS.length : 0;
    const avg = averageTickCpu();
    const newShare = (limit * 0.95) / Math.max(1, rooms + 1);
    const need = Math.max(8, limit * 0.12, newShare);
    const spare = limit - avg;

    if (bucket < bucketMax * 0.75) {
        return {ok: false, reason: `bucket ${bucket}`, avg, spare, need};
    }
    const tracking = typeof Memory !== 'undefined' ? Memory.cpuTracking : null;
    if (tracking && tracking.roomPenalty && tracking.roomPenalty + 50000 > Game.time) {
        return {ok: false, reason: 'cpu roomPenalty', avg, spare, need};
    }
    if (tracking && (tracking.bucketIssueCount || 0) >= 10) {
        return {ok: false, reason: `bucketIssues ${tracking.bucketIssueCount}`, avg, spare, need};
    }

    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) {
        for (let i = 0; i < MY_ROOMS.length; i++) {
            const room = Game.rooms[MY_ROOMS[i]];
            if (room && room.memory && room.memory.noRemote && room.memory.noRemote > Game.time) {
                return {ok: false, reason: `${room.name} remotes-off`, avg, spare, need};
            }
        }
    }

    const arrays = typeof ROOM_CPU_ARRAY !== 'undefined' ? ROOM_CPU_ARRAY : {};
    const currentShare = (limit * 0.95) / Math.max(1, rooms);
    let over = 0;
    let sampled = 0;
    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) {
        for (let i = 0; i < MY_ROOMS.length; i++) {
            const samples = arrays[MY_ROOMS[i]];
            if (!samples || samples.length < 10) continue;
            sampled++;
            let sum = 0;
            for (let j = 0; j < samples.length; j++) sum += samples[j];
            if (sum / samples.length > currentShare) over++;
        }
    }
    if (sampled && over / sampled >= 0.3) {
        return {ok: false, reason: `rooms over share ${over}/${sampled}`, avg, spare, need};
    }

    if (avg > limit - need) {
        return {ok: false, reason: `tick ${avg.toFixed(1)}/${limit} need ${need.toFixed(1)}`, avg, spare, need};
    }
    return {ok: true, avg, spare, need};
}

/**
 * Lighter CPU floor for launching military / auxiliary work.
 * Expansion's canSpareCpuForRoom() also fails on remotes-off, roomPenalty,
 * and rooms over share — those should not freeze a longbow raid.
 */
function canSpareCpuForMilitary() {
    const limit = (typeof Game !== 'undefined' && Game.cpu && Game.cpu.limit) || 20;
    const bucket = (typeof Game !== 'undefined' && Game.cpu && Game.cpu.bucket) || 0;
    const avg = averageTickCpu();
    const spare = limit - avg;

    if (bucket < MILITARY_BUCKET_MIN) {
        return {ok: false, reason: `bucket ${bucket}`, avg, spare};
    }
    if (avg > limit * MILITARY_CPU_RATIO) {
        return {ok: false, reason: `tick ${avg.toFixed(1)}/${limit}`, avg, spare};
    }
    return {ok: true, avg, spare};
}

function applyOperationLimits(state) {
    const readiness = getEmpireReadiness();
    const expandCpu = canSpareCpuForRoom();
    const milCpu = canSpareCpuForMilitary();
    readiness.cpuSpareRoom = expandCpu.ok;
    readiness.cpuReason = expandCpu.reason || null;
    readiness.tickCpuAvg = milCpu.avg;
    readiness.cpuSpare = milCpu.spare;
    readiness.militaryCpuOk = milCpu.ok;
    readiness.militaryCpuReason = milCpu.reason || null;
    state.EMPIRE_READINESS = readiness;
    // New military / aux ops use the light military CPU floor, not expansion's.
    state.ALLOW_NEW_OPS = !!(milCpu.ok && readiness.canLaunchOps);

    if (!readiness.canLaunchOps) {
        state.OPERATION_LIMIT = 0;
        state.SIEGE_LIMIT = 0;
        state.AUXILIARY_LIMIT = 0;
        state.OFFENSIVE_ALLOWED = false;
        return readiness;
    }

    const budgetScale = warBudgetScale(readiness.warBudget);
    // Full room offense (occupy / denial / siege). Harassment uses ALLOW_NEW_OPS only.
    state.OFFENSIVE_ALLOWED = milCpu.ok && !readiness.empireCritical && readiness.warBudget >= WAR_BUDGET_OFFENSE_MIN;

    if (readiness.empireCritical) {
        state.OPERATION_LIMIT = Math.max(1, Math.floor(readiness.weightedCombatReady * 0.25 * budgetScale));
        state.SIEGE_LIMIT = 0;
        state.AUXILIARY_LIMIT = auxiliaryLimit(readiness, true);
        return readiness;
    }

    if (readiness.empireStressed) {
        state.OPERATION_LIMIT = Math.max(1, Math.floor(readiness.weightedCombatReady * 0.35 * budgetScale));
        state.SIEGE_LIMIT = Math.max(0, Math.floor(readiness.weightedRcl7CombatReady * 0.12
            * readiness.siegeLimitMultiplier * budgetScale));
        state.AUXILIARY_LIMIT = auxiliaryLimit(readiness, true);
        return readiness;
    }

    state.OPERATION_LIMIT = Math.max(1, Math.ceil(readiness.weightedCombatReady * 0.7 * budgetScale));
    state.SIEGE_LIMIT = Math.max(0, Math.ceil(readiness.weightedRcl7CombatReady * 0.25
        * readiness.siegeLimitMultiplier * budgetScale));
    state.AUXILIARY_LIMIT = auxiliaryLimit(readiness, false);
    return readiness;
}

function getOpsPauseReason(readiness) {
    if (!readiness) readiness = getEmpireReadiness();
    if (!readiness.canLaunchOps) return `CR ${readiness.combatReady}/${readiness.minCombatReady}`;
    if (readiness.militaryCpuOk === false) return `cpu ${readiness.militaryCpuReason || 'tight'}`;
    return null;
}

function getOpsStressNote(readiness) {
    if (!readiness) readiness = getEmpireReadiness();
    if (!readiness.canLaunchOps) return null;
    const parts = [];
    if (readiness.empireCritical) parts.push(`critical ${readiness.struggling}/${readiness.total}`);
    else if (readiness.empireStressed) parts.push(`stressed ${readiness.struggling}/${readiness.total}`);
    if (readiness.militaryCpuOk === false) parts.push(`cpu ${readiness.militaryCpuReason || 'tight'}`);
    if (readiness.warBudget < WAR_BUDGET_OFFENSE_MIN) parts.push(`budget ${Math.round(readiness.warBudget)}`);
    else if (readiness.siegeLimitMultiplier < 1) {
        parts.push(`siege x${readiness.siegeLimitMultiplier.toFixed(1)}`);
    }
    return parts.length ? parts.join('; ') : null;
}

function empireOpsPaused(readiness) {
    if (!readiness) readiness = getEmpireReadiness();
    return !readiness.canLaunchOps;
}

module.exports = {
    OP_TIER,
    getEmpireReadiness,
    invalidateReadinessCache,
    applyOperationLimits,
    isLiveCombatReady,
    isLiveCombatReadyRaw,
    isLiveAuxReady,
    isRoomStruggling,
    isRoomReadyForTier,
    getOpTier,
    roomFlowStressed,
    roomMilitaryFlowSpare,
    roomStockpileRatio,
    getCombatReadyFailReason,
    recordSiegeCancellation,
    getOpsPauseReason,
    getOpsStressNote,
    empireOpsPaused,
    noteTickCpu,
    averageTickCpu,
    canSpareCpuForRoom,
    canSpareCpuForMilitary,
};