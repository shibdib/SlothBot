Creep.prototype.guardRoom = function () {
    let sentence = ['Security', 'Guard', 'For', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'guard' && c.memory.squadLeader);
    if (!squadLeader.length) return this.memory.squadLeader = true;
    if (this.memory.squadLeader && !this.handleMilitaryCreep(false, false)) {
        let squadMember = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'guard' && !c.memory.squadLeader);
        if (!squadMember.length || (this.pos.getRangeTo(squadMember[0]) > 1 && !this.borderCheck())) return this.idleFor(3);
        if (this.hits === this.hitsMax && squadMember[0].hits < squadMember[0].hitsMax) {
            this.heal(squadMember[0]);
        } else if (this.hits < this.hitsMax) {
            this.heal(this);
        }
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
        highCommand.threatManagement(this);
    } else if (!this.memory.squadLeader) {
        if (this.room.name === squadLeader[0].room.name) this.shibMove(squadLeader[0], {range: 0}); else this.shibMove(new RoomPosition(25, 25, squadLeader[0].room.name), {range: 17});
        if (this.hits === this.hitsMax && squadLeader[0].hits < squadLeader[0].hitsMax) {
            this.heal(squadLeader[0]);
        } else if (this.hits < this.hitsMax) {
            this.heal(this);
        }
        this.attackInRange();
    }
};