/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Empire-wide energy and combat readiness for operation gating.
 */

function matureRoomLevel() {
    if (typeof MAX_LEVEL === 'undefined') return 4;
    return Math.max(4, MAX_LEVEL - 1);
}

function roomFlowStressed(room) {
    const ei = room.memory.energyInfo;
    if (!ei) return false;
    // A room at/above its stock target can absorb transient negative income (military spend, etc.)
    if ((room.energyState || 0) >= 2) return false;
    if (typeof ei.flowStressed === 'boolean') return ei.flowStressed;
    return ei.spareIncome < 0 || ei.trend < -3;
}

function isLiveCombatReady(room) {
    if (room.level < matureRoomLevel()) return false;
    const energyState = room.energyState || 0;
    if (energyState >= 2) return true;
    // RCL8 still stockpiling: need a modest buffer plus healthy income
    if (room.level === 8) return energyState >= 1 && !roomFlowStressed(room);
    return false;
}

function isLiveAuxReady(room) {
    if (room.level < matureRoomLevel()) return false;
    const energyState = room.energyState || 0;
    if (energyState >= 1) return true;
    return room.level === 8 && !roomFlowStressed(room);
}

function isRoomStruggling(room) {
    return !isLiveCombatReady(room) && (room.energyState || 0) < 1;
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
            total++;
            struggling++;
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

    const minCombatReady = Math.max(1, Math.ceil(total * 0.25));
    const canLaunchOps = combatReady >= minCombatReady;
    const strugglingRatio = total ? struggling / total : 0;
    const empireStressed = total > 0 && strugglingRatio >= 0.4;
    const empireCritical = total > 0 && strugglingRatio >= 0.6;

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

    if (!readiness.canLaunchOps || readiness.empireCritical) {
        state.OPERATION_LIMIT = 0;
        state.SIEGE_LIMIT = 0;
        state.AUXILIARY_LIMIT = 0;
        state.OFFENSIVE_ALLOWED = false;
        return readiness;
    }

    state.OFFENSIVE_ALLOWED = true;

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
    const reasons = [];
    if (!readiness.canLaunchOps) reasons.push(`CR ${readiness.combatReady}/${readiness.minCombatReady}`);
    if (readiness.empireCritical) reasons.push(`stress ${readiness.struggling}/${readiness.total}`);
    return reasons.length ? reasons.join('; ') : null;
}

function empireOpsPaused(readiness) {
    if (!readiness) readiness = getEmpireReadiness();
    return !readiness.canLaunchOps || readiness.empireCritical;
}

module.exports = {
    getEmpireReadiness,
    applyOperationLimits,
    isLiveCombatReady,
    isLiveAuxReady,
    isRoomStruggling,
    roomFlowStressed,
    getOpsPauseReason,
    empireOpsPaused,
};