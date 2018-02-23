/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    let hostiles = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 5) return creep.retreat();
    let lair = Game.getObjectById(creep.memory.lair);
    if (lair && creep.pos.getRangeTo(lair) <= 6 && lair.ticksToSpawn <= 10) return creep.flee(lair);
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    //Initial move
    if (creep.carry.energy === 0) creep.memory.harvesting = true;
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = undefined;
    if (creep.pos.roomName !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
    }
    creep.memory.destinationReached = true;
    creep.borderCheck();
    if (_.sum(creep.carry) === creep.carryCapacity || creep.memory.harvesting === false) {
        creep.memory.harvesting = false;
        SKdeposit(creep);
    } else {
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (!source || source.pos.roomName !== creep.pos.roomName) return creep.memory.source = undefined;
            if (!creep.memory.lair) creep.memory.lair = source.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR}).id;
            if (source.energy === 0) {
                if (lair && creep.pos.getRangeTo(lair) <= 6) return creep.flee(lair);
                creep.idleFor(source.ticksToRegeneration + 1)
            } else {
                switch (creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        break;
                    case ERR_NO_BODYPART:
                        creep.shibMove(source);
                        break;
                    case ERR_TIRED:
                        creep.idleFor(creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTRACTOR}).cooldown);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        break;
                }
            }
        } else {
            if (!creep.findSource()) {
                creep.findMineral();
            }
        }
    }
}

/**
 * @return {undefined}
 */
function SKdeposit(creep) {
    if (!creep.memory.buildAttempt) skRoads(creep);
    if (!creep.memory.containerID) {
        creep.memory.containerID = creep.harvestDepositContainer();
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (container.pos.getRangeTo(Game.getObjectById(creep.memory.source)) > 2) return creep.memory.containerID = undefined;
            creep.memory.containerBuilding = undefined;
            let otherContainers = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {filter: (c) => c.structureType === STRUCTURE_CONTAINER});
            if (container.hits < container.hitsMax * 0.75 && creep.carry[RESOURCE_ENERGY] > 0) {
                switch (creep.repair(container)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(container);
                        break;
                }
                creep.say('Fixing');
            } else if (otherContainers.length > 0) {
                switch (creep.build(otherContainers[0])) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(otherContainers[0]);
                        break;
                }
            } else if (_.sum(container.store) !== container.storeCapacity) {
                if (creep.pos.getRangeTo(container) > 0) return creep.shibMove(container, {range: 0});
                for (const resourceType in creep.carry) {
                    if (creep.transfer(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(container, {range: 0});
                    }
                }
            } else if (creep.carry[RESOURCE_ENERGY] > 0) {
                creep.findConstruction();
                if (creep.memory.task === 'build') {
                    let construction = Game.getObjectById(creep.memory.constructionSite);
                    if (creep.build(construction) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(construction, {range: 3});
                    }
                }
            }
        }
    } else {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (!buildSite && creep.memory.containerBuilding !== true) {
            creep.harvesterContainerBuild();
        } else if (creep.carry[RESOURCE_ENERGY] > 0) {
            creep.build(buildSite);
            creep.memory.containerBuilding = true;
        }
    }
}

function skRoads(creep) {
    creep.memory.buildAttempt = true;
    if (creep.room.name !== creep.memory.destination) return;
    let sources = creep.room.find(FIND_SOURCES);
    let minerals = creep.room.find(FIND_MINERALS);
    sources = sources.concat(minerals);
    let neighboring = Game.map.describeExits(creep.pos.roomName);
    for (let key in sources) {
        if (_.size(Game.constructionSites) >= 35) return;
        buildRoadAround(creep.room, sources[key].pos);
        buildRoadFromTo(creep.room, sources[key], _.sample(sources));
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
    let path = start.pos.findPathTo(end, {ignoreCreeps: true, ignoreRoads: false});
    for (let point of path) {
        if (_.size(Game.constructionSites) >= 50) break;
        buildRoad(new RoomPosition(point.x, point.y, room.name));
    }
}

buildRoadFromTo = profiler.registerFN(buildRoadFromTo, 'buildRoadFromToFunctionRemote');

function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                if (_.size(Game.constructionSites) >= 50) break;
                buildRoad(new RoomPosition(position.x + xOff, position.y + yOff, room.name));
            }
        }
    }
}

buildRoadAround = profiler.registerFN(buildRoadAround, 'buildRoadAroundFunctionRemote');

function buildRoad(position) {
    //if (position.checkForWall() || position.checkForObstacleStructure() || position.checkForRoad()) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}

buildRoad = profiler.registerFN(buildRoad, 'buildRoadFunctionRemote');