/**
 * Created by Bob on 7/12/2017.
 */
let highCommand = require('military.highCommand');

module.exports.role = function (creep) {
    let sentence = [MY_USERNAME, 'Is', 'Watching', 'This', 'Room'];
    let word = Game.time % sentence.length;
    creep.say(sentence[word], true);
    if (creep.room.name !== creep.memory.targetRoom) return creep.shibMove(new RoomPosition(25, 25, creep.memory.targetRoom), {range: 23});
    highCommand.operationSustainability(creep.room);
    levelManager(creep);
    //If no longer needed, cache intel and recycle
    if (!Memory.targetRooms[creep.memory.targetRoom]) {
        creep.room.cacheRoomIntel(true);
        return creep.memory.recycle = true;
    }
    //Type specific stuff
    switch (Memory.targetRooms[creep.memory.targetRoom].type) {
        case 'hold':
            // HOLD - Clear target if room is no longer owned
            if (!creep.room.controller.owner || creep.room.controller.safeMode || !Memory.targetRooms[creep.room.name]) delete Memory.targetRooms[creep.memory.targetRoom];
            // Request unClaimer if room level is too high
            Memory.targetRooms[creep.memory.targetRoom].unClaimer = !creep.room.controller.upgradeBlocked && (!creep.room.controller.ticksToDowngrade || creep.room.controller.ticksToDowngrade > 1000);
            break;
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.targetRoom]) return;
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