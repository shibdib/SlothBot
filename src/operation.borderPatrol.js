/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Run from unwinnable fights
    if (!this.canIWin() || (this.room.user && !_.includes(FRIENDLIES, this.room.user))) {
        this.attackInRange();
        this.say('RUN!', true);
        delete this.memory.responseTarget;
        return this.goHomeAndHeal();
    }
    // Set squad leader
    if (!this.memory.squadLeader && !this.memory.leader) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord && c.memory.operation === 'borderPatrol' && c.memory.squadLeader);
        if (!squadLeader.length) this.memory.squadLeader = true; else this.memory.leader = squadLeader[0].id;
    }
    // Handle border
    if (this.borderCheck()) return;
    // Handle squad leader
    if (this.memory.squadLeader) {
        // Remove duplicate squad leaders
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord &&
            c.memory.operation === this.memory.operation && c.memory.squadLeader && c.id !== this.id && c.memory.targetRoom === this.memory.targetRoom);
        if (squadLeader.length) return this.memory.squadLeader = undefined;
        // Invader check
        this.room.invaderCheck();
        // Get squad members
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === this.memory.operation && c.id !== this.id);
        // Handle contact reporting
        this.memory.contactReport = undefined;
        // If military action required do that
        if (this.handleMilitaryCreep(false, true, true, false, true)) return this.memory.contactReport = true;
        if (this.ticksToLive >= 1000 || squadMember.length) {
            if (!squadMember.length) {
                let otherHold = _.filter(this.room.creeps, (c) => c.memory && c.memory.role === 'longbow' && c.memory.operation === this.memory.operation && c.id !== this.id && c.memory.waitingForSquad)[0] ||
                    _.filter(Game.creeps, (c) => c.memory && c.memory.role === 'longbow' && c.memory.operation === this.memory.operation && c.id !== this.id && c.memory.waitingForSquad)[0];
                if (otherHold) {
                    otherHold.memory.targetRoom = this.memory.targetRoom;
                    otherHold.memory.squadLeader = undefined;
                }
            }
            if (this.pos.findInRange(squadMember, 2).length < squadMember.length) return this.idleFor(1);
        }
        // Move to response room if needed
        if (this.memory.responseTarget && this.room.name !== this.memory.responseTarget) return this.shibMove(new RoomPosition(25, 25, this.memory.responseTarget), {range: 22});
        // If on target, be available to respond
        if (!this.memory.onTarget) this.memory.onTarget = Game.time;
        // Idle in target rooms for 25 ticks
        if (!this.memory.responseTarget || this.memory.onTarget + _.random(10, 25) <= Game.time) {
            this.memory.responseTarget = undefined;
            this.memory.onTarget = undefined;
            this.memory.awaitingOrders = true;
        }
        if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
    } else {
        // Set leader and move to them
        let leader = Game.getObjectById(this.memory.leader);
        if (!leader) return delete this.memory.leader;
        if (leader.memory.idle && leader.memory.idle > Game.time) {
            return this.idleFor(leader.memory.idle - Game.time)
        }
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

function remoteManager(creep) {
    // Remove remote if reserved by someone else
    if (creep.room.controller && creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME) Game.rooms[creep.memory.overlord].memory.remoteRooms = _.filter(Game.rooms[creep.memory.overlord].memory.remoteRooms, (r) => r !== creep.room.name);
    // Remove remote if owned by someone else
    if (creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username !== MY_USERNAME) Game.rooms[creep.memory.overlord].memory.remoteRooms = _.filter(Game.rooms[creep.memory.overlord].memory.remoteRooms, (r) => r !== creep.room.name);
}