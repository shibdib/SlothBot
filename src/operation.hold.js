/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

const highCommand = require('military.highCommand');
Creep.prototype.holdRoom = function () {
    if (this.tryToBoost(['ranged', 'heal', 'attack', 'tough'])) return;
    let sentence = ['Coming', 'For', 'That', 'Booty', this.memory.destination];
    this.say(sentence[Game.time % sentence.length], true);
    this.attackInRange();
    this.healInRange();
    // Move to response room if needed
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
    } else {
        if (!Memory.targetRooms[this.room.name]) return this.memory.operation = 'borderPatrol';
        let sentence = ['Please', 'Abandon'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        // Handle combat
        if (this.room.hostileCreeps.length) {
            if (this.handleMilitaryCreep()) return;
        } else if (!this.scorchedEarth()) this.findDefensivePosition();
        if (Game.time % 5 === 0) this.operationManager();
        highCommand.operationSustainability(this.room);
    }
};