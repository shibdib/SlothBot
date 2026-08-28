/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Colony energy-flow helpers shared across spawn queue runners.
 */

/** Per-tick energy state cached by Colony before spawn queues run. */
function spawnEnergyState(room) {
    if (room && room._spawnEnergyState !== undefined) return room._spawnEnergyState;
    return room ? room.energyState : 0;
}

function getFlowContext(room) {
    const energyInfo = room.memory.energyInfo;
    const trend = (energyInfo && energyInfo.trend) || 0;
    const spareIncome = (energyInfo && energyInfo.spareIncome) || 0;
    const flowSpare = (energyInfo && typeof energyInfo.flowSpare === 'number')
        ? energyInfo.flowSpare
        : spareIncome + ((energyInfo && energyInfo.militarySpawnExpense) || 0);
    const flowStressed = energyInfo && typeof energyInfo.flowStressed === 'boolean'
        ? energyInfo.flowStressed
        : flowSpare < 0 || trend < -2;
    return {
        energyInfo,
        trend,
        spareIncome,
        flowSpare,
        trendOk: trend >= -2,
        flowHealthy: trend >= 0,
        flowStressed,
    };
}

/** Discretionary sinks (power, nuker, factory recipes, optional tower repair). */
function roomCanBurnSurplus(room) {
    const energyState = spawnEnergyState(room) || 0;
    if (energyState < 3) return false;
    const {spareIncome, flowStressed, trend} = getFlowContext(room);
    return !flowStressed && spareIncome >= 0 && trend >= 0;
}

function roomHasPositiveFlow(room) {
    const {spareIncome, flowStressed} = getFlowContext(room);
    return !flowStressed && spareIncome > 0;
}

module.exports = {
    spawnEnergyState,
    getFlowContext,
    roomCanBurnSurplus,
    roomHasPositiveFlow,
};