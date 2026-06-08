/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Empire-wide energy and combat readiness for operation gating.
 */

function getEmpireReadiness() {
    let total = 0;
    let combatReady = 0;
    let auxReady = 0;
    let rcl7CombatReady = 0;
    let struggling = 0;

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room || !room.controller || !room.controller.my) continue;
        total++;

        if (room.memory.combatReady) {
            combatReady++;
            if (room.level >= 7) rcl7CombatReady++;
        }
        if (room.memory.auxilaryReady) auxReady++;

        const ei = room.memory.energyInfo;
        const flowStressed = ei && (ei.spareIncome < 0 || ei.trend < -3);
        if (!room.energyState || room.energyState < 2 || flowStressed) struggling++;
    }

    const minCombatReady = Math.max(1, Math.ceil(total * 0.25));
    const canLaunchOps = combatReady >= minCombatReady;
    const strugglingRatio = total ? struggling / total : 0;
    const empireStressed = total > 0 && struggling >= Math.ceil(total * 0.4);
    const empireCritical = total > 0 && struggling >= Math.ceil(total * 0.6);

    return {
        total,
        combatReady,
        auxReady,
        rcl7CombatReady,
        struggling,
        minCombatReady,
        canLaunchOps,
        strugglingRatio,
        empireStressed,
        empireCritical,
    };
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
        state.AUXILIARY_LIMIT = 1;
        return readiness;
    }

    state.OPERATION_LIMIT = Math.ceil(readiness.combatReady * 0.7);
    state.SIEGE_LIMIT = Math.ceil(readiness.rcl7CombatReady * 0.25);
    state.AUXILIARY_LIMIT = 3;
    return readiness;
}

module.exports = {
    getEmpireReadiness,
    applyOperationLimits,
};