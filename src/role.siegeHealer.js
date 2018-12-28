/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['heal', 'tough']);
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    creep.siegeRoom();
};
