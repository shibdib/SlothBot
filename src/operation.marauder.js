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
    // Set squad leader
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.operation === 'marauder' && c.memory.squadLeader === c.id)[0];
        if (!squadLeader) this.memory.squadLeader = this.id; else this.memory.squadLeader = squadLeader.id;
    }
    if (this.memory.squadLeader === this.id) {
        // Set a target
        if (!this.memory.other.destination) {
            let roomName = this.room.name;
            let filtered = _.filter(Memory.roomCache, (r) => r.name !== roomName && !_.includes(this.memory.other.visited, r.name) && r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && !r.sk && !r.safemode && !r.isHighway);
            let target = shuffle(_.filter(filtered, (r) => _.includes(Memory._enemies, r.user) && r.level && !r.towers))[0]
                || shuffle(_.filter(filtered, (r) => _.includes(Memory._threatList, r.user) && r.level && !r.towers))[0]
                || shuffle(_.filter(filtered, (r) => NEW_SPAWN_DENIAL && !_.includes(FRIENDLIES, r.user) && r.level && !r.towers))[0]
                || shuffle(_.filter(filtered, (r) => ATTACK_LOCALS && !_.includes(FRIENDLIES, r.user) && !r.towers))[0]
                || shuffle(_.filter(filtered, (r) => _.includes(Memory._threatList, r.user) && !r.level))[0]
                || shuffle(_.filter(filtered, (r) => r.level && !r.towers && NEW_SPAWN_DENIAL))[0]
                || shuffle(_.filter(filtered, (r) => !r.level && POKE_NEUTRALS))[0];
            if (target) {
                this.memory.other.destination = target.name;
            } else if (!this.handleMilitaryCreep()) {
                if (!this.goToHub(this.memory.overlord)) this.memory.other.visited = [];
            }
        } else {
            if (this.room.name !== this.memory.other.destination) {
                return this.shibMove(new RoomPosition(25, 25, this.memory.other.destination), {range: 19});
            }
            if (this.room.name === this.memory.other.destination) {
                if ((!this.room.hostileCreeps.length && !this.room.hostileStructures.length) || !this.canIWin() || (!this.moveToHostileConstructionSites() && !this.handleMilitaryCreep())) {
                    highCommand.generateThreat(this);
                    this.scorchedEarth();
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
    } else {
        // Set leader and move to them
        let leader = Game.getObjectById(this.memory.squadLeader);
        if (this.room.name === leader.room.name) {
            let moveRange = 0;
            let ignore = true;
            if (this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49 || this.pos.getRangeTo(leader) > 2) {
                moveRange = 1;
                ignore = false;
            }
            this.shibMove(leader, {range: moveRange, ignoreCreeps: ignore, ignoreRoads: true});
        } else {
            this.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 23});
        }
    }
};