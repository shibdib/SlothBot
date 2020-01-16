/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (Game.time % 150 === 0 && creep.wrongRoom()) return;
    creep.say(ICONS.haul, true);
    // If hauling do things
    if (creep.isFull) creep.memory.hauling = true;
    if (!_.sum(creep.store)) creep.memory.hauling = undefined;
    if (creep.memory.hauling) {
        if (creep.memory.storageDestination || expedite(creep)) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (!storageItem) return delete creep.memory.storageDestination;
            switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                case OK:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    if (storageItem.memory) delete storageItem.memory.assignedExpediter;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(storageItem);
                    break;
                case ERR_FULL || ERR_INVALID_TARGET:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    if (storageItem.memory) delete storageItem.memory.assignedExpediter;
                    break;
            }
        } else creep.idleFor(5);
    } else if (creep.memory.energyDestination || creep.locateEnergy()) creep.withdrawResource(); else creep.idleFor(5);
};

function expedite(creep) {
    let needsExpediter = _.filter(creep.room.creeps, (c) => c.my && c.memory.needExpediter && !c.memory.assignedExpediter)[0];
    if (needsExpediter) {
        creep.memory.storageDestination = needsExpediter.id;
        needsExpediter.memory.assignedExpediter = creep.id;
    } else {
        creep.haulerDelivery();
    }
}