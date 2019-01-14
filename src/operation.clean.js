let highCommand = require('military.highCommand');

Creep.prototype.cleanRoom = function () {
    let sentence = ['Cleaning', 'Room', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    //Handle movement and staging
    if (this.memory.staging && this.room.name === this.memory.staging) this.memory.staged = true;
    if (this.memory.staging && !this.memory.staged && this.room.name !== this.memory.staging) return this.shibMove(new RoomPosition(25, 25, this.memory.staging), {range: 15});
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    //Check sustaintability
    highCommand.operationSustainability(this.room);
    //If no longer a target recycle
    if (!Memory.targetRooms[this.memory.targetRoom] || Memory.targetRooms[this.memory.targetRoom].type === 'Pending') return this.memory.recycle = true;
    //If hostile creeps present request an escort
    if (this.room.hostileCreeps.length) {
        Memory.targetRooms[this.room.name].escort = true;
    } else {
        Memory.targetRooms[this.room.name].escort = undefined;
    }
    let target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType === STRUCTURE_SPAWN});
    if (!target || target === null) {
        if (!Memory.targetRooms[this.memory.targetRoom].complete) {
            target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
        } else {
            target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
        }
        if (!target || target === null) {
            target = this.findClosestBarrier();
            if (!target) {
                let valuable = this.pos.findClosestByRange(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
                if (valuable) target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType === STRUCTURE_WALL});
            }
        }
    }
    if (!target) {
        let terminal = this.room.terminal;
        let storage = this.room.storage;
        if (!Memory.targetRooms[this.memory.targetRoom].complete && ((terminal && _.sum(terminal.store)) || (storage && _.sum(storage.store)))) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'robbery',
                level: 1
            };
            Memory.targetRooms = cache;
        } else if (terminal || storage) {
            return Memory.targetRooms[this.memory.targetRoom].complete = true;
        } else if (!this.room.controller) {
            if (Memory.targetRooms) delete Memory.targetRooms[this.memory.targetRoom];
            if (this.memory.staging) delete Memory.stagingRooms[this.memory.staging];
        } else if (this.room.controller.owner) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'hold',
                level: 1
            };
            Memory.targetRooms = cache;
        } else {
            switch (this.signController(this.room.controller, 'Room cleaned courtesy of ' + MY_USERNAME)) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    return this.shibMove(this.room.controller);
            }
            if (Memory.targetRooms) delete Memory.targetRooms[this.memory.targetRoom];
            if (this.memory.staging) delete Memory.stagingRooms[this.memory.staging];
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