/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['heal']);
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    // Harass
    if (creep.memory.operation && creep.memory.operation === 'harass') creep.harassRoom();
    // Siege
    if (creep.memory.operation && creep.memory.operation === 'siege') creep.siegeRoom();
    if (creep.memory.operation && creep.memory.operation === 'siegeGroup') creep.siegeGroupRoom();
    // Hold
    if (creep.memory.operation && creep.memory.operation === 'hold') creep.holdRoom();
    // Remote Guard Squad
    let remoteGuardLeader = _.filter(Game.creeps, (c) => c.memory.overlord === creep.memory.overlord && c.memory.role === 'remoteGuard' && c.memory.squadLeader);
    if (!remoteGuardLeader.length) return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 18});
    if (!creep.healMyCreeps() && !creep.healAllyCreeps() && creep.pos.getRangeTo(remoteGuardLeader[0]) > 2) return creep.shibMove(remoteGuardLeader[0]);
};
