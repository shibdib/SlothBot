/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.guardRoom = function () {
    if (this.tryToBoost(['ranged', 'heal', 'attack', 'tough'])) return;
    let destination = this.memory.destination;
    let sentence = ['Security', 'Guard', 'For', destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // If military action required do that
    if (this.room.name !== destination) {
        if (this.room.hostileCreeps.length && this.canIWin(50)) return this.handleMilitaryCreep();
        return this.shibMove(new RoomPosition(25, 25, destination), {range: 24});
    }
    // Handle combat
    if (this.canIWin(50)) {
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            this.handleMilitaryCreep()
        } else if (!this.healCreeps()) this.findDefensivePosition();
    } else {
        if (!this.findDefensivePosition()) this.shibKite();
    }
    this.operationManager();
};