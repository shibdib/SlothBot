/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.tryToBoost(['tough', 'attack', 'ranged'])) return;
    if (creep.memory.operation === 'siege') return creep.siegeRoom();
    if (creep.memory.operation === 'siegeGroup') return creep.siegeGroupRoom();
};
