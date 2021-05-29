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
    // Set heal partner
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.squadLeader === c.id && c.memory.operation === 'siegeGroup' && c.memory.destination === this.memory.destination && !c.memory.buddyAssigned)[0];
        if (!squadLeader && this.memory.role === 'longbow') this.memory.squadLeader = this.id; else if (squadLeader) {
            this.memory.squadLeader = squadLeader.id;
            return;
        }
    } else if (this.memory.squadLeader && this.memory.squadLeader !== this.id) return;
    // Handle squad leader
    if (this.memory.squadLeader === this.id) {
        // Sustainability
        if (this.room.name === this.memory.destination) highCommand.operationSustainability(this.room);
        // Handle partner checks
        let partner = _.filter(Game.creeps, (c) => c.my && c.memory.squadLeader === this.id && c.id !== this.id)[0];
        if (partner) {
            this.memory.buddyAssigned = partner.id;
            // Attack in range
            partner.attackInRange();
            // Handle healing
            partner.healInRange();
            // If in same room but apart move to each other
            if (partner.room.name === this.room.name && !partner.pos.isNearTo(this)) {
                partner.shibMove(this, {range: 0});
                if (!this.canIWin(10)) this.shibKite();
            } // Handle separate rooms
            else if (partner.room.name !== this.room.name) {
                if (this.canIWin(10)) this.handleMilitaryCreep(); else this.shibKite();
                if (partner.canIWin(5)) partner.shibMove(this); else partner.shibKite();
            } // Handle next to each other
            else if (partner.pos.isNearTo(this)) {
                partner.shibMove(this, {range: 0});
                // Move to response room if needed
                if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
                // Handle winnable fights
                this.handleMilitaryCreep();
            }
        } else {
            this.memory.buddyAssigned = undefined;
            if (this.canIWin(50) && this.handleMilitaryCreep()) return; else return this.goToHub();
        }
    }
};