Creep.prototype.guardRoom = function () {
    let sentence = ['Security', 'Guard', 'For', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    if (this.memory.staging && this.room.name === this.memory.staging) this.memory.staged = true;
    if (this.memory.staging && !this.memory.staged && this.room.name !== this.memory.staging) return this.shibMove(new RoomPosition(25, 25, this.memory.staging), {range: 15});
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    let hostile = this.findClosestEnemy();
    if (this.memory.role === 'longbow') {
        return this.fightRanged(hostile);
    } else if (this.memory.role === 'attacker') {
        this.handleDefender();
    } else if (this.memory.role === 'healer') {
        this.squadHeal();
    }
};