/**
 * Created by Bob on 7/2/2017.
 */
const profiler = require('screeps-profiler');

meleeTeamLeader = function () {
    let squadLeader;
    let rangedLeader;
    if (!this.memory.assignedSquadLeader || !Game.getObjectById(this.memory.assignedSquadLeader)) {
        this.memory.assignedSquadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    }
    if (this.memory.assignedSquadLeader) {
        squadLeader = Game.getObjectById(this.memory.assignedSquadLeader);
    }
    if (!this.memory.assignedRangedLeader || !Game.getObjectById(this.memory.assignedRangedLeader)) {
        this.memory.assignedRangedLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.rangedLeader === true);
    }
    if (this.memory.assignedRangedLeader) {
        rangedLeader = Game.getObjectById(this.memory.assignedRangedLeader);
    }
    let siege = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.siegeComplete === true);
    let creepsInRoom = this.room.find(FIND_CREEPS);
    let hostiles = _.filter(creepsInRoom, (c) => c.pos.y < 47 && c.pos.y > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeCreeps = this.pos.findInRange(creepsInRoom, 1);
    let inRangeHostile = _.filter(inRangeCreeps, (c) => c.pos.y < 47 && c.pos.y > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
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
            return null;
        } else if (squadLeader) {
            this.shibMove(squadLeader, {allowHostile: false, movingTarget: true});
            return null;
        } else {
            this.retreat();
        }
    }
    if (this.hits < this.hitsMax) {
        this.heal(this);
    } else if (needsHeals.length > 0) {
        this.rangedHeal(needsHeals[0]);
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
            this.memory.meleeTarget = closestArmed.id;
            if (closestArmed.getActiveBodyparts(ATTACK) > 0) {
                if (this.attack(closestArmed) === ERR_NOT_IN_RANGE) {
                    this.shibMove(closestArmed, {movingTarget: true});
                }
                if (inRangeArmed.length > 1) {
                    this.rangedMassAttack();
                } else {
                    this.rangedAttack(closestArmed);
                }
            } else if (this.pos.getRangeTo(closestArmed) <= 3) {
                this.kite(5);
            } else if (rangedLeader[0]) {
                this.shibMove(rangedLeader[0], {movingTarget: true});
            }
        } else if (closestHostile) {
            this.memory.meleeTarget = closestHostile.id;
            if (this.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                this.shibMove(closestHostile, {movingTarget: true});
            }
            if (inRangeHostile.length > 1) {
                this.rangedMassAttack();
            } else {
                this.rangedAttack(closestHostile);
            }
        }
    } else if (squadLeader && this.room.name === squadLeader.pos.roomName) {
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
Creep.prototype.meleeTeamLeader = profiler.registerFN(meleeTeamLeader, 'meleeTeamLeaderTactic');

meleeTeamMember = function () {
    let squadLeader;
    let meleeLeader;
    if (!this.memory.assignedSquadLeader || !Game.getObjectById(this.memory.assignedSquadLeader)) {
        this.memory.assignedSquadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    }
    if (this.memory.assignedSquadLeader) {
        squadLeader = Game.getObjectById(this.memory.assignedSquadLeader);
    }
    if (!this.memory.assignedMeleeLeader || !Game.getObjectById(this.memory.assignedMeleeLeader)) {
        this.memory.assignedMeleeLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.meleeLeader === true);
    }
    if (this.memory.assignedMeleeLeader) {
        meleeLeader = Game.getObjectById(this.memory.assignedMeleeLeader);
    }
    let creepsInRoom = this.room.find(FIND_CREEPS);
    let hostiles = _.filter(creepsInRoom, (c) => c.pos.y < 47 && c.pos.y > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeCreeps = this.pos.findInRange(creepsInRoom, 1);
    let inRangeHostile = _.filter(inRangeCreeps, (c) => c.pos.y < 47 && c.pos.y > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
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
            return null;
        } else if (squadLeader) {
            this.shibMove(squadLeader, {allowHostile: false, movingTarget: true});
            return null;
        } else {
            this.retreat();
        }
    }
    if (this.hits < this.hitsMax) {
        this.heal(this);
    } else if (needsHeals.length > 0) {
        this.rangedHeal(needsHeals[0]);
    }
    if (meleeLeader) {
        if (this.pos.getRangeTo(meleeLeader) > 4) {
            if (this.room.name !== meleeLeader.pos.roomName) {
                this.shibMove(meleeLeader, {allowHostile: false});
            } else {
                this.shibMove(meleeLeader, {allowHostile: false, movingTarget: true});
            }
        }
    } else if ((closestArmed || closestHostile) && (this.pos.getRangeTo(closestArmed) < 5 || this.pos.getRangeTo(closestHostile) < 5)) {
        this.borderCheck();
        if (closestArmed) {
            this.memory.meleeTarget = closestArmed.id;
            if (closestArmed.getActiveBodyparts(ATTACK) > 0) {
                if (this.attack(closestArmed) === ERR_NOT_IN_RANGE) {
                    this.shibMove(closestArmed, {movingTarget: true});
                }
                if (inRangeArmed.length > 1) {
                    this.rangedMassAttack();
                } else {
                    this.rangedAttack(closestArmed);
                }
            } else {
                this.kite(5);
            }
        } else if (closestHostile) {
            this.memory.meleeTarget = closestHostile.id;
            this.attack(closestHostile);
            this.shibMove(closestHostile, {movingTarget: true});
            if (inRangeHostile.length > 1) {
                this.rangedMassAttack();
            } else {
                this.rangedAttack(closestHostile);
            }
        }
    } else if (meleeLeader && meleeLeader.memory.meleeTarget) {
        if (this.attack(Game.getObjectById(meleeLeader.memory.meleeTarget)) === ERR_NOT_IN_RANGE) {
            this.shibMove(Game.getObjectById(meleeLeader.memory.meleeTarget))
        }
        if (needsHeals.length > 0) {
            this.rangedHeal(needsHeals[0])
        }
    }
};
Creep.prototype.meleeTeamMember = profiler.registerFN(meleeTeamMember, 'meleeTeamMemberTactic');