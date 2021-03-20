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
    hud(this);
    // Attack in range
    this.attackInRange();
    // Handle healing
    this.healInRange();
    if (this.room.name === this.memory.other.destination || !this.memory.other.destination) {
        Memory.roomCache[this.room.name].lastMarauder = Game.time;
        if ((!this.room.hostileCreeps.length && !this.room.hostileStructures.length) || !this.canIWin(15) || !this.handleMilitaryCreep()) {
            highCommand.generateThreat(this);
            this.scorchedEarth();
            if (!this.memory.other.onScene) this.memory.other.onScene = Game.time;
            // If on target and cant win find a new target
            if (this.memory.other.onScene + 25 < Game.time || !this.canIWin()) {
                this.room.cacheRoomIntel(true);
                if (!this.memory.other.visited) this.memory.other.visited = [];
                if (this.memory.other.destination) this.memory.other.visited.push(this.memory.other.destination);
                this.memory.other.destination = undefined;
                this.memory.other.onScene = undefined;
                this.memory.awaitingTarget = true;
            }
            if (!this.shibKite()) this.findDefensivePosition();
        }
    }
    if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50) && this.handleMilitaryCreep()) return;
    // Handle flee
    if (this.memory.runCooldown || (!this.getActiveBodyparts(RANGED_ATTACK) && !this.getActiveBodyparts(ATTACK))) return this.fleeHome(true);
    // Move if needed
    if (this.memory.other.destination && this.room.name !== this.memory.other.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.other.destination), {range: 22});
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