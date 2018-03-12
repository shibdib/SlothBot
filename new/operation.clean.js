Creep.prototype.cleanRoom = function () {
    let sentence = ['Cleaning', 'Room', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    if (this.room.name !== this.memory.targetRoom) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    }
    let creeps = this.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(FRIENDLIES, e.owner['username']) === false});
    if (this.room.controller.reservation || creeps) {
        Game.rooms[this.memory.overlord].memory.cleaningTargets = _.filter(Game.rooms[this.memory.overlord].memory.cleaningTargets, (t) => t.name !== this.memory.targetRoom);
    }
    let target = this.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART});
    if (!target || target === null) {
        target = this.findClosestBarrier();
        if (target) {
            this.memory.siegeTarget = target.id;
            this.memory.siegeComplete = undefined;
        }
    }
    if (!target) {
        switch (this.signController(this.room.controller, 'Room cleaned courtesy of #overlords.')) {
            case OK:
                Game.rooms[this.memory.overlord].memory.cleaningTargets = _.filter(Game.rooms[this.memory.overlord].memory.cleaningTargets, (t) => t.name !== this.memory.targetRoom);
                break;
            case ERR_NOT_IN_RANGE:
                this.shibMove(this.room.controller);
        }
    } else {
        switch (this.dismantle(target)) {
            case ERR_NOT_IN_RANGE:
                this.shibMove(target);
                break;
            case OK:
                return true;

        }
    }
};