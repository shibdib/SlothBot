Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    // Abandon remotes if bucket empty
    if (Game.cpu.bucket < 5000) return this.suicide();
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Run from unwinnable fights
    if (!this.canIWin()) {
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
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord && c.memory.operation === this.memory.operation && c.memory.squadLeader && c.id !== this.id);
        if (squadLeader.length) this.memory.squadLeader = undefined;
        // Handle removing bad remotes
        if (this.room.name === this.memory.responseTarget) remoteManager(this);
        // Invader check
        this.room.invaderCheck();
        // Get squad members
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === this.memory.operation && c.id !== this.id);
        // If military action required do that
        if (this.handleMilitaryCreep(false, true, true, false, true)) return this.memory.contactReport = true;
        // Handle contact reporting
        this.memory.contactReport = undefined;
        // Check for squad
        if (this.pos.findInRange(squadMember, 3).length < squadMember.length) return this.idleFor(1);
        // Heal squad
        let woundedSquad = _.filter(squadMember, (c) => c.hits < c.hitsMax && c.pos.getRangeTo(this) === 1);
        if (this.hits === this.hitsMax && woundedSquad[0]) this.heal(woundedSquad[0]); else if (this.hits < this.hitsMax) this.heal(this);
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
        // Heal if waiting for orders
        this.healAllyCreeps();
        this.healMyCreeps();
        if (this.memory.responseTarget && !this.shibMove(new RoomPosition(25, 25, this.memory.responseTarget), {range: 17})) return;
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
        // Handle attacker
        if (this.getActiveBodyparts(ATTACK) && this.handleMilitaryCreep(false, true, false, false, true)) return;
        // Handle longbow
        let woundedSquad = _.filter(this.room.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord && c.memory.operation === 'borderPatrol' && c.id !== this.id && c.hits < c.hitsMax && c.pos.getRangeTo(this) === 1);
        if (this.hits === this.hitsMax && woundedSquad[0]) this.heal(woundedSquad[0]); else if (this.hits < this.hitsMax) this.heal(this);
        if (this.memory.role === 'longbow') this.attackInRange();
    }
};

function remoteManager(creep) {
    // Remove remote if reserved by someone else
    if (creep.room.controller && creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME) Game.rooms[creep.memory.overlord].memory.remoteRooms = _.filter(Game.rooms[creep.memory.overlord].memory.remoteRooms, (r) => r !== creep.room.name);
    // Remove remote if owned by someone else
    if (creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username !== MY_USERNAME) Game.rooms[creep.memory.overlord].memory.remoteRooms = _.filter(Game.rooms[creep.memory.overlord].memory.remoteRooms, (r) => r !== creep.room.name);
}