/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.pos.roomName === creep.memory.overlord) {
        delete creep.memory.destinationReached;
    } else if (creep.pos.roomName === Game.flags[creep.memory.destination].pos.roomName) {
        creep.memory.destinationReached = true;
    }
    //INITIAL CHECKS
    creep.wrongRoom();
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.hauling === false) {
        if (creep.memory.storage) {
            if (creep.withdraw(Game.getObjectById(creep.memory.storage), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.shibMove(Game.getObjectById(creep.memory.storage));
            }
        } else if (!creep.memory.storage) {
            let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
            if (storage.length > 0) {
                creep.memory.storage = storage[0];
            } else {
                creep.memory.storage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE}).id;
            }
        }
    } else {
        if (creep.memory.destinationReached !== true) {
            creep.shibMove(Game.flags[creep.memory.destination]);
        } else {
            if (creep.memory.deliveryStorage) {
                if (creep.transfer(Game.getObjectById(creep.memory.deliveryStorage), RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(Game.getObjectById(creep.memory.deliveryStorage));
                }
            } else if (!creep.memory.deliveryStorage) {
                let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
                if (storage.length > 0) {
                    creep.memory.deliveryStorage = storage[0];
                } else {
                    creep.memory.deliveryStorage = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE}).id;
                }
                if (!creep.memory.deliveryStorage) {
                    creep.findEssentials();
                }
            }
        }
    }
};
