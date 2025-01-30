/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);

    if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
        if (this.canIWin(50)) {
            if (this.handleMilitaryCreep()) return;
            else return this.shibKite();
        }
    } else {
        if (this.memory.destination) {
            // If we are already on a mission, let's move there
            if (this.room.name !== this.memory.destination) {
                return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
            } else {
                if (!this.room.hostileCreeps.length && !this.room.hostileStructures.length) {
                    this.memory.destination = undefined;
                    this.idleFor(5);
                    return;
                }
            }
        }

        if (!this.memory.destination && !this.memory.awaitingOrders) {
            if (INTEL[this.room.name] && INTEL[this.room.name].sk) {
                this.memory.destination = this.memory.overlord;
            } else {
                this.memory.destination = this.memory.overlord;
                this.memory.awaitingOrders = true;
                this.idleFor(5);
            }
        }

        if (this.memory.awaitingOrders && !this.memory.destination) {
            this.memory.destination = this.memory.overlord;
            this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
        }
    }
};