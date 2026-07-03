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
    const diag = room.memory.energyDiag;
    if (!diag || !diag.stockTarget) return 0;
    return (diag.stockEnergy || 0) / diag.stockTarget;
}

function roomHasCombatStockpile(room) {
    return room.level >= matureRoomLevel() && roomStockpileRatio(room) >= STOCKPILE_COMBAT_READY_RATIO;
}

function roomMilitaryFlowSpare(room) {
    const ei = room.memory.energyInfo;
    if (!ei) return 0;
    if (typeof ei.flowSpare === 'number') return ei.flowSpare;
    const diag = room.memory.energyDiag;
    const military = diag && diag.militarySpawnExpense || 0;
    return (ei.spareIncome || 0) + military;
}

function roomFlowStressed(room) {
    const ei = room.memory.energyInfo;
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
    if (!room.memory.readinessSticky) room.memory.readinessSticky = {};
    const sticky = room.memory.readinessSticky;
    if (rawReady) {
        sticky.combatReady = true;
        sticky.until = Game.time + STICKY_CR_TTL;
        return true;
    }
    if (sticky.combatReady && sticky.until > Game.time && (room.energyState || 0) >= 1) return true;
    if (sticky.until <= Game.time) delete sticky.combatReady;
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
        return isLiveCombatReady(room) && room.level >= 7 && roomMilitaryFlowSpare(room) >= 0;
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
    if (!Memory._siegeCancelLog) Memory._siegeCancelLog = [];
    Memory._siegeCancelLog.push(Game.time);
    while (Memory._siegeCancelLog.length > 30) Memory._siegeCancelLog.shift();
    invalidateReadinessCache();
}

function getSiegeLimitMultiplier() {
    const log = Memory._siegeCancelLog || [];
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

function applyOperationLimits(state) {
    const readiness = getEmpireReadiness(true);
    state.EMPIRE_READINESS = readiness;

    if (!readiness.canLaunchOps) {
        state.OPERATION_LIMIT = 0;
        state.SIEGE_LIMIT = 0;
        state.AUXILIARY_LIMIT = 0;
        state.OFFENSIVE_ALLOWED = false;
        return readiness;
    }

    const budgetScale = warBudgetScale(readiness.warBudget);
    state.OFFENSIVE_ALLOWED = !readiness.empireCritical && readiness.warBudget >= WAR_BUDGET_OFFENSE_MIN;

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
    return null;
}

function getOpsStressNote(readiness) {
    if (!readiness) readiness = getEmpireReadiness();
    if (!readiness.canLaunchOps) return null;
    const parts = [];
    if (readiness.empireCritical) parts.push(`critical ${readiness.struggling}/${readiness.total}`);
    else if (readiness.empireStressed) parts.push(`stressed ${readiness.struggling}/${readiness.total}`);
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
};