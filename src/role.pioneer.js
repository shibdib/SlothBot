/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.borderCheck();
    //Invader detection
    creep.repairRoad();
    let hostiles = creep.findClosestEnemy();
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 7) return creep.retreat();
    if (creep.hits < creep.hitsMax && !creep.memory.initialBuilder) return creep.goHomeAndHeal();
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    if (creep.memory.destinationReached && (creep.pos.x === 1 || creep.pos.x === 48 || creep.pos.y === 1 || creep.pos.y === 48) && creep.pos.findInRange(creep.room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART})[0]) {
        if (creep.memory.lastPos === creep.pos.x + ':' + creep.pos.y) {
            return creep.dismantle(creep.pos.findInRange(creep.room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART})[0]);
        } else {
            creep.memory.lastPos = creep.pos.x + ':' + creep.pos.y;
        }
    }

    if (creep.memory.destinationReached && _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my)[0]) {
        if (creep.memory.initialBuilder) {
            if (!creep.room.memory.extensionHub) findExtensionHub(creep.room);
            let supportRoom = _.filter(Game.rooms, (r) => r.memory && r.memory.assistingRoom === creep.room.name || r.memory.claimTarget === creep.room.name);
            log.a(creep.room.name + ' is now an active room and no longer needs support.');
            for (let key in supportRoom) {
                delete supportRoom[key].memory.activeClaim;
                delete supportRoom[key].memory.assistingRoom;
                delete supportRoom[key].memory.claimTarget;
            }
        }
        creep.memory.role = 'worker';
        creep.memory.overlord = creep.room.name;
        creep.memory.assignedSpawn = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_SPAWN}).id;
        return;
    }
    if (creep.carry.energy === 0) {
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
        creep.memory.hauling = false;
    }
    if (creep.carry.energy === creep.carryCapacity) {
        creep.memory.hauling = true;
    }
    if (creep.memory.destinationReached) {
        if (creep.memory.hauling === false) {
            let container = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 100);
            if (container.length > 0) {
                if (creep.withdraw(container[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(container[0]);
                }
            } else {
                let source = creep.pos.getClosestSource();
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
            }
        } else {
            if (creep.memory.task === 'build' && creep.memory.constructionSite) {
                if (!Game.getObjectById(creep.memory.constructionSite)) {
                    creep.memory.constructionSite = undefined;
                    creep.memory.task = undefined;
                    return;
                }
                let construction = Game.getObjectById(creep.memory.constructionSite);
                switch (creep.build(construction)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(construction, {range: 3});
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                    case ERR_INVALID_TARGET:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                }
            } else if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
                if (!Game.getObjectById(creep.memory.constructionSite)) {
                    creep.memory.constructionSite = undefined;
                    creep.memory.task = undefined;
                    return;
                }
                let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
                switch (creep.repair(repairNeeded)) {
                    case OK:
                        return null;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(repairNeeded, {range: 3});
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        delete creep.memory.constructionSite;
                        break;
                    case ERR_INVALID_TARGET:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                }
            } else if (creep.memory.initialBuilder) {
                if (creep.room.controller.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_WALL})[0]) {
                    switch (creep.dismantle(creep.room.controller.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_WALL})[0])) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(creep.room.controller.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_WALL})[0]);
                    }
                } else if (creep.memory.initialBuilder && creep.room.controller && creep.room.controller.level < 2) {
                    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) creep.shibMove(creep.room.controller, {range: 3});
                } else if (creep.memory.upgrade || (creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username === USERNAME && creep.room.controller.ticksToDowngrade < 1000)) {
                    creep.memory.upgrade = true;
                    if (creep.room.controller.ticksToDowngrade >= 2000) delete creep.memory.upgrade;
                    if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(creep.room.controller);
                    }
                } else if (_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000).length) {
                    switch (creep.repair(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000)[0])) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 5000)[0], {range: 3});
                            break;
                    }
                } else if (!creep.findConstruction()) {
                    creep.findRepair(1);
                }
            } else if (!creep.findConstruction()) {
                creep.findRepair(1);
            }
        }
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
}

module.exports.role = profiler.registerFN(role, 'pioneerRole');

function findExtensionHub(room) {
    for (let i = 1; i < 249; i++) {
        let spawn = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_SPAWN && s.my)[0];
        if (spawn) {
            room.memory.extensionHub = {};
            room.memory.extensionHub.x = spawn.x;
            room.memory.extensionHub.y = spawn.y;
            return;
        }
        let pos = new RoomPosition(getRandomInt(11, 39), getRandomInt(11, 39), room.name);
        let closestStructure = pos.findClosestByRange(room.structures);
        let terrain = Game.rooms[pos.roomName].lookForAtArea(LOOK_TERRAIN, pos.y - 3, pos.x - 3, pos.y + 3, pos.x + 3, true);
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
        }
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}