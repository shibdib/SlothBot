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
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['build']);
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    if (creep.carry.energy === 0) creep.memory.working = null;
    if (creep.isFull) {
        creep.memory.working = true;
        delete creep.memory.deliveryRequestTime;
        delete creep.memory.deliveryIncoming;
    }
    if (!creep.getSafe()) {
        if (creep.memory.working === true) {
            if (!creep.memory.constructionSite || !Game.getObjectById(creep.memory.constructionSite)) creep.findConstruction();
            if (creep.memory.task === 'build' && creep.room.memory.responseNeeded !== true) {
                let construction = Game.getObjectById(creep.memory.constructionSite);
                switch (creep.build(construction)) {
                    case OK:
                        return null;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(construction, {range: 3});
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        delete creep.memory.constructionSite;
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
                }
            }
        } else {
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
            } else {
                creep.findEnergy();
                if (!creep.memory.energyDestination) {
                    let source = creep.pos.getClosestSource();
                    if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
                }
            }
        }
    }
}
module.exports.role = profiler.registerFN(role, 'workerRole');

function deliveryManagement(creep) {
    if (!creep.findEnergy(6)) {
        if (creep.memory.deliveryRequestTime) {
            if (creep.memory.deliveryRequestTime < Game.time - 100) {
                delete creep.memory.deliveryRequestTime;
                return true;
            }
            if (creep.memory.deliveryRequestTime < Game.time - 15) {
                if (creep.memory.deliveryRequestTime < Game.time - 30) {
                    creep.memory.deliveryIncoming = false;
                }
                return creep.memory.deliveryIncoming;
            }
            return true;
        } else {
            creep.memory.deliveryRequestTime = Game.time;
            return true;
        }
    }
    return false;
}