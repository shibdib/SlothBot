let highCommand = require('military.highCommand');

Creep.prototype.rangersRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        let sentence = ['Pew', 'Bang', 'Pop', 'Peeeeeew'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.squadLeader);
        if (!squadLeader.length) this.memory.squadLeader = true;
        if (this.memory.squadLeader) {
            if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
            this.handleMilitaryCreep(false, false);
            threatManagement(this);
            highCommand.operationSustainability(this.room);
        } else {
            if (this.room.name === this.memory.targetRoom) {
                this.handleMilitaryCreep(false, false);
                threatManagement(this);
                highCommand.operationSustainability(this.room);
            } else {
                if (this.pos.rangeToTarget(squadLeader[0]) > 2) this.shibMove(squadLeader[0], {ignoreCreeps: false})
            }
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