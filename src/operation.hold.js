Creep.prototype.holdRoom = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
        // Clear target if room is no longer owned
        if (!this.room.controller.owner || this.room.controller.safeMode) {
            delete Memory.targetRooms[this.room.name];
            let otherTargets = shuffle(_.filter(Memory.targetRooms, (t) => t.type === 'harass' || t.type === 'hold'));
            for (let key in otherTargets) {
                return this.memory.targetRoom = key
            }
        }
        let sentence = ['Area', 'Denial', 'In', 'Progress'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        let hostile = this.findClosestEnemy();
        if (this.memory.role === 'longbow') {
            if (hostile) {
                if (hostile.body && (hostile.getActiveBodyparts(ATTACK) || hostile.getActiveBodyparts(RANGED_ATTACK))) {
                    Memory.targetRooms[this.memory.targetRoom].level = 3;
                } else {
                    Memory.targetRooms[this.memory.targetRoom].level = 2;
                }
                if (this.hits < this.hitsMax * 0.50) return this.kite(8);
                return this.fightRanged(hostile);
            } else {
                Memory.targetRooms[this.memory.targetRoom].level = 1;
                if (!this.moveToHostileConstructionSites()) {
                    if (!this.healMyCreeps() && !this.healAllyCreeps()) {
                        this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 17});
                    }
                }
            }
        } else if (this.memory.role === 'attacker') {
            this.handleDefender();
        } else if (this.memory.role === 'healer') {
            this.squadHeal();
        } else if (this.memory.role === 'unClaimer') {
            switch (this.attackController(this.room.controller)) {
                case ERR_NOT_IN_RANGE:
                    this.shibMove(this.room.controller, {range: 1});
                    break;
            }
        }
        // Convert to a scout if tower exists
        let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER);
        if (towers.length && _.max(towers, 'energy').energy > 10) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'attack'
            };
            Memory.targetRooms = cache;
            return this.suicide();
        }
        // Request unClaimer if room level is too high
        Memory.targetRooms[this.room.name].unClaimer = !this.room.controller.ticksToDowngrade || this.room.controller.level > 1 || this.room.controller.ticksToDowngrade > this.ticksToLive;
    }
};