Creep.prototype.cleanRoom = function () {
    let sentence = ['Cleaning', 'Room', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    if (this.room.name !== this.memory.targetRoom) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    }
    let creeps = this.pos.findClosestByRange(this.room.creeps, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(FRIENDLIES, e.owner['username']) === false});
    if (this.room.controller.reservation || creeps) {
        Game.rooms[this.memory.overlord].memory.cleaningTargets = _.filter(Game.rooms[this.memory.overlord].memory.cleaningTargets, (t) => t.name !== this.memory.targetRoom);
    }
    let target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
    if (!target || target === null) {
        target = this.findClosestBarrier(false);
        if (!target) {
            let valuable = this.pos.findClosestByRange(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
            if (valuable) target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType === STRUCTURE_WALL});
        }
    }
    if (!target) {
        if (this.room.controller.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_WALL})[0]) {
            switch (this.dismantle(this.room.controller.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_WALL})[0])) {
                case ERR_NOT_IN_RANGE:
                    this.shibMove(this.room.controller.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_WALL})[0]);
                    return true;
                case OK:
                    return true;

            }
        }
        switch (this.signController(this.room.controller, 'Room cleaned courtesy of #overlords.')) {
            case OK:
                Game.rooms[this.memory.overlord].memory.cleaningTargets = _.filter(Game.rooms[this.memory.overlord].memory.cleaningTargets, (t) => t.name !== this.memory.targetRoom);
                delete Memory.targetRooms[this.room.name];
                break;
            case ERR_NOT_IN_RANGE:
                return this.shibMove(this.room.controller);
        }
        let terminal = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
        let storage = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
        if ((terminal && _.sum(terminal.store) > 0) || (storage && _.sum(storage.store) > 0)) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'robbery',
                level: 1
            };
            Memory.targetRooms = cache;
        }
        this.memory.role = 'worker';
    } else {
        this.room.visual.text(
            ICONS.noEntry,
            target.pos.x,
            target.pos.y,
            {align: 'left', opacity: 1}
        );
        switch (this.dismantle(target)) {
            case ERR_NOT_IN_RANGE:
                this.shibMove(target);
                break;
            case OK:
                return true;

        }
    }
};