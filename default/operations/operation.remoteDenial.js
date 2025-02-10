/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('module.highCommand');

Creep.prototype.remoteDenial = function () {
    let sentence = ['No', 'Remotes', 'Allowed'];
    this.say(sentence[Game.time % sentence.length], true);

    // Combat handling
    if (this.handleMilitaryCreep()) return;

    // Healing
    if (this.hits < this.hitsMax) {
        if (this.hasActiveBodyparts(HEAL)) {
            this.findDefensivePosition();
            return this.heal(this);
        } else {
            return this.fleeHome();
        }
    }

    // If already in the target room
    if (this.room.name === this.memory.destination || !this.memory.destination) {
        highCommand.generateThreat(this);
        if (this.memory.other) highCommand.operationSustainability(this.room, this.memory.other.target);

        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            if (this.room.hostileCreeps.length) {
                Memory.targetRooms[this.memory.other.target].level = 2;
            } else {
                Memory.targetRooms[this.memory.other.target].level = 1;
            }
        } else {
            this.memory.destination = _.sample(this.memory.misc.remotes);
            this.say('RETASKED', true);
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};
