/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);

    // Combat handling
    if (this.handleMilitaryCreep()) return;

    // Healing
    if (this.hits < this.hitsMax) {
        if (this.hasActiveBodyparts(HEAL)) {
            this.findDefensivePosition();
            return this.heal(this);
        } else {
            return this.fleeHome();
        }
    }

    // Movement
    if (this.memory.destination) {
        // If we are already on a mission, let's move there
        if (this.room.name !== this.memory.destination) {
            return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
        } else {
            if (!this.room.hostileCreeps.length && !this.room.hostileStructures.length) {
                if (!this.memory.standingGuard) this.memory.standingGuard = Game.time;
                else if (this.memory.standingGuard + 25 < Game.time) {
                    this.memory.destination = undefined;
                }
                this.idleFor(5);
                return;
            }
        }
    }

    // Awaiting orders
    if (!this.memory.destination && !this.memory.awaitingOrders) {
        this.memory.destination = this.memory.colony;
        this.memory.awaitingOrders = true;
    }

    // Idle handling
    if (this.memory.awaitingOrders && !this.memory.destination && this.room.name !== this.memory.colony) {
        this.memory.destination = this.memory.colony;
        this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
    } else {
        scanForNearbyThreats(this);
        if (!scanForNearbyThreats(this) && this.findDefensivePosition()) this.idleFor(5);
    }
};

function scanForNearbyThreats(creep) {
    const adjacentRooms = _.map(Game.map.describeExits(creep.room.name));
    for (let roomName of adjacentRooms) {
        let roomIntel = INTEL[roomName];
        if (roomIntel) {
            if (roomIntel.towers) continue;
            if (roomIntel.threatLevel || roomIntel.hostileStructures) {
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