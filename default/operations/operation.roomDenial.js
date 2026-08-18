const highCommand = require('module.highCommand');

// attackDirection is a neighboring room name (current writer) or a
// FIND_EXIT_* key (legacy intel). Either must resolve to a room name.
function resolveDenialStaging(dest) {
    if (!dest) return dest;
    const attack = INTEL[dest] && INTEL[dest].attackDirection;
    if (!attack) return dest;
    const exits = Game.map.describeExits(dest);
    if (!exits) return dest;
    if (exits[attack]) return exits[attack];
    const neighbors = Object.values(exits);
    for (let i = 0; i < neighbors.length; i++) {
        if (neighbors[i] === attack) return attack;
    }
    return dest;
}

Creep.prototype.ensureDenialStaging = function () {
    if (!this.memory.destination) return;
    if (!this.memory.misc) this.memory.misc = {};
    if (!this.memory.misc.stagingRoom) {
        this.memory.misc.stagingRoom = resolveDenialStaging(this.memory.destination);
    }
    if (this.memory.misc.stagingRoom === this.room.name) this.memory.misc.staged = true;
};

Creep.prototype.denyRoom = function (options = {}) {
    // Make sure to display status to inform the user what's happening
    const sentence = ['Coming', 'For', 'That', 'Booty'];
    this.say(sentence[Game.time % sentence.length], true);

    if (this.room.name === this.memory.destination) {
        // Track wave if we haven't yet
        if (!this.memory.waveTracked) {
            if (Memory.targetRooms[this.room.name] && (!Memory.targetRooms[this.room.name].lastWave || Memory.targetRooms[this.room.name].lastWave + 20 < Game.time)) {
                this.memory.waveTracked = true;
                Memory.targetRooms[this.room.name].lastWave = Game.time;
                Memory.targetRooms[this.room.name].waves = (Memory.targetRooms[this.room.name].waves || 0) + 1;
            } else {
                this.memory.waveTracked = true;
            }
        }
        if (!this.memory.activeTracked || this.memory.activeTracked + 50 < Game.time) {
            const armedHostiles = this.room.creeps.filter((c) => !c.my && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
            if (INTEL[this.room.name]) INTEL[this.room.name].activeDefenders = armedHostiles.length > 0;
            this.memory.activeTracked = Game.time;
        }

        this.operationManager();

        // Update sustainability of operation in this room
        if (highCommand.operationSustainability(this.room)) {
            return this.memory.operation = 'borderPatrol';
        }

        // Packed quads move via shibSquadMovement — fightRanged would peel the leader.
        if (options.squadMove) return;

        // Ignore-border would skip exit-camping defenders — the usual hold.
        if (this.handleMilitaryCreep(false, true, false)) return;

        // Move towards the controller
        if (this.pos.getRangeTo(this.room.controller) > 5) {
            return this.shibMove(this.room.controller, {range: 4});
        }

        this.idleFor(this.pos.getRangeTo(this.pos.findClosestByPath(FIND_EXIT)) * 0.5);
        return;
    }

    // Packed quad travel is the caller's job (2×2 step, not a solo shibMove).
    if (options.squadMove) return;

    this.ensureDenialStaging();
    const destination = this.memory.misc && this.memory.misc.stagingRoom && !this.memory.misc.staged
        ? this.memory.misc.stagingRoom
        : this.memory.destination;
    if (this.room.name !== destination) {
        return this.shibMove(new RoomPosition(25, 25, destination), {range: 23});
    }
};
