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
            let towerTarget = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER);
            if (this.getActiveBodyparts(WORK) && this.dismantle(towerTarget[0]) === ERR_NOT_IN_RANGE) this.shibMove(towerTarget[0])
            if (this.getActiveBodyparts(ATTACK) && this.attack(towerTarget[0]) === ERR_NOT_IN_RANGE) this.shibMove(towerTarget[0])
        } else {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.pos.roomName] = {
                tick: tick,
                type: 'drain',
                level: towers.length + 1
            };
            Memory.targetRooms = cache;
        }
        highCommand.operationSustainability(this.room);
        highCommand.threatManagement(this);
    }
    this.say(sentence[word], true);
    if (this.room.name === this.memory.targetRoom || this.hits < this.hitsMax) this.heal(this);
    this.borderHump();
};