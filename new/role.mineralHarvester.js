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
    if (!creep.memory.containerID) {
        creep.memory.containerID = mineralContainer(creep);
    }
    if (creep.memory.containerID) {
        creep.room.memory.mineralContainer = creep.memory.containerID;
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (_.sum(container.store) !== container.storeCapacity) {
                for (const resourceType in creep.carry) {
                    if (creep.transfer(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(container);
                    }
                }
            }
        }
    } else {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (!buildSite && creep.memory.containerBuilding !== true) {
            creep.harvesterContainerBuild();
        } else {
            creep.memory.containerBuilding = true;
        }
    }
}
depositMineral = profiler.registerFN(depositMineral, 'depositMineralWorkers');

function mineralContainer(creep) {
    let container = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] === 0});
    if (container) {
        if (container.pos.getRangeTo(Game.getObjectById(creep.memory.assignedMineral)) < 3) {
            if (creep.pos.getRangeTo(container) <= 1) {
                return container.id;
            } else {
                creep.shibMove(container);
                return container.id;
            }
        }
    } else if (creep.pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
    }
}