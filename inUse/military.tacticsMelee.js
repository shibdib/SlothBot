/**
 * Created by Bob on 7/2/2017.
 */
let borderChecks = require('module.borderChecks');
let militaryFunctions = require('module.militaryFunctions');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

meleeTeam = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let rangedLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.rangedLeader === true);
    let squad = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget);
    let team = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.role === this.memory.role);
    let healers = _.filter(Game.creeps, (h) => h.memory.role === 'healer');
    let hostiles = this.room.find(FIND_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
    let hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTROLLER && _.includes(RawMemory.segments[2], s.owner['username']) === false});
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeHostile = this.pos.findInRange(hostiles, 3);
    let inRangeArmed = this.pos.findInRange(armedHostile, 3);
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
    if (rangedLeader.length === 0) this.memory.rangedLeader = true;

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
    if (this.memory.rangedLeader === true) {
        let closestHostileTower = this.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && _.includes(RawMemory.segments[2], s.owner['username']) === false});
        let weakPoint = this.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && _.includes(RawMemory.segments[2], s.owner['username']) === false});
        //Check if safe mode
        if (this.room.controller && this.room.controller.owner && _.includes(RawMemory.segments[2], this.room.controller.owner['username']) === false && this.room.controller.safeMode) {
            this.memory.attackStarted = 'safe';
            Game.flags[this.memory.attackTarget].remove();
            return this.travelTo(Game.flags[this.memory.staging]);
        }
        if (armedHostile.length > 0) {
            borderChecks.borderCheck(this);
            if ((closestHostileTower && this.pos.getRangeTo(closestHostileTower) < this.pos.getRangeTo(this.pos.findClosestByPath(armedHostile))) || !closestHostileTower) {
                if (inRangeArmed.length > 0) {
                    if (inRangeArmed.length > 1) {
                        this.memory.rangedTarget = 'mass';
                        this.rangedMassAttack();
                    } else if (inRangeArmed.length === 1) {
                        this.memory.rangedTarget = closestArmed;
                        this.fightRanged(closestArmed);
                    }
                } else if (inRangeHostile.length > 0) {
                    if (inRangeHostile.length > 1) {
                        this.memory.rangedTarget = 'mass';
                        this.rangedMassAttack();
                    } else if (inRangeHostile.length === 1) {
                        this.memory.rangedTarget = closestHostile.id;
                        this.fightRanged(closestHostile);
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
                        this.memory.rangedTarget = 'mass';
                        this.rangedMassAttack();
                    } else if (inRangeHostile.length === 1) {
                        this.memory.rangedTarget = closestHostile.id;
                        this.fightRanged(closestHostile);
                    }
                } else {
                    this.travelTo(this.pos.findClosestByPath(inRangeHostile))
                }
            }
        } else if (hostileStructures.length > 0 && (!Game.flags[this.memory.attackTarget] || this.pos.roomName === Game.flags[this.memory.attackTarget].pos.roomName)) {
            borderChecks.borderCheck(this);
            if ((closestHostileTower && this.pos.getRangeTo(closestHostileTower) < this.pos.getRangeTo(this.pos.findClosestByPath(hostileStructures))) || !closestHostileTower) {
                if (inRangeHostile.length > 0) {
                    let inRangeStructure = this.pos.findInRange(hostileStructures, 3);
                    if (inRangeStructure.length > 1) {
                        this.memory.rangedTarget = 'mass';
                        this.rangedMassAttack();
                    } else if (inRangeStructure.length === 1) {
                        this.memory.rangedTarget = closestHostile.id;
                        this.fightRanged(inRangeStructure[0]);
                    }
                } else {
                    this.travelTo(this.pos.findClosestByPath(hostileStructures))
                }
            }
        } else if (this.memory.attackStarted !== true) {
            this.memory.rangedTarget = undefined;
            this.travelTo(Game.flags[this.memory.staging]);
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
            this.memory.rangedTarget = undefined;
            if (Game.flags[this.memory.wp] && this.memory.waypointReached !== true) {
                if (this.pos.getRangeTo(this.memory.wp) > 6) {
                    this.memory.waypointReached = true;
                }
                this.travelTo(this.memory.wp, {allowHostile: false});
            } else {
                this.travelTo(Game.flags[this.memory.attackTarget], {allowHostile: false});
            }
        }
    } else {
        if (closestArmed && this.pos.getRangeTo(closestArmed) <= 2) {
            this.fightRanged(closestArmed);
        } else if (squadLeader[0]) {
            if (this.pos.getRangeTo(squadLeader[0]) > 10) {
                if (this.room.name !== squadLeader[0].pos.roomName) {
                    this.travelTo(squadLeader[0], {allowHostile: true});
                } else {
                    this.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
                }
            }
        } else if (rangedLeader[0]) {
            if (this.pos.getRangeTo(rangedLeader[0]) > 4) {
                if (this.room.name !== rangedLeader[0].pos.roomName) {
                    this.travelTo(rangedLeader[0], {allowHostile: true});
                } else {
                    this.travelTo(rangedLeader[0], {allowHostile: true, movingTarget: true});
                }
            }
        }
        if (rangedLeader[0].memory.rangedTarget) {
            if (rangedLeader[0].memory.rangedTarget === 'mass') {
                this.rangedMassAttack();
            } else {
                this.fightRanged(Game.getObjectById(rangedLeader[0].memory.rangedTarget));
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
Creep.prototype.tacticSquadLeaderMedic = profiler.registerFN(tacticSquadLeaderMedic, 'squadLeaderMedicTactic');

meleeSolo = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let targets = this.pos.findInRange(FIND_CREEPS, 7, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true});
    let armedHostile = this.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    if (!armedHostile || this.pos.getRangeTo(armedHostile) >= 3) {
        if (targets.length > 0) {
            if (this.heal(targets[0]) === ERR_NOT_IN_RANGE) {
                this.travelTo(targets[0]);
                this.rangedHeal(targets[0]);
            }
        }
        else if (this.pos.getRangeTo(squadLeader[0]) > 4) {
            this.travelTo(squadLeader[0]);
        }
    } else {
        if (targets.length > 0) {
            if (this.heal(targets[0]) === ERR_NOT_IN_RANGE) {
                this.rangedHeal(targets[0]);
            }
        }
        this.fleeFromHostile(armedHostile);
    }
};
Creep.prototype.tacticMedic = profiler.registerFN(tacticMedic, 'tacticMedicTactic');