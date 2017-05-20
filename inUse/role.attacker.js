var roleAttacker = {

    /** @param {Creep} creep **/
    run: function (creep) {
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
    }

};

module.exports = roleAttacker;
/**
 * Created by rober on 5/15/2017.
 */
