/**
 * Created by Bob on 7/12/2017.
 */
let highCommand = require('military.highCommand');

module.exports.role = function (creep) {
    if (creep.room.name !== creep.memory.targetRoom) return creep.shibMove(new RoomPosition(25, 25, creep.memory.targetRoom), {range: 22});
    if (!Memory.targetRooms[creep.memory.targetRoom]) return creep.memory.recycle = true;
    let sentence = [MY_USERNAME, 'Is', 'Watching', 'This', 'Room'];
    let word = Game.time % sentence.length;
    creep.say(sentence[word], true);
    levelManager(creep);
    highCommand.operationSustainability(creep.room);
    //Type specific stuff
    switch (Memory.targetRooms[creep.room.name].type) {
        case undefined:
            creep.memory.recycle = true;
            break;
        case 'hold':
            // HOLD - Clear target if room is no longer owned
            if (!creep.room.controller.owner || creep.room.controller.safeMode || !Memory.targetRooms[creep.room.name]) delete Memory.targetRooms[creep.room.name];
            // Request unClaimer if room level is too high
            Memory.targetRooms[creep.room.name].unClaimer = !creep.room.controller.upgradeBlocked && (!creep.room.controller.ticksToDowngrade || creep.room.controller.ticksToDowngrade > 1000);
            break;
    }
};

function levelManager(creep) {
    let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && c.body.length > 1);
    let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 2;
        return creep.flee(creep.pos.findClosestByRange(armedEnemies))
    } else if (enemyCreeps.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 1;
    } else {
        Memory.targetRooms[creep.memory.targetRoom].level = 0;
    }
}