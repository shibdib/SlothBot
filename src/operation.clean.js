let highCommand = require('military.highCommand');

Creep.prototype.cleanRoom = function () {
    let sentence = ['Cleaning', 'Room', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    //Handle movement and staging
    if (this.memory.staging && this.room.name === this.memory.staging) this.memory.staged = true;
    if (this.memory.staging && !this.memory.staged && this.room.name !== this.memory.staging) return this.shibMove(new RoomPosition(25, 25, this.memory.staging), {range: 15});
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    //If room safemodes switch to pending
    if (this.room.controller && this.room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[Game.flags[name].pos.roomName] = {
            tick: tick,
            dDay: tick + this.room.controller.safeMode,
            type: 'pending',
        };
        Memory.targetRooms = cache;
        return this.memory.recycle = true;
    }
    highCommand.operationSustainability(this.room);
    //If no longer a target recycle
    if (!Memory.targetRooms[this.memory.targetRoom]) return this.memory.recycle = true;
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
        if (!Memory.targetRooms[this.memory.targetRoom].complete && ((terminal && _.sum(terminal.store) > terminal.store[RESOURCE_ENERGY]) || (storage && _.sum(storage.store) > storage.store[RESOURCE_ENERGY]))) {
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
            switch (this.signController(this.room.controller, 'Room cleaned courtesy of #Overlord-Bot.')) {
                case OK:
                    break;
                case ERR_NOT_IN_RANGE:
                    return this.shibMove(this.room.controller);
            }
            if (Memory.targetRooms) delete Memory.targetRooms[this.memory.targetRoom];
            if (this.memory.staging) delete Memory.stagingRooms[this.memory.staging];
            this.suicide();
        }
    } else {
        let dismantlePower = DISMANTLE_POWER * this.getActiveBodyparts(WORK);
        let secondsToDismantle = (target.hits / dismantlePower) * Memory.tickLength;
        let displayTime;
        if (secondsToDismantle < 60) displayTime = _.round(secondsToDismantle) + ' Seconds';
        if (secondsToDismantle >= 86400) displayTime = _.round(secondsToDismantle / 86400, 2) + ' Days';
        if (secondsToDismantle < 86400 && secondsToDismantle >= 3600) displayTime = _.round(secondsToDismantle / 3600, 2) + ' Hours';
        if (secondsToDismantle > 60 && secondsToDismantle < 3600) displayTime = _.round(secondsToDismantle / 60, 2) + ' Minutes';
        this.room.visual.text(
            ICONS.noEntry + ' Destroyed in appx. ' + displayTime,
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