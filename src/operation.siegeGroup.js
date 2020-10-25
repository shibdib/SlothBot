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
        if (!squadLeader && this.memory.role === 'longbow') this.memory.squadLeader = this.id; else if (squadLeader) this.memory.squadLeader = squadLeader.id;
    }
    // Handle squad leader
    if (this.memory.squadLeader === this.id) {
        hud(this);
        // Sustainability
        if (this.room.name === this.memory.destination) highCommand.operationSustainability(this.room);
        // Attack in range
        this.attackInRange();
        // Handle healing
        this.healInRange();
        // Handle Boosts
        if (this.tryToBoost(['heal', 'rangedAttack'])) return;
        // Handle partner checks
        let partner = _.filter(Game.creeps, (c) => c.my && c.memory.squadLeader === this.id && c.id !== this.id)[0];
        if (partner) {
            this.memory.buddyAssigned = partner.id;
            // Handle Boosts
            if (partner.tryToBoost(['heal', 'rangedAttack'])) return this.shibKite();
            // Attack in range
            partner.attackInRange();
            // Handle healing
            partner.healInRange();
            // If in same room but apart move to each other
            if (partner.room.name === this.room.name && !partner.pos.isNearTo(this)) {
                partner.shibMove(this, {range: 0});
                if (!this.canIWin(10)) this.shibKite();
                return;
            } // Handle separate rooms
            else if (partner.room.name !== this.room.name) {
                if (this.canIWin(10)) this.handleMilitaryCreep(); else this.shibKite();
                if (partner.canIWin(5)) partner.shibMove(this); else partner.shibKite();
            } // Handle next to each other
            else if (partner.pos.isNearTo(this)) {
                partner.shibMove(this, {range: 0});
                // Move to response room if needed
                if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
                // Handle flee
                if (this.memory.runCooldown || (!this.getActiveBodyparts(RANGED_ATTACK) && !this.getActiveBodyparts(ATTACK))) {
                    this.fleeHome(true);
                    return partner.shibMove(this, {range: 0});
                }
                // Handle winnable fights
                if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(10) && this.pairFighting(partner)) {
                    return;
                }
            }
        } else {
            this.memory.buddyAssigned = undefined;
            if (this.canIWin(50) && this.handleMilitaryCreep()) return; else return this.goToHub();
        }
    }
};

function hud(creep) {
    try {
        let response = creep.memory.destination || creep.room.name;
        Game.map.visual.text('SIEGE', new RoomPosition(17, 3, response), {
            color: '#d68000',
            fontSize: 3,
            align: 'left'
        });
        if (response !== creep.room.name && creep.memory._shibMove && creep.memory._shibMove.route) {
            let route = [];
            for (let routeRoom of creep.memory._shibMove.route) {
                if (routeRoom === creep.room.name) route.push(new RoomPosition(creep.pos.x, creep.pos.y, routeRoom));
                else route.push(new RoomPosition(25, 25, routeRoom));
            }
            for (let posNumber = 0; posNumber++; posNumber < route.length) {
                Game.map.visual.line(route[posNumber], route[posNumber + 1])
            }
        }
    } catch (e) {
    }
}