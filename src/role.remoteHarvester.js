/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    creep.borderCheck();
    //Invader detection
    if (creep.room.invaderCheck()) return creep.goHomeAndHeal();
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) {
        creep.memory.destinationReached = true;
        if (!creep.memory.buildAttempt) remoteRoads(creep);
        if (creep.room.constructionSites.length > 0) {
            creep.room.memory.requestingPioneer = true;
        } else {
            delete creep.room.memory.requestingPioneer;
        }
    }
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination));
        if (creep.pos.roomName === creep.memory.destination) {
            creep.borderCheck();
            creep.memory.destinationReached = true;
        }
        return null;
    } else if (creep.carry.energy === creep.carryCapacity) {
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
                delete creep.memory.source;
            }
        } else {
            creep.findSource();
        }
    }
}

module.exports.role = profiler.registerFN(role, 'remoteHarvesterRole');

function depositEnergy(creep) {
    //if (!creep.memory.buildAttempt) remoteRoads(creep);
    if (!creep.memory.containerID) {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (buildSite) {
            creep.build(buildSite);
        } else {
            creep.memory.containerID = creep.harvestDepositContainer();
        }
    } else if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            creep.room.memory.needsPickup = _.sum(container.store) > 750;
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
    }
}
function remoteRoads(creep) {
    creep.memory.buildAttempt = true;
    if (creep.room.name !== creep.memory.destination) return;
    let sources = creep.room.sources;
    let neighboring = Game.map.describeExits(creep.pos.roomName);
    if (sources.length > 1) {
        buildRoadFromTo(creep.room, sources[0], sources[1]);
    }
    for (let key in sources){
        if (_.size(Game.constructionSites) >= 80) return;
        buildRoadAround(creep.room, sources[key].pos);
        if (neighboring) {
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
    let path = start.pos.findPathTo(end, {ignoreCreeps: true, ignoreRoads: false, maxOps: 25000});
    for (let point of path) {
        if (_.size(Game.constructionSites) >= 50) break;
        buildRoad(new RoomPosition(point.x, point.y, room.name));
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