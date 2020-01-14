/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.pokeRoom = function () {
    this.room.cacheRoomIntel();
    let sentence = ['Hi', 'Hello'];
    // Kite around dangerous enemies
    if (!this.canIWin(4)) return this.shibKite(6);
    highCommand.operationSustainability(this.room);
    if (!this.handleMilitaryCreep(false, false, false, true)) {
        if (this.memory.targetRoom !== this.room.name) this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23}); else this.scorchedEarth();
    } else {
        let sentence = ['PLEASE', 'JUST', 'DIE'];
    }
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
};