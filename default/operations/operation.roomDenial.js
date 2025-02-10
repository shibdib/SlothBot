const highCommand = require('module.highCommand');

Creep.prototype.denyRoom = function () {
    if (this.tryToBoost(['ranged_attack', 'heal', 'attack', 'tough'])) return;

    // Make sure to display status to inform the user what's happening
    const sentence = ['Coming', 'For', 'That', 'Booty', this.memory.destination];
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

    // If not in the destination room, move there
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
    }

    // Check if we still have a target room in the memory
    if (!Memory.targetRooms[this.room.name]) {
        this.memory.operation = 'borderPatrol';
        return;
    }

    // Call operation manager periodically (every 5 ticks)
    if (Game.time % 5 === 0) {
        this.operationManager();
    }

    // Update sustainability of operation in this room
    highCommand.operationSustainability(this.room);
};
