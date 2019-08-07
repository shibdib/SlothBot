let highCommand = require('military.highCommand');

Creep.prototype.holdRoom = function () {
    let sentence = ['This', 'Room', 'Has', 'Been', 'Marked', 'For', 'Other', 'Uses', 'Please', 'Abandon'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Handle border
    if (this.borderCheck()) return;
    if (this.memory.role === 'longbow') {
        // Set squad leader
        if (!this.memory.squadLeader || !this.memory.leader || !Game.getObjectById(this.memory.leader)) {
            let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'hold' && c.memory.squadLeader);
            if (!squadLeader.length) this.memory.squadLeader = true; else this.memory.leader = squadLeader[0].id;
        }
        let squadMember = _.filter(this.room.creeps, (c) => c.memory && c.memory.targetRoom === this.memory.targetRoom && c.memory.operation === 'hold' && c.id !== this.id && c.memory.role === 'longbow');
        // Handle squad leader
        if (this.memory.squadLeader) {
            levelManager(this);
            highCommand.threatManagement(this);
            // Remove duplicate squad leaders
            let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord &&
                c.memory.operation === this.memory.operation && c.memory.squadLeader && c.id !== this.id && c.memory.targetRoom === this.memory.targetRoom);
            if (squadLeader.length) return this.memory.squadLeader = undefined;
            // If military action required do that
            if (this.handleMilitaryCreep(false, false, true)) return;
            if (this.ticksToLive >= 1000 || squadMember.length) {
                if (!squadMember.length) {
                    let otherHold = _.filter(this.room.creeps, (c) => c.memory && c.memory.role === 'longbow' && c.memory.operation === this.memory.operation && c.id !== this.id && c.memory.waitingForSquad)[0] ||
                        _.filter(Game.creeps, (c) => c.memory && c.memory.role === 'longbow' && c.memory.operation === this.memory.operation && c.id !== this.id && c.memory.waitingForSquad)[0];
                    if (otherHold) {
                        otherHold.memory.targetRoom = this.memory.targetRoom;
                        otherHold.memory.squadLeader = undefined;
                    }
                }
                if (this.pos.findInRange(squadMember, 2).length < squadMember.length) return this.idleFor(1);
            }
            // Handle target room
            if (this.room.name === this.memory.targetRoom) {
                highCommand.operationSustainability(this.room);
                Memory.targetRooms[this.room.name].unClaimer = !this.room.controller.upgradeBlocked && (!this.room.controller.ticksToDowngrade || this.room.controller.level > 1 || this.room.controller.ticksToDowngrade > this.ticksToLive);
            } else {
                this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 24});
            }
            if (!this.attackInRange()) if (this.hits < this.hitsMax) this.heal(this); else this.healInRange();
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
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.targetRoom] || creep.room.name !== creep.memory.targetRoom) return;
    // Safemode
    if (creep.room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[creep.room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + creep.room.controller.safeMode,
        };
        Memory.targetRooms = cache;
        creep.memory.recycle = true;
        return;
    }
    let enemyCreeps = _.filter(creep.room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10);
    let armedEnemies = _.filter(enemyCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (creep.room.name === creep.memory.targetRoom && towers.length) {
        delete Memory.targetRooms[creep.memory.targetRoom];
        log.a('Canceling operation in ' + roomLink(key) + ' as we cannot hold it due to towers.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
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