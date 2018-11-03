let highCommand = require('military.highCommand');

Creep.prototype.guardRoom = function () {
    let sentence = ['Security', 'Guard', 'For', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Set squad leader
    if (!this.memory.squadLeader || !this.memory.leader || !Game.getObjectById(this.memory.leader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'guard' && c.memory.squadLeader);
        if (!squadLeader.length) this.memory.squadLeader = true; else this.memory.leader = squadLeader[0].id;
    }
    // Handle squad leader
    if (this.memory.squadLeader) {
        // Sustainability
        if (this.room.name === this.memory.targetRoom) highCommand.operationSustainability(this.room);
        highCommand.threatManagement(this);
        levelManager(this);
        // If military action required do that
        if (this.handleMilitaryCreep(false, false)) return;
        // Handle border
        if (this.borderCheck()) return;
        // Check for squad
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'guard' && c.id !== this.id);
        if (!squadMember.length || this.pos.rangeToTarget(squadMember[0]) > 1) return this.idleFor(1);
        // Heal squad
        let woundedSquad = _.filter(squadMember, (c) => c.hits < c.hitsMax && c.pos.rangeToTarget(this) === 1);
        if (this.hits === this.hitsMax && woundedSquad[0]) this.heal(woundedSquad[0]); else if (this.hits < this.hitsMax) this.heal(this);
        // Move to response room if needed
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
        if (!this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 17})) return this.idleFor(5);
    } else {
        // Set leader and move to them
        let leader = Game.getObjectById(this.memory.leader);
        if (this.room.name === leader.room.name) this.shibMove(leader, {range: 0}); else this.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 23});
        // Heal squadmates
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'guard' && c.id !== this.id);
        // Heal squad
        let woundedSquad = _.filter(squadMember, (c) => c.hits < c.hitsMax && c.pos.rangeToTarget(this) === 1);
        if (this.hits === this.hitsMax && woundedSquad[0]) this.heal(woundedSquad[0]); else if (this.hits < this.hitsMax) this.heal(this);
        this.attackInRange();
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
    } else {
        Memory.targetRooms[creep.memory.targetRoom].level = 0;
    }
}