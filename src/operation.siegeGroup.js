/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.siegeGroupRoom = function () {
    let sentence = [ICONS.respond];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Set squad leader
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.destination === this.memory.destination && c.memory.operation === 'siegeGroup' && c.memory.squadLeader);
        if (!squadLeader.length) this.memory.squadLeader = this.id; else this.memory.squadLeader = squadLeader[0].id;
    }
    // Handle squad leader
    if (this.memory.squadLeader === this.id) {
        // Sustainability
        if (this.room.name === this.memory.destination) highCommand.operationSustainability(this.room);
        //levelManager(this);
        // Check for squad
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.destination === this.memory.destination && c.memory.operation === this.memory.operation && c.id !== this.id);
        if (!squadMember.length) {
            if (this.room.controller && this.room.controller.my) this.idleFor(10);
            return this.handleMilitaryCreep(false, false);
        }
        if (this.pos.findInRange(squadMember, 2).length < squadMember.length) return this.idleFor(1);
        // If military action required do that
        this.attackInRange();
        // Heal
        if (this.hits < this.hitsMax) this.heal(this);
        // Move to response room if needed
        if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
        this.siege();
    } else {
        // Set leader and move to them
        let leader = Game.getObjectById(this.memory.squadLeader);
        if (!leader) {
            if (this.room.controller && this.room.controller.my) this.idleFor(10);
            return delete this.memory.squadLeader;
        }
        if (this.room.name === leader.room.name) {
            let moveRange = 0;
            let ignore = true;
            if (this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49 || this.pos.getRangeTo(leader) > 1) {
                moveRange = 1;
                ignore = false;
            }
            this.shibMove(leader, {range: moveRange, ignoreCreeps: ignore, ignoreRoads: true});
        } else {
            this.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 23});
        }
        // Heal squadmates
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.destination === this.memory.destination && c.memory.operation === 'siegeGroup' && c.id !== this.id);
        // Heal squad
        let woundedSquad = _.filter(squadMember, (c) => c.hits < c.hitsMax && c.pos.getRangeTo(this) === 1);
        if (this.hits === this.hitsMax && woundedSquad[0]) this.heal(woundedSquad[0]); else if (this.hits < this.hitsMax) this.heal(this);
    }
};