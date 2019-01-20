/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.pokeRoom = function () {
    // Recycle if room is no longer a target
    if (!Memory.targetRooms[this.memory.targetRoom]) return this.memory.recycle;
    // Travel to target
    if (this.room.name !== this.memory.targetRoom) {
        if (this.room.hostileCreeps) return this.handleMilitaryCreep(false, false, false, true); else return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 19});
    }
    highCommand.operationSustainability(this.room);
    // Run from unwinnable fights
    if (!this.canIWin()) {
        this.attackInRange();
        this.say('RUN!', true);
        return this.goHomeAndHeal();
    }
    if (!this.handleMilitaryCreep(false, false, false, true)) {
        highCommand.threatManagement(this);
        let sentence = ['Hi', 'Hello'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 19})
    } else {
        let sentence = ['PLEASE', 'JUST', 'DIE'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
    }
};