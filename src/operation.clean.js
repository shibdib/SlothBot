let highCommand = require('military.highCommand');

Creep.prototype.cleanRoom = function () {
    let sentence = ['Cleaning', 'Room', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    //Handle movement and staging
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    //Check sustaintability
    highCommand.operationSustainability(this.room);
    //If no longer a target recycle
    if (!Memory.targetRooms[this.memory.targetRoom] || Memory.targetRooms[this.memory.targetRoom].type === 'Pending') return this.memory.recycle = true;
    //If hostile creeps present request an escort
    Memory.targetRooms[this.room.name].escort = this.room.hostileCreeps.length;
    // If all targets are cleared kill everything
    let target;
    if (Memory.targetRooms[this.memory.targetRoom].complete) {
        let worthwhile = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD).length;
        if (worthwhile) {
            target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
            if (!target) {
                target = this.findClosestBarrier() || this.findClosestBarrier(true);
            }
        }
    } else {
        // Try to find non valuable targets
        let worthwhile = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD).length;
        if (worthwhile) {
            target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
            // If nothing check that there's not ramparts in the way
            if (!target) {
                target = this.findClosestBarrier() || this.findClosestBarrier(true);
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