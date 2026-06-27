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
    const flowStressed = energyInfo && typeof energyInfo.flowStressed === 'boolean'
        ? energyInfo.flowStressed
        : spareIncome < 0 || trend < -3;
    return {
        energyInfo,
        trend,
        spareIncome,
        trendOk: trend >= -3,
        flowHealthy: trend >= 0,
        flowStressed,
    };
}

function roomHasOperateExtensionOperator(roomName) {
    return _.some(Game.powerCreeps, c =>
        c.my &&
        c.memory.destinationRoom === roomName &&
        c.powers[PWR_OPERATE_EXTENSION]
    );
}

module.exports = {
    spawnEnergyState,
    getFlowContext,
    roomHasOperateExtensionOperator,
};