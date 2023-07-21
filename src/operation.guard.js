/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.guardRoom = function () {
    let destination = this.memory.destination;
    let sentence = ['Security', 'Guard', 'For', destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // If no operation become border patrol
    if (!Memory.targetRooms[this.memory.destination]) {
        this.memory.operation = 'borderPatrol';
        return this.memory._shibMove = undefined;
    }
    // If military action required do that
    if (this.room.name !== destination) {
        if (this.room.hostileCreeps.length && this.canIWin(50)) return this.handleMilitaryCreep();
        return this.shibMove(new RoomPosition(25, 25, destination), {range: 24});
    }
    let guardLocation, guardRange;
    /** Season 1
     if (Game.shard.name === 'shardSeason') {
        guardLocation = this.room.find(FIND_SCORE_COLLECTORS)[0];
        if (guardLocation) {
            let sentence = ['Contact', MY_USERNAME, 'For', 'Access'];
            let word = Game.time % sentence.length;
            this.say(sentence[word], true);
        }
        guardRange = 8;
    } **/
    // Handle combat
    if (this.canIWin(50)) {
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            this.handleMilitaryCreep()
        } else this.findDefensivePosition();
    } else {
        if (!this.findDefensivePosition()) this.shibKite();
    }
    this.operationManager();
};