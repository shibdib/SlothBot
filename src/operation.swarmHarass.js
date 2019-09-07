/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.swarmHarassRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        let sentence = ['Swarm', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        highCommand.operationSustainability(this.room);
        if (Memory.targetRooms[this.memory.targetRoom]) {
            let hostile = this.findClosestEnemy();
            if (hostile && hostile.body && (hostile.getActiveBodyparts(ATTACK) > 3 || hostile.getActiveBodyparts(RANGED_ATTACK) > 3)) {
                delete Memory.targetRooms[this.memory.targetRoom];
            } else {
                Memory.targetRooms[this.memory.targetRoom].level = 1;
            }
        }
        this.handleMilitaryCreep(true);
    }
};