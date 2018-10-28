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
        threatManagement(this);
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

function threatManagement(creep) {
    if (!creep.room.controller) return;
    let user;
    if (creep.room.controller.owner) user = creep.room.controller.owner.username;
    if (creep.room.controller.reservation) user = creep.room.controller.reservation.username;
    if (!user || _.includes(FRIENDLIES, user)) return;
    let cache = Memory._badBoyList || {};
    let threatRating = 50;
    if (cache[user] && cache[user]['threatRating'] > 50) threatRating = cache[user]['threatRating'];
    cache[user] = {
        threatRating: threatRating,
        lastAction: Game.time,
    };
    Memory._badBoyList = cache;
}