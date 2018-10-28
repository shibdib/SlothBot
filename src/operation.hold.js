let highCommand = require('military.highCommand');

Creep.prototype.holdRoom = function () {
    let sentence = ['Area', 'Denial', 'In', 'Progress'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    if (this.room.name === this.memory.targetRoom) highCommand.operationSustainability(this.room);
    if (this.memory.role === 'longbow') {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'hold' && c.memory.squadLeader);
        if (!squadLeader.length) return this.memory.squadLeader = true;
        if (this.memory.squadLeader && !this.handleMilitaryCreep(false, false)) {
            let squadMember = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'hold' && !c.memory.squadLeader);
            if (!squadMember.length || (this.pos.getRangeTo(squadMember[0]) > 1 && !this.borderCheck())) return this.idleFor(3);
            if (this.hits === this.hitsMax && squadMember[0].hits < squadMember[0].hitsMax) {
                this.heal(squadMember[0]);
            } else if (this.hits < this.hitsMax) {
                this.heal(this);
            }
            if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
            // Clear target if room is no longer owned
            if (!this.room.controller.owner || this.room.controller.safeMode || !Memory.targetRooms[this.room.name]) delete Memory.targetRooms[this.room.name];
            // Request unClaimer if room level is too high
            if (Memory.targetRooms[this.room.name]) Memory.targetRooms[this.room.name].unClaimer = !this.room.controller.ticksToDowngrade || this.room.controller.level > 1 || this.room.controller.ticksToDowngrade > this.ticksToLive;
            threatManagement(this);
        } else if (!this.memory.squadLeader) {
            if (this.room.name === squadLeader[0].room.name) this.shibMove(squadLeader[0], {range: 0}); else this.shibMove(new RoomPosition(25, 25, squadLeader[0].room.name), {range: 17});
            if (this.hits === this.hitsMax && squadLeader[0].hits < squadLeader[0].hitsMax) {
                this.heal(squadLeader[0]);
            } else if (this.hits < this.hitsMax) {
                this.heal(this);
            }
            this.attackInRange();
        }
    } else if (this.memory.role === 'unClaimer') {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
        switch (this.attackController(this.room.controller)) {
            case ERR_NOT_IN_RANGE:
                this.shibMove(this.room.controller, {range: 1});
                break;
        }
    }
};

function threatManagement(creep) {
    if (!creep.room.controller) return;
    let user;
    if (creep.room.controller.owner) user = creep.room.controller.owner.username;
    if (creep.room.controller.reservation) user = creep.room.controller.reservation.username;
    if (!user) return;
    let cache = Memory._badBoyList || {};
    let threatRating = 50;
    if (cache[user] && cache[user]['threatRating'] > 50) threatRating = cache[user]['threatRating'];
    cache[user] = {
        threatRating: threatRating,
        lastAction: Game.time,
    };
    Memory._badBoyList = cache;
}