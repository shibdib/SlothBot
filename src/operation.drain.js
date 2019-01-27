let highCommand = require('military.highCommand');

Creep.prototype.drainRoom = function () {
    // If room is no longer a target
    if (this.room.name === this.memory.targetRoom) {
        let sentence = ['Gimme', 'That', 'Energy', 'Please'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
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
            let target = this.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => (s.structureType === STRUCTURE_TOWER)}) || this.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => (s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_CONTROLLER)});
            if (target) {
                if (this.getActiveBodyparts(WORK) && this.dismantle(target) === ERR_NOT_IN_RANGE) this.shibMove(target);
                if (this.getActiveBodyparts(ATTACK) && this.attack(target) === ERR_NOT_IN_RANGE) this.shibMove(target);
            }
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
    if (this.room.name === this.memory.targetRoom || this.hits < this.hitsMax) this.heal(this);
    this.borderHump();
};