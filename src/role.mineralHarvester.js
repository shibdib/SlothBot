/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    if (creep.tryToBoost(['harvest'])) return;
    if (creep.wrongRoom()) return null;
    // Check if mineral depleted
    if (creep.memory.assignedMineral && Game.getObjectById(creep.memory.assignedMineral).mineralAmount === 0) {
        if (_.sum(creep.carry) > 0) {
            depositMineral(creep);
            return null;
        } else {
            log.a(creep.room.name + ' supply of ' + Game.getObjectById(creep.memory.assignedMineral).mineralType + ' has been depleted.');
            creep.memory.role = 'waller'
        }
    }
    if (_.sum(creep.carry) === 0) {
        creep.memory.hauling = false;
    } else if (_.sum(creep.carry) === creep.carryCapacity || creep.memory.hauling === true) {
        creep.memory.hauling = true;
        depositMineral(creep);
    }
    if (creep.memory.hauling !== true) {
        if (creep.memory.extractor) {
            if (Game.getObjectById(creep.memory.extractor).cooldown && Game.getObjectById(creep.memory.extractor).pos.rangeToTarget(creep) < 2) {
                creep.idleFor(Game.getObjectById(creep.memory.extractor).cooldown - 1)
            } else {
                let mineral = Game.getObjectById(creep.memory.assignedMineral);
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
    if (creep.room.memory.extractorContainer && Game.getObjectById(creep.room.memory.extractorContainer)) {
        for (let resourceType in creep.carry) {
            switch (creep.transfer(Game.getObjectById(creep.room.memory.extractorContainer), resourceType)) {
                case OK:
                    return creep.shibMove(Game.getObjectById(creep.room.memory.extractorContainer), {range: 0});
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(Game.getObjectById(creep.room.memory.extractorContainer), {range: 0});
            }
        }
    } else {
        let storage = creep.room.terminal;
        for (let resourceType in creep.carry) {
            switch (creep.transfer(storage, resourceType)) {
                case OK:
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(storage);
            }
        }
    }
}