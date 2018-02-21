Creep.prototype.cleanRoom = function () {
    let sentence = ['Cleaning', 'Room', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    if (this.room.name !== this.memory.targetRoom) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    }
    let target;
    if (this.memory.attackType === 'clean') {
        target = this.pos.findClosestByPath(FIND_STRUCTURES);
    }
    if (!target) {
        switch (this.signController(this.room.controller, 'Room cleaned courtesy of #overlords.')) {
            case OK:
                Game.rooms[this.memory.overlord].memory.cleaningTargets = _.filter(Game.rooms[this.memory.overlord].memory.cleaningTargets, (t) => t.name !== this.memory.targetRoom);
                this.suicide();
                break;
            case ERR_NOT_IN_RANGE:
                this.shibMove(creep.room.controller);
        }
    } else {
        switch (this.dismantle(target)) {
            case ERR_NOT_IN_RANGE:
                this.heal(this);
                this.shibMove(target, {ignoreCreeps: false, repathChance: 0.5});
                this.memory.siegeTarget = undefined;
                break;
            case ERR_NO_BODYPART:
                if (this.getActiveBodyparts(ATTACK) > 0) this.attack(target);
                this.shibMove(target, {ignoreCreeps: false, repathChance: 0.5});
                break;
            case OK:
                return true;

        }
    }
};