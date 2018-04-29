let highCommand = require('military.highCommand');

Creep.prototype.swarmHarassRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        let sentence = ['Swarm', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        threatManagement(this);
        highCommand.operationSustainability(this.room);
        if (Memory.targetRooms[this.memory.targetRoom]) {
            let hostile = this.findClosestEnemy();
            if (hostile && hostile.body && (hostile.getActiveBodyparts(ATTACK) > 3 || hostile.getActiveBodyparts(RANGED_ATTACK) > 3)) {
                delete Memory.targetRooms[this.memory.targetRoom];
            } else {
                Memory.targetRooms[this.memory.targetRoom].level = 1;
            }
        }
        this.handleMilitaryCreep(true);
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