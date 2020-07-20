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
    // Set visited
    if (!this.memory.other.visited) this.memory.other.visited = [];
    // Attack in range
    this.attackInRange();
    // Handle healing
    this.healInRange();
    // Set a target
    if (!this.memory.other.destination) {
        let roomName = this.room.name;
        let filtered = _.filter(Memory.roomCache, (r) => r.name !== roomName && !_.includes(this.memory.other.visited, r.name) && r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.safemode && !r.isHighway);
        let target = _.sortBy(_.filter(filtered, (r) => _.includes(Memory._enemies, r.user) && r.level && !r.towers), function (r) {
            Game.map.getRoomLinearDistance(roomName, r.name);
        })[0] || _.sortBy(_.filter(filtered, (r) => _.includes(Memory._enemies, r.user) && !r.level), function (r) {
            Game.map.getRoomLinearDistance(roomName, r.name);
        })[0] || _.sortBy(_.filter(filtered, (r) => _.includes(Memory._threatList, r.user) && r.level && !r.towers), function (r) {
            Game.map.getRoomLinearDistance(roomName, r.name);
        })[0] || _.sortBy(_.filter(filtered, (r) => _.includes(Memory._threatList, r.user) && !r.level), function (r) {
            Game.map.getRoomLinearDistance(roomName, r.name);
        })[0] || _.sortBy(_.filter(filtered, (r) => r.level && !r.towers && NEW_SPAWN_DENIAL), function (r) {
            Game.map.getRoomLinearDistance(roomName, r.name);
        })[0] || _.sortBy(_.filter(filtered, (r) => !r.level && POKE_NEUTRALS), function (r) {
            Game.map.getRoomLinearDistance(roomName, r.name);
        })[0];
        if (target) {
            this.memory.other.destination = target.name;
        } else if (!this.handleMilitaryCreep()) {
            this.memory.other.visited = [];
            this.findDefensivePosition(this);
        }
    } else {
        if (this.room.name !== this.memory.other.destination) {
            return this.shibMove(new RoomPosition(25, 25, this.memory.other.destination), {range: 19});
        }
        if (this.room.name === this.memory.other.destination) {
            if (!this.canIWin() || (!this.handleMilitaryCreep() && !this.moveToHostileConstructionSites())) {
                highCommand.generateThreat(this);
                if (!this.memory.other.onScene) this.memory.other.onScene = Game.time;
                // If on target and cant win find a new target
                if (this.memory.other.onScene + 100 < Game.time || !this.canIWin()) {
                    this.room.cacheRoomIntel(true);
                    this.memory.other.visited.push(this.memory.other.destination);
                    this.memory.other.destination = undefined;
                    this.memory.other.onScene = undefined;
                    this.shibKite();
                }
            }
        }
    }
};