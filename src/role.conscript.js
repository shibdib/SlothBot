/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['ranged']);
    // Conscripts
    if (creep.memory.operation === 'conscripts') creep.conscriptsRoom();
}
