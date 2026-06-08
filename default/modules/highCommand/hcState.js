/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Module-level operation limits and task scheduling state.

 */


let OPERATION_LIMIT;

let SIEGE_LIMIT;

let lastNoSiegeWarning = 0;

const lastRun = {};

const tasks = ['housekeeping', 'flags', 'military', 'auxiliary', 'response', 'nukes'];

module.exports = {

    get OPERATION_LIMIT() {
        return OPERATION_LIMIT;
    },

    set OPERATION_LIMIT(v) {
        OPERATION_LIMIT = v;
    },

    get SIEGE_LIMIT() {
        return SIEGE_LIMIT;
    },

    set SIEGE_LIMIT(v) {
        SIEGE_LIMIT = v;
    },

    lastNoSiegeWarning,

    lastRun,

    tasks,

};