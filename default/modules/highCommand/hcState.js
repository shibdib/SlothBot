/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Module-level operation limits and task scheduling state.

 */


let OPERATION_LIMIT;

let SIEGE_LIMIT;

let AUXILIARY_LIMIT;

let OFFENSIVE_ALLOWED;

let EMPIRE_READINESS;

let ALLOW_NEW_OPS = true;

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

    get AUXILIARY_LIMIT() {
        return AUXILIARY_LIMIT;
    },

    set AUXILIARY_LIMIT(v) {
        AUXILIARY_LIMIT = v;
    },

    get OFFENSIVE_ALLOWED() {
        return OFFENSIVE_ALLOWED;
    },

    set OFFENSIVE_ALLOWED(v) {
        OFFENSIVE_ALLOWED = v;
    },

    get EMPIRE_READINESS() {
        return EMPIRE_READINESS;
    },

    set EMPIRE_READINESS(v) {
        EMPIRE_READINESS = v;
    },

    get ALLOW_NEW_OPS() {
        return ALLOW_NEW_OPS !== false;
    },

    set ALLOW_NEW_OPS(v) {
        ALLOW_NEW_OPS = !!v;
    },

    lastNoSiegeWarning,

    lastRun,

    tasks,

};