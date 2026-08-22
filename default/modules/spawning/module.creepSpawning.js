/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Facade for the spawn queue subsystem. Implementation lives in ./spawning/.
 */

module.exports.processBuildQueue = require('spawnBuild').processBuildQueue;
module.exports.essentialCreepQueue = require('spawnEssential').essentialCreepQueue;
module.exports.miscCreepQueue = require('spawnMisc').miscCreepQueue;
module.exports.remoteCreepQueue = require('spawnRemote').remoteCreepQueue;
module.exports.globalCreepQueue = require('spawnGlobal').globalCreepQueue;
module.exports.resolvePendingAssignments = require('spawnOperations').resolvePendingAssignments;