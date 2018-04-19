/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');


/**
 * @return {null}
 */
function role(creep) {
    //INITIAL CHECKS
    if (creep.room.memory.responseNeeded && creep.room.memory.threatLevel > 2 && creep.room.memory.tickDetected + 100 < Game.time) creep.suicide();
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['build']);
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    if (creep.carry.energy === 0) creep.memory.working = null;
    if (creep.isFull) creep.memory.working = true;
        if (creep.memory.working === true) {
            creep.memory.source = undefined;
            if (!creep.memory.constructionSite || !Game.getObjectById(creep.memory.constructionSite)) {
                creep.memory.constructionSite = undefined;
                creep.memory.task = undefined;
                creep.findConstruction();
            }
            if (creep.memory.task === 'build') {
                let construction = Game.getObjectById(creep.memory.constructionSite);
                switch (creep.build(construction)) {
                    case OK:
                        return null;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(construction, {range: 3});
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                    case ERR_INVALID_TARGET:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                }
            } else {
                creep.findRepair(creep.room.controller.level);
                if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
                    let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
                    switch (creep.repair(repairNeeded)) {
                        case OK:
                            return null;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(repairNeeded, {range: 3});
                            break;
                        case ERR_RCL_NOT_ENOUGH:
                            delete creep.memory.constructionSite;
                    }
                } else if (creep.upgradeController(Game.rooms[creep.memory.overlord].controller) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(Game.rooms[creep.memory.overlord].controller);
                    creep.memory.constructionSite = undefined;
                    creep.memory.task = undefined;
                }
            }
        } else {
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
            } else {
                if (!creep.findEnergy()) {
                    if (!creep.memory.energyDestination && !creep.memory.source) {
                        let source = creep.pos.getClosestSource();
                        if (source) creep.memory.source = source.id;
                    } else if (creep.memory.source) {
                        let source = Game.getObjectById(creep.memory.source);
                        if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
                    }
                }
            }
        }
    }
module.exports.role = profiler.registerFN(role, 'workerRole');