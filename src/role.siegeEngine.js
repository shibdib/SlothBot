/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.tryToBoost(['heal', 'ranged'])) return;
    return creep.siegeGroupRoom();
};
