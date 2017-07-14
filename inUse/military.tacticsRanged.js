/**
 * Created by Bob on 7/2/2017.
 */
const profiler = require('screeps-profiler');

rangedTeamLeader = function () {
    let squadLeader;
    if (!this.memory.assignedSquadLeader || !Game.getObjectById(this.memory.assignedSquadLeader)) {
        let leaders = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
        if (leaders.length > 0) this.memory.assignedSquadLeader = leaders[0];
    }
    if (this.memory.assignedSquadLeader) {
        squadLeader = Game.getObjectById(this.memory.assignedSquadLeader);
    }
    let siege = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.siegeComplete === true);
    let creepsInRoom = this.room.find(FIND_CREEPS);
    let hostiles = _.filter(creepsInRoom, (c) => c.pos.y < 47 && c.pos.y > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeCreeps = this.pos.findInRange(creepsInRoom, 3);
    let inRangeArmed = _.filter(inRangeCreeps, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let closestArmed = this.pos.findClosestByPath(armedHostile);
    let closestHostile = this.pos.findClosestByPath(hostiles);
    let healers = _.filter(creepsInRoom, (h) => h.memory && h.memory.role === 'healer');
    let closestHealer = this.pos.findClosestByPath(healers);

    //Retreat if wounded
    if (this.getActiveBodyparts(TOUGH) === 0) {
        this.heal(this);
        if (closestHealer) {
            this.shibMove(closestHealer, {allowHostile: false, movingTarget: true});
            this.rangedAttack(inRangeArmed[0]);
            return null;
        } else if (squadLeader) {
            this.shibMove(squadLeader, {allowHostile: false, movingTarget: true});
            this.rangedAttack(inRangeArmed[0]);
            return null;
        } else {
            this.retreat();
        }
    }
    if (this.hits < this.hitsMax) {
        this.heal(this);
    }
    //Check if safe mode
    if (this.room.controller && this.room.controller.owner && _.includes(RawMemory.segments[2], this.room.controller.owner['username']) === false && this.room.controller.safeMode) {
        this.memory.attackStarted = 'safe';
        Memory.warControl[this.memory.attackTarget] = undefined;
        Memory.militaryNeeds[this.memory.attackTarget] = undefined;
        this.shibMove(new RoomPosition(25, 25, this.memory.staging), {range: 15});
    }
    if (closestArmed || closestHostile) {
        this.memory.inCombat = true;
        this.borderCheck();
        if (closestArmed) {
            this.memory.rangedTarget = closestArmed.id;
            this.fightRanged(closestArmed);
        } else if (closestHostile) {
            this.memory.rangedTarget = closestHostile.id;
            this.fightRanged(closestHostile);
        }
    } else if (squadLeader && this.pos.roomName === squadLeader.pos.roomName) {
        this.memory.inCombat = undefined;
        if (this.pos.getRangeTo(squadLeader) > 4) {
            this.shibMove(squadLeader, {allowHostile: true, movingTarget: true});
        }
    } else if (this.memory.attackType === 'raid' || siege.length > 0) {
        this.memory.inCombat = undefined;
        this.shibMove(new RoomPosition(25, 25, this.memory.attackTarget), {range: 12});
    } else if (squadLeader && squadLeader.memory.attackStarted !== true) {
        this.memory.rangedTarget = undefined;
        this.shibMove(new RoomPosition(25, 25, this.memory.staging), {range: 15});
    } else if (this.memory.attackType !== 'siege' || siege.length > 0) {
        this.memory.inCombat = undefined;
        this.shibMove(new RoomPosition(25, 25, this.memory.attackTarget), {range: 23});
    } else if (this.memory.attackType === 'siege') {
        this.shibMove(new RoomPosition(25, 25, this.memory.siegePoint), {range: 15});
    }
};
Creep.prototype.rangedTeamLeader = profiler.registerFN(rangedTeamLeader, 'rangedTeamTactic');

rangedTeamMember = function () {
    let squadLeader;
    let rangedLeader;
    if (!this.memory.assignedSquadLeader || !Game.getObjectById(this.memory.assignedSquadLeader)) {
        let leaders = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
        if (leaders.length > 0) this.memory.assignedSquadLeader = leaders[0];
    }
    if (this.memory.assignedSquadLeader) {
        squadLeader = Game.getObjectById(this.memory.assignedSquadLeader);
    }
    if (!this.memory.assignedRangedLeader || !Game.getObjectById(this.memory.assignedRangedLeader)) {
        let leaders = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.rangedLeader === true);
        if (leaders.length > 0) this.memory.assignedRangedLeader = leaders[0];
    }
    if (this.memory.assignedRangedLeader) {
        rangedLeader = Game.getObjectById(this.memory.assignedRangedLeader);
    }
    let creepsInRoom = this.room.find(FIND_CREEPS);
    let hostiles = _.filter(creepsInRoom, (c) => c.pos.y < 47 && c.pos.y > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeCreeps = this.pos.findInRange(creepsInRoom, 1);
    let inRangeArmed = _.filter(inRangeCreeps, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let closestArmed = this.pos.findClosestByPath(armedHostile);
    let closestHostile = this.pos.findClosestByPath(hostiles);
    let healers = _.filter(creepsInRoom, (h) => h.memory && h.memory.role === 'healer');
    let closestHealer = this.pos.findClosestByPath(healers);
    let needsHeals = this.pos.findInRange(creepsInRoom, 3, {filter: (c) => c.hits < c.hitsMax && _.includes(RawMemory.segments[2], c.owner['username']) === true});

    //Retreat if wounded
    if (this.getActiveBodyparts(TOUGH) === 0) {
        this.heal(this);
        if (closestHealer) {
            this.shibMove(closestHealer, {allowHostile: false, movingTarget: true});
            this.rangedAttack(inRangeArmed[0]);
            return null;
        } else if (squadLeader) {
            this.shibMove(squadLeader, {allowHostile: false, movingTarget: true});
            this.rangedAttack(inRangeArmed[0]);
            return null;
        } else {
            this.retreat();
        }
    }
    if (this.hits < this.hitsMax) {
        this.heal(this);
    }

    //
    if (rangedLeader) {
        if (this.pos.getRangeTo(rangedLeader) > 4) {
            if (this.room.name !== rangedLeader.pos.roomName) {
                this.shibMove(rangedLeader, {allowHostile: true});
            } else {
                this.shibMove(rangedLeader, {allowHostile: true, movingTarget: true});
            }
        }
    }
    if (this.pos.getRangeTo(rangedLeader.memory.rangedTarget) <= 3) {
        if (this.pos.getRangeTo(closestArmed) <= 2) {
            this.fightRanged(closestArmed);
        } else {
            this.fightRanged(Game.getObjectById(rangedLeader.memory.rangedTarget));
        }
    } else if (closestArmed && this.pos.getRangeTo(closestArmed) <= 3) {
        this.fightRanged(closestArmed);
    } else if (closestHostile && this.pos.getRangeTo(closestHostile) <= 3) {
        this.fightRanged(closestHostile);
    } else {
        if (needsHeals.length > 0) {
            this.rangedHeal(needsHeals[0])
        }
    }
};
Creep.prototype.rangedTeamMember = profiler.registerFN(rangedTeamMember, 'rangedTeamMemberTactic');