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
    // Set heal partner
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord && c.memory.squadLeader === c.id && c.memory.operation === 'borderPatrol' && !c.memory.buddyAssigned)[0];
        if (!squadLeader && this.memory.role === 'longbow') this.memory.squadLeader = this.id; else if (squadLeader) this.memory.squadLeader = squadLeader.id;
    }
    // Handle squad leader
    if (this.memory.squadLeader === this.id) {
        hud(this);
        // Attack in range
        this.attackInRange();
        // Handle healing
        this.healInRange();
        // Handle partner checks
        let partner = Game.getObjectById(this.memory.buddyAssigned) || _.filter(Game.creeps, (c) => c.my && c.memory.squadLeader === this.id && c.id !== this.id)[0];
        if (partner) {
            this.memory.buddyAssigned = partner.id;
            // Attack in range
            partner.attackInRange();
            // Handle healing
            partner.healInRange();
            // Handle next to each other
            if (partner.pos.isNearTo(this)) {
                // Handle idling
                if (this.memory.awaitingOrders && this.memory.offDuty && !this.room.hostileCreeps.length && !this.room.hostileStructures.length) {
                    return offDuty(this, partner);
                }
                this.memory.offDuty = undefined;
                // Handle flee
                if (this.memory.runCooldown) {
                    this.fleeHome(true);
                    return partner.shibMove(this, {range: 0});
                } // Handle winnable fights
                else if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(10) && this.pairFighting(partner)) {
                    this.memory.onTarget = undefined;
                    this.memory.other.responseTarget = this.room.name;
                    this.memory.awaitingOrders = undefined;
                } // Move to response target
                else if (this.memory.other.responseTarget && this.room.name !== this.memory.other.responseTarget) {
                    this.shibMove(new RoomPosition(25, 25, this.memory.other.responseTarget), {range: 22});
                    return partner.shibMove(this, {range: 0});
                } // If room is hopeless head home
                else if (this.room.hostileCreeps.length && !this.canIWin(50, true)) {
                    if (!this.canIWin(5)) {
                        this.shibKite();
                        if (!partner.pos.positionAtDirection(this.memory.lastKite).checkForImpassible()) return partner.move(this.memory.lastKite); else return partner.shibMove(this, {range: 0});
                    }
                    if (this.memory.other.responseTarget && this.room.name === this.memory.other.responseTarget) this.memory.other.responseTarget = undefined;
                    this.goToHub();
                    return partner.shibMove(this, {range: 0});
                } // If room is winnable but waiting on help, kite
                else if (this.room.hostileCreeps.length && !this.canIWin(7)) {
                    if (this.memory.other.responseTarget && this.room.name === this.memory.other.responseTarget) this.memory.other.responseTarget = undefined;
                    this.shibKite(8);
                    if (!partner.pos.positionAtDirection(this.memory.lastKite).checkForImpassible()) return partner.move(this.memory.lastKite); else return partner.shibMove(this, {range: 0});
                } // Handle idle
                else if (!this.memory.awaitingOrders) {
                    // Check neighbors
                    let adjacent = _.filter(Game.map.describeExits(this.pos.roomName), (r) => Memory.roomCache[r] && Memory.roomCache[r].threatLevel &&
                        Memory.roomCache[r].user === MY_USERNAME && Memory.roomCache[r].hostilePower < (Memory.roomCache[r].friendlyPower + Memory.roomCache[this.room.name].friendlyPower))[0];
                    if (adjacent) {
                        return this.memory.other.responseTarget = adjacent;
                    }
                    // If on target, be available to respond
                    if (!this.memory.onTarget) this.memory.onTarget = Game.time;
                    // Don't idle in SK rooms, go home
                    if (Memory.roomCache[this.room.name] && Memory.roomCache[this.room.name].sk) return this.memory.other.responseTarget = this.memory.overlord;
                    // Idle in target rooms for 5 ticks then check if adjacent rooms need help or mark yourself ready to respond
                    if (this.memory.onTarget + 5 <= Game.time) {
                        this.memory.other.responseTarget = undefined;
                        this.memory.awaitingOrders = true;
                        this.memory.onTarget = undefined;
                    }
                } else {
                    this.memory.offDuty = true;
                }
            } // If in same room but apart move to each other
            else if (partner.room.name === this.room.name && !partner.pos.isNearTo(this)) {
                partner.shibMove(this, {range: 0});
                if (!this.canIWin(10)) this.shibKite();
            } // Handle separate rooms
            else if (partner.room.name !== this.room.name) {
                if (this.canIWin(10)) this.handleMilitaryCreep(); else this.shibKite();
                if (partner.canIWin(5)) partner.shibMove(this); else partner.shibKite();
            }
        } else {
            this.memory.buddyAssigned = undefined;
            if (this.canIWin(50) && this.handleMilitaryCreep()) return; else return this.goToHub();
        }
    }
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