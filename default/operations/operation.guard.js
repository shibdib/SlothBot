/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.guardRoom = function () {
    let destination = this.memory.destination;
    let sentence = ['Security', 'Guard', 'For', destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);

    this.attackInRange();
    this.healInRange();

    // Move to the destination room if not there yet
    if (this.room.name !== destination) {
        return this.shibMove(new RoomPosition(25, 25, destination), {range: 24});
    } else {
        // Check for new mission or update orders if necessary
        this.operationManager();
        // Combat handling
        if (this.handleMilitaryCreep() || this.findDefensivePosition()) return;
    }
};