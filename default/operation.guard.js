/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.guardRoom = function () {
    // Attempt to boost body parts if possible and beneficial
    if (this.tryToBoost(['ranged', 'heal', 'attack', 'tough'])) return;

    let destination = this.memory.destination;
    let sentence = ['Security', 'Guard', 'For', destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);

    // Move to the destination room if not there yet
    if (this.room.name !== destination) {
        if (this.room.hostileCreeps.length && this.canIWin(50)) {
            // Engage with hostile creeps if the room is hostile
            return this.handleMilitaryCreep();
        }
        // Otherwise, move to the room if no hostiles are in range
        return this.shibMove(new RoomPosition(25, 25, destination), {range: 24});
    }

    // Combat Handling: If there are hostile creeps or structures, engage
    if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
        // Prioritize military creep handling or find a defensive position
        return this.handleMilitaryCreep();
    }

    // If no enemies, focus on healing or defending
    if (!this.healCreeps()) {
        this.findDefensivePosition();  // Move to a defensive position if no healing needed
    }

    // Check for new mission or update orders if necessary
    this.operationManager();

    // Optional: Consider checking adjacent rooms for potential threats
    this.scanForNearbyThreats();
};
