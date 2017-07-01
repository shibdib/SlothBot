let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let militaryFunctions = require('module.militaryFunctions');
let cache = require('module.cache');
let _ = require('lodash');
let profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];


function Manager(creep) {
    if (creep.memory.role === "defender") {
        defender(creep);
    } else if (creep.memory.role === "deconstructor") {
        deconstructor(creep);
    } else if (creep.memory.role === "healer") {
        healer(creep);
    } else if (creep.memory.role === "scout") {
        scout(creep);
    } else if (creep.memory.role === "attacker") {
        attacker(creep);
    } else if (creep.memory.role === "claimer") {
        claimer(creep);
    } else if (creep.memory.role === "reserver") {
        reserver(creep);
    } else if (creep.memory.role === "raider") {
        raider(creep);
    } else if (creep.memory.role === "responder") {
        responder(creep);
    } else if (creep.memory.role === "ranged") {
        ranged(creep);
    }
}
module.exports.Manager = profiler.registerFN(Manager, 'managerMilitary');

/**
 * @return {null}
 */
function scout(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.memory.destinationReached !== true) {
        creep.travelTo(Game.flags[creep.memory.destination]);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 1) {
            creep.memory.destinationReached = true;
        }
    } else {
        let HostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS);
        if (HostileCreeps.length > 0) {
            creep.memory.enemyCount = HostileCreeps.length;
            creep.memory.enemyPos = HostileCreeps[0].pos;
        } else {
            creep.memory.enemyCount = null;
            creep.memory.enemyPos = null;
        }
    }
}
scout = profiler.registerFN(scout, 'scoutMilitary');

/**
 * @return {null}
 */
function healer(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }

    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.squadLeader === true);
    const targets = creep.pos.findInRange(FIND_CREEPS, 10, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true});
    if (targets.length > 0) {
        if (creep.heal(targets[0]) === ERR_NOT_IN_RANGE) {
            if (creep.heal(targets[0]) === ERR_NOT_IN_RANGE) {
                creep.rangedHeal(targets[0]);
                creep.travelTo(targets[0], {allowHostile: true, movingTarget: true});
            }
        }
    } else {
        if (squadLeader.length > 0) {
            creep.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
        } else {
            creep.travelTo(Game.flags[creep.memory.staging]);
        }
    }
}
healer = profiler.registerFN(healer, 'healerMilitary');

/**
 * @return {null}
 */
function attacker(creep) {
    cache.cacheRoomIntel(creep);
    if (creep.memory.attackStarted !== true && Game.flags[creep.memory.staging].pos.roomName !== creep.pos.roomName) {
        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
        creep.travelTo(Game.flags[creep.memory.staging]);
        return null;
    }

    let attackers = _.filter(Game.creeps, (a) => a.memory.attackTarget === creep.memory.attackTarget && a.memory.role === 'attacker');
    let healers = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'healer');
    let ranged = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'ranged');
    let deconstructors = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'deconstructor');
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.squadLeader === true);

    if (squadLeader.length === 0) {
        creep.memory.squadLeader = true;
    }

    if (creep.memory.squadLeader === true) {
        let armedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        let closestHostileSpawn = creep.pos.findClosestByPath(FIND_HOSTILE_SPAWNS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
        let closestHostileTower = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && _.includes(doNotAggress, s.owner['username']) === false});
        let closestHostile = creep.pos.findClosestByPath(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
        let weakPoint = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false});
        let hostileStructures = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => (s.structureType !== STRUCTURE_RAMPART || s.structureType !== STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false});
        if (creep.room.controller && creep.room.controller.owner && _.includes(doNotAggress, creep.room.controller.owner['username']) === false && creep.room.controller.safeMode) {
            creep.memory.attackStarted = 'safe';
            Game.flags[creep.memory.attackTarget].remove();
            creep.travelTo(Game.flags[creep.memory.staging]);
        }
        if (armedHostile) {
            creep.memory.squadTarget = armedHostile.id;
            if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
                creep.rangedAttack(armedHostile);
                if (creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                }
                creep.travelTo(armedHostile, {allowHostile: true, movingTarget: true});
            }
        } else if (closestHostileTower) {
            creep.memory.squadTarget = closestHostileTower.id;
            if (creep.attack(closestHostileTower) === ERR_NOT_IN_RANGE) {
                creep.rangedAttack(closestHostileTower);
                if (creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                }
                creep.travelTo(closestHostileTower, {allowHostile: true});
            }
        } else if (closestHostileSpawn) {
            creep.memory.squadTarget = closestHostileSpawn.id;
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
                creep.rangedAttack(closestHostileSpawn);
                creep.travelTo(closestHostileSpawn, {allowHostile: true});
            }
        } else if (Game.flags[creep.memory.attackTarget] && closestHostile && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = closestHostile.id;
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.rangedAttack(closestHostile);
                creep.travelTo(closestHostile, {allowHostile: true, movingTarget: true});
            }
        } else if (Game.flags[creep.memory.attackTarget] && hostileStructures && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = hostileStructures.id;
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            if (creep.attack(hostileStructures) === ERR_NOT_IN_RANGE) {
                creep.rangedAttack(hostileStructures);
                creep.travelTo(hostileStructures, {allowHostile: true});
            }
        } else if (Game.flags[creep.memory.attackTarget] && weakPoint.length > 0 && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            weakPoint = _.min(weakPoint, 'hits');
            creep.memory.squadTarget = weakPoint.id;
            if (creep.pos.findInRange(deconstructors, 5).length === 0) {
                if (creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                }
                if (creep.attack(weakPoint) === ERR_NOT_IN_RANGE) {
                    creep.rangedAttack(weakPoint);
                    creep.travelTo(weakPoint, {allowHostile: true});
                }
            } else {
                creep.rangedAttack(weakPoint);
                creep.travelTo(weakPoint, {allowHostile: true, range: 2});
            }
        } else if (creep.memory.attackStarted !== true) {
            creep.memory.squadTarget = undefined;
            creep.travelTo(Game.flags[creep.memory.staging]);
            if (Game.flags[creep.memory.attackTarget]) {
                let nearbyAttackers = creep.pos.findInRange(attackers, 5);
                let nearbyHealers = creep.pos.findInRange(healers, 5);
                let nearbyRanged = creep.pos.findInRange(ranged, 5);
                let nearbyDeconstructors = creep.pos.findInRange(deconstructors, 5);
                if (nearbyAttackers.length >= creep.memory.waitForAttackers - 1 && nearbyHealers.length >= creep.memory.waitForHealers && nearbyDeconstructors.length >= creep.memory.waitForDeconstructor && nearbyRanged.length >= creep.memory.waitForRanged) {
                    creep.memory.attackStarted = true;
                }
            }
        } else {
            if (Game.flags['wp'] && creep.memory.waypointReached !== true) {
                if (creep.pos.getRangeTo(Game.flags['wp']) > 6) {
                    creep.memory.waypointReached = true;
                }
                creep.travelTo(Game.flags['wp'], {allowHostile: false});
            } else {
                creep.travelTo(Game.flags[creep.memory.attackTarget], {allowHostile: true});
            }
        }
    } else {
        if (squadLeader[0].memory.attackStarted !== true) {
            creep.travelTo(squadLeader[0], {movingTarget: true});
        } else if (creep.pos.getRangeTo(squadLeader[0]) > 4) {
            if (creep.room.name !== squadLeader[0].pos.roomName) {
                creep.travelTo(squadLeader[0], {allowHostile: true});
            } else {
                creep.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
            }
        } else if (creep.attack(Game.getObjectById(squadLeader[0].memory.squadTarget)) === ERR_NOT_IN_RANGE) {
            creep.rangedAttack(Game.getObjectById(squadLeader[0].memory.squadTarget));
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            creep.travelTo(Game.getObjectById(squadLeader[0].memory.squadTarget), {
                allowHostile: true,
                movingTarget: true
            });
        }
    }
}
attacker = profiler.registerFN(attacker, 'attackerMilitary');

/**
 * @return {null}
 */
function ranged(creep) {
    cache.cacheRoomIntel(creep);

    let attackers = _.filter(Game.creeps, (a) => a.memory.attackTarget === creep.memory.attackTarget && a.memory.role === 'attacker');
    let healers = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'healer');
    let ranged = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'ranged');
    let deconstructors = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'deconstructor');
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.squadLeader === true);

    if (squadLeader.length === 0) {
        creep.memory.squadLeader = true;
    }
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }

    if (creep.memory.squadLeader === true) {
        let armedHostile = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        let closestHostileSpawn = creep.pos.findClosestByPath(FIND_HOSTILE_SPAWNS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
        let closestHostileTower = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && _.includes(doNotAggress, s.owner['username']) === false});
        let closestHostile = creep.pos.findClosestByPath(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
        let weakPoint = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false});
        let hostileStructures = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => (s.structureType !== STRUCTURE_RAMPART || s.structureType !== STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false});
        if (creep.room.controller && creep.room.controller.owner && _.includes(doNotAggress, creep.room.controller.owner['username']) === false && creep.room.controller.safeMode) {
            creep.memory.attackStarted = 'safe';
            Game.flags[creep.memory.attackTarget].remove();
            creep.travelTo(Game.flags[creep.memory.staging]);
        }
        if (armedHostile) {
            creep.memory.squadTarget = armedHostile.id;
            if (creep.rangedAttack(armedHostile) === ERR_NOT_IN_RANGE) {
                creep.travelTo(armedHostile, {allowHostile: true, range: 3, movingTarget: true});
            } else if (creep.pos.getRangeTo(armedHostile) < 3) {
                militaryFunctions.retreat(creep);
            }
        } else if (closestHostileTower) {
            creep.memory.squadTarget = closestHostileTower.id;
            if (creep.rangedAttack(closestHostileTower) === ERR_NOT_IN_RANGE) {
                creep.travelTo(closestHostileTower, {allowHostile: true, range: 3});
            }
        } else if (closestHostileSpawn) {
            creep.memory.squadTarget = closestHostileSpawn.id;
            if (creep.rangedAttack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
                creep.travelTo(closestHostileSpawn, {allowHostile: true, range: 3});
            }
        } else if (Game.flags[creep.memory.attackTarget] && closestHostile && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = closestHostile.id;
            if (creep.rangedAttack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.travelTo(closestHostile, {allowHostile: true, range: 3, movingTarget: true});
            }
        } else if (Game.flags[creep.memory.attackTarget] && hostileStructures && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = hostileStructures.id;
            if (creep.rangedAttack(hostileStructures) === ERR_NOT_IN_RANGE) {
                creep.travelTo(hostileStructures, {allowHostile: true, range: 3});
            }
        } else if (Game.flags[creep.memory.attackTarget] && weakPoint.length > 0 && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            weakPoint = _.min(weakPoint, 'hits');
            creep.memory.squadTarget = weakPoint.id;
            if (creep.pos.findInRange(deconstructors, 5).length === 0) {
                if (creep.rangedAttack(weakPoint) === ERR_NOT_IN_RANGE) {
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
                let nearbyAttackers = creep.pos.findInRange(attackers, 5);
                let nearbyHealers = creep.pos.findInRange(healers, 5);
                let nearbyRanged = creep.pos.findInRange(ranged, 5);
                let nearbyDeconstructors = creep.pos.findInRange(deconstructors, 5);
                if (nearbyRanged.length >= creep.memory.waitForRanged - 1 && nearbyAttackers.length >= creep.memory.waitForAttackers && nearbyHealers.length >= creep.memory.waitForHealers && nearbyDeconstructors.length >= creep.memory.waitForDeconstructor) {
                    creep.memory.attackStarted = true;
                }
            }
        } else {
            creep.memory.squadTarget = undefined;
            if (Game.flags['wp'] && creep.memory.waypointReached !== true) {
                if (creep.pos.getRangeTo(Game.flags['wp']) > 6) {
                    creep.memory.waypointReached = true;
                }
                creep.travelTo(Game.flags['wp'], {allowHostile: false});
            } else {
                creep.travelTo(Game.flags[creep.memory.attackTarget], {allowHostile: true});
            }
        }
    } else {
        if (squadLeader[0].memory.attackStarted !== true) {
            creep.travelTo(squadLeader[0], {movingTarget: true});
        } else if (creep.pos.getRangeTo(squadLeader[0]) > 4) {
            if (creep.room.name !== squadLeader[0].pos.roomName) {
                creep.travelTo(squadLeader[0], {allowHostile: true});
            } else {
                creep.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
            }
        } else if (squadLeader[0].memory.squadTarget && creep.rangedAttack(Game.getObjectById(squadLeader[0].memory.squadTarget)) === ERR_NOT_IN_RANGE) {
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            creep.travelTo(Game.getObjectById(squadLeader[0].memory.squadTarget), {
                allowHostile: true,
                movingTarget: true,
                range: 3
            });
        } else if (squadLeader[0].memory.squadTarget && creep.pos.getRangeTo(Game.getObjectById(squadLeader[0].memory.squadTarget)) < 3) {
            creep.travelTo(Game.getObjectById(squadLeader[0].memory.squadTarget), {
                allowHostile: true,
                movingTarget: true,
                range: 3
            });
        }
    }
}
ranged = profiler.registerFN(ranged, 'rangedMilitary');

/**
 * @return {null}
 */
function deconstructor(creep) {
    cache.cacheRoomIntel(creep);
    if (!Game.flags[creep.memory.attackTarget]) {
        creep.suicide();
    }
    if (creep.memory.attackStarted !== true && Game.flags[creep.memory.staging].pos.roomName !== creep.pos.roomName) {
        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
        }
        creep.travelTo(Game.flags[creep.memory.staging]);
        return null;
    }

    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.squadLeader === true);

    let closestHostileSpawn = creep.pos.findClosestByPath(FIND_HOSTILE_SPAWNS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
    let closestHostileTower = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && _.includes(doNotAggress, s.owner['username']) === false});
    let weakPoint = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false});
    let hostileStructures = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => (s.structureType !== STRUCTURE_RAMPART || s.structureType !== STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false});
    if (closestHostileTower) {
        if (creep.dismantle(closestHostileTower) === ERR_NOT_IN_RANGE) {
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            creep.travelTo(closestHostileTower, {allowHostile: true});
        }
    } else if (closestHostileSpawn) {
        if (creep.dismantle(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            creep.travelTo(closestHostileSpawn, {allowHostile: true});
        }
    } else if (hostileStructures && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
        if (creep.dismantle(hostileStructures) === ERR_NOT_IN_RANGE) {
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            creep.travelTo(hostileStructures, {allowHostile: true});
        }
    } else if (weakPoint && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
        weakPoint = _.min(weakPoint, 'hits');
        if (creep.dismantle(weakPoint) === ERR_NOT_IN_RANGE) {
            if (creep.hits < creep.hitsMax) {
                creep.heal(creep);
            }
            creep.travelTo(weakPoint, {allowHostile: true});
        }
    } else if (squadLeader.length > 0) {
        if (creep.pos.getRangeTo(squadLeader[0]) > 6) {
            creep.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
        }
    } else {
        creep.travelTo(Game.flags[creep.memory.staging]);
    }
}
deconstructor = profiler.registerFN(deconstructor, 'deconstructorMilitary');

/**
 * @return {null}
 */
function claimer(creep) {
    //Initial move

    if (!Game.flags[creep.memory.destination]) {
        creep.suicide();
    }
    if (!creep.memory.destinationReached) {
        creep.travelTo(Game.flags[creep.memory.destination]);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.destination]) <= 3) {
            creep.memory.destinationReached = true;
        }
    } else {
        if (creep.room.controller) {
            if (creep.claimController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.travelTo(creep.room.controller);
            }
        }
    }
}
claimer = profiler.registerFN(claimer, 'claimerMilitary');

/**
 * @return {null}
 */
function reserver(creep) {
    //Invader detection
    invaderCheck(creep);
    let reservers = creep.pos.findClosestByRange(FIND_MY_CREEPS, {filter: (c) => c.memory.role === 'reserver' && c.name !== creep.name});
    if (creep.memory.invaderDetected === true) {
        creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
        creep.memory.visitedRooms.push(creep.memory.currentDestination);
        creep.memory.currentDestination = undefined;
    }
    if (!creep.memory.targetRooms) {
        creep.memory.targetRooms = Game.map.describeExits(creep.memory.assignedRoom)
    }
    if (creep.memory.reserving) {
        if ((creep.room.controller.reservation && creep.room.controller.reservation['ticksToEnd'] >= 1500) || creep.room.controller.owner) {
            creep.memory.reserving = undefined;
        } else if (creep.reserveController(creep.room.controller) === ERR_NOT_IN_RANGE || creep.signController(creep.room.controller, "Reserved Territory of Overlords - #overlords on Slack") === ERR_NOT_IN_RANGE) {
            creep.travelTo(creep.room.controller);
        }
        return null;
    }
    if (!creep.memory.currentDestination) {
        for (let key in creep.memory.targetRooms) {
            creep.memory.currentDestination = creep.memory.targetRooms[key];
        }
        creep.memory.visitedRooms = [];
    }
    if (creep.pos.roomName !== creep.memory.currentDestination) {
        creep.travelTo((new RoomPosition(25, 25, creep.memory.currentDestination))); //to move to any room
    } else {
        if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || (creep.room.controller.reservation['username'] === 'Shibdib' && creep.room.controller.reservation['ticksToEnd'] < 1000)) && !reservers) {
            creep.travelTo(creep.room.controller);
            creep.memory.reserving = true;
        } else {
            creep.memory.visitedRooms.push(creep.memory.currentDestination);
            creep.memory.currentDestination = undefined;
            for (let key in creep.memory.targetRooms) {
                if (_.includes(creep.memory.visitedRooms, creep.memory.targetRooms[key]) === false) {
                    creep.memory.currentDestination = creep.memory.targetRooms[key];
                }
            }
        }
    }
}
reserver = profiler.registerFN(reserver, 'reserverMilitary');

/**
 * @return {null}
 */
function raider(creep) {
    cache.cacheRoomIntel(creep);
    if (!Game.flags[creep.memory.attackTarget]) {
        creepTools.recycle(creep);
        return null;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.returning = true;
        creep.memory.destinationReached = false;
    }
    if (creep.carry.energy === 0) {
        creep.memory.returning = false;
    }
    if (creep.memory.returning === true) {
        if (creep.room.name === Game.getObjectById(creep.memory.assignedSpawn).pos.roomName) {
            let terminal = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'terminal'), 'id');
            let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
            if (terminal.length > 0) {
                creep.memory.storageDestination = terminal[0];
            } else if (storage.length > 0) {
                creep.memory.storageDestination = storage[0];
            }
            if (creep.memory.storageDestination) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(storageItem);
                } else {
                    creep.memory.storageDestination = null;
                    creep.memory.path = null;
                }
                return null;
            }
            creepTools.findStorage(creep);
        } else {
            creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
            return null;
        }
        return null;
    }
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.travelTo(Game.flags[creep.memory.attackTarget]);
        if (creep.pos.getRangeTo(Game.flags[creep.memory.attackTarget]) <= 3) {
            creep.memory.destinationReached = true;
        }
    } else {
        let storage = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] !== 0});
        if (storage) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storage);
            }
        } else {
            let extension = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.energy !== 0});
            if (extension) {
                if (creep.withdraw(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.travelTo(extension);
                }
            } else {
                let spawn = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.energy !== 0});
                if (spawn) {
                    if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.travelTo(spawn);
                    }
                } else {
                    let terminal = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TERMINAL && s.energy !== 0});
                    if (terminal) {
                        if (creep.withdraw(terminal, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            creep.travelTo(terminal);
                        }
                    } else {
                        if (creep.carry.energy > 0) {
                            creep.memory.returning = true;
                            creep.memory.destinationReached = false;
                        }
                    }
                }
            }
        }
    }
}
raider = profiler.registerFN(raider, 'raiderMilitary');

/**
 * @return {null}
 */
function responder(creep) {

    borderChecks.borderCheck(creep);
    if (creep.hits < creep.hitsMax / 2) {
        creep.heal(creep);
    }

    if (Game.rooms[creep.memory.responseTarget] && creep.pos.roomName === Game.rooms[creep.memory.responseTarget].name) {
        creep.memory.destinationReached = true;
    }

    let armedHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1 || e.getActiveBodyparts(WORK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    let closestHostileSpawn = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS);
    let closestHostileTower = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER});
    let closestHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    let friendlies = creep.pos.findInRange(FIND_CREEPS, 15, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true});
    if (armedHostile) {
        if (creep.pos.roomName === creep.memory.assignedRoom) {
            if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
                findDefensivePosition(creep, armedHostile);
            }
            creep.rangedAttack(armedHostile);
        } else {
            if (creep.attack(armedHostile) === ERR_NOT_IN_RANGE) {
                creep.travelTo(armedHostile);
            }
            creep.rangedAttack(armedHostile);
        }
    } else if (closestHostileTower) {
        if (creep.attack(closestHostileTower) === ERR_NOT_IN_RANGE) {
            creep.travelTo(closestHostileTower);
        }
    } else if (closestHostileSpawn) {
        if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
            creep.travelTo(closestHostileSpawn);
        }
    } else if (closestHostile) {
        if (creep.pos.roomName === creep.memory.assignedRoom) {
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                findDefensivePosition(creep, closestHostile);
            }
            creep.rangedAttack(closestHostile);
        } else {
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.travelTo(closestHostile);
            }
            creep.rangedAttack(closestHostile);
        }
    } else if (friendlies.length > 0 && creep.room.memory.responseNeeded !== true && creep.memory.destinationReached === true) {
        if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
            if (creep.heal(friendlies[0]) === ERR_NOT_IN_RANGE) {
                creep.travelTo(friendlies[0]);
            }
        }
    } else if (creep.memory.destinationReached !== true && Game.rooms[creep.memory.responseTarget]) {
        if (creep.pos.roomName === Game.rooms[creep.memory.responseTarget].name) {
            creep.memory.destinationReached = true;
        }
        creep.moveTo(new RoomPosition(25, 25, Game.rooms[creep.memory.responseTarget].name), {range: 21}); //to move to any room
    } else if (creep.memory.assignedRampart) {
        if (Game.getObjectById(creep.memory.assignedRampart).pos.x !== creep.pos.x || Game.getObjectById(creep.memory.assignedRampart).pos.y !== creep.pos.y) {
            creep.travelTo(Game.getObjectById(creep.memory.assignedRampart));
        }
    } else if (!creep.memory.assignedRampart) {
        findDefensivePosition(creep, creep);
    }
}
responder = profiler.registerFN(responder, 'responderMilitary');

function invaderCheck(creep) {
    let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (invader) {
        let number = creep.room.find(FIND_HOSTILE_CREEPS);
        creep.room.memory.responseNeeded = true;
        creep.room.memory.tickDetected = Game.time;
        if (!creep.room.memory.numberOfHostiles || creep.room.memory.numberOfHostiles < number.length) {
            creep.room.memory.numberOfHostiles = number.length;
        }
        creep.memory.invaderDetected = true;
    } else if (creep.room.memory.tickDetected < Game.time - 150) {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.numberOfHostiles = undefined;
        creep.room.memory.responseNeeded = false;
    }
}
invaderCheck = profiler.registerFN(invaderCheck, 'invaderCheckMilitary');

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        let armedHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1 || e.getActiveBodyparts(WORK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        if (bestRampart && bestRampart.pos !== creep.pos) {
            creep.memory.pathAge = 999;
            bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos && (creep.pos.getRangeTo(bestRampart) < creep.pos.getRangeTo(armedHostile) || !armedHostile)) {
                creep.travelTo(bestRampart);
            }
        }
    }
}
findDefensivePosition = profiler.registerFN(findDefensivePosition, 'findDefensivePositionMilitary');

function kiting(creep, target) {
    if (target.pos.x < creep.pos.x && target.pos.y < creep.pos.y) {
        if (new RoomPosition(creep.pos.x + 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM_RIGHT);
        } else if (new RoomPosition(creep.pos.x + 1, creep.pos.y, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(RIGHT);
        } else if (new RoomPosition(creep.pos.x, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM);
        }
        return;
    }
    if (target.pos.x < creep.pos.x && target.pos.y > creep.pos.y) {
        if (new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(TOP_RIGHT);
        } else if (new RoomPosition(creep.pos.x + 1, creep.pos.y, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(RIGHT);
        } else if (new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(TOP);
        }
        return;
    }
    if (target.pos.x > creep.pos.x && target.pos.y > creep.pos.y) {
        if (new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(TOP_LEFT);
        } else if (new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(LEFT);
        } else if (new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(TOP);
        }
        return;
    }
    if (target.pos.x > creep.pos.x && target.pos.y < creep.pos.y) {
        if (new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM_LEFT);
        } else if (new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(LEFT);
        } else if (new RoomPosition(creep.pos.x, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM);
        }
        return;
    }
    if (target.pos.x > creep.pos.x && target.pos.y === creep.pos.y) {
        if (new RoomPosition(creep.pos.x - 1, creep.pos.y, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(LEFT);
        } else if (new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM_LEFT);
        } else if (new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(TOP_LEFT);
        }
        return;
    }
    if (target.pos.x < creep.pos.x && target.pos.y === creep.pos.y) {
        if (new RoomPosition(creep.pos.x + 1, creep.pos.y, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(RIGHT);
        } else if (new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(TOP_RIGHT);
        } else if (new RoomPosition(creep.pos.x + 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM_RIGHT);
        }
        return;
    }
    if (target.pos.x === creep.pos.x && target.pos.y < creep.pos.y) {
        if (new RoomPosition(creep.pos.x, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM);
        } else if (new RoomPosition(creep.pos.x + 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM_RIGHT);
        } else if (new RoomPosition(creep.pos.x - 1, creep.pos.y + 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(BOTTOM_LEFT);
        }
        return;
    }
    if (target.pos.x === creep.pos.x && target.pos.y > creep.pos.y) {
        if (new RoomPosition(creep.pos.x, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
        creep.move(TOP);
        } else if (new RoomPosition(creep.pos.x + 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(TOP_RIGHT);
        } else if (new RoomPosition(creep.pos.x - 1, creep.pos.y - 1, creep.room.name).lookFor(LOOK_TERRAIN) === 'plain') {
            creep.move(TOP_LEFT);
        }

    }
}
kiting = profiler.registerFN(kiting, 'kitingMilitary');

