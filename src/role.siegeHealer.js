/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.tryToBoost(['heal', 'tough'])) return;
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    creep.siegeRoom();
};
