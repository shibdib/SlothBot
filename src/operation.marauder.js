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
    this.attackInRange();
    // Set a target
    if (!this.memory.destination) {
        let lowLevel = _.sortBy(_.filter(Memory.roomCache, (r) => r.name !== this.room.name && r.user && r.user !== MY_USERNAME && _.includes(Memory._badBoyArray, r.user) && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.safemode && r.level && !r.towers), function (r) {
            Game.map.getRoomLinearDistance(r.name, this.room.name);
        })[0];
        if (lowLevel) {
            this.memory.destination = lowLevel.name;
        } else {
            let potential = _.sortBy(_.filter(Memory.roomCache, (r) => r.name !== this.room.name && r.user && r.user !== MY_USERNAME && _.includes(Memory._badBoyArray, r.user) && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.level && !r.towers), function (r) {
                Game.map.getRoomLinearDistance(r.name, this.room.name);
            })[0];
            if (potential) this.memory.destination = potential.name; else this.handleMilitaryCreep();
        }
    } else {
        if (this.room.name !== this.memory.destination) {
            return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 19});
        }
        if (this.room.name === this.memory.destination) {
            highCommand.generateThreat(this);
            // If on target and cant win find a new target
            if (!this.canIWin() || !this.handleMilitaryCreep()) {
                this.room.cacheRoomIntel(true);
                this.attackInRange();
                this.memory.destination = undefined;
                this.shibKite();
            }
        }
    }
};