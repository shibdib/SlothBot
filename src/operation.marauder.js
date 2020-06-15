/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');
Creep.prototype.marauding = function () {
    let sentence = ['Oh', 'No', 'Here', 'I', 'Go', 'Killing', 'Again'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Attack in range
    this.attackInRange();
    // Handle healing
    this.healInRange();
    // Set a target
    if (!this.memory.destination) {
        let target = _.sortBy(_.filter(Memory.roomCache, (r) => r.name !== this.room.name && r.user && r.user !== MY_USERNAME && _.includes(Memory._badBoyArray, r.user) && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.safemode && r.level && !r.towers), function (r) {
            Memory.roomCache[r.name].closestRange;
        })[0] || _.sortBy(_.filter(Memory.roomCache, (r) => r.name !== this.room.name && r.user && r.user !== MY_USERNAME && _.includes(Memory._badBoyArray, r.user) && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.level && !r.towers), function (r) {
            Memory.roomCache[r.name].closestRange;
        })[0] || _.sortBy(_.filter(Memory.roomCache, (r) => r.name !== this.room.name && r.user && r.user !== MY_USERNAME && Memory.ncpArray && _.includes(Memory.ncpArray, r.user) && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.level && !r.towers), function (r) {
            Memory.roomCache[r.name].closestRange;
        })[0] || _.sortBy(_.filter(Memory.roomCache, (r) => r.name !== this.room.name && r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.towers && NEW_SPAWN_DENIAL), function (r) {
            Memory.roomCache[r.name].closestRange;
        })[0] || _.sortBy(_.filter(Memory.roomCache, (r) => r.name !== this.room.name && r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.level && !r.towers && NEW_SPAWN_DENIAL), function (r) {
            Memory.roomCache[r.name].closestRange;
        })[0] || _.sortBy(_.filter(Memory.roomCache, (r) => r.name !== this.room.name && r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.level && !r.towers), function (r) {
            Memory.roomCache[r.name].closestRange;
        })[0];
        if (target) {
            this.memory.destination = target.name;
        } else if (!this.handleMilitaryCreep()) {
            this.findDefensivePosition(this);
        }
    } else {
        if (this.room.name !== this.memory.destination) {
            return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 19});
        }
        if (this.room.name === this.memory.destination) {
            highCommand.generateThreat(this);
            if (!this.memory.onScene) this.memory.onScene = Game.time;
            // If on target and cant win find a new target
            if (!this.canIWin() || (!this.handleMilitaryCreep() && !this.moveToHostileConstructionSites()) || this.memory.onScene + 100 < Game.time) {
                this.room.cacheRoomIntel(true);
                this.memory.destination = undefined;
                this.memory.onScene = undefined;
                this.shibKite();
            }
        }
    }
};