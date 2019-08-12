/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */
let highCommand = require('military.highCommand');

module.exports.role = function (creep) {
    let sentence = [MY_USERNAME, 'Is', 'Watching', 'This', 'Room'];
    let word = Game.time % sentence.length;
    creep.say(sentence[word], true);
    if (creep.room.name !== creep.memory.targetRoom) return creep.shibMove(new RoomPosition(25, 25, creep.memory.targetRoom), {range: 23});
    creep.borderCheck();
    creep.room.invaderCheck();
    creep.room.cacheRoomIntel();
    creep.kite();
    if (Memory.targetRooms[creep.memory.targetRoom]) {
        highCommand.operationSustainability(creep.room);
        levelManager(creep);
        //Type specific stuff
        switch (Memory.targetRooms[creep.memory.targetRoom].type) {
            case 'hold':
                // HOLD - Clear target if room is no longer owned
                if (!creep.room.controller.owner || creep.room.controller.safeMode || !Memory.targetRooms[creep.room.name]) {
                    log.a('Canceling hold operation in ' + roomLink(creep.memory.targetRoom) + ' as it is no longer owned.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[creep.memory.targetRoom];
                    return;
                }
                // Request unClaimer if room level is too high
                Memory.targetRooms[creep.memory.targetRoom].unClaimer = !creep.room.controller.upgradeBlocked && (!creep.room.controller.ticksToDowngrade || creep.room.controller.ticksToDowngrade > 1000);
                break;
        }
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.targetRoom]) return;
    let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && c.body.length > 1);
    let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (armedEnemies.length) {
        if (Memory.targetRooms[creep.memory.targetRoom].oldPriority) Memory.targetRooms[creep.memory.targetRoom].priority = Memory.targetRooms[creep.memory.targetRoom].oldPriority;
        Memory.targetRooms[creep.memory.targetRoom].level = 2;
        log.a(Memory.targetRooms[creep.memory.targetRoom].type + ' Operation in ' + creep.room.name + ' is now a level 2.', 'OBSERVER CONTROL:');
        return creep.memory.recycle = true;
    } else if (enemyCreeps.length) {
        if (Memory.targetRooms[creep.memory.targetRoom].oldPriority) Memory.targetRooms[creep.memory.targetRoom].priority = Memory.targetRooms[creep.memory.targetRoom].oldPriority;
        Memory.targetRooms[creep.memory.targetRoom].level = 1;
        log.a(Memory.targetRooms[creep.memory.targetRoom].type + ' Operation in ' + creep.room.name + ' is now a level 3.', 'OBSERVER CONTROL:');
        return creep.memory.recycle = true;
    } else {
        if (Memory.targetRooms[creep.memory.targetRoom].type !== 'hold') {
            if (!Memory.targetRooms[creep.memory.targetRoom].oldPriority) Memory.targetRooms[creep.memory.targetRoom].oldPriority = Memory.targetRooms[creep.memory.targetRoom].priority;
            Memory.targetRooms[creep.memory.targetRoom].priority = 3;
        }
        Memory.targetRooms[creep.memory.targetRoom].level = 0;
    }
}