/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Colony energy-flow helpers shared across spawn queue runners.
 */

function getFlowContext(room) {
    const energyInfo = room.memory.energyInfo;
    const trend = (energyInfo && energyInfo.trend) || 0;
    const spareIncome = (energyInfo && energyInfo.spareIncome) || 0;
    return {
        energyInfo,
        trend,
        spareIncome,
        trendOk: trend >= -3,
        flowHealthy: trend >= 0,
        flowStressed: spareIncome < 0 || trend < -3,
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
    getFlowContext,
    roomHasOperateExtensionOperator,
};