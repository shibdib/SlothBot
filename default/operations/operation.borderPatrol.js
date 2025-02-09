/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);

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

    // Movement
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

    // Awaiting orders
    if (!this.memory.destination && !this.memory.awaitingOrders) {
        this.memory.destination = this.memory.overlord;
        this.memory.awaitingOrders = true;
    }

    // Idle handling
    if (this.memory.awaitingOrders && !this.memory.destination && this.room.name !== this.memory.overlord) {
        this.memory.destination = this.memory.overlord;
        this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
    } else {
        if (this.findDefensivePosition()) this.idleFor(5);
    }
};