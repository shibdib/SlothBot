/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Colony energy-flow helpers shared across spawn queue runners.
 */

/** Energy/tick we try to keep as net surplus even at energyState 3. */
const ENERGY_ACCRUAL_FLOOR = 10;

/** Controller-link WORK feed while RCL < 8 and the room is below target. */
const UPGRADER_FEED_WORK_POOR = 5;
const UPGRADER_FEED_WORK_RECOVERING = 12;

/**
 * WORK the controller link will actually feed. Undefined = no cap (RCL8 or
 * energyState 2+). Matches scaledControllerTarget in linkController.
 */
function upgraderFeedWorkCap(room) {
    const rcl = (room && room.controller && room.controller.level) || (room && room.level) || 0;
    if (rcl >= 8) return;
    const state = (room && room.energyState) || 0;
    if (state <= 0) return UPGRADER_FEED_WORK_POOR;
    if (state === 1) return UPGRADER_FEED_WORK_RECOVERING;
}

/** Per-tick energy state cached by Colony before spawn queues run. */
function spawnEnergyState(room) {
    if (room && room._spawnEnergyState !== undefined) return room._spawnEnergyState;
    return room ? room.energyState : 0;
}

function getFlowContext(room) {
    const energyInfo = room.energyInfo;
    const trend = (energyInfo && energyInfo.trend) || 0;
    const spareIncome = (energyInfo && energyInfo.spareIncome) || 0;
    const flowSpare = (energyInfo && typeof energyInfo.flowSpare === 'number')
        ? energyInfo.flowSpare
        : spareIncome + ((energyInfo && energyInfo.militarySpawnExpense) || 0);
    const flowStressed = energyInfo && typeof energyInfo.flowStressed === 'boolean'
        ? energyInfo.flowStressed
        : spareIncome < ENERGY_ACCRUAL_FLOOR || trend < -2;
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

/** Discretionary sinks (nuker, factory recipes, optional tower repair). */
function roomCanBurnSurplus(room) {
    const energyState = spawnEnergyState(room) || 0;
    if (energyState < 3) return false;
    const {spareIncome, flowStressed, trend} = getFlowContext(room);
    return !flowStressed && spareIncome >= ENERGY_ACCRUAL_FLOOR && trend >= 0;
}

/** Power processing is 50 energy/tick and is counted in spareIncome. */
function roomCanProcessPower(room) {
    const energyState = spawnEnergyState(room) || 0;
    if (energyState < 2) return false;
    const {flowStressed, spareIncome} = getFlowContext(room);
    if (flowStressed) return false;
    return spareIncome >= ENERGY_ACCRUAL_FLOOR;
}

function roomHasPositiveFlow(room) {
    const {spareIncome, flowStressed} = getFlowContext(room);
    return !flowStressed && spareIncome >= ENERGY_ACCRUAL_FLOOR;
}

function noteNukerEnergyDeposit(dest, resource, amount) {
    if (resource && resource !== RESOURCE_ENERGY) return;
    if (!dest || dest.structureType !== STRUCTURE_NUKER) return;
    if (!(amount > 0)) return;
    if (global.bumpEnergyExpense) global.bumpEnergyExpense('nuke', dest.room.name, amount);
}

module.exports = {
    ENERGY_ACCRUAL_FLOOR,
    UPGRADER_FEED_WORK_POOR,
    UPGRADER_FEED_WORK_RECOVERING,
    upgraderFeedWorkCap,
    spawnEnergyState,
    getFlowContext,
    roomCanBurnSurplus,
    roomCanProcessPower,
    roomHasPositiveFlow,
    noteNukerEnergyDeposit,
};