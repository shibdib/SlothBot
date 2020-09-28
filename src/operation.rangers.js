/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.rangersRoom = function () {
    let sentence = [ICONS.respond, 'SWAT', 'TEAM'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // General combat tasks
    if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
    // Set squad leader
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.destination === this.memory.destination && c.memory.operation === 'rangers' && c.memory.squadLeader);
        if (!squadLeader.length) this.memory.squadLeader = this.id; else this.memory.squadLeader = squadLeader[0].id;
    }
    // Handle squad leader
    if (this.memory.squadLeader === this.id) {
        // Handle room targets
        if (!this.memory.harassTargets || !this.memory.harassTargets.length) {
            this.memory.harassTargets = _.filter(shuffle(_.filter(Game.map.describeExits(this.memory.destination), (e) => !Memory.roomCache[e] ||
                (!Memory.roomCache[e].towers && (!Memory.roomCache[e].owner || !_.includes(FRIENDLIES, !Memory.roomCache[e].owner))))));
        }
        if (!this.memory.currentTarget) {
            this.memory.currentTarget = _.first(this.memory.harassTargets);
            this.memory.harassTargets = _.rest(this.memory.harassTargets)
        }
        // Move to room if needed
        if (this.room.name !== this.memory.currentTarget) {
            return this.shibMove(new RoomPosition(25, 25, this.memory.currentTarget), {range: 22});
        } else {
            // Sustainability
            highCommand.operationSustainability(this.room);
            highCommand.generateThreat(this);
            levelManager(this);
        }
        // If military action required do that
        if (this.canIWin(6)) {
            if (this.handleMilitaryCreep(false, false)) {
                this.memory.timeout = undefined;
                return;
            }
        } else {
            this.memory.currentTarget = undefined;
        }
        // Rotate around target room
        if (this.memory.timeout + 25 < Game.time) {
            this.memory.currentTarget = undefined;
        } else if (!this.memory.timeout) this.memory.timeout = Game.time;
        this.scorchedEarth();
    } else {
        // Set leader and move to them
        let leader = Game.getObjectById(this.memory.squadLeader);
        if (this.room.name === leader.room.name) {
            let moveRange = 0;
            let ignore = true;
            if (this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49 || this.pos.getRangeTo(leader) > 2) {
                moveRange = 1;
                ignore = false;
            }
            this.shibMove(leader, {range: moveRange, ignoreCreeps: ignore, ignoreRoads: true});
        } else {
            this.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 23});
        }
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.destination] || creep.room.name !== creep.memory.currentTarget) return;
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10);
    let armedEnemies = _.filter(creep.room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (towers.length) {
        creep.room.cacheRoomIntel(true);
        creep.memory.currentTarget = undefined;
        return;
    }
    // Claim attacker
    if (!armedEnemies.length && Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].owner && !_.includes(FRIENDLIES, !Memory.roomCache[creep.room.name].owner)) {
        Memory.targetRooms[creep.memory.destination].claimAttacker = creep.room.name;
    }
    // If overall target loses towers, switch to hold
    if (!Memory.roomCache[creep.memory.destination].towers) {
        Memory.targetRooms[creep.memory.destination].type = 'hold';
    }
}