/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    hud(this);
    // Attack in range
    this.attackInRange();
    // Handle healing
    this.healInRange();
    if (!this.canIWin(4)) return this.shibKite();
    if (!this.memory.other.responseTarget) {
        // Check neighbors
        let adjacent = _.filter(Game.map.describeExits(this.pos.roomName), (r) => Memory.roomCache[r] && Memory.roomCache[r].threatLevel)[0] || _.filter(Game.map.describeExits(this.pos.roomName), (r) => Memory.roomCache[r] && Memory.roomCache[r].roomHeat)[0];
        if (adjacent) {
            return this.memory.other.responseTarget = adjacent;
        }
        if (!this.memory.awaitingOrders) {
            // If on target, be available to respond
            if (!this.memory.onTarget) this.memory.onTarget = Game.time;
            // Don't idle in SK rooms, go home
            if (Memory.roomCache[this.room.name] && Memory.roomCache[this.room.name].sk) return this.memory.other.responseTarget = this.memory.overlord;
            // Idle in target rooms for 25 ticks then check if adjacent rooms need help or mark yourself ready to respond
            if (this.memory.onTarget + 25 <= Game.time) {
                this.memory.other.responseTarget = undefined;
                this.memory.awaitingOrders = true;
                this.memory.onTarget = undefined;
            }
        }
    }
    if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50) && this.handleMilitaryCreep()) return;
    if (this.memory.other.responseTarget && this.room.name !== this.memory.other.responseTarget) return this.shibMove(new RoomPosition(25, 25, this.memory.other.responseTarget), {range: 24});
    if (this.memory.other.responseTarget && this.room.name === this.memory.other.responseTarget && !this.room.hostileCreeps.length && !this.room.hostileStructures.length) this.memory.other.responseTarget = undefined;
    if (!this.memory.other.responseTarget) this.goToHub();
};

function offDuty(creep, partner = undefined) {
    if (!creep.healCreeps()) {
        let latestAttack = _.max(_.filter(Memory.roomCache, (r) => r.roomHeat > 0 && Game.map.getRoomLinearDistance(r.name, creep.memory.overlord) <= 2 && !r.threatLevel), 'roomHeat');
        if (latestAttack && latestAttack.name && latestAttack.name !== creep.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, latestAttack.name), {range: 8})
        } else if (!latestAttack && creep.room.name !== creep.memory.overlord) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 8})
        }
        if (!partner || partner.pos.isNearTo(creep)) {
            if (partner) partner.idleFor(10)
            return creep.idleFor(10);
        } else if (partner) {
            return partner.shibMove(this, {range: 0});
        }
    }
}

function hud(creep) {
    try {
        if (!creep.memory.other) return;
        let response = creep.memory.other.responseTarget || creep.room.name;
        Game.map.visual.text('BP', new RoomPosition(46, 2, response), {color: '#d68000', fontSize: 3, align: 'left'});
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