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

    // If the target room no longer is hostile or exists cancel the operations
    if (INTEL[this.memory.destination]) {
        if (!INTEL[this.memory.destination].owner || FRIENDLIES.includes(INTEL[this.memory.destination].owner)) {
            const dest = this.memory.destination;
            this.memory.operation = 'borderPatrol';
            this.memory.destination = undefined;
            this.memory.targetRoom = undefined;
            if (this.memory.other) {
                this.memory.other.target = undefined;
                this.memory.other.visited = undefined;
            }
            if (dest) Memory.targetRooms[dest] = undefined;
            log.a('Operation cancelled due to target room no longer being hostile or no longer existing', 'REMOTE-DENIAL: ');
            return this.fleeHome();
        }
    }

    // If already in the target room
    if (this.room.name === this.memory.targetRoom || !this.memory.targetRoom) {
        highCommand.generateThreat(this);
        highCommand.operationSustainability(this.room, this.memory.destination);

        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            if (Memory.targetRooms[this.memory.destination]) {
                if (this.room.hostileCreeps.length) {
                    Memory.targetRooms[this.memory.destination].level = 2;
                } else {
                    Memory.targetRooms[this.memory.destination].level = 1;
                }
            }
        } else {
            const destinationOwner = INTEL[this.memory.destination] && INTEL[this.memory.destination].owner;
            const remotes = Object.values(Game.map.describeExits(this.memory.destination) || {}).filter((n) =>
                (!INTEL[n] || !INTEL[n].user || INTEL[n].user === destinationOwner) && Object.values(Game.map.describeExits(n) || {}).length > 1);
            this.memory.targetRoom = _.sample(remotes);
            this.say('RETASKED', true);
        }
    } else {
        if (this.memory.targetRoom === this.memory.destination) {
            this.say('RETASKED', true);
            return this.memory.targetRoom = undefined;
        }
        return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
    }
};
