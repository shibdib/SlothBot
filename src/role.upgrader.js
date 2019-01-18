/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (creep.tryToBoost(['upgrade']) || creep.wrongRoom()) return;
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) creep.memory.working = true;
    if (!creep.carry.energy) delete creep.memory.working;
    let container = Game.getObjectById(creep.room.memory.controllerContainer);
    if (creep.memory.working) {
        if (!creep.memory.onContainer) {
            if (container && !container.pos.checkForCreep() && creep.pos.getRangeTo(container) > 0) {
                return creep.shibMove(container, {range: 0});
            } else {
                creep.memory.onContainer = true;
            }
        }
        switch (creep.upgradeController(Game.rooms[creep.memory.overlord].controller)) {
            case OK:
                delete creep.memory._shibMove;
                return;
            case ERR_NOT_IN_RANGE:
                return creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
        }
    }
    if (creep.memory.energyDestination) {
        creep.withdrawEnergy();
    } else if (creep.room.memory.controllerContainer && (creep.room.controller.level >= 4 || Game.getObjectById(creep.room.memory.controllerContainer).store[RESOURCE_ENERGY])) {
        if (!container) return delete creep.room.memory.controllerContainer;
        if (creep.room.memory.controllerLink && Game.getObjectById(creep.room.memory.controllerLink).energy > 0) {
            creep.withdrawEnergy(Game.getObjectById(creep.room.memory.controllerLink));
        } else if (container.store[RESOURCE_ENERGY] > 0) {
            creep.withdrawEnergy(container);
        } else {
            creep.idleFor(5);
        }
    } else if (!creep.findEnergy(25)) {
        let source = creep.pos.getClosestSource();
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
    }
};