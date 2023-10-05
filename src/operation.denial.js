/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('military.highCommand');
Creep.prototype.roomDenial = function () {
    if (this.tryToBoost(['ranged', 'heal'])) return;
    // Become border patrol if no longer a target
    if (!Memory.targetRooms[this.memory.other.target]) {
        this.memory.operation = 'borderPatrol';
        this.memory.destination = undefined;
        return;
    }
    let sentence = ['No', 'Remotes', 'Allowed'];
    this.say(sentence[Game.time % sentence.length], true);
    // Handle combat
    if (this.canIWin(10)) {
        if (this.handleMilitaryCreep() || this.scorchedEarth()) return;
    } else {
        return this.shibKite();
    }
    if (this.room.name === this.memory.destination) {
        highCommand.generateThreat(this);
        if (this.memory.other) highCommand.operationSustainability(this.room, this.memory.other.target);
        // Handle combat
        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            // If hostile creeps, level 2
            if (this.room.hostileCreeps.length) Memory.targetRooms[this.memory.other.target].level = 2; else Memory.targetRooms[this.memory.other.target].level = 1;
        } else {
            this.memory.destination = _.sample(_.filter(_.map(Game.map.describeExits(this.memory.other.target)), (r) => !INTEL[r] || !INTEL[r].owner));
            this.say('RETASKED', true);
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};