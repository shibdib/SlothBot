Creep.prototype.siegeRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        let sentence = ['Overlords', 'Wants', 'Your', 'Room'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        let hostile = this.findClosestEnemy();
        if (this.memory.role === 'deconstructor' || this.memory.role === 'siegeEngine') {
            return this.siege();
        } else if (this.memory.role === 'longbow') {
            return this.fightRanged(hostile);
        } else if (this.memory.role === 'attacker') {
            this.handleDefender();
        } else if (this.memory.role === 'healer' || this.memory.role === 'siegeHealer') {
            this.siegeHeal();
        }
    }
};