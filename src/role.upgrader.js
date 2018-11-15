/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (!creep.carry.energy) delete creep.memory.working;
    if (creep.memory.working) {
        switch (creep.upgradeController(Game.rooms[creep.memory.overlord].controller)) {
            case OK:
                delete creep.memory._shibMove;
                return;
            case ERR_NOT_IN_RANGE:
                return creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
        }
    }
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) return creep.memory.working = true;
    if (creep.tryToBoost(['upgrade']) || creep.wrongRoom()) return;
    if (creep.memory.energyDestination) {
        creep.withdrawEnergy();
        creep.upgradeController(Game.rooms[creep.memory.overlord].controller)
    } else if (creep.room.memory.controllerContainer && (creep.room.controller.level >= 4 || Game.getObjectById(creep.room.memory.controllerContainer).store[RESOURCE_ENERGY])) {
        let container = Game.getObjectById(creep.room.memory.controllerContainer);
        if (!container) return delete creep.room.memory.controllerContainer;
        if (!creep.memory.onContainer) {
            if (container && !container.pos.checkForCreep() && creep.pos.getRangeTo(container) > 0) return creep.shibMove(container, {range: 0});
        } else creep.memory.onContainer = true;
        if (creep.room.memory.controllerLink && Game.getObjectById(creep.room.memory.controllerLink).energy > 0) {
            switch (creep.withdraw(Game.getObjectById(creep.room.memory.controllerLink), RESOURCE_ENERGY)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(Game.getObjectById(creep.room.memory.controllerLink));
            }
        } else if (container.store[RESOURCE_ENERGY] > 0) {
            switch (creep.withdraw(container, RESOURCE_ENERGY)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(container);
            }
        } else {
            creep.idleFor(5);
        }
    } else if (!creep.findEnergy(25)) {
        let source = creep.pos.getClosestSource();
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
    }
};