/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul2, true);
    if (creep.room.name !== creep.memory.destination) {
        if (!creep.isFull) {
            if (creep.room.name === creep.memory.overlord) {
                if (creep.ticksToLive < 500) return creep.memory.recycle = true;
                if (creep.memory.energyDestination) {
                    creep.withdrawEnergy();
                } else {
                    creep.findEnergy();
                }
            } else {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 22});
            }
        } else {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
        }
    } else {
        if (!_.sum(creep.carry)) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 22});
        }
        let dropPoint = Game.getObjectById(creep.room.memory.controllerContainer) || creep.room.storage;
        if (dropPoint) {
            switch (creep.transfer(dropPoint, RESOURCE_ENERGY)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(dropPoint);
            }
        } else {
            creep.shibMove(Game.rooms[creep.memory.destination].controller);
        }
    }
};
