/**
 * Created by Bob on 7/2/2017.
 */
let borderChecks = require('module.borderChecks');
let militaryFunctions = require('module.militaryFunctions');
const profiler = require('screeps-profiler');

rangedTeam = function () {
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
        } else if (hostiles.length > 0 && (this.pos.roomName === Game.flags[this.memory.attackTarget].pos.roomName || !Game.flags[this.memory.attackTarget])) {
            borderChecks.borderCheck(this);
            if ((closestHostileTower && this.pos.getRangeTo(closestHostileTower) < this.pos.getRangeTo(this.pos.findClosestByPath(armedHostile))) || !closestHostileTower) {
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
        } else if (hostileStructures.length > 0 && (this.pos.roomName === Game.flags[this.memory.attackTarget].pos.roomName || !Game.flags[this.memory.attackTarget])) {
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
            if (this.pos.getRangeTo(squadLeader[0]) > 5) {
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
Creep.prototype.rangedTeam = profiler.registerFN(rangedTeam, 'rangedTeamTactic');

function rangedSolo(creep) {
    let nearbyHealers = creep.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'healer'), 15);
    let needsHeals = creep.pos.findInRange(FIND_CREEPS, 3, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true});
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }
    let armedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    let rangedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(RANGED_ATTACK) >= 4) && _.includes(doNotAggress, e.owner['username']) === false});
    let hostileHealer = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(HEAL) >= 3) && _.includes(doNotAggress, e.owner['username']) === false});
    let closestHostileTower = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && _.includes(doNotAggress, s.owner['username']) === false});
    let closestHostile = creep.pos.findClosestByPath(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    let hostileStructures = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTROLLER && _.includes(doNotAggress, s.owner['username']) === false});
    if (creep.hits < creep.hitsMax * 0.75) {
        creep.rangedAttack(closestHostile);
        creep.heal(creep);
        if (nearbyHealers.length > 0) {
            creep.travelTo(nearbyHealers[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else {
            militaryFunctions.retreat(creep);
        }
    } else if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }
    if (creep.room.controller && creep.room.controller.owner && _.includes(doNotAggress, creep.room.controller.owner['username']) === false && creep.room.controller.safeMode) {
        creep.memory.attackStarted = 'safe';
        Game.flags[creep.memory.attackTarget].remove();
        return creep.travelTo(Game.flags[creep.memory.staging]);
    }
    if (armedHostile) {
        if (!closestHostileTower) {
            borderChecks.borderCheck(creep);
        }
        if (creep.rangedAttack(hostileHealer) !== OK) {
            if (creep.rangedAttack(rangedHostile) !== OK) {
                if (creep.rangedAttack(armedHostile) === ERR_NOT_IN_RANGE) {
                    creep.rangedAttack(closestHostile);
                    if (needsHeals.length > 0) {
                        creep.rangedHeal(needsHeals[0])
                    }
                    return creep.travelTo(armedHostile, {
                        allowHostile: false,
                        range: 3,
                        repath: 1,
                        movingTarget: true
                    });
                } else if (creep.pos.getRangeTo(armedHostile) <= 3) {
                    militaryFunctions.kite(creep);
                } else {
                    if (needsHeals.length > 0) {
                        creep.rangedHeal(needsHeals[0])
                    }
                    creep.travelTo(armedHostile, {allowHostile: false, range: 3, repath: 1, movingTarget: true});
                }
            } else if (creep.pos.getRangeTo(armedHostile) <= 3) {
                militaryFunctions.kite(creep);
            } else {
                if (needsHeals.length > 0) {
                    creep.rangedHeal(needsHeals[0])
                }
                creep.travelTo(armedHostile, {allowHostile: false, range: 3, repath: 1, movingTarget: true});
            }
        } else if (creep.pos.getRangeTo(armedHostile) <= 3) {
            militaryFunctions.kite(creep);
        } else {
            if (needsHeals.length > 0) {
                creep.rangedHeal(needsHeals[0])
            }
            creep.travelTo(armedHostile, {allowHostile: false, range: 3, repath: 1, movingTarget: true});
        }
    } else if (Game.flags[creep.memory.attackTarget] && hostileStructures && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
        if (creep.rangedAttack(hostileStructures) === ERR_NOT_IN_RANGE) {
            if (needsHeals.length > 0) {
                creep.rangedHeal(needsHeals[0])
            }
            creep.travelTo(hostileStructures, {allowHostile: true, range: 3});
        }
    } else {
        creep.memory.squadTarget = undefined;
        if (Game.flags[creep.memory.wp] && creep.memory.waypointReached !== true) {
            if (creep.pos.getRangeTo(creep.memory.wp) > 6) {
                creep.memory.waypointReached = true;
            }
            creep.travelTo(creep.memory.wp, {allowHostile: false});
        } else {
            creep.travelTo(Game.flags[creep.memory.attackTarget], {allowHostile: false});
        }
    }
}
module.exports.rangedSolo = profiler.registerFN(rangedSolo, 'rangedSoloTactic');