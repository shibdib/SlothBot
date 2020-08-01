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
    // Set squad leader
    if ((!this.memory.squadLeader && !this.memory.leader) || (this.memory.leader && !Game.getObjectById(this.memory.leader))) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.destination === this.memory.destination && c.memory.operation === 'rangers' && c.memory.squadLeader);
        if (!squadLeader.length) this.memory.squadLeader = true; else this.memory.leader = squadLeader[0].id;
    }
    // Revert to marauder
    if (!Memory.targetRooms[this.memory.destination] || _.includes(FRIENDLIES, Memory.roomCache[this.memory.destination].user)) return this.memory.operation = 'marauding';
    // Handle squad leader
    if (this.memory.squadLeader) {
        // Remove duplicate squad leaders
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord &&
            c.memory.operation === this.memory.operation && c.memory.squadLeader && c.id !== this.id && c.memory.destination === this.memory.destination);
        if (squadLeader.length) return this.memory.squadLeader = undefined;
        // Check for squad and handle grouping
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.destination === this.memory.destination && c.memory.operation === this.memory.operation && c.id !== this.id);
        this.memory.waitingForSquad = squadMember.length > 0;
        if (this.ticksToLive <= 1000 || squadMember.length) {
            if (!squadMember.length) {
                let otherRanger = _.filter(this.room.creeps, (c) => c.memory && c.memory.role === 'longbow' && c.memory.operation === this.memory.operation && c.id !== this.id && c.memory.waitingForSquad)[0] ||
                    _.filter(Game.creeps, (c) => c.memory && c.memory.role === 'longbow' && c.memory.operation === this.memory.operation && c.id !== this.id && c.memory.waitingForSquad)[0];
                if (otherRanger) {
                    otherRanger.memory.destination = this.memory.destination;
                    otherRanger.memory.squadLeader = undefined;
                }
            }
        }
        this.attackInRange();
        if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
        // Move to room if needed
        if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
        levelManager(this);
        // Sustainability
        highCommand.operationSustainability(this.room);
        // Generate threat
        highCommand.generateThreat(this);
        // If military action required do that
        if (!this.canIWin(6)) return this.fleeHome(true);
        if (this.handleMilitaryCreep(false, false)) {
            this.memory.timeout = undefined;
            return;
        }
        // Rotate around
        if (this.memory.timeout + 25 < Game.time) {
            let adjacent = Game.map.describeExits(this.pos.roomName);
            // Check for adjacent targets
            let possible = _.filter(adjacent, (r) => Memory.roomCache[r] && Memory.roomCache[r].user === Memory.roomCache[this.room.name].user && !Memory.roomCache[r].towers)[0];
            if (possible) {
                this.memory.timeout = undefined;
                Memory.targetRooms[possible] = Memory.targetRooms[this.room.name];
                Memory.targetRooms[this.room.name] = undefined;
                let creeps = _.filter(Game.creeps, (c) => c.my && c.memory.destination === this.room.name);
                for (let creep of creeps) {
                    creeps.memory.destination = possible;
                }
            } else {
                this.scorchedEarth();
            }
        } else if (!this.memory.timeout) this.memory.timeout = Game.time;

    } else {
        // Set leader and move to them
        let leader = Game.getObjectById(this.memory.leader);
        if (!leader) return delete this.memory.leader;
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
        if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.destination] || creep.room.name !== creep.memory.destination) return;
    let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10);
    let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (towers.length) {
        delete Memory.targetRooms[creep.memory.destination];
        creep.room.cacheRoomIntel(true);
        log.a('Canceling operation in ' + roomLink(creep.room.name) + ' as we are not equipped to fight towers.', 'HIGH COMMAND: ');
        return;
    }
    if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.destination].level = 2;
    } else if (enemyCreeps.length) {
        Memory.targetRooms[creep.memory.destination].level = 1;
    } else {
        Memory.targetRooms[creep.memory.destination].level = 0;
    }
    if (creep.room.controller) {
        if (creep.room.controller.owner) return Memory.targetRooms[creep.memory.destination].type = 'hold';
        if (creep.room.controller.reservation) Memory.targetRooms[creep.room.name].claimAttacker = !creep.room.controller.upgradeBlocked && creep.room.controller.reservation.ticksToEnd >= 500;
    }
}