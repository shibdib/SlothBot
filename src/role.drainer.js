/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.memory.boostAttempt !== true) return creep.tryToBoost(['heal', 'tough']);
    creep.drainRoom();
};