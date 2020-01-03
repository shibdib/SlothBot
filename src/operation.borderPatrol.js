/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Invader check
    this.room.invaderCheck();
    // Handle rampart
    if (this.fightRampart()) return;
    if (this.room.memory.towerTarget && Game.getObjectById(this.room.memory.towerTarget)) {
        if (this.getActiveBodyparts(RANGED_ATTACK)) return this.fightRanged(Game.getObjectById(this.room.memory.towerTarget)); else if (this.getActiveBodyparts(ATTACK)) this.attackHostile(Game.getObjectById(this.room.memory.towerTarget));
    }
    this.attackInRange();
    if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
    if (!this.getActiveBodyparts(RANGED_ATTACK) && !this.getActiveBodyparts(ATTACK)) return this.goHomeAndHeal();
    if (this.canIWin(5) && this.handleMilitaryCreep()) {
        this.memory.onTarget = undefined;
    } else if (!this.canIWin(5)) {
        if (this.memory.responseTarget && this.room.name === this.memory.responseTarget) this.memory.responseTarget = undefined;
        this.attackInRange();
        this.shibKite(5);
    } else if (this.memory.responseTarget && this.room.name !== this.memory.responseTarget) {
        this.shibMove(new RoomPosition(25, 25, this.memory.responseTarget), {range: 22});
    } else {
        // If on target, be available to respond
        if (!this.memory.onTarget) this.memory.onTarget = Game.time;
        // Idle in target rooms for 25 ticks
        if (!this.memory.responseTarget || (this.memory.onTarget && this.memory.onTarget + _.random(10, 25) <= Game.time)) {
            offDuty(this);
        } else {
            this.findDefensivePosition(this);
        }
    }
};

function offDuty(creep) {
    if (creep.room.name !== creep.memory.overlord || creep.pos.getRangeTo(new RoomPosition(25, 25, creep.memory.overlord)) >= 5) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 3});
    } else {
        creep.memory.responseTarget = undefined;
        creep.memory.onTarget = undefined;
        creep.memory.awaitingOrders = true;
        creep.idleFor(creep.pos.getRangeTo(creep.pos.findClosestByRange(FIND_EXIT)) - 4);
    }
}