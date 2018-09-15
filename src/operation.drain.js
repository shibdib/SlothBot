Creep.prototype.drainRoom = function () {
    let sentence = ['Gimme', 'That', 'Energy', 'Please'];
    let word = Game.time % sentence.length;
    if (this.room.name === this.memory.targetRoom) {
        let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy >= 15);
        if (!tower.length) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'clean',
                level: 1
            };
            Memory.targetRooms = cache;
        }
    }
    this.say(sentence[word], true);
    this.heal(this);
    this.borderHump();
};