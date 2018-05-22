let highCommand = require('military.highCommand');

Creep.prototype.harassRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (!Memory.targetRooms[this.memory.targetRoom] || Memory.targetRooms[this.memory.targetRoom].type !== 'harass') {
            this.memory.responseTarget = this.room.name;
            this.memory.operation = undefined;
            return;
        }
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 19});
        threatManagement(this);
        highCommand.operationSustainability(this.room);
        let sentence = ['Area', 'Denial', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        let hostile = this.findClosestEnemy();
        if (Memory.targetRooms[this.memory.targetRoom]) {
            if (hostile && hostile.body && (hostile.getActiveBodyparts(ATTACK) > 3 || hostile.getActiveBodyparts(RANGED_ATTACK) > 3)) {
                Memory.targetRooms[this.memory.targetRoom].level = 2;
            } else {
                Memory.targetRooms[this.memory.targetRoom].level = 1;
                this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 19});
            }
        } else {
            this.memory.awaitingOrders = true;
            if (this.room.name !== this.memory.overlord) return this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 19});
        }
        if (this.memory.role === 'longbow') {
            this.handleMilitaryCreep();
        } else if (this.memory.role === 'attacker') {
            this.handleMilitaryCreep();
        } else if (this.memory.role === 'healer') {
            this.squadHeal();
        }
    }
};

function threatManagement(creep) {
    if (!creep.room.controller) return;
    let user;
    if (creep.room.controller.owner) user = creep.room.controller.owner.username;
    if (creep.room.controller.reservation) user = creep.room.controller.reservation.username;
    if (!user) return;
    let cache = Memory._badBoyList || {};
    let threatRating = 50;
    if (cache[user] && cache[user]['threatRating'] > 50) threatRating = cache[user]['threatRating'];
    cache[user] = {
        threatRating: threatRating,
        lastAction: Game.time,
    };
    Memory._badBoyList = cache;
}