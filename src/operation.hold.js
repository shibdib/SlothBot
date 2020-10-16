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
    // Set heal buddy
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.squadLeader === c.id && c.memory.operation === 'hold' && !c.memory.buddyAssigned)[0];
        if (!squadLeader && this.memory.role === 'longbow') this.memory.squadLeader = this.id; else if (squadLeader) this.memory.squadLeader = squadLeader.id;
    }
    if (this.memory.squadLeader === this.id) {
        // Clear kite if needed
        this.memory.squadKite = undefined;
        // Handle buddy checks
        let buddy = _.filter(Game.creeps, (c) => c.my && c.memory.squadLeader === this.id && c.id !== this.id)[0];
        if (buddy) {
            this.memory.buddyAssigned = buddy.id;
            if (buddy.room.name === this.room.name && !buddy.pos.isNearTo(this)) return this.shibMove(buddy);
            if (this.hits === this.hitsMax && buddy.hits < buddy.hitsMax) this.heal(buddy);
        } else {
            this.memory.buddyAssigned = undefined;
        }
        // Handle target room
        if (this.room.name === this.memory.destination && Memory.targetRooms[this.memory.destination]) {
            levelManager(this);
            highCommand.generateThreat(this);
            highCommand.operationSustainability(this.room);
            if (this.room.controller.owner) Memory.targetRooms[this.room.name].claimAttacker = !this.room.controller.upgradeBlocked && (!this.room.controller.ticksToDowngrade || this.room.controller.level > 1 || this.room.controller.ticksToDowngrade > this.ticksToLive || this.room.controller.reservation) && this.room.controller.pos.countOpenTerrainAround() > 0;
            Memory.targetRooms[this.room.name].cleaner = _.filter(this.room.structures, (c) => c.structureType !== STRUCTURE_CONTROLLER).length > 0;
        } else if (!Memory.targetRooms[this.memory.destination]) {
            return this.memory.recycle = true;
        }
        if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
        if (!this.canIWin(6)) return this.shibKite(7);
        if (!this.handleMilitaryCreep(false, false, true)) this.scorchedEarth();
    } else {
        // Set leader and move to them
        let leader = Game.getObjectById(this.memory.squadLeader);
        if (!leader) {
            this.goToHub();
            return this.memory.squadLeader = undefined;
        }
        // Clean leader
        if (leader.memory.squadLeader !== leader.id) return this.memory.squadLeader = leader.memory.squadLeader;
        if (leader.memory.idle && this.pos.isNearTo(leader)) return this.memory.idle = leader.memory.idle;
        if (this.room.name === leader.room.name) {
            let moveRange = 0;
            let ignore = true;
            if (this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49 || this.pos.getRangeTo(leader) > 2) {
                moveRange = 1;
                ignore = false;
            }
            this.shibMove(leader, {range: moveRange, ignoreCreeps: ignore, ignoreRoads: true});
            // Kite with leader
            if (this.pos.isNearTo(leader)) {
                if (this.hits === this.hitsMax && leader.hits < leader.hitsMax) this.heal(leader);
                if (leader.memory.squadKite) this.move(leader.memory.squadKite);
            }
        } else {
            if (!this.canIWin(5)) return this.shibKite();
            this.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 23});
        }
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.destination] || creep.room.name !== creep.memory.destination) return;
    if (!creep.room.controller || (!creep.room.controller.owner && !creep.room.controller.reservation) || (!creep.room.creeps.length && !creep.room.structures.length)) return delete Memory.targetRooms[creep.memory.destination];
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
    let armedEnemies = _.filter(creep.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)) && !_.includes(FRIENDLIES, c.owner.username));
    let armedOwners = _.filter(_.union(_.pluck(armedEnemies, 'owner.username'), [creep.room.controller.owner.username]), (o) => !_.includes(FRIENDLIES, o) && o !== 'Invader');
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
    } else {
        Memory.targetRooms[creep.memory.destination].level = 1;
    }
}