/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Constants and module-level caches for pathfinding.

 */


const DEFAULT_MAXOPS = 1500;

// Hostile / obstacle rooms often have a winding terrain tunnel. 1500 ops
// returns incomplete and the creep walks into the nearest wall instead.
const MAZE_MAXOPS = 12000;

const STATE_STUCK = 2;

const FLEE_RANGE = 4;


const MATRIX_CACHE = {};


const ROOM_BASE_MATRIX_CACHE = {};


const NO_RAMPART_CODE = [];


let routeSafetyCache = {};

module.exports = {

    DEFAULT_MAXOPS,

    MAZE_MAXOPS,

    STATE_STUCK,

    FLEE_RANGE,

    MATRIX_CACHE,


    ROOM_BASE_MATRIX_CACHE,

    NO_RAMPART_CODE,

    routeSafetyCache,

};