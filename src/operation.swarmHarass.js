Creep.prototype.swarmHarassRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        let sentence = ['Swarm', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        threatManagement(this);
        if (Memory.targetRooms[this.memory.targetRoom]) {
            let hostile = this.findClosestEnemy();
            if (hostile && hostile.body && (hostile.getActiveBodyparts(ATTACK) || hostile.getActiveBodyparts(RANGED_ATTACK))) {
                Memory.targetRooms[this.memory.targetRoom].level = 2;
            } else {
                Memory.targetRooms[this.memory.targetRoom].level = 1;
            }
        }
        this.handleMilitaryCreep(true);
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