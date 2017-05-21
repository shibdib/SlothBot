let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');

module.exports.Defender = function (creep) {
    if(borderChecks.isOnBorder(creep) === true){
        borderChecks.nextStepIntoRoom(creep);
    }

    var closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile) {
        creep.say('ATTACKING');
        if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestHostile, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    } else {
        creep.moveTo(Game.flags.defender1, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
    }
};

module.exports.RangedDefender = function (creep) {
    if(borderChecks.isOnBorder(creep) === true){
        borderChecks.nextStepIntoRoom(creep);
    }

    var closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile) {
        creep.say('ATTACKING');
        if (creep.rangedAttack(closestHostile) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestHostile, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
        }
    } else {
        creep.moveTo(Game.flags.defender1, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}, maxRooms: 1});
    }
};

module.exports.Scout = function (creep) {
    var scout = creep.memory.destination;
    creep.moveTo(Game.flags[scout]);
};

module.exports.Attacker = function (creep) {
    var attackers = _.filter(Game.creeps, (attackers) => attackers.memory.role === 'attacker' && attackers.room === creep.room);

    var closestHostileSpawn = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS);
    if (closestHostileSpawn) {
        if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestHostileSpawn, {visualizePathStyle: {stroke: '#ffaa00'}});
        }
    } else
    if (!closestHostileSpawn) {
        var closestHostile = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (closestHostile) {
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.moveTo(closestHostile, {visualizePathStyle: {stroke: '#ffaa00'}});
            }
        }
    } else if (attackers.length >= 3 || creep.memory.attackStarted === true){
        creep.memory.attackStarted = true;
        creep.moveTo(Game.flags.attack1);
    } else {
        creep.moveTo(Game.flags.stage1);
    }
};