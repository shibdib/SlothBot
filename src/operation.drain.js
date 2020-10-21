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
            this.borderHump();
        }
        highCommand.operationSustainability(this.room);
    } else this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
};