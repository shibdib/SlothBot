/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.guardRoom = function () {
    if (this.tryToBoost(['ranged_attack', 'heal', 'attack', 'tough'])) return;

    let destination = this.memory.destination;
    let sentence = ['Security', 'Guard', 'For', destination];
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

    // Move to the destination room if not there yet
    if (this.room.name !== destination) {
        return this.shibMove(new RoomPosition(25, 25, destination), {range: 24});
    }

    // If no enemies, focus on healing or defending
    if (!this.healCreeps()) {
        this.findDefensivePosition();  // Move to a defensive position if no healing needed
    }

    // Check for new mission or update orders if necessary
    this.operationManager();

    scanForNearbyThreats(this);
};

function scanForNearbyThreats(creep) {
    const adjacentRooms = _.map(Game.map.describeExits(creep.room.name));
    for (let roomName of adjacentRooms) {
        let roomIntel = INTEL[roomName];
        if (roomIntel && (roomIntel.threatLevel || roomIntel.hostileStructures)) {
            log.a('Potential threat detected in ' + roomLink(roomName), 'GUARD: ');
            if (!creep.memory.destination || creep.memory.destination !== roomName) {
                creep.memory.destination = roomName;
                creep.say('Threat Detected', true);
            }
        }
    }
};