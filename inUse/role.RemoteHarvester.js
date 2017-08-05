/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    if (Game.time % 50 === 0) {
        creep.cacheRoomIntel();
    }
    //Invader detection
    creep.invaderCheck();
    if (!_.startsWith(creep.name, 'SK') && !creep.room.controller) {
        if (creep.memory.invaderDetected === true || creep.memory.invaderCooldown < 50) {
            creep.memory.invaderCooldown++;
            creep.shibMove(new RoomPosition(25, 25, creep.memory.assignedRoom));
            creep.memory.destinationReached = false;
            return null;
        } else if (creep.memory.invaderCooldown > 50) {
            creep.memory.invaderCooldown = undefined;
        }
    }
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 5) {
        return creep.retreat();
    }

    //Mark room as no go if reserved or owned by someone else
    if (creep.room.controller && ((creep.room.controller.reservation && creep.room.controller.reservation.username !== 'Shibdib') || creep.room.owner)) {
        creep.room.memory.noRemote = true;
        creep.suicide();
    }

    //Initial move
    if (creep.carry.energy === 0) {
        creep.memory.harvesting = true;
    }
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if (creep.pos.roomName === creep.memory.destination) {
            creep.borderCheck();
            creep.memory.destinationReached = true;
        }
        return null;
    } else if (creep.carry.energy === creep.carryCapacity || creep.memory.harvesting === false) {
        creep.memory.harvesting = false;
        depositEnergy(creep);
    } else {
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (source) {
                if (source.energy === 0) {
                    creep.idleFor(source.ticksToRegeneration + 1)
                } else if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(source);
                }
            } else {
                creep.memory.source = undefined;
            }
        } else {
            creep.findSource();
        }
    }
}

module.exports.role = profiler.registerFN(role, 'remoteHarvesterRole');

function depositEnergy(creep) {
    if (!creep.memory.buildAttempt) remoteRoads(creep);
    if (!creep.memory.containerID) {
        creep.memory.containerID = creep.harvestDepositContainer();
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (container.pos.getRangeTo(Game.getObjectById(creep.memory.source)) > 2) return creep.memory.containerID = undefined;
            if (creep.pos.getRangeTo(container) > 0) return creep.shibMove(container, {range: 0});
            if (container.hits < container.hitsMax * 0.5) {
                if (creep.repair(container) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(container);
                } else {
                    creep.say('Fixing');
                }
            } else if (container.store[RESOURCE_ENERGY] !== container.storeCapacity) {
                creep.transfer(container, RESOURCE_ENERGY);
            }
        }
    } else {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (buildSite) {
            creep.build(buildSite);
        } else {
            creep.harvesterContainerBuild();
        }
    }
}

function remoteRoads(creep) {
    creep.memory.buildAttempt = true;
    if (creep.room.name !== creep.memory.destination) return;
    let sources = creep.room.find(FIND_SOURCES);
    let neighboring = Game.map.describeExits(creep.pos.roomName)
    if (sources.length > 1) {
        buildRoadFromTo(creep.room, sources[0], sources[1]);
    }
    for (let key in sources){
        buildRoadAround(creep.room, sources[key].pos);
        if (neighboring) {
            if (neighboring['1']) {
                buildRoadFromTo(creep.room, sources[key], sources[key].pos.findClosestByRange(FIND_EXIT_TOP));
            }
            if (neighboring['3']) {
                buildRoadFromTo(creep.room, sources[key], sources[key].pos.findClosestByRange(FIND_EXIT_RIGHT));
            }
            if (neighboring['5']) {
                buildRoadFromTo(creep.room, sources[key], sources[key].pos.findClosestByRange(FIND_EXIT_BOTTOM));
            }
            if (neighboring['7']) {
                buildRoadFromTo(creep.room, sources[key], sources[key].pos.findClosestByRange(FIND_EXIT_LEFT));
            }
        }
    }
}

function buildRoadFromTo(room, start, end) {
    let path = start.pos.findPathTo(end, {ignoreCreeps: true, ignoreRoads: true});
    for (let point of path) {
        buildRoad(new RoomPosition(point.x, point.y, room.name));
    }
}

buildRoadFromTo = profiler.registerFN(buildRoadFromTo, 'buildRoadFromToFunctionRemote');
function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                buildRoad(new RoomPosition(position.x + xOff, position.y + yOff, room.name));
            }
        }
    }
}

buildRoadAround = profiler.registerFN(buildRoadAround, 'buildRoadAroundFunctionRemote');

function buildRoad(position) {
    if (position.checkForWall() || position.checkForObstacleStructure() || position.checkForRoad()) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}

buildRoad = profiler.registerFN(buildRoad, 'buildRoadFunctionRemote');