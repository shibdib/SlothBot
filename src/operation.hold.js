Creep.prototype.holdRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        let sentence = ['Area', 'Denial', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        let hostile = this.findClosestEnemy();
        if (this.memory.role === 'longbow') {
            if (hostile) {
                return this.fightRanged(hostile);
            } else {
                this.moveToHostileConstructionSites();
            }
        } else if (this.memory.role === 'attacker') {
            this.handleDefender();
        } else if (this.memory.role === 'healer') {
            this.squadHeal();
        }
        if (!this.room.controller.owner) {
            delete Memory.targetRooms[this.room.name];
        }
    }
};