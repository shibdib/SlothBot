let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');
let militaryFunctions = require('module.militaryFunctions');

module.exports.Defender = function (creep) {
    const targets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 10);
    const closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (targets.length > 0) {
        creep.say('ATTACKING');
        if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestHostile, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        }
    } else {
        pathing.Move(creep, creep.memory.assignedSpawn, 1);
    }
};

/**
 * @return {null}
 */
module.exports.Sentry = function (creep) {
    const targets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
    if (targets.length > 0) {
        creep.rangedMassAttack();
        creep.say('ATTACKING')
    } else {
        militaryFunctions.findDefensivePosition(creep);
    }
};

/**
 * @return {null}
 */
module.exports.Healer = function (creep) {
    const targets = creep.pos.findInRange(FIND_MY_CREEPS, 15, {filter: (c) => c.hits < c.hitsMax});
    if (targets[0]) {
        if (creep.heal(targets[0]) === ERR_NOT_IN_RANGE) {
            if (creep.rangedHeal(targets[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    } else {
        militaryFunctions.findDefensivePosition(creep);
    }
};

/**
 * @return {null}
 */
module.exports.Scout = function (creep) {
    if (creep.memory.destinationReached !== true) {
        pathing.Move(creep, Game.flags[creep.memory.destination], 30, false, 16);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
            creep.memory.destinationReached = true;
        }
    } else {
        let HostileCreeps = spawn.room.find(FIND_HOSTILE_CREEPS);
        if (HostileCreeps.length > 0) {
            creep.memory.enemyCount = HostileCreeps.length;
            creep.memory.enemyPos = HostileCreeps[0].pos;
        } else {
            creep.memory.enemyCount = null;
            creep.memory.enemyPos = null;
        }
    }
};

/**
 * @return {null}
 */
module.exports.Attacker = function (creep) {
    if (!Game.flags[creep.memory.attackTarget]) {
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
        pathing.Move(creep, Game.flags[creep.memory.attackTarget], 25, false, 16);
        } else {
        pathing.Move(creep, Game.flags.stage1, 25, false, 16);
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
        pathing.Move(creep, Game.flags[creep.memory.destination], 45, false, 16);
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