Creep.prototype.strongholdAttack = function () {
    let destination = this.memory.destination;

    // Destination can be cleared by path failures or reassignment races.
    // RoomPosition throws if roomName is undefined (roomNameToXY → substr).
    if (!destination) {
        destination = recoverStrongholdDestination(this);
        if (!destination) {
            if (this.handleMilitaryCreep()) return;
            if (this.memory.colony && this.room.name !== this.memory.colony) {
                return this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 24});
            }
            if (this.findDefensivePosition()) return;
            return;
        }
        this.memory.destination = destination;
    }

    // Make sure to display status to inform the user what's happening
    const sentence = ['Gimme', 'The', 'Loot', destination];
    this.say(sentence[Game.time % sentence.length], true);

    // Combat handling
    if (this.handleMilitaryCreep()) return;

    // If not in the destination room, move there
    if (this.room.name !== destination) {
        return this.shibMove(new RoomPosition(25, 25, destination), {range: 23});
    } else {
        const core = this.room.structures.find((s) => s.structureType === STRUCTURE_INVADER_CORE);
        if (core && this.attackHostile(core.pos.checkForRampart() || core)) return;

        const tower = this.room.towers[0];
        if (!tower) {
            const container = this.room.containers.find((s) => _.sum(s.store) > s.store[RESOURCE_ENERGY]);
            if (container) {
                if (container.pos.checkForRampart()) this.memory.target = container.pos.checkForRampart().id;
                else {
                    const op = Memory.targetRooms[this.room.name] || Memory.auxiliaryTargets[this.room.name];
                    if (op) {
                        op.loot = true;
                        op.level = 0;
                    }
                }
            }
        }
    }
};

/**
 * Recover a lost stronghold destination from partner memory or active ops.
 * @param {Creep} creep
 * @returns {string|undefined}
 */
function recoverStrongholdDestination(creep) {
    if (creep.memory.partner) {
        const partner = Game.getObjectById(creep.memory.partner);
        if (partner && partner.memory.destination) return partner.memory.destination;
    }
    if (Memory.targetRooms) {
        for (const roomName in Memory.targetRooms) {
            const op = Memory.targetRooms[roomName];
            if (op && op.type === 'stronghold') return roomName;
        }
    }
    if (Memory.auxiliaryTargets) {
        for (const roomName in Memory.auxiliaryTargets) {
            const op = Memory.auxiliaryTargets[roomName];
            if (op && op.type === 'stronghold') return roomName;
        }
    }
    return undefined;
}
