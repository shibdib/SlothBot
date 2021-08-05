/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.holdRoom = function () {
    let sentence = ['Coming', 'For', 'That', 'Booty', this.memory.destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Move to response room if needed
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
    } else {
        let sentence = ['Please', 'Abandon'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        // Handle combat
        if (this.canIWin(50)) {
            if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
                this.handleMilitaryCreep()
            } else if (!this.scorchedEarth()) this.findDefensivePosition();
        } else {
            this.shibKite();
        }
        if (Game.time % 5 === 0) levelManager(this);
        highCommand.operationSustainability(this.room);
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.destination] || creep.room.name !== creep.memory.destination) return;
    if (!creep.room.controller || (!creep.room.controller.owner && !creep.room.controller.reservation) || (!creep.room.creeps.length && !creep.room.structures.length)) return delete Memory.targetRooms[creep.memory.destination];
    // Safemode
    if (creep.room.controller.safeMode) {
        Memory.targetRooms[creep.memory.destination] = undefined;
        creep.suicide();
        return;
    } else if (creep.room.hostileCreeps.length) Memory.targetRooms[creep.memory.destination].level = 2;
    else Memory.targetRooms[creep.memory.destination].level = 1;
    Memory.targetRooms[creep.memory.destination].cleaner = creep.room.hostileStructures.length > 0;
    Memory.targetRooms[creep.memory.destination].claimAttacker = creep.room.controller && creep.room.controller.owner && (!creep.room.controller.upgradeBlocked || creep.room.controller.upgradeBlocked < CREEP_CLAIM_LIFE_TIME);
}