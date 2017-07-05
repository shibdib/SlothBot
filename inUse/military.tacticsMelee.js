/**
 * Created by Bob on 7/2/2017.
 */
let borderChecks = require('module.borderChecks');
let militaryFunctions = require('module.militaryFunctions');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

meleeTeam = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let meleeLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.meleeLeader === true);
    let squad = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget);
    let team = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.role === this.memory.role);
    let healers = _.filter(Game.creeps, (h) => h.memory.role === 'healer');
    let hostiles = this.room.find(FIND_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
    let hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTROLLER && _.includes(RawMemory.segments[2], s.owner['username']) === false});
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeHostile = this.pos.findInRange(hostiles, 1);
    let inRangeArmed = this.pos.findInRange(armedHostile, 1);
    let closestArmed;
    let closestHostile;
    if (inRangeArmed.length > 0) {
        closestArmed = this.pos.findClosestByPath(inRangeArmed);
    }
    if (inRangeHostile.length > 0) {
        closestHostile = this.pos.findClosestByPath(inRangeHostile);
    }
    let nearbyHealers = this.pos.findInRange(healers, 5);
    let farHealers = this.pos.findInRange(healers, 15);
    let needsHeals = this.pos.findInRange(FIND_CREEPS, 3, {filter: (c) => c.hits < c.hitsMax && _.includes(RawMemory.segments[2], c.owner['username']) === true});
    if (meleeLeader.length === 0) this.memory.meleeLeader = true;

    //Retreat if wounded
    if (this.hits < this.hitsMax * 0.75) {
        this.heal(this);
        if (inRangeArmed.length > 1) {
            this.rangedMassAttack();
        } else if (inRangeArmed.length === 1) {
            this.rangedAttack(inRangeArmed[0]);
        }
        if (nearbyHealers.length > 0) {
            this.travelTo(nearbyHealers[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else if (squadLeader.length > 0) {
            this.travelTo(squadLeader[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else if (farHealers.length > 0) {
            this.travelTo(farHealers[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else {
            militaryFunctions.retreat(this);
        }
    } else if (this.hits < this.hitsMax) {
        this.heal(this);
    }
    if (this.memory.meleeLeader === true) {
        let closestHostileTower = this.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && _.includes(RawMemory.segments[2], s.owner['username']) === false});
        let weakPoint = _.min(this.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && _.includes(RawMemory.segments[2], s.owner['username']) === false}), 'hits');
        //Check if safe mode
        if (this.room.controller && this.room.controller.owner && _.includes(RawMemory.segments[2], this.room.controller.owner['username']) === false && this.room.controller.safeMode) {
            this.memory.attackStarted = 'safe';
            Memory.warControl[this.memory.attackTarget] = undefined;
            Memory.militaryNeeds[this.memory.attackTarget] = undefined;
            this.travelTo(new RoomPosition(25, 25, this.memory.staging), {range: 15});
        }
        if (armedHostile.length > 0) {
            if (closestArmed && this.pos.getRangeTo(closestArmed) <= 1) {
                this.attack(closestArmed);
                this.rangedAttack(closestArmed);
            }
            borderChecks.borderCheck(this);
            if ((closestHostileTower && this.pos.getRangeTo(closestHostileTower) < this.pos.getRangeTo(this.pos.findClosestByPath(armedHostile))) || !closestHostileTower) {
                if (inRangeArmed.length > 0) {
                    if (inRangeArmed.length > 1) {
                        this.rangedMassAttack();
                    } else if (inRangeArmed.length === 1) {
                        this.memory.meleeTarget = closestArmed.id;
                        this.rangedAttack(closestArmed);
                        this.attack(closestArmed);
                    }
                } else if (inRangeHostile.length > 0) {
                    if (inRangeHostile.length > 1) {
                        this.memory.rangedTarget = 'mass';
                        this.rangedMassAttack();
                    } else if (inRangeHostile.length === 1) {
                        this.memory.meleeTarget = closestHostile.id;
                        this.rangedAttack(closestHostile);
                        this.attack(closestHostile);
                    }
                } else {
                    this.travelTo(this.pos.findClosestByPath(armedHostile))
                }
            }
        } else if (hostiles.length > 0 && (!Game.flags[this.memory.attackTarget] || this.pos.roomName === Game.flags[this.memory.attackTarget].pos.roomName)) {
            borderChecks.borderCheck(this);
            if ((closestHostileTower && this.pos.getRangeTo(closestHostileTower) < this.pos.getRangeTo(this.pos.findClosestByPath(hostiles))) || !closestHostileTower) {
                if (inRangeHostile.length > 0) {
                    let closestHostile = this.pos.findClosestByPath(inRangeHostile);
                    if (inRangeHostile.length > 1) {
                        this.rangedMassAttack();
                    } else if (inRangeHostile.length === 1) {
                        this.memory.meleeTarget = closestHostile.id;
                        this.rangedAttack(closestHostile);
                        this.attack(closestHostile);
                    }
                } else {
                    this.travelTo(this.pos.findClosestByPath(inRangeHostile))
                }
            }
        } else if (squadLeader[0]) {
            if (this.pos.getRangeTo(squadLeader[0]) > 10) {
                if (this.room.name !== squadLeader[0].pos.roomName) {
                    this.travelTo(squadLeader[0], {allowHostile: true});
                } else {
                    this.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
                }
            }
        } else if (weakPoint && this.pos.getRangeTo(weakPoint) <= 2) {
            this.attack(weakPoint);
            this.rangedAttack(weakPoint);
        } else if (this.memory.attackStarted !== true) {
            this.memory.meleeTarget = undefined;
            this.travelTo(new RoomPosition(25, 25, this.memory.staging), {range: 15});
            if (Game.flags[this.memory.attackTarget]) {
                let nearbyAttackers = this.pos.findInRange(_.filter(Game.creeps, (a) => a.memory.attackTarget === this.memory.attackTarget && a.memory.role === 'attacker'), 5);
                let nearbyHealers = this.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.role === 'healer'), 5);
                let nearbyRanged = this.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.role === 'ranged'), 5);
                let nearbyDeconstructors = this.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.role === 'deconstructor'), 5);
                if (nearbyRanged.length >= this.memory.waitForRanged && nearbyAttackers.length >= this.memory.waitForAttackers && nearbyHealers.length >= this.memory.waitForHealers && nearbyDeconstructors.length >= this.memory.waitForDeconstructor) {
                    this.memory.attackStarted = true;
                }
            }
        } else {
            this.memory.meleeTarget = undefined;
                this.travelTo(new RoomPosition(25, 25, this.memory.attackTarget), {range: 15});
        }
    } else {
        if (closestArmed && this.pos.getRangeTo(closestArmed) <= 1) {
            this.attack(closestArmed);
            this.rangedAttack(closestArmed);
        } else if (squadLeader[0]) {
            if (this.pos.getRangeTo(squadLeader[0]) > 10) {
                if (this.room.name !== squadLeader[0].pos.roomName) {
                    this.travelTo(squadLeader[0], {allowHostile: true});
                } else {
                    this.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
                }
            }
        } else if (meleeLeader[0]) {
            if (this.pos.getRangeTo(meleeLeader[0]) > 4) {
                if (this.room.name !== meleeLeader[0].pos.roomName) {
                    this.travelTo(meleeLeader[0], {allowHostile: true});
                } else {
                    this.travelTo(meleeLeader[0], {allowHostile: true, movingTarget: true});
                }
            }
        }
        if (meleeLeader[0].memory.meleeLeader) {
            if (this.fightRanged(Game.getObjectById(meleeLeader[0].memory.meleeLeader)) === ERR_NOT_IN_RANGE) {
                this.travelTo(Game.getObjectById(meleeLeader[0].memory.meleeLeader))
            }
            if (needsHeals.length > 0) {
                this.rangedHeal(needsHeals[0])
            }
        } else {
            if (needsHeals.length > 0) {
                this.rangedHeal(needsHeals[0])
            }
        }
    }
};
Creep.prototype.meleeTeam = profiler.registerFN(meleeTeam, 'meleeTeamTactic');