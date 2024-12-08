/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('military.highCommand');

Creep.prototype.roomDenial = function () {
    // Boost logic - only boost if needed
    if (this.tryToBoost(['ranged', 'heal'])) return;

    // Become border patrol if no longer a target room
    if (!Memory.targetRooms[this.memory.other.target]) {
        this.memory.operation = 'borderPatrol';
        this.memory.destination = undefined;
        this.say('No target', true);
        return;
    }

    let sentence = ['No', 'Remotes', 'Allowed'];
    this.say(sentence[Game.time % sentence.length], true);

    // Combat handling - engage if possible, kite if necessary
    if (this.canIWin(10)) {
        if (this.handleMilitaryCreep() || this.scorchedEarth()) return;
    } else {
        return this.shibKite();
    }

    // If already in the target room
    if (this.room.name === this.memory.destination) {
        highCommand.generateThreat(this); // Notify High Command of ongoing threat
        if (this.memory.other) highCommand.operationSustainability(this.room, this.memory.other.target);

        // Combat management: prioritize handling hostiles
        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            // Determine the level of the threat (hostile creeps present or not)
            if (this.room.hostileCreeps.length) {
                Memory.targetRooms[this.memory.other.target].level = 2; // High threat level
            } else {
                Memory.targetRooms[this.memory.other.target].level = 1; // Lower threat level
            }
        } else {
            // If no immediate threat, retask or patrol a nearby area
            this.memory.destination = findNextTargetRoom(this.memory.other.target);
            this.say('RETASKED', true);
        }
    } else {
        // If not in the target room, move towards it
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};

// Standalone function to find the next target room
function findNextTargetRoom(targetRoom) {
    // Get a list of exits to adjacent rooms
    let adjacentRooms = Game.map.describeExits(targetRoom);
    // Filter to find a room that has no owner or is under weak control
    let possibleTargets = _.filter(adjacentRooms, (r) => !INTEL[r] || !INTEL[r].owner || INTEL[r].threatLevel < 2);

    // If we have a valid target, return the room name
    if (possibleTargets.length) {
        return _.sample(possibleTargets); // Choose a random valid room from the list
    } else {
        // No immediate valid targets, return to a safe position (perhaps the overworld?)
        return null;
    }
}
