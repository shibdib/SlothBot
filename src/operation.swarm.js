/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.swarmRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.destination) {
        if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
        let sentence = ['Swarm', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        this.handleMilitaryCreep();
    }
};