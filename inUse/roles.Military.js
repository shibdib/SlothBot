let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');

module.exports.Defender = function (creep) {
    if (borderChecks.wrongRoom(creep) !== false){
        return;
    }
    if (borderChecks.isOnBorder(creep) === true) {
        borderChecks.nextStepIntoRoom(creep);
    }

    const closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile) {
        creep.say('ATTACKING');
        if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestHostile, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        }
    } else {
        pathing.Move(creep, Game.flags.defender1);
    }
};

/**
 * @return {null}
 */
module.exports.Sentry = function (creep) {
    if (creep.memory.assignedRampart) {
        let post = Game.getObjectById(creep.memory.assignedRampart);
        //Initial move
        if (post) {
            if (post.pos !== creep.pos) {
                pathing.Move(creep, post);
            } else {
                const targets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
                if (targets.length > 0) {
                    creep.rangedMassAttack();
                    creep.say('Attacking')
                }
            }
        }
    }
};

/**
 * @return {null}
 */
module.exports.Scout = function (creep) {
    const scout = creep.memory.destination;
    pathing.Move(creep, Game.flags[scout]);
};

/**
 * @return {null}
 */
module.exports.Attacker = function (creep) {
    if (creep.memory.attackTarget) {
        creep.suicide();
    }
    let attackers = _.filter(Game.creeps, (creep) => creep.memory.attackTarget === Game.flags[creep.memory.attackTarget] && creep.memory.role === 'attacker');

    let armedHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (e) => e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1});
    let closestHostileSpawn = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS);
    let closestHostileTower = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER});
    let closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (armedHostile) {
        if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, armedHostile);
        }
    } else if (closestHostileTower) {
        if (creep.attack(closestHostileTower) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostileTower);
        }
    } else if (closestHostileSpawn) {
        if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostileSpawn);
        }
    } else if (closestHostile) {
        if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
            pathing.AttackMove(creep, closestHostile);
        }
    } else if (attackers.length >= creep.memory.waitFor || creep.memory.attackStarted === true) {
            creep.memory.attackStarted = true;
        pathing.Move(creep, creep.memory.attackTarget);
        } else {
            pathing.Move(creep, Game.flags.stage1);
        }
};

/**
 * @return {null}
 */
module.exports.Claimer = function (creep) {
    const attackers = _.filter(Game.creeps, (attackers) => attackers.memory.role === 'claimer' && attackers.room === creep.room);

    let closestHostileSpawn = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS);
    if (closestHostileSpawn) {
        if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestHostileSpawn, {visualizePathStyle: {stroke: '#ffaa00'}});
        }
    } else
    if (!closestHostileSpawn) {
        const closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (closestHostile) {
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.moveTo(closestHostile, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        } else if (Game.flags.attack1 && (attackers.length >= 3 || creep.memory.attackStarted === true)){
            creep.memory.attackStarted = true;
            pathing.Move(creep, Game.flags.attack1);
        } else {
            pathing.Move(creep, Game.flags.stage1);
        }
    }
};

/**
 * @return {null}
 */
module.exports.Reserver = function (creep) {
    //Initial move
    if (!creep.memory.destinationReached) {
        pathing.Move(creep, Game.flags[creep.memory.destination], 45);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 3) {
            creep.memory.destinationReached = true;
        }
    } else {
        if (creep.room.controller) {
            if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, creep.room.controller);
            }
        }
    }
};