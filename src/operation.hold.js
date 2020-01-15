/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.holdRoom = function () {
    let sentence = ['This', 'Room', 'Has', 'Been', 'Marked', 'For', 'Other', 'Uses', 'Please', 'Abandon'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Handle border
    if (this.memory.role === 'longbow') {
        levelManager(this);
        highCommand.generateThreat(this);
        // Handle target room
        if (this.room.name === this.memory.destination && Memory.targetRooms[this.memory.destination]) {
            highCommand.operationSustainability(this.room);
            Memory.targetRooms[this.room.name].claimAttacker = !this.room.controller.upgradeBlocked && (!this.room.controller.ticksToDowngrade || this.room.controller.level > 1 || this.room.controller.ticksToDowngrade > this.ticksToLive) && this.room.controller.pos.countOpenTerrainAround() > 0;
            Memory.targetRooms[this.room.name].cleaner = this.room.structures.length > 0;
        } else if (!Memory.targetRooms[this.memory.destination]) {
            return this.memory.recycle = true;
        }
        // If military action required do that
        this.attackInRange();
        if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
        if (this.room.name !== this.memory.destination) this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
        this.handleMilitaryCreep(false, false, true)
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.destination] || creep.room.name !== creep.memory.destination) return;
    if (!creep.room.controller.owner) return delete Memory.targetRooms[creep.memory.destination];
    // Safemode
    if (creep.room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[creep.room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + creep.room.controller.safeMode,
        };
        Memory.targetRooms = cache;
        creep.memory.recycle = true;
        return;
    }
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10 && c.isActive());
    let armedEnemies = _.filter(creep.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)) && c.owner.username === c.room.controller.owner.username);
    if (creep.room.name === creep.memory.destination && towers.length) {
        delete Memory.targetRooms[creep.memory.destination];
        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot hold it due to towers.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
        return;
    }
    if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.destination].level = 2;
    } else if (creep.room.hostileCreeps.length) {
        Memory.targetRooms[creep.memory.destination].level = 1;
    } else {
        Memory.targetRooms[creep.memory.destination].level = 0;
    }
}