/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    // Border Patrol
    if (creep.memory.operation === 'borderPatrol') return creep.borderPatrol();
    // Boosts
    if (!creep.memory.boostAttempt) return creep.tryToBoost(['ranged']);
    // Responder Mode
    if (creep.memory.responseTarget) {
        if (creep.memory.awaitingOrders) return creep.memory.responseTarget = undefined;
        creep.say(ICONS.respond, true);
        if (creep.room.name !== creep.memory.responseTarget) {
            let hostile = creep.findClosestEnemy();
            if (hostile && (!creep.room.controller || !creep.room.controller.safeMode)) {
                return creep.handleMilitaryCreep(false, true);
            } else {
                return creep.shibMove(new RoomPosition(25, 25, creep.memory.responseTarget), {range: 18}); //to move to any room}
            }
        } else if (!creep.handleMilitaryCreep(false, true)) {
            creep.memory.awaitingOrders = !creep.room.memory.responseNeeded;
            return findDefensivePosition(creep, creep);
        }
    } else if (creep.memory.operation) {
        // Harass
        if (creep.memory.operation === 'harass') creep.harassRoom();
        // Marauder
        if (creep.memory.operation === 'marauding') creep.marauding();
        // Escort
        if (creep.memory.operation === 'guard') creep.guardRoom();
        // Hold
        if (creep.memory.operation === 'hold') creep.holdRoom();
        // Hold
        if (creep.memory.operation === 'rangers') creep.rangersRoom();
    } else if (!creep.handleMilitaryCreep(false, true)) {
        creep.memory.awaitingOrders = !creep.room.memory.responseNeeded;
        if (creep.pos.checkForRoad()) {
            creep.moveRandom();
        } else {
            creep.idleFor(5)
        }
    }
};

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart;
        if (!creep.memory.assignedRampart) {
            bestRampart = target.pos.findClosestByPath(creep.room.structures, {
                filter: (r) => r.structureType === STRUCTURE_RAMPART &&
                    !r.pos.checkForObstacleStructure() && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y)) &&
                    (!r.room.memory.extensionHub || (r.pos.x !== r.room.memory.extensionHub.x && r.pos.y !== r.room.memory.extensionHub.y))
            });
            if (creep.pos.checkForRampart()) {
                let add = 1;
                if (creep.getActiveBodyparts(RANGED_ATTACK)) add = 3;
                if (bestRampart.pos.getRangeTo(target) + add >= creep.pos.getRangeTo(target) && Math.random() > 0.1) creep.memory.assignedRampart = creep.pos.checkForRampart().id;
            }
        } else {
            bestRampart = Game.getObjectById(creep.memory.assignedRampart);
            let resetChance = 0.75;
            if (this.memory.role === 'responder') resetChance = 0.95;
            if (Math.random() > resetChance && bestRampart.pos.getRangeTo(this) <= 1) creep.memory.assignedRampart = undefined;
        }
        if (bestRampart) {
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos) {
                creep.shibMove(bestRampart, {forceRepath: true, range: 0});
            }
        } else if (creep.pos.checkForRoad()) {
            creep.moveRandom();
        } else {
            creep.idleFor(5)
        }
    }
}
