/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');
Creep.prototype.marauding = function () {
    let sentence = ['Oh', 'No', 'Here', 'I', 'Go', 'Killing', 'Again'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Set heal buddy
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.squadLeader === c.id && c.memory.operation === 'marauding' && !c.memory.buddyAssigned)[0];
        if (!squadLeader && this.memory.role === 'longbow') this.memory.squadLeader = this.id; else if (squadLeader) this.memory.squadLeader = squadLeader.id;
    }
    if (this.memory.squadLeader === this.id) {
        hud(this);
        // Set visited
        if (!this.memory.other.visited) this.memory.other.visited = [];
        // Attack in range
        this.attackInRange();
        // Handle healing
        this.healInRange();
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
                return;
            } // Handle separate rooms
            else if (partner.room.name !== this.room.name) {
                if (this.canIWin(10)) this.handleMilitaryCreep(); else this.shibKite();
                if (partner.canIWin(5)) partner.shibMove(this); else partner.shibKite();
            } // Handle next to each other
            else if (partner.pos.isNearTo(this)) {
                partner.shibMove(this, {range: 0});
            }
        } else {
            this.memory.buddyAssigned = undefined;
            if (this.canIWin(50) && this.handleMilitaryCreep()) return;
        }
        // Handle flee
        if (this.memory.runCooldown || (!this.getActiveBodyparts(RANGED_ATTACK) && !this.getActiveBodyparts(ATTACK))) return this.fleeHome(true);
        // Move if needed
        if (this.memory.other.destination && this.room.name !== this.memory.other.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.other.destination), {range: 22});
        if (this.room.name === this.memory.other.destination || !this.memory.other.destination) {
            Memory.roomCache[this.room.name].lastMarauder = Game.time;
            if ((!this.room.hostileCreeps.length && !this.room.hostileStructures.length) || !this.canIWin(15) || !this.pairFighting(partner)) {
                highCommand.generateThreat(this);
                this.scorchedEarth();
                if (!this.memory.other.onScene) this.memory.other.onScene = Game.time;
                // If on target and cant win find a new target
                if (this.memory.other.onScene + 25 < Game.time || !this.canIWin()) {
                    this.room.cacheRoomIntel(true);
                    this.memory.other.visited.push(this.memory.other.destination);
                    this.memory.other.destination = undefined;
                    this.memory.other.onScene = undefined;
                    this.memory.awaitingTarget = true;
                }
                if (!this.shibKite()) this.findDefensivePosition();
            }
        }
    }
};

function hud(creep) {
    try {
        let response = creep.memory.other.destination || creep.room.name;
        Game.map.visual.text('MARAUDER', new RoomPosition(17, 3, response), {
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