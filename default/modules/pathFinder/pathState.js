/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Constants and module-level caches for pathfinding.

 */


const DEFAULT_MAXOPS = 1500;

const STATE_STUCK = 2;

const FLEE_RANGE = 4;


const MATRIX_CACHE = {};


const ROOM_BASE_MATRIX_CACHE = {};


const NO_RAMPART_CODE = [];


let routeSafetyCache = {};

module.exports = {

    DEFAULT_MAXOPS,

    STATE_STUCK,

    FLEE_RANGE,

    MATRIX_CACHE,


    ROOM_BASE_MATRIX_CACHE,

    NO_RAMPART_CODE,

    routeSafetyCache,

};