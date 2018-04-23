Creep.prototype.harassRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (!Memory.targetRooms[this.memory.targetRoom] || Memory.targetRooms[this.memory.targetRoom].type !== 'harass') {
            this.memory.responseTarget = this.room.name;
            this.memory.operation = undefined;
            return;
        }
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        threatManagement(this);
        let sentence = ['Area', 'Denial', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        let hostile = this.findClosestEnemy();
        if (Memory.targetRooms[this.memory.targetRoom]) {
            if (hostile && hostile.body && (hostile.getActiveBodyparts(ATTACK) || hostile.getActiveBodyparts(RANGED_ATTACK))) {
                Memory.targetRooms[this.memory.targetRoom].level = 2;
                if (Math.random() > Math.random()) {
                    let cache = Memory.targetRooms || {};
                    let tick = Game.time;
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'rangers',
                        level: 1,
                        priority: Memory.targetRooms[this.memory.targetRoom].priority
                    };
                    Memory.targetRooms = cache;
                    return;
                }
            } else {
                Memory.targetRooms[this.memory.targetRoom].level = 1;
            }
        } else {
            this.memory.awaitingOrders = true;
            if (this.room.name !== this.memory.overlord) return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 23});
        }
        if (this.memory.role === 'longbow') {
            if (hostile) {
                Memory.targetRooms[this.memory.targetRoom].hostilesLastSeen = Game.time;
                if (this.hits < this.hitsMax * 0.50 || !this.getActiveBodyparts(RANGED_ATTACK)) return this.kite(8);
                return this.fightRanged(hostile);
            } else {
                if (Memory.targetRooms[this.memory.targetRoom]) Memory.targetRooms[this.memory.targetRoom].level = 1;
                if (!Memory.targetRooms[this.memory.targetRoom].hostilesLastSeen) Memory.targetRooms[this.memory.targetRoom].hostilesLastSeen = Game.time;
                if (Memory.targetRooms[this.memory.targetRoom].hostilesLastSeen && Memory.targetRooms[this.memory.targetRoom].hostilesLastSeen + 250 < Game.time) {
                    delete Memory.targetRooms[this.room.name];
                    this.memory.awaitingOrders = true;
                }
                if (!this.moveToHostileConstructionSites()) {
                    if (!this.healMyCreeps() && !this.healAllyCreeps()) {
                        this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 17});
                    }
                }
            }
        } else if (this.memory.role === 'attacker') {
            this.handleMilitaryCreep();
        } else if (this.memory.role === 'healer') {
            this.squadHeal();
        }
    }
};

function threatManagement(creep) {
    if (!creep.room.controller || !creep.room.controller.reservation) return;
    let user = creep.room.controller.reservation.username;
    if (_.includes(FRIENDLIES, user)) return;
    let cache = Memory._badBoyList || {};
    let threatRating = 50;
    if (cache[user] && cache[user]['threatRating'] > 50) threatRating = cache[user]['threatRating'];
    cache[user] = {
        threatRating: threatRating,
        lastAction: Game.time,
    };
    Memory._badBoyList = cache;
}