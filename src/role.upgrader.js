/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //INITIAL CHECKS
    if (!creep.carry.energy) delete creep.memory.working;
    if (creep.memory.working) if (creep.upgradeController(Game.rooms[creep.memory.overlord].controller) === ERR_NOT_IN_RANGE) return creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3}); else return;
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) return creep.memory.working = true;
    if (creep.tryToBoost(['upgrade']) || creep.wrongRoom()) return;
    if (!creep.memory.onContainer) {
        let container = Game.getObjectById(creep.room.memory.controllerContainer);
        if (container && !container.pos.checkForCreep() && creep.pos.getRangeTo(container) > 0) return creep.shibMove(container, {range: 0});
    } else creep.memory.onContainer = true;
    if (creep.memory.energyDestination) {
        creep.withdrawEnergy();
    } else if (creep.room.memory.controllerContainer) {
        let container = Game.getObjectById(creep.room.memory.controllerContainer);
        if (container.store[RESOURCE_ENERGY] > 0) {
            switch (creep.withdraw(container, RESOURCE_ENERGY)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(container);
            }
        } else if (creep.room.memory.controllerLink) {
            let link = Game.getObjectById(creep.room.memory.controllerLink);
            if (link && link.energy > 0) {
                switch (creep.withdraw(link, RESOURCE_ENERGY)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(link);
                }
            }
        } else {
            creep.idleFor(5);
        }
    } else if (!creep.findEnergy(25)) {
        let source = creep.pos.getClosestSource();
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
    }
};