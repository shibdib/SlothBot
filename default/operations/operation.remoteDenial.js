/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('module.highCommand');

function denialRemotes(dest) {
    const destinationOwner = INTEL[dest] && INTEL[dest].owner;
    return Object.values(Game.map.describeExits(dest) || {}).filter((n) =>
        n !== dest &&
        (!INTEL[n] || !INTEL[n].user || INTEL[n].user === destinationOwner) &&
        Object.values(Game.map.describeExits(n) || {}).length > 1);
}

function moveToDenialRemote(creep, roomName) {
    const dest = creep.memory.destination;
    const opts = {range: 22};
    if (dest) opts.avoid = [dest];
    return creep.shibMove(new RoomPosition(25, 25, roomName), opts);
}

Creep.prototype.remoteDenial = function () {
    let sentence = ['No', 'Remotes', 'Allowed'];
    this.say(sentence[Game.time % sentence.length], true);

    const dest = this.memory.destination;
    // Never linger or fight in the owned hostile room. Walk out around it.
    if (dest && this.room.name === dest) {
        if (!this.memory.targetRoom || this.memory.targetRoom === dest) {
            this.memory.targetRoom = _.sample(denialRemotes(dest));
            this.say('RETASKED', true);
        }
        if (this.memory.targetRoom && this.memory.targetRoom !== dest) {
            return moveToDenialRemote(this, this.memory.targetRoom);
        }
        const exit = this.pos.findClosestByPath(FIND_EXIT);
        if (exit) return this.shibMove(exit, {range: 0});
        return;
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

    // If the target room no longer is hostile or exists cancel the operations
    if (INTEL[dest]) {
        if (!INTEL[dest].owner || FRIENDLIES.includes(INTEL[dest].owner)) {
            this.memory.operation = 'borderPatrol';
            this.memory.destination = undefined;
            this.memory.targetRoom = undefined;
            if (this.memory.other) {
                this.memory.other.target = undefined;
                this.memory.other.visited = undefined;
            }
            // Companion raiders on a roomDenial dest must not delete the siege.
            const op = dest && Memory.targetRooms[dest];
            if (op && op.type === 'remoteDenial') Memory.targetRooms[dest] = undefined;
            log.a('Operation cancelled due to target room no longer being hostile or no longer existing', 'REMOTE-DENIAL: ');
            return this.fleeHome();
        }
    }

    // If already in the target room
    if (this.room.name === this.memory.targetRoom || !this.memory.targetRoom) {
        highCommand.generateThreat(this);
        highCommand.operationSustainability(this.room, dest);

        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            const destOp = dest && Memory.targetRooms[dest];
            if (destOp && destOp.type === 'remoteDenial') {
                destOp.level = this.room.hostileCreeps.length ? 2 : 1;
            }
        } else {
            this.memory.targetRoom = _.sample(denialRemotes(dest));
            this.say('RETASKED', true);
        }
    } else {
        if (this.memory.targetRoom === dest) {
            this.say('RETASKED', true);
            return this.memory.targetRoom = undefined;
        }
        return moveToDenialRemote(this, this.memory.targetRoom);
    }
};
