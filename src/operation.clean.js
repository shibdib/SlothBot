/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.cleanRoom = function () {
    let sentence = ['Cleaning', 'Room', this.memory.destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    //Handle movement
    if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
    //Check sustaintability
    highCommand.operationSustainability(this.room);
    //If no longer a target recycle
    if (!Memory.targetRooms[this.memory.destination] || Memory.targetRooms[this.memory.destination].type !== 'clean') return this.memory.recycle = true;
    //If hostile creeps present request an escort
    Memory.targetRooms[this.room.name].escort = this.room.hostileCreeps.length > 0;
    //Handle level based on ramparts
    let highestRampart = _.max(_.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART), 'hits');
    if (highestRampart && highestRampart.id) {
        let level = _.ceil(highestRampart.hits / 500000);
        if (level > 3) level = 3;
        Memory.targetRooms[this.pos.roomName].level = level;
    }
    let target;
    // If already have a target, kill it
    if (this.memory.target && Game.getObjectById(this.memory.target)) {
        target = Game.getObjectById(this.memory.target);
        switch (this.dismantle(target)) {
            case ERR_NOT_IN_RANGE:
                this.shibMove(target);
                return;
            case OK:
                return true;

        }
    }
    // If all targets are cleared kill everything
    if (Memory.targetRooms[this.memory.destination].complete) {
        let worthwhile = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD).length;
        if (worthwhile) {
            target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
            if (!target && !this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD})) {
                target = this.findClosestBarrier() || this.findClosestBarrier(true);
            }
        }
    } else {
        // Try to find non valuable targets
        let worthwhile = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD).length;
        if (worthwhile) {
            target = this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_TERMINAL && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD});
            // If nothing check that there's not ramparts in the way
            if (!target && !this.pos.findClosestByPath(this.room.structures, {filter: (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD})) {
                target = this.findClosestBarrier() || this.findClosestBarrier(true);
            }
        }
    }
    if (!target) {
        let terminal = this.room.terminal;
        let storage = this.room.storage;
        if (!Memory.targetRooms[this.memory.destination].complete && ((terminal && _.sum(_.filter(terminal.store, (r) => r.reservation !== RESOURCE_ENERGY))) ||
            (storage && _.sum(_.filter(terminal.store, (r) => r.reservation !== RESOURCE_ENERGY))))) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'robbery',
                level: 1
            };
            Memory.targetRooms = cache;
        } else if (terminal || storage) {
            return Memory.targetRooms[this.memory.destination].complete = true;
        } else if (!this.room.controller) {
            if (Memory.targetRooms) delete Memory.targetRooms[this.memory.destination];
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
                    this.room.cacheRoomIntel(true);
                    break;
                case ERR_NOT_IN_RANGE:
                    return this.shibMove(this.room.controller);
            }
            if (Memory.targetRooms) delete Memory.targetRooms[this.memory.destination];
            log.a('Room cleaning in ' + this.memory.destination + ' is complete.', 'CLEANING: ');
        }
    } else {
        this.memory.target = target.id;
    }
};