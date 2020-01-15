/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.harassRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.destination) {
        if (!Memory.targetRooms[this.memory.destination] || Memory.targetRooms[this.memory.destination].type !== 'harass') {
            this.memory.other.responseTarget = this.room.name;
            this.memory.operation = undefined;
            return;
        }
        if (this.room.name === this.memory.destination) highCommand.operationSustainability(this.room);
        if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 19});
        let sentence = ['Area', 'Denial', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        if (Memory.targetRooms[this.memory.destination]) {
            if (this.findClosestEnemy()) {
                Memory.targetRooms[this.memory.destination].annoy = undefined;
            } else {
                Memory.targetRooms[this.memory.destination].annoy = true;
            }
            this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 19});
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