/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    //Invader detection
    creep.invaderCheck();
    //Intel collection
    creep.room.cacheRoomIntel();
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 5) {
        return creep.retreat();
    }

    if (creep.pos.roomName !== creep.memory.destination) {
        creep.memory.destinationReached = false;
    }
    if (creep.pos.roomName === creep.memory.destination) {
        creep.memory.destinationReached = true;
    }
    if (creep.memory.destinationReached && creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN})) {
        if (creep.memory.initialBuilder) {
            Game.rooms[creep.memory.overlord].memory.activeClaim = undefined;
        }
        creep.memory.role = 'worker';
        creep.memory.overlord = creep.room.name;
        creep.memory.assignedSpawn = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN}).id;
        return;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.destinationReached) {
        if (creep.memory.hauling === false) {
            let container = creep.room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 100});
            if (container.length > 0) {
                if (creep.withdraw(container[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(container[0]);
                }
            } else {
                let source = creep.pos.getClosestSource();
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
            }
        } else {
            if (creep.memory.initialBuilder && creep.room.controller && creep.room.controller.level < 2) {
                if (creep.upgradeController(Game.rooms[creep.memory.overlord].controller) === ERR_NOT_IN_RANGE) creep.shibMove(Game.rooms[creep.memory.overlord].controller, {range: 3});
            } else if (creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username === 'Shibdib' && creep.room.controller.ticksToDowngrade < 3000) {
                if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(creep.room.controller);
                }
            } else {
                if (!creep.findConstruction()) {
                    //Pioneer initial builder spawn creation
                    if (this.memory.initialBuilder) {
                        if (this.room.memory.extensionHub) {
                            let hub = new RoomPosition(this.room.memory.extensionHub.x, this.room.memory.extensionHub.y, this.room.name);
                            if (_.filter(hub.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART).length === 0) {
                                switch (hub.createConstructionSite(STRUCTURE_RAMPART)) {
                                    case OK:
                                        for (let key in Memory.ownedRooms) {
                                            if (Game.rooms[key].memory.claimTarget === this.pos.roomName) {
                                                Game.rooms[key].memory.activeClaim = true;
                                            }
                                        }
                                }
                            } else if (_.filter(hub.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART)[0].hits < 5000) {
                                switch (hub.repair(_.filter(hub.lookFor(LOOK_STRUCTURES), (s) => s.structureType === STRUCTURE_RAMPART)[0])) {
                                    case OK:
                                        for (let key in Memory.ownedRooms) {
                                            if (Game.rooms[key].memory.claimTarget === this.pos.roomName) {
                                                Game.rooms[key].memory.activeClaim = true;
                                            }
                                        }
                                        break;
                                    case ERR_NOT_IN_RANGE:
                                        creep.shibMove(hub);
                                }
                            } else {
                                switch (hub.createConstructionSite(STRUCTURE_SPAWN)) {
                                    case OK:
                                        for (let key in Memory.ownedRooms) {
                                            if (Game.rooms[key].memory.claimTarget === this.pos.roomName) {
                                                Game.rooms[key].memory.activeClaim = true;
                                            }
                                        }
                                }
                            }
                        } else {
                            findExtensionHub(this.room);
                        }
                    }
                }
                if (creep.memory.task === 'build') {
                    let construction = Game.getObjectById(creep.memory.constructionSite);
                    if (creep.build(construction) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(construction, {range: 3});
                    }
                } else {
                    creep.findRepair('1');
                    if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
                        let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
                        if (creep.repair(repairNeeded) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(repairNeeded, {range: 3});
                        }
                    } else if (Game.room && Game.room.controller && creep.upgradeController(Game.room.controller) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(Game.room.controller);
                    } else {
                        creep.idleFor(10);
                    }
                }
            }
        }
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
    }
}

module.exports.role = profiler.registerFN(role, 'pioneerRole');

function findExtensionHub(room) {
    for (let i = 1; i < 249; i++) {
        let pos = new RoomPosition(getRandomInt(8, 41), getRandomInt(8, 41), room.name);
        let built = room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN});
        let inBuild = room.find(FIND_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_SPAWN});
        if (built.length > 0 || inBuild.length > 0) {
            if (built[0]) {
                room.memory.extensionHub = {};
                room.memory.extensionHub.x = built[0].pos.x;
                room.memory.extensionHub.y = built[0].pos.y;
                return;
            } else {
                room.memory.extensionHub = {};
                room.memory.extensionHub.x = inBuild[0].pos.x;
                room.memory.extensionHub.y = inBuild[0].pos.y;
                return;
            }
        }
        let closestStructure = pos.findClosestByRange(FIND_STRUCTURES);
        let terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y - 4, pos.x - 4, pos.y + 4, pos.x + 4, true);
        let wall = false;
        for (let key in terrain) {
            let position = new RoomPosition(terrain[key].x, terrain[key].y, room.name);
            if (!position.checkForWall()) {
                continue;
            }
            wall = true;
            break;
        }
        if (pos.getRangeTo(closestStructure) >= 4 && wall === false) {
            room.memory.extensionHub = {};
            room.memory.extensionHub.x = pos.x;
            room.memory.extensionHub.y = pos.y;
            return;
        }
    }
}

findExtensionHub = profiler.registerFN(findExtensionHub, 'findExtensionHub');