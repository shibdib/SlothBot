/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.respond, true);
    if (creep.tryToBoost(['attack'])) return;
    if (!creep.handleMilitaryCreep(false, true, true)) {
        if (!creep.room.memory.responseNeeded) creep.memory.recycle = true;
        findDefensivePosition(creep, creep);
    }
};

function findDefensivePosition(creep, target) {
    if (target) {
        if (!creep.memory.assignedRampart) {
            let bestRampart = target.pos.findClosestByPath(creep.room.structures, {filter: (r) => r.structureType === STRUCTURE_RAMPART && !r.pos.checkForObstacleStructure() && !r.pos.checkForConstructionSites() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y)) && r.my});
            if (bestRampart) {
                creep.memory.assignedRampart = bestRampart.id;
                if (bestRampart.pos !== creep.pos) {
                    creep.shibMove(bestRampart, {range: 0});
                }
            }
        } else {
            creep.shibMove(Game.getObjectById(creep.memory.assignedRampart), {range: 0});
        }
    }
}
