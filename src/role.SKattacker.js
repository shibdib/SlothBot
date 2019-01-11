/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.memory.boostAttempt !== true) return creep.tryToBoost(['attack']);
    let SKSupport = Game.getObjectById(creep.memory.support) || _.filter(Game.creeps, (c) => c.memory.role && c.memory.role === 'SKsupport' && c.memory.destination === creep.memory.destination)[0];
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (!SKSupport) {
        creep.memory.support = undefined;
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
    }
    if (creep.room.name === creep.memory.destination) {
        let sourceKeeper = creep.pos.findClosestByRange(creep.room.creeps, {filter: (c) => c.owner.username === 'Source Keeper'});
        if (sourceKeeper) {
            switch (creep.attack(sourceKeeper)) {
                case ERR_NOT_IN_RANGE:
                    if (SKSupport.pos.getRangeTo(creep) <= 3) creep.shibMove(sourceKeeper, {
                        movingTarget: true,
                        ignoreCreeps: false
                    });
                    break;
                case ERR_NO_BODYPART:
                    break;
                default:
            }
        } else {
            let lair = _.min(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR), 'ticksToSpawn');
            creep.shibMove(lair, {range: 2});
        }
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    }
};