/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.siegeRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.destination) {
        if (this.room.name === this.memory.destination) highCommand.operationSustainability(this.room);
        if (this.memory.role === 'deconstructor' || this.memory.role === 'siegeEngine') {
            return this.siege();
        } else if (this.memory.role === 'longbow') {
            return this.handleMilitaryCreep();
        } else if (this.memory.role === 'attacker') {
            this.handleMilitaryCreep();
        } else if (this.memory.role === 'healer' || this.memory.role === 'siegeHealer') {
            this.siegeHeal();
        }
    }
};