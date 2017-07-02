/**
 * Created by Bob on 7/2/2017.
 */
let borderChecks = require('module.borderChecks');
let militaryFunctions = require('module.militaryFunctions');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

function rangedTeam(creep) {
    creep.memory.squadKite = undefined;
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.squadLeader === true);
    let rangedLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.rangedLeader === true);
    let nearbyHealers = creep.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'healer'), 5);
    let farHealers = creep.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'healer'), 15);
    let needsHeals = creep.pos.findInRange(FIND_CREEPS, 3, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true});
    if (squadLeader.length === 0) {
        creep.memory.squadLeader = true;
    }
    if (rangedLeader.length === 0) {
        creep.memory.rangedLeader = true;
    }

    let armedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});

    if (creep.hits < creep.hitsMax * 0.75) {
        creep.rangedAttack(armedHostile);
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
    if (creep.memory.squadLeader === true) {
        let rangedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(RANGED_ATTACK) >= 4) && _.includes(doNotAggress, e.owner['username']) === false});
        let hostileHealer = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(HEAL) >= 3) && _.includes(doNotAggress, e.owner['username']) === false});
        let closestHostileSpawn = creep.pos.findClosestByPath(FIND_HOSTILE_SPAWNS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
        let closestHostileTower = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && _.includes(doNotAggress, s.owner['username']) === false});
        let closestHostile = creep.pos.findClosestByPath(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
        let weakPoint = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false});
        let hostileStructures = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTROLLER && _.includes(doNotAggress, s.owner['username']) === false});
        if (creep.room.controller && creep.room.controller.owner && _.includes(doNotAggress, creep.room.controller.owner['username']) === false && creep.room.controller.safeMode) {
            creep.memory.attackStarted = 'safe';
            Game.flags[creep.memory.attackTarget].remove();
            return creep.travelTo(Game.flags[creep.memory.staging]);
        }
        if (armedHostile) {
            if (creep.memory.waitForHealers > 0 && nearbyHealers.length === 0) {
                creep.memory.squadTarget = undefined;
                if (farHealers.length === 0) {
                    return creep.travelTo(Game.flags[creep.memory.staging]);
                } else {
                    return creep.travelTo(farHealers[0], {
                        allowHostile: false,
                        range: 1,
                        repath: 1,
                        movingTarget: true
                    });
                }
            }
            if (!closestHostileTower) {
                borderChecks.borderCheck(creep);
            }
            if (hostileHealer && creep.rangedAttack(hostileHealer) !== OK) {
                if (rangedHostile && creep.rangedAttack(rangedHostile) !== OK) {
                    if (armedHostile && creep.rangedAttack(armedHostile) === ERR_NOT_IN_RANGE) {
                        creep.memory.squadTarget = armedHostile.id;
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
                        creep.memory.squadTarget = armedHostile.id;
                        militaryFunctions.kite(creep);
                    } else {
                        creep.memory.squadTarget = armedHostile.id;
                        if (needsHeals.length > 0) {
                            creep.rangedHeal(needsHeals[0])
                        }
                        creep.travelTo(armedHostile, {allowHostile: false, range: 3, repath: 1, movingTarget: true});
                    }
                } else if (creep.pos.getRangeTo(armedHostile) <= 3) {
                    creep.memory.squadTarget = rangedHostile.id;
                    militaryFunctions.kite(creep);
                } else {
                    creep.memory.squadTarget = rangedHostile.id;
                    if (needsHeals.length > 0) {
                        creep.rangedHeal(needsHeals[0])
                    }
                    creep.travelTo(armedHostile, {allowHostile: false, range: 3, repath: 1, movingTarget: true});
                }
            } else if (creep.pos.getRangeTo(armedHostile) <= 3) {
                creep.memory.squadTarget = hostileHealer.id;
                militaryFunctions.kite(creep);
            } else {
                creep.memory.squadTarget = hostileHealer.id;
                if (needsHeals.length > 0) {
                    creep.rangedHeal(needsHeals[0])
                }
                creep.travelTo(armedHostile, {allowHostile: false, range: 3, repath: 1, movingTarget: true});
            }
        } else if (closestHostileTower) {
            creep.memory.squadTarget = closestHostileTower.id;
            if (creep.rangedAttack(closestHostileTower) === ERR_NOT_IN_RANGE) {
                if (needsHeals.length > 0) {
                    creep.rangedHeal(needsHeals[0])
                }
                creep.travelTo(closestHostileTower, {allowHostile: true, range: 3});
            }
        } else if (closestHostileSpawn) {
            creep.memory.squadTarget = closestHostileSpawn.id;
            if (creep.rangedAttack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
                if (needsHeals.length > 0) {
                    creep.rangedHeal(needsHeals[0])
                }
                creep.travelTo(closestHostileSpawn, {allowHostile: true, range: 3});
            }
        } else if (Game.flags[creep.memory.attackTarget] && closestHostile && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = closestHostile.id;
            if (creep.rangedAttack(closestHostile) === ERR_NOT_IN_RANGE) {
                if (needsHeals.length > 0) {
                    creep.rangedHeal(needsHeals[0])
                }
                creep.travelTo(closestHostile, {allowHostile: true, repath: 1, range: 3, movingTarget: true});
            }
        } else if (Game.flags[creep.memory.attackTarget] && hostileStructures && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = hostileStructures.id;
            if (creep.rangedAttack(hostileStructures) === ERR_NOT_IN_RANGE) {
                if (needsHeals.length > 0) {
                    creep.rangedHeal(needsHeals[0])
                }
                creep.travelTo(hostileStructures, {allowHostile: true, range: 3});
            }
        } else if (Game.flags[creep.memory.attackTarget] && weakPoint.length > 0 && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            weakPoint = _.min(weakPoint, 'hits');
            creep.memory.squadTarget = weakPoint.id;
            if (creep.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'deconstructor'), 5).length === 0) {
                if (creep.rangedAttack(weakPoint) === ERR_NOT_IN_RANGE) {
                    if (needsHeals.length > 0) {
                        creep.rangedHeal(needsHeals[0])
                    }
                    creep.travelTo(weakPoint, {allowHostile: true, range: 3});
                }
            } else {
                creep.rangedAttack(weakPoint);
                creep.travelTo(weakPoint, {allowHostile: true, range: 2});
            }
        } else if (creep.memory.attackStarted !== true) {
            creep.memory.squadTarget = undefined;
            creep.travelTo(Game.flags[creep.memory.staging]);
            if (Game.flags[creep.memory.attackTarget]) {
                let nearbyAttackers = creep.pos.findInRange(_.filter(Game.creeps, (a) => a.memory.attackTarget === creep.memory.attackTarget && a.memory.role === 'attacker'), 5);
                let nearbyHealers = creep.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'healer'), 5);
                let nearbyRanged = creep.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'ranged'), 5);
                let nearbyDeconstructors = creep.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'deconstructor'), 5);
                if (nearbyRanged.length >= creep.memory.waitForRanged && nearbyAttackers.length >= creep.memory.waitForAttackers && nearbyHealers.length >= creep.memory.waitForHealers && nearbyDeconstructors.length >= creep.memory.waitForDeconstructor) {
                    creep.memory.attackStarted = true;
                }
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
    } else {
        if (armedHostile && creep.pos.getRangeTo(armedHostile) <= 3) {
            militaryFunctions.kite(creep);
        } else if (creep.pos.getRangeTo(squadLeader[0]) !== 0) {
            if (creep.room.name !== squadLeader[0].pos.roomName) {
                creep.travelTo(squadLeader[0], {allowHostile: true});
            } else {
                creep.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
            }
        }
        if (squadLeader[0].memory.squadTarget) {
            if (creep.rangedAttack(Game.getObjectById(squadLeader[0].memory.squadTarget)) !== OK) {
                creep.rangedAttack(armedHostile);
                if (needsHeals.length > 0) {
                    creep.rangedHeal(needsHeals[0])
                }
            }
        } else {
            if (needsHeals.length > 0) {
                creep.rangedHeal(needsHeals[0])
            }
        }
    }
}
module.exports.rangedTeam = profiler.registerFN(rangedTeam, 'rangedTeamTactic');

function teamRangedAttack(creep, target) {
    if (target) {
        let inRange = target.pos.findInRange(_.filter(Game.creeps, (a) => a.memory.attackTarget === creep.memory.attackTarget && a.memory.role === 'attacker'), 3);
        for (let i = 0; i < inRange.length; i++) {
            inRange.rangedAttack(target);
        }
    }
}
module.exports.teamRangedAttack = profiler.registerFN(teamRangedAttack, 'teamRangedAttackTactic');

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