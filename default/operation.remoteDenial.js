/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('military.highCommand');

Creep.prototype.remoteDenial = function () {
    // Boost logic - only boost if needed
    if (this.tryToBoost(['ranged', 'heal'])) return;

    let sentence = ['No', 'Remotes', 'Allowed'];
    this.say(sentence[Game.time % sentence.length], true);

    // Combat handling - engage if possible, kite if necessary
    if (this.handleMilitaryCreep() || this.scorchedEarth()) return;

    // If already in the target room
    if (this.room.name === this.memory.destination) {
        highCommand.generateThreat(this);
        if (this.memory.other) highCommand.operationSustainability(this.room, this.memory.other.target);

        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            if (this.room.hostileCreeps.length) {
                Memory.targetRooms[this.memory.other.target].level = 2;
            } else {
                Memory.targetRooms[this.memory.other.target].level = 1;
            }
        } else {
            this.memory.destination = _.sample(this.memory.other.remotes);
            this.say('RETASKED', true);
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};
