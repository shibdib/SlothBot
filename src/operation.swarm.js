Creep.prototype.swarmRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        let sentence = ['Swarm', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        threatManagement(this);
        this.handleMilitaryCreep(true);
    }
};

function threatManagement(creep) {
    let user = creep.room.controller.owner.username;
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