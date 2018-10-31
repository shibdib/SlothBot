/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul2, true);
    if (!creep.memory.arrived) {
        if (!creep.isFull) {
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
            } else {
                creep.findEnergy();
            }
        } else {
            if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
            creep.memory.arrived = true;
        }
    } else {
        if (!_.sum(creep.carry)) {
            creep.drop(RESOURCE_ENERGY);
            creep.memory.recycle = true;
        }
        creep.shibMove(Game.rooms[creep.memory.destination].controller);
    }
};
