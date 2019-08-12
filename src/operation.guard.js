/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.guardRoom = function () {
    let sentence = ['Security', 'Guard', 'For', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    if (this.memory.targetRoom && this.room.name !== this.memory.targetRoom) {
        if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
        this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
    } else {
        levelManager(this);
        this.handleMilitaryCreep();
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.targetRoom] || (creep.room.controller && creep.room.controller.safeMode)) {
        Memory.targetRooms[creep.memory.targetRoom] = undefined;
        creep.memory.role = 'longbow';
        creep.memory.operation = 'borderPatrol';
        return;
    }
    let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
    let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 2;
    } else if (enemyCreeps.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 1;
    } else {
        Memory.targetRooms[creep.memory.targetRoom].level = 0;
    }
}