/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * High command tick orchestration.

 */


const state = require('hcState');

const {militaryOperations} = require('hcMilitaryOps');

const {auxiliaryOperations} = require('hcAuxiliaryOps');

const {manageResponseForces} = require('hcResponse');

const {manageMilitary} = require('hcManageMilitary');

const {manageAuxiliary} = require('hcManageAuxiliary');

const {manualAttacks} = require('hcFlags');

const {autoNuke, offensiveNuke} = require('hcNukes');

const {applyOperationLimits} = require('hcReadiness');


function getCooldown(task) {
    switch (task) {
        case 'housekeeping':
            return 10000;
        case 'flags':
            return 25;
        case 'military':
            return 50;
        case 'auxiliary':
            return 100;
        case 'response':
            return 5;
        case 'nukes':
            return 500;
        default:
            return 100;
    }
}

function checkCooldown(task, cooldown) {
    if (!state.lastRun[task] || state.lastRun[task] + cooldown < Game.time) {
        state.lastRun[task] = Game.time;
        return true;
    }
    return false;
}


function highCommand() {

    if (typeof MAX_LEVEL === 'undefined') return;

    // Ensure op containers exist early (housekeeping is on long cooldown; many direct accesses assume objects)
    if (!Memory.targetRooms) Memory.targetRooms = {};
    if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};

    const readiness = applyOperationLimits(state);
    if (!readiness.canLaunchOps && state.lastNoSiegeWarning + 5000 < Game.time) {
        state.lastNoSiegeWarning = Game.time;
        log.a(`Operations paused — ${readiness.combatReady}/${readiness.total} combat-ready (need ${readiness.minCombatReady}).`, 'HIGH COMMAND: ');
    } else if (readiness.empireCritical && state.lastNoSiegeWarning + 5000 < Game.time) {
        state.lastNoSiegeWarning = Game.time;
        log.a(`Operations throttled — ${readiness.struggling}/${readiness.total} energy-critical (${Math.round(readiness.strugglingRatio * 100)}%).`, 'HIGH COMMAND: ');
    }

    const sinceReset = (global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99);

    if (global.isPostResetDangerWindow && global.isPostResetDangerWindow()) {
        return;  // defer ALL highCommand during post-reset danger window
    }

    for (const task of state.tasks) {
        if (sinceReset < 6) {
            // Spread high-CPU tasks (military/aux/response planning, flag processing, etc.)
            // over the first ~5 ticks after reset. On reset all lastRun are cleared and
            // many other systems are also cold, causing bucket/CPU limit hits.
            const stagger = (task.charCodeAt(0) || 0) % 5;
            if (sinceReset !== stagger) continue;
        }

        if (!checkCooldown(task, getCooldown(task))) continue;

        switch (task) {
            case 'housekeeping':
                if (!Memory.nonCombatRooms) Memory.nonCombatRooms = [];
                if (!Memory.targetRooms) Memory.targetRooms = {};
                if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};
                break;

            case 'flags':
                if (_.size(Game.flags)) manualAttacks();
                break;

            case 'military':
                militaryOperations();
                manageMilitary();
                break;

            case 'auxiliary':
                auxiliaryOperations();
                manageAuxiliary();
                break;

            case 'response':
                manageResponseForces();
                break;

            case 'nukes':
                if (!autoNuke()) offensiveNuke();
                break;
        }
    }

}

module.exports = {

    highCommand,

};