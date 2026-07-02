/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Empire-wide energy and combat readiness for operation gating.
 */

const STRESS_STRESSED_RATIO = 0.5;
const STRESS_CRITICAL_RATIO = 0.75;
const STOCKPILE_COMBAT_READY_RATIO = 0.8;
const FLOW_TREND_STRESS = -2;

function matureRoomLevel() {
    if (typeof MAX_LEVEL === 'undefined') return 4;
    return Math.max(4, MAX_LEVEL - 1);
}

function roomStockpileRatio(room) {
    const diag = room.memory.energyDiag;
    if (!diag || !diag.stockTarget) return 0;
    return (diag.stockEnergy || 0) / diag.stockTarget;
}

function roomHasCombatStockpile(room) {
    return room.level >= matureRoomLevel() && roomStockpileRatio(room) >= STOCKPILE_COMBAT_READY_RATIO;
}

function roomFlowStressed(room) {
    const ei = room.memory.energyInfo;
    if (!ei) return false;
    if ((room.energyState || 0) >= 2) return false;
    if (roomHasCombatStockpile(room)) return false;
    if (typeof ei.flowStressed === 'boolean') return ei.flowStressed;
    return ei.spareIncome < 0 || ei.trend < FLOW_TREND_STRESS;
}

function isLiveCombatReady(room) {
    if (room.level < matureRoomLevel()) return false;
    const energyState = room.energyState || 0;
    if (energyState >= 2) return true;
    if (energyState >= 1) {
        if (roomHasCombatStockpile(room)) return true;
        return !roomFlowStressed(room);
    }
    return false;
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

function getEmpireReadiness() {
    let total = 0;
    let combatReady = 0;
    let auxReady = 0;
    let rcl7CombatReady = 0;
    let struggling = 0;
    let invisible = 0;

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
            if (room.level >= 7) rcl7CombatReady++;
        }
        if (isLiveAuxReady(room)) auxReady++;

        if (isRoomStruggling(room)) struggling++;
    }

    const minCombatReady = 1;
    const canLaunchOps = combatReady >= minCombatReady;
    const strugglingRatio = total ? struggling / total : 0;
    const empireStressed = total > 0 && strugglingRatio >= STRESS_STRESSED_RATIO;
    const empireCritical = total > 0 && strugglingRatio >= STRESS_CRITICAL_RATIO;

    return {
        total,
        combatReady,
        auxReady,
        rcl7CombatReady,
        struggling,
        invisible,
        minCombatReady,
        canLaunchOps,
        strugglingRatio,
        empireStressed,
        empireCritical,
    };
}

function auxiliaryLimit(readiness, stressed) {
    if (readiness.auxReady <= 0) return 0;
    if (stressed) return 1;
    return Math.min(3, Math.max(1, readiness.auxReady));
}

function applyOperationLimits(state) {
    const readiness = getEmpireReadiness();
    state.EMPIRE_READINESS = readiness;

    if (!readiness.canLaunchOps) {
        state.OPERATION_LIMIT = 0;
        state.SIEGE_LIMIT = 0;
        state.AUXILIARY_LIMIT = 0;
        state.OFFENSIVE_ALLOWED = false;
        return readiness;
    }

    state.OFFENSIVE_ALLOWED = !readiness.empireCritical;

    if (readiness.empireCritical) {
        state.OPERATION_LIMIT = Math.max(1, Math.floor(readiness.combatReady * 0.25));
        state.SIEGE_LIMIT = 0;
        state.AUXILIARY_LIMIT = auxiliaryLimit(readiness, true);
        return readiness;
    }

    if (readiness.empireStressed) {
        state.OPERATION_LIMIT = Math.max(1, Math.floor(readiness.combatReady * 0.35));
        state.SIEGE_LIMIT = Math.max(0, Math.floor(readiness.rcl7CombatReady * 0.12));
        state.AUXILIARY_LIMIT = auxiliaryLimit(readiness, true);
        return readiness;
    }

    state.OPERATION_LIMIT = Math.ceil(readiness.combatReady * 0.7);
    state.SIEGE_LIMIT = Math.ceil(readiness.rcl7CombatReady * 0.25);
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
    if (readiness.empireCritical) return `critical ${readiness.struggling}/${readiness.total}`;
    if (readiness.empireStressed) return `stressed ${readiness.struggling}/${readiness.total}`;
    return null;
}

function empireOpsPaused(readiness) {
    if (!readiness) readiness = getEmpireReadiness();
    return !readiness.canLaunchOps;
}

module.exports = {
    getEmpireReadiness,
    applyOperationLimits,
    isLiveCombatReady,
    isLiveAuxReady,
    isRoomStruggling,
    roomFlowStressed,
    getOpsPauseReason,
    getOpsStressNote,
    empireOpsPaused,
};