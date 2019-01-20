/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (!creep.memory.destination) return creep.suicide();
    creep.say(ICONS.haul2, true);
    //Invader detection
    if (creep.fleeHome()) return;
    // Check if empty
    if (_.sum(creep.carry) === 0) {
        creep.memory.storageDestination = undefined;
        creep.memory.hauling = undefined;
    }
    // Check if ready to haul
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) creep.memory.hauling = true;
    if (creep.memory.hauling) {
        if (creep.pos.roomName === creep.memory.overlord) {
            // If carrying minerals deposit in terminal or storage
            if (_.sum(creep.carry) > creep.carry[RESOURCE_ENERGY]) creep.memory.storageDestination = creep.room.terminal.id || creep.room.storage.id;
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                for (const resourceType in creep.carry) {
                    switch (creep.transfer(storageItem, resourceType)) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(storageItem);
                            break;
                        case ERR_FULL:
                            creep.memory.storageDestination = undefined;
                            break;
                    }
                }
            } else if (!creep.findEssentials() && !creep.findStorage() && !creep.findSpawnsExtensions()) creep.idleFor(5)
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Handle Moving
        if (creep.room.name !== creep.memory.destination) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22, offRoad: true});
        } else {
            let container = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= creep.carryCapacity * 0.5)[0];
            if (container) {
                for (const resourceType in container.store) {
                    if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(container, {offRoad: true});
                    }
                }
            } else if (_.filter(creep.room.droppedEnergy, (e) => e.amount >= 50)) {
                let dropped = _.max(creep.room.droppedEnergy, 'amount');
                if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(dropped, {offRoad: true});
                }
            } else {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22, offRoad: true});
            }
        }
    }
};
