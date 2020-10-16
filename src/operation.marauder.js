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
    // Set visited
    if (!this.memory.other.visited) this.memory.other.visited = [];
    // Attack in range
    this.attackInRange();
    // Handle healing
    this.healInRange();
    // Set heal buddy
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.squadLeader === c.id && c.memory.operation === 'marauding' && !c.memory.buddyAssigned)[0];
        if (!squadLeader && this.memory.role === 'longbow') this.memory.squadLeader = this.id; else if (squadLeader) this.memory.squadLeader = squadLeader.id;
    }
    if (this.memory.squadLeader === this.id) {
        hud(this);
        // Clear kite if needed
        this.memory.squadKite = undefined;
        // Handle buddy checks
        let buddy = _.filter(Game.creeps, (c) => c.my && c.memory.squadLeader === this.id && c.id !== this.id)[0];
        if (buddy) {
            this.memory.buddyAssigned = buddy.id;
            if (buddy.room.name === this.room.name && !buddy.pos.isNearTo(this)) return this.shibMove(buddy);
            if (this.hits === this.hitsMax && buddy.hits < buddy.hitsMax) this.heal(buddy);
        }
        // Set a target
        if (!this.memory.other.destination) {
            this.memory.awaitingTarget = true;
        } else {
            if (this.room.name !== this.memory.other.destination) {
                // Handle flee
                if (this.room.hostileCreeps.length && !this.canIWin(8)) return this.shibKite(9);
                return this.shibMove(new RoomPosition(25, 25, this.memory.other.destination), {range: 19});
            }
            if (this.room.name === this.memory.other.destination) {
                Memory.roomCache[this.room.name].lastMarauder = Game.time;
                if ((!this.room.hostileCreeps.length && !this.room.hostileStructures.length) || !this.canIWin(15) || (!this.moveToHostileConstructionSites() && !this.handleMilitaryCreep(false, true, true))) {
                    highCommand.generateThreat(this);
                    this.scorchedEarth();
                    if (!this.memory.other.onScene) this.memory.other.onScene = Game.time;
                    // If on target and cant win find a new target
                    if (this.memory.other.onScene + 25 < Game.time || !this.canIWin()) {
                        this.room.cacheRoomIntel(true);
                        this.memory.other.visited.push(this.memory.other.destination);
                        this.memory.other.destination = undefined;
                        this.memory.other.onScene = undefined;
                        this.shibKite();
                    }
                }
            }
        }
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