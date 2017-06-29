let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let militaryFunctions = require('module.militaryFunctions');
let _ = require('lodash');

let doNotAggress = RawMemory.segments[2];


module.exports.Manager = function (creep) {
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
    }
};

function defender(creep) {
    const targets = creep.pos.findInRange(FIND_CREEPS, 10, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    const closestHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    if (targets.length > 0) {
        creep.say('ATTACKING');
        if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
            creep.moveTo(closestHostile, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        }
    } else {
        creep.travelTo(creep.memory.assignedSpawn);
    }
}
/**
 * @return {null}
 */
function healer(creep) {

    //RENEWAL
    if (creepTools.renewal(creep) === true) {
        return null;
    }
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    }

    if (!Game.flags[creep.memory.attackTarget]) {
        creep.suicide();
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
/**
 * @return {null}
 */
function scout(creep) {
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
/**
 * @return {null}
 */
function attacker(creep) {
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

    let attackers = _.filter(Game.creeps, (a) => a.memory.attackTarget === creep.memory.attackTarget && a.memory.role === 'attacker');
    let healers = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.role === 'healer');
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
        let weakPoint = _.min(creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false}), 'hits');
        let hostileStructures = creep.pos.findClosestByPath(FIND_HOSTILE_STRUCTURES, {filter: (s) => (s.structureType !== STRUCTURE_RAMPART || s.structureType !== STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false});
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
            if (creep.attack(closestHostileSpawn) === ERR_NOT_IN_RANGE) {
                creep.rangedAttack(closestHostileSpawn);
                if (creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                }
                creep.travelTo(closestHostileSpawn, {allowHostile: true});
            }
        } else if (closestHostile && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = closestHostile.id;
            if (creep.attack(closestHostile) === ERR_NOT_IN_RANGE) {
                creep.rangedAttack(closestHostile);
                if (creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                }
                creep.travelTo(closestHostile, {allowHostile: true, movingTarget: true});
            }
        } else if (hostileStructures && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = hostileStructures.id;
            if (creep.attack(hostileStructures) === ERR_NOT_IN_RANGE) {
                creep.rangedAttack(hostileStructures);
                if (creep.hits < creep.hitsMax) {
                    creep.heal(creep);
                }
                creep.travelTo(hostileStructures, {allowHostile: true});
            }
        } else if (weakPoint && creep.pos.roomName === Game.flags[creep.memory.attackTarget].pos.roomName) {
            creep.memory.squadTarget = weakPoint.id;
            if (creep.pos.findInRange(deconstructors, 5).length === 0) {
                if (creep.attack(weakPoint) === ERR_NOT_IN_RANGE) {
                    creep.rangedAttack(weakPoint);
                    if (creep.hits < creep.hitsMax) {
                        creep.heal(creep);
                    }
                    creep.travelTo(weakPoint, {allowHostile: true});
                }
            } else {
                creep.rangedAttack(weakPoint);
                creep.travelTo(weakPoint, {allowHostile: true, range: 2});
            }
        } else if (creep.memory.attackStarted !== true) {
            creep.travelTo(Game.flags[creep.memory.staging]);
            let nearbyAttackers = creep.pos.findInRange(attackers, 5);
            let nearbyHealers = creep.pos.findInRange(healers, 5);
            let nearbyDeconstructors = creep.pos.findInRange(deconstructors, 5);
            if (nearbyAttackers.length >= creep.memory.waitForAttackers - 1 && nearbyHealers.length >= creep.memory.waitForHealers && nearbyDeconstructors.length >= creep.memory.waitForDeconstructor) {
                creep.memory.attackStarted = true;
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
        } else if (creep.pos.getRangeTo(squadLeader[0]) > 6) {
            creep.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
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
/**
 * @return {null}
 */
function deconstructor(creep) {
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
    let weakPoint = _.min(creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10, {filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && _.includes(doNotAggress, s.owner['username']) === false}), 'hits');
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
/**
 * @return {null}
 */
function reserver(creep) {
    //Invader detection
    invaderCheck(creep);
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
        if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || (creep.room.controller.reservation['username'] === 'Shibdib' && creep.room.controller.reservation['ticksToEnd'] < 1000))) {
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
/**
 * @return {null}
 */
function raider(creep) {

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
    } else if (friendlies.length > 0) {
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

function invaderCheck(creep) {
    let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (!spawn) {
        let invader = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (invader) {
            let number = creep.room.find(FIND_HOSTILE_CREEPS);
            creep.room.memory.responseNeeded = true;
            creep.room.memory.numberOfHostiles = number.length;
            creep.memory.invaderDetected = true;
        } else {
            creep.memory.invaderDetected = undefined;
            creep.memory.invaderID = undefined;
            creep.room.memory.numberOfHostiles = undefined;
            creep.room.memory.responseNeeded = false;
        }
    } else {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.responseNeeded = false;
    }
}

function findDefensivePosition(creep, target) {
    if (target) {
        let bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        if (bestRampart && bestRampart.pos !== creep.pos) {
            creep.memory.pathAge = 999;
            bestRampart = target.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART && (r.pos.lookFor(LOOK_CREEPS).length === 0 || (r.pos.x === creep.pos.x && r.pos.y === creep.pos.y))});
            creep.memory.assignedRampart = bestRampart.id;
            if (bestRampart.pos !== creep.pos) {
                creep.travelTo(bestRampart);
            }
        }
    }
}
