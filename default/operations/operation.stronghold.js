Creep.prototype.strongholdAttack = function () {
    // Make sure to display status to inform the user what's happening
    const sentence = ['Gimme', 'The', 'Loot', this.memory.destination];
    this.say(sentence[Game.time % sentence.length], true);

    // Combat handling
    if (this.handleMilitaryCreep()) return;

    // If not in the destination room, move there
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
    } else {
        const tower = this.room.structures.find((s) => s.structureType === STRUCTURE_TOWER);
        if (!tower) {
            const container = this.room.structures.find((s) => s.structureType === STRUCTURE_CONTAINER && _.sum(s.store) > s.store[RESOURCE_ENERGY]);
            if (container) {
                if (container.pos.checkForRampart()) this.memory.target = container.pos.checkForRampart().id;
                else {
                    Memory.targetRooms[this.room.name].loot = true;
                    Memory.targetRooms[this.room.name].level = 0;
                }
            }
        }
    }
};
