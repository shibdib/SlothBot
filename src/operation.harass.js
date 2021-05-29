/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');
Creep.prototype.harass = function () {
    // Become border patrol if no longer a target
    if (!Memory.targetRooms[this.memory.other.target]) {
        this.memory.operation = 'borderPatrol';
        this.memory.destination = undefined;
        return;
    }
    if (this.room.name === this.memory.destination) {
        this.say(['Contact', MY_USERNAME, 'For', 'A', 'Diplomatic', 'Resolution'][Game.time % 6], true);
        highCommand.generateThreat(this);
        if (this.memory.other) highCommand.operationSustainability(this.room, this.memory.other.target);
        // If hostile creeps, level 2
        if (this.room.hostileCreeps.length) Memory.targetRooms[this.memory.other.target].level = 2; else Memory.targetRooms[this.memory.other.target].level = 1;
        // Handle combat
        if (this.canIWin(50)) {
            if (this.room.hostileCreeps.length) {
                this.handleMilitaryCreep()
            } else if (!this.scorchedEarth()) this.findDefensivePosition();
        } else {
            this.shibKite();
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};