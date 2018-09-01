/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    creep.borderCheck();
    //Invader detection
    if (creep.room.invaderCheck() || creep.hits < creep.hitsMax) {
        if (creep.carry[RESOURCE_ENERGY]) creep.drop(RESOURCE_ENERGY);
        return creep.goHomeAndHeal();
    }
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) {
        if (creep.room.controller && creep.room.controller.reservation && creep.room.controller.reservation.username !== USERNAME) {
            creep.room.cacheRoomIntel(true);
            return creep.suicide();
        }
        creep.memory.destinationReached = true;
        if (creep.room.constructionSites.length > 0) {
            creep.room.memory.requestingPioneer = true;
        } else {
            delete creep.room.memory.requestingPioneer;
        }
    }
    // Call for hauler
    let dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_ENERGY});
    if (dropped && dropped.amount > 500) markReadyForHauler(creep);
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container && _.sum(container.store) > 500) markReadyForHauler(creep);
    }
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if (creep.pos.roomName === creep.memory.destination) {
            creep.borderCheck();
            creep.memory.destinationReached = true;
        }
        return null;
    } else {
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (source) {
                switch (creep.harvest(source)) {
                    case OK:
                        if (creep.carry.energy === creep.carryCapacity) depositEnergy(creep);
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.idleFor(source.ticksToRegeneration + 1)
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
    if (!creep.memory.containerID) {
        if (Game.rooms[creep.memory.overlord].controller.level >= 4) creep.memory.containerID = creep.harvestDepositContainer();
    } else if (creep.memory.containerID) {
        if (!creep.memory.buildAttempt) remoteRoads(creep);
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (_.sum(container.store) > 500) markReadyForHauler(creep);
            if (creep.pos.getRangeTo(container) > 0) return creep.shibMove(container, {range: 0});
            if (Game.time % 10 === 0 && container.hits < container.hitsMax * 0.75) {
                if (creep.repair(container) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(container);
                } else {
                    creep.say('Fixing');
                }
            }
        } else {
            creep.memory.containerID = undefined;
        }
    }
}
function remoteRoads(creep) {
    creep.memory.buildAttempt = true;
    if (creep.room.name !== creep.memory.destination) return;
    let sources = creep.room.sources;
    let neighboring = Game.map.describeExits(creep.pos.roomName);
    let goHome = Game.map.findExit(creep.room.name, creep.memory.overlord);
    let homeExit = creep.room.find(goHome);
    let homeMiddle = _.round(homeExit.length / 2);
    if (sources.length > 1) {
        buildRoadFromTo(creep.room, sources[0], sources[1]);
    }
    for (let key in sources){
        if (_.size(Game.constructionSites) >= 70) return;
        buildRoadAround(creep.room, sources[key].pos);
        buildRoadFromTo(creep.room, sources[key], homeExit[homeMiddle]);
        if (neighboring && _.size(Game.constructionSites) < 40 && Game.rooms[creep.memory.overlord].controller.level >= 6) {
            if (neighboring['1']) {
                let exits = sources[key].room.find(FIND_EXIT_TOP);
                let middle = _.round(exits.length / 2);
                buildRoadFromTo(creep.room, sources[key], exits[middle]);
            }
            if (neighboring['3']) {
                let exits = sources[key].room.find(FIND_EXIT_RIGHT);
                let middle = _.round(exits.length / 2);
                buildRoadFromTo(creep.room, sources[key], exits[middle]);
            }
            if (neighboring['5']) {
                let exits = sources[key].room.find(FIND_EXIT_BOTTOM);
                let middle = _.round(exits.length / 2);
                buildRoadFromTo(creep.room, sources[key], exits[middle]);
            }
            if (neighboring['7']) {
                let exits = sources[key].room.find(FIND_EXIT_LEFT);
                let middle = _.round(exits.length / 2);
                buildRoadFromTo(creep.room, sources[key], exits[middle]);
            }
        }
    }
}
function buildRoadFromTo(room, start, end) {
    let path = start.pos.findPathTo(end, {
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: false, swampCost: 5, plainCost: 5
    });
    for (let point of path) {
        let pos = new RoomPosition(point.x, point.y, room.name);
        if (pos.checkForImpassible()) continue;
        buildRoad(pos);
    }
}
function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                if (_.size(Game.constructionSites) >= 50) break;
                if (!position || !position.x || !position.y || !room.name) continue;
                buildRoad(new RoomPosition(position.x + xOff, position.y + yOff, room.name));
            }
        }
    }
}
function buildRoad(position) {
    //if (position.checkForWall() || position.checkForObstacleStructure() || position.checkForRoad()) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}

function markReadyForHauler(creep) {
    let overlord = Game.rooms[creep.memory.overlord];
    let requester = overlord.memory.remotesNeedingHauler || [];
    let inbound = _.filter(Game.creeps, (c) => c.memory.destination === creep.room.name && (c.memory.role === 'remoteHauler' || c.memory.role === 'hauler'));
    if (!_.includes(requester, creep.room.name) && inbound.length < 2) requester.push(creep.room.name);
    overlord.memory.remotesNeedingHauler = requester;
}