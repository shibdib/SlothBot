/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Module-level mutable state for the room planner.
 */

const tickTracker = {};
const extensionPositionCache = {}; // module-level -- never hits Memory serialization
const dynamicLayoutCache = {}; // {extensions, corridors} per room

const quadTraps = {};
// Walkway ramparts are derived from the seal contour and must not live in
// ROOM_RAMPART_SPOTS (that set is the leak-seal / isInBunker ring).
const walkwayCache = {};

// Planner used tickLimit (500) as the abort line, so one min-cut pass or
// a tower reseat could spend 100+ CPU on a 100-limit shard.
const PLANNER_SOFT_BUDGET = 35;
const PLANNER_HARD_RESERVE = 50;

let plannerStartCpu = 0;
let plannerMinCuts = 0;
let plannerCpuTick = -1;

function beginPlannerCpu() {
    if (typeof Game === 'undefined' || !Game.cpu || !Game.cpu.getUsed) {
        plannerStartCpu = 0;
        plannerMinCuts = 0;
        plannerCpuTick = -1;
        return;
    }
    plannerStartCpu = Game.cpu.getUsed();
    plannerMinCuts = 0;
    plannerCpuTick = Game.time;
}

function plannerCpuSpent() {
    if (typeof Game === 'undefined' || !Game.cpu || !Game.cpu.getUsed) return 0;
    if (plannerCpuTick !== Game.time) return 0;
    return Game.cpu.getUsed() - plannerStartCpu;
}

function plannerShouldStop() {
    if (typeof Game === 'undefined' || !Game.cpu || !Game.cpu.getUsed) return false;
    const used = Game.cpu.getUsed();
    const tickLimit = Game.cpu.tickLimit || 500;
    const limit = Game.cpu.limit || 20;
    if (used > tickLimit - PLANNER_HARD_RESERVE) return true;
    if (plannerCpuTick === Game.time && plannerCpuSpent() > PLANNER_SOFT_BUDGET) return true;
    // Colonies already spent the GCL limit — skip non-critical planner (safeRun
    // still runs HUB/SPAWN/TOWERS). The old 12 CPU grace let global_perimeter
    // start a flood fill that ran to 40+ on a 400 CPU tick.
    if (used > limit) return true;
    return false;
}

function canAffordMinCut() {
    if (plannerShouldStop()) return false;
    if (typeof Game === 'undefined' || !Game.cpu || !Game.cpu.getUsed) return true;
    const used = Game.cpu.getUsed();
    const tickLimit = Game.cpu.tickLimit || 500;
    const limit = Game.cpu.limit || 20;
    if (used > tickLimit - PLANNER_HARD_RESERVE - 30) return false;
    if (used > limit * 0.85) return false;
    const maxCuts = used < limit * 0.5 ? 2 : 1;
    return plannerMinCuts < maxCuts;
}

function noteMinCut() {
    plannerMinCuts++;
}

module.exports = {
    tickTracker,
    extensionPositionCache,
    dynamicLayoutCache,
    quadTraps,
    walkwayCache,
    beginPlannerCpu,
    plannerCpuSpent,
    plannerShouldStop,
    canAffordMinCut,
    noteMinCut,
};
