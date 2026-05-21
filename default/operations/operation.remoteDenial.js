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
    if (INTEL[this.memory.other.target]) {
        if (!INTEL[this.memory.other.target].owner || FRIENDLIES.includes(INTEL[this.memory.other.target].owner)) {
            this.memory.operation = 'borderPatrol';
            this.memory.destination = undefined;
            this.memory.other.target = undefined;
            this.memory.other.visited = undefined;
            Memory.targetRooms[this.memory.other.target] = undefined;
            log.a('Operation cancelled due to target room no longer being hostile or no longer existing', 'REMOTE-DENIAL: ');
            return this.fleeHome();
        }
    }

    // If already in the target room
    if (this.room.name === this.memory.destination || !this.memory.destination) {
        highCommand.generateThreat(this);
        highCommand.operationSustainability(this.room, this.memory.other.target);

        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            if (Memory.targetRooms[this.memory.other.target]) {
                if (this.room.hostileCreeps.length) {
                    Memory.targetRooms[this.memory.other.target].level = 2;
                } else {
                    Memory.targetRooms[this.memory.other.target].level = 1;
                }
            }
        } else {
            const remotes = Object.values(Game.map.describeExits(this.memory.other.target)).filter((n) =>
                (!INTEL[n] || !INTEL[n].user || INTEL[n].user === INTEL[this.memory.other.target].owner) && Object.values(Game.map.describeExits(n)).length > 1);
            console.log(JSON.stringify(remotes))
            this.memory.destination = _.sample(remotes);
            console.log(this.memory.destination);
            this.say('RETASKED', true);
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};
