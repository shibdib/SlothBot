/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul, true);
    if (creep.towTruck()) return true;
    // If hauling do things
    if (_.sum(creep.store)) {
        if (_.sum(creep.store) > creep.store[RESOURCE_ENERGY]) {
            let storageItem = creep.room.storage || _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity() >= CONTAINER_CAPACITY * 0.5)[0]
            for (const resourceType in creep.store) {
                if (resourceType === RESOURCE_ENERGY) continue;
                if (!storageItem) return creep.drop(resourceType);
                switch (creep.transfer(storageItem, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storageItem);
                        break;
                }
            }
        } else {
            creep.opportunisticFill();
            // If we have an energy state and a storage, store in the controller container. Otherwise store in storage.
            if (!creep.memory.storageDestination) {
                let controllerContainer = Game.getObjectById(creep.room.memory.controllerContainer);
                if (creep.room.storage && creep.room.energyState > 1 && controllerContainer && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 100) creep.memory.storageDestination = controllerContainer.id;
                else if (creep.room.storage) creep.memory.storageDestination = creep.room.storage.id;
            }
            if (!creep.haulerDelivery()) creep.idleFor(5)
        }
    } else {
        if (!creep.memory.cooldown && (creep.memory.energyDestination || creep.locateEnergy())) {
            creep.withdrawResource()
        } else {
            creep.memory.cooldown = undefined;
            creep.idleFor(10)
        }
    }
};