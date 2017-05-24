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
        creep.moveTo(Game.flags.defender1, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
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
                if (creep.moveByPath(creep.memory.path) === OK) {
                    return null;
                } else {
                    creep.memory.path = pathing.Move(creep, post);
                    creep.moveByPath(creep.memory.path);
                    return null;
                }
            } else {
                const closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
                if (creep.rangedAttack(closestHostile)) {
                    creep.say('ATTACKING');
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
    if (creep.moveByPath(creep.memory.path) === OK) {
        return null;
    } else {
        creep.memory.path = pathing.Move(creep, Game.flags[scout]);
        creep.moveByPath(creep.memory.path);
        return null;
    }
};

/**
 * @return {null}
 */
module.exports.Attacker = function (creep) {
    const attackers = _.filter(Game.creeps, (attackers) => attackers.memory.role === 'attacker' && attackers.room === creep.room);

    let armedHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (e) => e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1});
    let closestHostileSpawn = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS);
    if (armedHostile) {
        if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
            creep.moveTo(armedHostile, {visualizePathStyle: {stroke: '#ffaa00'}});
        }
    } else
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
            if (creep.moveByPath(creep.memory.path) === OK) {
                return null;
            } else {
                creep.memory.path = pathing.Move(creep, Game.flags.attack1);
                creep.moveByPath(Game.flags.attack1);
                return null;
            }
        } else {
            creep.moveTo(Game.flags.stage1);
            if (creep.moveByPath(creep.memory.path) === OK) {
                return null;
            } else {
                creep.memory.path = pathing.Move(creep, Game.flags.stage1);
                creep.moveByPath(creep.memory.path);
                return null;
            }
        }
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
            if (creep.moveByPath(creep.memory.path) === OK) {
                return null;
            } else {
                creep.memory.path = pathing.Move(creep, Game.flags.attack1);
                creep.moveByPath(creep.memory.path);
                return null;
            }
        } else {
            creep.moveTo(Game.flags.stage1);
        }
    }
};

/**
 * @return {null}
 */
module.exports.Reserver = function (creep) {
    //Initial move
    if (!creep.memory.destinationReached) {
        if (creep.room.name === Game.flags[creep.memory.destination].room.name) {
            creep.memory.destinationReached = true;
        }
        if (creep.moveByPath(creep.memory.path) === OK) {
            return null;
        } else {
            creep.memory.path = pathing.Move(creep, Game.flags[creep.memory.destination]);
            creep.moveByPath(creep.memory.path);
            return null;
        }
    } else {
        if (creep.room.controller) {
            if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                if (creep.moveByPath(creep.memory.path) === OK) {
                    return null;
                } else {
                    creep.memory.path = pathing.Move(creep, creep.room.controller);
                    creep.moveByPath(creep.memory.path);
                    return null;
                }
            }
        }
    }
};