/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.drainRoom = function () {
    // If room is no longer a target
    if (!Memory.targetRooms[this.memory.destination]) return this.memory.recycle = true;
    // Handle healing
    this.healInRange();
    if (this.room.name === this.memory.destination) {
        let sentence = ['Gimme', 'That', 'Energy', 'Please'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        this.scorchedEarth();
        let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy >= 10);
        if (!towers.length) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'hold',
                level: 1
            };
            Memory.targetRooms = cache;
        } else {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'drain',
                level: towers.length + 1
            };
            Memory.targetRooms = cache;
            borderHump(this);
        }
        highCommand.operationSustainability(this.room);
    } else this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
};


borderHump = function (creep) {
    let exit = creep.pos.findClosestByRange(FIND_EXIT);
    if (creep.hits < creep.hitsMax * 0.9 && !creep.getActiveBodyparts(TOUGH) && creep.room.name === creep.memory.destination) {
        if (creep.pos.getRangeTo(exit) <= 4) Memory.roomCache[creep.room.name].noDrain = undefined;
        return creep.shibMove(exit, {ignoreCreeps: false, range: 0});
    } else if (creep.hits === creep.hitsMax && creep.room.name === creep.memory.destination) {
        let noDrainCount = Memory.roomCache[creep.room.name].noDrain || 0;
        Memory.roomCache[creep.room.name].noDrain = noDrainCount + 1;
        // If room is not drainable mark as such and recycle
        if (Memory.roomCache[creep.room.name].noDrain >= 15) {
            delete Memory.targetRooms[creep.room.name]
            Memory.roomCache[creep.room.name].noDrain = true;
            creep.memory.recycle = true;
        }
        creep.heal(creep);
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 15})
    } else if (creep.hits < creep.hitsMax && creep.room.name !== creep.memory.destination) {
        creep.heal(creep);
    } else if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
};