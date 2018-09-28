let highCommand = require('military.highCommand');

Creep.prototype.drainRoom = function () {
    let sentence = ['Gimme', 'That', 'Energy', 'Please'];
    let word = Game.time % sentence.length;
    if (this.room.name === this.memory.targetRoom) {
        let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy >= 10);
        if (!towers.length) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'clean',
                level: 1
            };
            Memory.targetRooms = cache;
        }
        highCommand.operationSustainability(this.room);
    }
    this.say(sentence[word], true);
    this.heal(this);
    this.borderHump();
};