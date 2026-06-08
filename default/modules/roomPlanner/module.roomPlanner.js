/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Facade for the room planner subsystem. Implementation lives in ./roomPlanner/.
 */

module.exports.buildRoom = require('planBuild').buildRoom;
module.exports.hubCheck = require('planHub').hubCheck;
module.exports.findHub = require('planHub').findHub;