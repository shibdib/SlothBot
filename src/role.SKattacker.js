/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.memory.boostAttempt !== true) return creep.tryToBoost(['attack']);
    if (creep.renewalCheck(5)) return null;
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (!creep.memory.destination) creep.memory.destination = shuffle(creep.memory.misc)[0];
    if (creep.room.name === creep.memory.destination) {
        if (!creep.memory.misc) creep.memory.misc = Game.rooms[creep.memory.overlord].memory.skRooms;
        let mineral = creep.room.mineral[0];
        let mineralKeeper = mineral.pos.findInRange(creep.room.creeps, 6, {filter: (c) => c.owner.username === 'Source Keeper'})[0];
        if (mineralKeeper) {
            switch (creep.attack(mineralKeeper)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(mineralKeeper, {movingTarget: true, ignoreCreeps: false});
                    break;
                case ERR_NO_BODYPART:
                    break;
                default:
            }
        } else {
            creep.memory.destination = shuffle(creep.memory.misc)[0];
        }
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
    }
};