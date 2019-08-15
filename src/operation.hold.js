/*
 * Copyright (c) 2019.
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
    if (this.borderCheck()) return;
    if (this.memory.role === 'longbow') {
        levelManager(this);
        highCommand.threatManagement(this);
        // Handle target room
        if (this.room.name === this.memory.targetRoom) {
            highCommand.operationSustainability(this.room);
            Memory.targetRooms[this.room.name].unClaimer = !this.room.controller.upgradeBlocked && (!this.room.controller.ticksToDowngrade || this.room.controller.level > 1 || this.room.controller.ticksToDowngrade > this.ticksToLive) && this.room.controller.pos.countOpenTerrainAround() > 0;
            Memory.targetRooms[this.room.name].cleaner = this.room.structures.length > 0;
        }
        // If military action required do that
        if (this.handleMilitaryCreep(false, false, true)) return;
        if (this.room.name !== this.memory.targetRoom) this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 24});
        if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.targetRoom] || creep.room.name !== creep.memory.targetRoom) return;
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
    let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10);
    let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (creep.room.name === creep.memory.targetRoom && towers.length) {
        delete Memory.targetRooms[creep.memory.targetRoom];
        log.a('Canceling operation in ' + roomLink(creep.memory.targetRoom) + ' as we cannot hold it due to towers.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
        return;
    }
    if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 2;
    } else if (enemyCreeps.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 1;
    } else {
        Memory.targetRooms[creep.memory.targetRoom].level = 0;
    }
}