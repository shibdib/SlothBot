let highCommand = require('military.highCommand');

Creep.prototype.conscriptsRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        let sentence = ['CREEP', 'WAVE'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'conscripts' && c.memory.squadLeader);
        if (!squadLeader.length) return this.memory.squadLeader = true;
        let squadMember = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'conscripts' && !c.memory.squadLeader);
        if (this.memory.squadLeader && squadMember.length && this.pos.findInRange(squadMember, 1).length < 3) return this.attackInRange();
        if (this.memory.squadLeader && !this.handleMilitaryCreep(false, false)) {
            if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
            levelManager(this);
            highCommand.operationSustainability(this.room);
            highCommand.threatManagement(this);
        } else if (!this.memory.squadLeader) {
            if (this.room.name === squadLeader[0].room.name) this.shibMove(squadLeader[0], {
                range: 1,
                ignoreCreeps: false
            }); else this.shibMove(new RoomPosition(25, 25, squadLeader[0].room.name), {range: 17});
            let squadMember = _.min(this.pos.findInRange(_.filter(this.room.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'conscripts' && c.id !== this.id && c.hits < c.hitsMax), 3), 'hits');
            if (this.hits === this.hitsMax && squadMember.id) {
                if (this.pos.getRangeTo(squadMember) === 1) this.heal(squadMember); else this.rangedHeal(squadMember);
            } else if (this.hits < this.hitsMax) {
                this.heal(this);
            }
            this.attackInRange();
        }
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.targetRoom]) return;
    let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
    let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 2;
    } else if (enemyCreeps.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 1;
    }
}