/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    //if (creep.renewalCheck(6)) return creep.shibMove(creep.pos.findClosestByRange(FIND_MY_SPAWNS));

    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    } else if (_.sum(creep.carry) === creep.carryCapacity || creep.memory.hauling === true) {
        creep.memory.hauling = true;
        depositMineral(creep);
    }
    if (creep.memory.hauling !== true) {
        if (creep.memory.extractor) {
            if (Game.getObjectById(creep.memory.extractor).cooldown) {
                creep.idleFor(Game.getObjectById(creep.memory.extractor).cooldown + 1)
            } else {
                let mineral;
                if (creep.memory.assignedMineral) {
                    mineral = Game.getObjectById(creep.memory.assignedMineral);
                }
                switch (creep.harvest(mineral)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(mineral);
                        break;
                    case ERR_NOT_FOUND:
                        mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
                        break;
                }
            }
        } else {
            creep.memory.extractor = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_EXTRACTOR}).id;
        }
    }
}
module.exports.role = profiler.registerFN(role, 'mineralHarvesterRole');

function depositMineral(creep) {
    let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    for (let resourceType in creep.carry) {
        switch (creep.transfer(storage, resourceType)) {
            case OK:
            case ERR_NOT_IN_RANGE:
                creep.shibMove(storage);
        }
    }
}