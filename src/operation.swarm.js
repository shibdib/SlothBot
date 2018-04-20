Creep.prototype.swarmRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        let sentence = ['Swarm', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        this.handleMilitaryCreep(true);
    }
};