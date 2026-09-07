/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);

    // Combat handling
    if (this.handleMilitaryCreep(false, true, false)) return;

    // Healing
    if (this.hits < this.hitsMax) {
        if (this.hasActiveBodyparts(HEAL)) {
            this.findDefensivePosition();
            return this.heal(this);
        } else {
            return this.fleeHome();
        }
    }

    // Determine creep/squad power
    const ap = abilityPower(this.body);
    let combatPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);

    if (this.memory.squadMembers && this.memory.squadMembers.length) {
        for (let member of this.memory.squadMembers) {
            const memberCreep = Game.getObjectById(member);
            if (memberCreep) {
                const memberAp = abilityPower(memberCreep.body);
                combatPower += memberAp.attack + memberAp.effectiveHeal + (memberAp.defense / 100);
            }
        }
    }
    // Movement
    if (this.memory.destination) {
        const dest = this.memory.destination;
        const destIntel = INTEL[dest];
        // In dest, kite/range beats raw power (melee invaders look "stronger"
        // than a blinky). From outside, only refuse tower rooms we cannot tank.
        if (this.room.name === dest) {
            if (!this.canIWin(50)) {
                if (!this.memory.squadMembers || this.memory.squadMembers.length < 3) this.memory.needsMoreSquadMembers = true;
                return this.fleeHome(true);
            }
            if (!this.room.hostileCreeps.length && !this.room.hostileStructures.length) {
                if (!this.memory.standingGuard) this.memory.standingGuard = Game.time;
                else if (this.memory.standingGuard + 100 < Game.time) {
                    this.memory.destination = undefined;
                }
                this.idleFor(5);
                return;
            }
        } else if (destIntel && destIntel.towers && destIntel.hostilePower > combatPower) {
            if (!this.memory.squadMembers || this.memory.squadMembers.length < 3) this.memory.needsMoreSquadMembers = true;
            return this.fleeHome(true);
        } else {
            this.memory.needsMoreSquadMembers = undefined;
            return this.shibMove(new RoomPosition(25, 25, dest), {range: 20});
        }
    }

    // Awaiting orders
    if (!this.memory.destination && !this.memory.awaitingOrders) {
        this.memory.needsMoreSquadMembers = undefined;
        this.memory.destination = this.memory.colony;
        this.memory.awaitingOrders = true;
    }

    // Idle handling
    if (this.memory.awaitingOrders && !this.memory.destination && this.room.name !== this.memory.colony) {
        this.memory.destination = this.memory.colony;
        this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
    } else {
        if (this.ticksToLive <= 500 && HOSTILES.length) this.memory.operation = 'harass';
        else if (!scanForNearbyThreats(this) && this.findDefensivePosition()) this.idleFor(5);
    }
};

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