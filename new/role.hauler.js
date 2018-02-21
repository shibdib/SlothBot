/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    //INITIAL CHECKS
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) > creep.carryCapacity / 2) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        let mineralHauler = _.filter(Game.creeps, (creep) => creep.memory.mineralHauling && creep.memory.overlord === this.name);
        if (Game.getObjectById(creep.room.memory.mineralContainer) && _.sum(Game.getObjectById(creep.room.memory.mineralContainer)) > 1000 && (mineralHauler.length === 0 || creep.memory.mineralHauling)) {
            creep.memory.mineralHauling = true;
            let mineralContainer = Game.getObjectById(creep.room.memory.mineralContainer);
            for (const resourceType in mineralContainer.store) {
                if (creep.withdraw(mineralContainer, resourceType) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(mineralContainer);
                }
            }
            return null;
        }
        creep.memory.mineralHauling = undefined;
        if (creep.memory.energyDestination) {
            creep.withdrawEnergy();
        } else {
            creep.getEnergy();
            if (!creep.memory.energyDestination) {
                let energy = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (s) => s.amount > 100 && s.resourceType === RESOURCE_ENERGY});
                if (energy.length > 0) {
                    if (creep.pickup(energy[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(energy[0]);
                    }
                }
            }
        }
    } else {
        if (creep.memory.mineralHauling) {
            if (!creep.memory.terminalID) {
                let terminal = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL});
                if (terminal) {
                    creep.memory.terminalID = terminal.id;
                }
            }
            if (creep.memory.terminalID) {
                let terminal = Game.getObjectById(creep.memory.terminalID);
                if (terminal) {
                    if (_.sum(terminal.store) !== terminal.storeCapacity) {
                        for (const resourceType in creep.carry) {
                            if (creep.transfer(terminal, resourceType) === ERR_NOT_IN_RANGE) {
                                creep.shibMove(terminal);
                            }
                        }
                    } else {
                        let storage = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL});
                        if (storage && _.sum(storage.store) !== storage.storeCapacity) {
                            for (const resourceType in creep.carry) {
                                if (creep.transfer(storage, resourceType) === ERR_NOT_IN_RANGE) {
                                    creep.shibMove(storage);
                                }
                            }
                        }
                    }
                }
            }
            return null;
        }
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (!storageItem) {
                creep.memory.storageDestination = undefined;
                creep.findEssentials();
            }
            switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                case OK:
                    creep.memory.storageDestination = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    let opportunity = creep.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity});
                    if (opportunity.length > 0) creep.transfer(opportunity[0], RESOURCE_ENERGY);
                    creep.shibMove(storageItem);
                    break;
                case ERR_FULL:
                    creep.memory.storageDestination = undefined;
                    if (storageItem.memory) {
                        storageItem.memory.deliveryIncoming = undefined;
                    }
                    creep.findEssentials();
                    break;
            }
        } else {
            let spawn = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'spawn'), 'id');
            if (spawn.energy < 300) {
                if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(spawn);
                }
            } else if (!creep.findEssentials()) {
                creep.idleFor(10);
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'basicHaulerRole');
