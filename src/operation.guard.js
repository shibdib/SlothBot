/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.guardRoom = function () {
    let sentence = ['Security', 'Guard', 'For', this.memory.destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // If military action required do that
    this.attackInRange();
    if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
    if (this.room.name !== this.memory.destination) this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
    this.handleMilitaryCreep();
    levelManager(this);
};

function levelManager(creep) {
    if (creep.room.controller && creep.room.controller.safeMode) {
        Memory.targetRooms[creep.memory.destination] = undefined;
        creep.memory.role = 'longbow';
        creep.memory.operation = 'borderPatrol';
        return;
    }
    if (Memory.targetRooms[creep.memory.destination]) {
        let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
        let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
        if (armedEnemies.length) {
            Memory.targetRooms[creep.memory.destination].level = 2;
        } else if (enemyCreeps.length) {
            Memory.targetRooms[creep.memory.destination].level = 1;
        } else {
            Memory.targetRooms[creep.memory.destination].level = 0;
        }
    }
}