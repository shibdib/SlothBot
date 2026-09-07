/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);

    const dest = this.memory.destination;
    // Do not chase a flee through the portal. Fight in dest; from the bounce
    // room only shoot if they followed, then walk back in.
    if (dest && this.room.name !== dest) {
        this.attackInRange();
        this.healInRange(true);
        const destIntel = INTEL[dest];
        const ap = abilityPower(this.body);
        const combatPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);
        if (destIntel && destIntel.towers && destIntel.hostilePower > combatPower) {
            if (!this.memory.squadMembers || this.memory.squadMembers.length < 3) this.memory.needsMoreSquadMembers = true;
            return this.fleeHome(true);
        }
        this.memory.needsMoreSquadMembers = undefined;
        return this.shibMove(new RoomPosition(25, 25, dest), {range: 20});
    }

    if (this.handleMilitaryCreep(false, true, false)) {
        notePatrolEdge(this);
        this.memory.standingGuard = undefined;
        return;
    }

    if (this.hits < this.hitsMax) {
        if (this.hasActiveBodyparts(HEAL)) {
            this.findDefensivePosition();
            return this.heal(this);
        }
        return this.fleeHome();
    }

    if (dest) {
        if (!this.canIWin(50)) {
            if (!this.memory.squadMembers || this.memory.squadMembers.length < 3) this.memory.needsMoreSquadMembers = true;
            return this.fleeHome(true);
        }
        if (!this.room.hostileCreeps.length && !this.room.hostileStructures.length) {
            holdPatrolEdge(this);
            if (destStillHot(dest)) {
                this.memory.standingGuard = undefined;
                return;
            }
            if (!this.memory.standingGuard) this.memory.standingGuard = Game.time;
            else if (this.memory.standingGuard + 100 < Game.time) {
                this.memory.destination = undefined;
                this.memory.patrolEdge = undefined;
            }
            return;
        }
    }

    if (!this.memory.destination && !this.memory.awaitingOrders) {
        this.memory.needsMoreSquadMembers = undefined;
        this.memory.destination = this.memory.colony;
        this.memory.awaitingOrders = true;
    }

    if (this.memory.awaitingOrders && !this.memory.destination && this.room.name !== this.memory.colony) {
        this.memory.destination = this.memory.colony;
        this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
    } else {
        if (this.ticksToLive <= 500 && HOSTILES.length) this.memory.operation = 'harass';
        else if (!scanForNearbyThreats(this) && this.findDefensivePosition()) this.idleFor(5);
    }
};

function destStillHot(dest) {
    const intel = INTEL[dest];
    if (!intel) return false;
    if (intel.threatLevel) return true;
    if (intel.invaderTTL && intel.invaderTTL > Game.time) return true;
    if (intel.lastInvaderSighting && intel.lastInvaderSighting + 200 > Game.time) return true;
    return false;
}

function edgeOf(pos) {
    if (!pos) return 0;
    if (pos.x <= 1) return LEFT;
    if (pos.x >= 48) return RIGHT;
    if (pos.y <= 1) return TOP;
    if (pos.y >= 48) return BOTTOM;
    return 0;
}

function notePatrolEdge(creep) {
    const t = Game.getObjectById(creep.memory.target);
    if (!t || !t.pos || t.pos.roomName !== creep.room.name) return;
    const e = edgeOf(t.pos);
    if (!e) return;
    creep.memory.patrolEdge = e;
    creep.memory.patrolEdgeTick = Game.time;
}

function holdPatrolEdge(creep) {
    const e = creep.memory.patrolEdge;
    if (!e || (creep.memory.patrolEdgeTick || 0) + 200 < Game.time) {
        if (creep.findDefensivePosition()) creep.idleFor(5);
        return;
    }
    let x = 25, y = 25;
    if (e === LEFT) x = 3;
    else if (e === RIGHT) x = 46;
    else if (e === TOP) y = 3;
    else y = 46;
    const pos = new RoomPosition(x, y, creep.room.name);
    if (creep.pos.getRangeTo(pos) > 2) creep.shibMove(pos, {range: 2});
    else creep.idleFor(5);
}

function scanForNearbyThreats(creep) {
    const adjacentRooms = _.map(Game.map.describeExits(creep.room.name));
    for (let roomName of adjacentRooms) {
        let roomIntel = INTEL[roomName];
        if (roomIntel) {
            if (roomIntel.towers) continue;
            if (roomIntel.threatLevel) {
                if (!creep.memory.destination || creep.memory.destination !== roomName) {
                    creep.memory.destination = roomName;
                    creep.memory.awaitingOrders = undefined;
                    creep.say('Threat!', true);
                    return true;
                }
            }
        }
    }
}