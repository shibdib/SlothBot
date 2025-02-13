const highCommand = require('module.highCommand');

Creep.prototype.denyRoom = function () {
    // Make sure to display status to inform the user what's happening
    const sentence = ['Coming', 'For', 'That', 'Booty', this.memory.destination];
    this.say(sentence[Game.time % sentence.length], true);

    if (this.room.name === this.memory.destination) {
        // Track wave if we haven't yet
        if (!this.memory.waveTracked) {
            if (!Memory.targetRooms[this.room.name].lastWave || Memory.targetRooms[this.room.name].lastWave + 20 < Game.time) {
                this.memory.waveTracked = true;
                Memory.targetRooms[this.room.name].lastWave = Game.time;
                Memory.targetRooms[this.room.name].waves = Memory.targetRooms[this.room.name].waves ? Memory.targetRooms[this.room.name].waves++ : 1;
            } else {
                this.memory.waveTracked = true;
            }
        }
        // Track if active defenders spawn or not
        if (!this.memory.activeTracked || this.memory.activeTracked + 100 < Game.time) {
            if (this.memory.activeTracked) {
                const armedHostiles = this.room.creeps.filter((c) => !c.my && (c.hasActiveBodyparts(ATTACK) || !c.hasActiveBodyparts(RANGED_ATTACK)));
                if (!armedHostiles.length) INTEL[this.room.name].noActiveDefenders = true;
            } else {
                this.memory.activeTracked = Game.time;
            }
        }
        // Call operation manager periodically (every 5 ticks)
        if (Game.time % 5 === 0) {
            this.operationManager();
        }

        // Update sustainability of operation in this room
        highCommand.operationSustainability(this.room);
    }

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
};
