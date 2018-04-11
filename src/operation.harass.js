Creep.prototype.harassRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        let sentence = ['Area', 'Denial', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        let hostile = this.findClosestEnemy();
        if (this.memory.role === 'longbow') {
            if (hostile) {
                if (hostile.body && (hostile.getActiveBodyparts(ATTACK) || hostile.getActiveBodyparts(RANGED_ATTACK))) {
                    Memory.targetRooms[this.memory.targetRoom].level = 3;
                } else {
                    Memory.targetRooms[this.memory.targetRoom].level = 2;
                }
                if (this.hits < this.hitsMax * 0.50) return this.kite(8);
                return this.fightRanged(hostile);
            } else {
                Memory.targetRooms[this.memory.targetRoom].level = 1;
                if (!this.moveToHostileConstructionSites()) {
                    if (!this.healMyCreeps() && !this.healAllyCreeps()) {
                        this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 17});
                    }
                }
            }
        } else if (this.memory.role === 'attacker') {
            this.handleDefender();
        } else if (this.memory.role === 'healer') {
            this.squadHeal();
        }
    }
};