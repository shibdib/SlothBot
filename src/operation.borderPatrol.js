/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Handle border
    if (this.borderCheck()) return;
    // Invader check
    this.room.invaderCheck();
    // Run from unwinnable fights
    if (!this.canIWin()) {
        if (this.memory.responseTarget && this.room.name === this.memory.responseTarget) this.memory.responseTarget = undefined;
    }
    // Handle contact reporting
    this.memory.contactReport = undefined;
    if (this.memory.responseTarget && this.room.name !== this.memory.responseTarget) {
        if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
        this.shibMove(new RoomPosition(25, 25, this.memory.responseTarget), {range: 22});
    } else {
        if (this.handleMilitaryCreep()) {
            this.memory.onTarget = undefined;
        } else {
            // If on target, be available to respond
            if (!this.memory.onTarget) this.memory.onTarget = Game.time;
        }
        // Idle in target rooms for 25 ticks
        if (!this.memory.responseTarget || (this.memory.onTarget && this.memory.onTarget + _.random(10, 25) <= Game.time)) {
            this.memory.responseTarget = undefined;
            this.memory.onTarget = undefined;
            this.memory.awaitingOrders = true;
        }
    }
};