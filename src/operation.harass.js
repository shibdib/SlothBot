/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.harassRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (!Memory.targetRooms[this.memory.targetRoom] || Memory.targetRooms[this.memory.targetRoom].type !== 'harass') {
            this.memory.responseTarget = this.room.name;
            this.memory.operation = undefined;
            return;
        }
        if (this.room.name === this.memory.targetRoom) highCommand.operationSustainability(this.room);
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 19});
        let sentence = ['Area', 'Denial', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        if (Memory.targetRooms[this.memory.targetRoom]) {
            if (this.findClosestEnemy()) {
                Memory.targetRooms[this.memory.targetRoom].annoy = undefined;
            } else {
                Memory.targetRooms[this.memory.targetRoom].annoy = true;
            }
            this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 19});
        } else {
            this.memory.awaitingOrders = true;
            if (this.room.name !== this.memory.overlord) return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 19});
        }
        if (this.memory.role === 'longbow') {
            this.handleMilitaryCreep();
        } else if (this.memory.role === 'attacker') {
            this.handleMilitaryCreep();
        } else if (this.memory.role === 'healer') {
            this.squadHeal();
        }
    }
};