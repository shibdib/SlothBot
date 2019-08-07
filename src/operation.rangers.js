let highCommand = require('military.highCommand');

Creep.prototype.rangersRoom = function () {
    let sentence = [ICONS.respond, 'SWAT', 'TEAM'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Set squad leader
    if (!this.memory.squadLeader || !this.memory.leader || !Game.getObjectById(this.memory.leader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'rangers' && c.memory.squadLeader);
        if (!squadLeader.length) this.memory.squadLeader = true; else this.memory.leader = squadLeader[0].id;
    }
    // Handle border
    if (this.borderCheck()) return;
    // Handle squad leader
    if (this.memory.squadLeader) {
        highCommand.threatManagement(this);
        levelManager(this);
        // Remove duplicate squad leaders
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord &&
            c.memory.operation === this.memory.operation && c.memory.squadLeader && c.id !== this.id && c.memory.targetRoom === this.memory.targetRoom);
        if (squadLeader.length) return this.memory.squadLeader = undefined;
        // Sustainability
        if (this.room.name === this.memory.targetRoom) highCommand.operationSustainability(this.room);
        // If military action required do that
        if (this.handleMilitaryCreep(false, false)) return;
        // Check for squad and handle grouping
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === this.memory.operation && c.id !== this.id);
        this.memory.waitingForSquad = squadMember.length > 0;
        if (this.ticksToLive >= 1000 || squadMember.length) {
            if (!squadMember.length) {
                let otherRanger = _.filter(this.room.creeps, (c) => c.memory && c.memory.role === 'longbow' && c.memory.operation === this.memory.operation && c.id !== this.id && c.memory.waitingForSquad)[0] ||
                    _.filter(Game.creeps, (c) => c.memory && c.memory.role === 'longbow' && c.memory.operation === this.memory.operation && c.id !== this.id && c.memory.waitingForSquad)[0];
                if (otherRanger) {
                    otherRanger.memory.targetRoom = this.memory.targetRoom;
                    otherRanger.memory.squadLeader = undefined;
                }
            }
            if (this.pos.findInRange(squadMember, 2).length < squadMember.length) return this.idleFor(1);
        }
        if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
        // Move to room if needed
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 22});
    } else {
        // Set leader and move to them
        let leader = Game.getObjectById(this.memory.leader);
        if (!leader) return delete this.memory.leader;
        if (this.room.name === leader.room.name) {
            let moveRange = 0;
            let ignore = true;
            if (this.pos.x === 0 || this.pos.x === 49 || this.pos.y === 0 || this.pos.y === 49 || this.pos.getRangeTo(leader) > 2) {
                moveRange = 1;
                ignore = false;
            }
            this.shibMove(leader, {range: moveRange, ignoreCreeps: ignore, ignoreRoads: true});
        } else {
            this.shibMove(new RoomPosition(25, 25, leader.room.name), {range: 23});
        }
        if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.targetRoom]) return;
    let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10);
    let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (towers.length) {
        delete Memory.targetRooms[creep.memory.targetRoom];
        creep.room.cacheRoomIntel(true);
        log.a('Canceling operation in ' + roomLink(creep.room.name) + ' as we are not equipped to fight towers.', 'HIGH COMMAND: ');
        return;
    }
    if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 2;
    } else if (enemyCreeps.length) {
        Memory.targetRooms[creep.memory.targetRoom].level = 1;
    } else {
        Memory.targetRooms[creep.memory.targetRoom].level = 0;
    }
}