/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (powerCreep) {
    // Handle renewal
    if (powerCreep.ticksToLive <= 4000) {
        console.log(232323)
        let closestSpawn = powerCreep.pos.findClosestByRange(FIND_MY_STRUCTURES, (s) => s.structureType === STRUCTURE_POWER_SPAWN);
        console.log(powerCreep.renew(closestSpawn))
    }
    powerCreep.moveTo(powerCreep.pos.findClosestByRange(FIND_STRUCTURES, (s) => s.structureType === STRUCTURE_CONTROLLER))
};