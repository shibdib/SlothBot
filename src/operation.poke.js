/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.pokeRoom = function () {
    if (!this.handleMilitaryCreep(false, false, false, true)) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 19});
        highCommand.threatManagement(this);
        highCommand.operationSustainability(this.room);
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