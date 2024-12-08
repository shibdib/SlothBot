/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);

    // 1. Proactive Combat Check
    if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
        if (this.canIWin(50)) {
            if (this.handleMilitaryCreep() || this.scorchedEarth()) return;
            else return this.shibKite();
        }
    } else {
        // 2. Evaluate adjacent rooms for threats
        let adjacentRoomWithThreat = findAdjacentRoomWithThreat(this);
        if (adjacentRoomWithThreat) {
            // Move to the adjacent room with the highest threat
            this.memory.destination = adjacentRoomWithThreat;
            return this.shibMove(new RoomPosition(25, 25, adjacentRoomWithThreat), {range: 24});
        }

        // 3. Check current room status
        if (this.memory.destination) {
            // If we are already on a mission, let's move there
            if (this.room.name !== this.memory.destination) {
                return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
            } else {
                // 4. Evaluate if we should stay or move back
                if (!this.room.hostileCreeps.length && !this.room.hostileStructures.length) {
                    this.memory.destination = undefined; // Safe, so reset destination
                    this.idleFor(5); // Idle for a moment to observe
                    return;
                }
            }
        }

        // 5. Proactive behavior when idle
        if (!this.memory.destination && !this.memory.awaitingOrders) {
            if (INTEL[this.room.name] && INTEL[this.room.name].sk) {
                // If in SK room, return to overlord
                this.memory.destination = this.memory.overlord;
                this.idleFor(5);
            } else {
                // Mark for awaiting orders after idle
                this.memory.destination = this.memory.overlord;
                this.memory.awaitingOrders = true;
                this.idleFor(5);
            }
        }

        // 6. Move back to overlord if needed
        if (this.memory.awaitingOrders && !this.memory.destination) {
            this.memory.destination = this.memory.overlord;
            this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
        }
    }
};

/**
 * Find an adjacent room with threats based on INTEL.
 * @returns {string|null} The room name with the highest threat or null.
 */
findAdjacentRoomWithThreat = function (creep) {
    let adjacentRooms = _.map(Game.map.describeExits(creep.pos.roomName));
    let maxThreatLevel = 0;
    let roomWithHighestThreat = null;

    for (let adjacentRoom of adjacentRooms) {
        if (INTEL[adjacentRoom]) {
            let threat = INTEL[adjacentRoom].threatLevel || 0;
            let heat = INTEL[adjacentRoom].roomHeat || 0;

            // Prioritize rooms with higher threat or room heat
            if (threat > maxThreatLevel || heat > maxThreatLevel) {
                maxThreatLevel = Math.max(threat, heat);
                roomWithHighestThreat = adjacentRoom;
            }
        }
    }

    return roomWithHighestThreat;
};