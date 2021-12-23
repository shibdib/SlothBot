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
    let sentence = ['No', 'Remotes', 'Allowed'];
    this.say(sentence[Game.time % sentence.length], true);
    if (this.room.name === this.memory.destination) {
        highCommand.generateThreat(this);
        if (this.memory.other) highCommand.operationSustainability(this.room, this.memory.other.target);
        // Handle combat
        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            // If hostile creeps, level 2
            if (this.room.hostileCreeps.length) Memory.targetRooms[this.memory.other.target].level = 2; else Memory.targetRooms[this.memory.other.target].level = 1;
            if (!this.handleMilitaryCreep() && !this.scorchedEarth()) this.findDefensivePosition();
        } else {
            this.memory.destination = _.sample(_.filter(_.map(Game.map.describeExits(this.memory.other.target)), (r) => !Memory.roomCache[r] || !Memory.roomCache[r].owner));
            this.say('RETASKED', true);
        }
    } else {
        if (this.room.hostileCreeps.length && this.canIWin(50)) return this.handleMilitaryCreep();
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};