/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.holdRoom = function () {
    let sentence = ['Please', 'Abandon'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // If military action required do that
    this.attackInRange();
    if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
    levelManager(this);
    if (this.memory.role === 'longbow') {
        highCommand.generateThreat(this);
        // Handle target room
        if (this.room.name === this.memory.destination && Memory.targetRooms[this.memory.destination]) {
            highCommand.operationSustainability(this.room);
            Memory.targetRooms[this.room.name].claimAttacker = !this.room.controller.upgradeBlocked && (!this.room.controller.ticksToDowngrade || this.room.controller.level > 1 || this.room.controller.ticksToDowngrade > this.ticksToLive) && this.room.controller.pos.countOpenTerrainAround() > 0;
            Memory.targetRooms[this.room.name].cleaner = this.room.structures.length > 0;
        } else if (!Memory.targetRooms[this.memory.destination]) {
            return this.memory.recycle = true;
        }
        if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
        if (!this.canIWin(6)) return this.fleeHome(true);
        if (!this.handleMilitaryCreep(false, false, true)) this.scorchedEarth();
    } else if (this.memory.role === 'deconstructor') {
        if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
        if (!this.handleMilitaryCreep(false, false, true)) this.scorchedEarth();
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.destination] || creep.room.name !== creep.memory.destination) return;
    if (!creep.room.controller.owner || (!creep.room.creeps.length && !creep.room.structures.length)) return delete Memory.targetRooms[creep.memory.destination];
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
    let armedOwners = _.filter(_.union(_.pluck(armedEnemies, 'owner.username'), [creep.room.controller.owner.username]), (o) => !_.includes(FRIENDLIES, o));
    if (armedOwners.length > 1) {
        delete Memory.targetRooms[creep.memory.destination];
        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as there is a 3rd party present.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
    } else if (towers.length) {
        delete Memory.targetRooms[creep.memory.destination];
        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot hold it due to towers.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
    } else if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.destination].level = 2;
    } else if (creep.room.hostileCreeps.length) {
        Memory.targetRooms[creep.memory.destination].level = 1;
    } else {
        Memory.targetRooms[creep.memory.destination].level = 0;
    }
}