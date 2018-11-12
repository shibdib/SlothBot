/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (Game.time % 150 === 0 && creep.wrongRoom()) return null;
    creep.say(ICONS.haul, true);
    // If hauling do things
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.5) creep.memory.hauling = true;
    if (!_.sum(creep.carry)) creep.memory.hauling = undefined;
    if (creep.memory.hauling) {
        // Hub Container
        let hubContainer = Game.getObjectById(creep.room.memory.hubContainer) || creep.room.storage || _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
        if (hubContainer) {
            if (_.sum(hubContainer.store) === hubContainer.storeCapacity) return creep.idleFor(10);
            let storageItem = hubContainer;
            if (!storageItem) return delete creep.memory.storageDestination;
            switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                case OK:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(storageItem);
                    break;
                case ERR_FULL || ERR_INVALID_TARGET:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    if (storageItem.memory) delete storageItem.memory.deliveryIncoming;
                    break;
            }
        }
    } else if (creep.memory.energyDestination || creep.fillerEnergy()) creep.withdrawEnergy(); else creep.idleFor(5);
};