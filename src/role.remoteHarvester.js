/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    let source;
    creep.borderCheck();
    //Invader detection
    if (creep.room.invaderCheck() || creep.hits < creep.hitsMax) creep.goHomeAndHeal();
    //Set destination reached
    creep.memory.destinationReached = creep.pos.roomName === creep.memory.destination;
    //Check hauler status
    if (creep.memory.hauler && !Game.getObjectById(creep.memory.hauler)) creep.memory.hauler = undefined;
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        //Suicide and cache intel if room is reserved by someone else
        if (creep.room.controller && creep.room.controller.reservation && creep.room.controller.reservation.username !== USERNAME) {
            creep.room.cacheRoomIntel(true);
            return creep.suicide();
        }
        //Request pioneer if construction sites exist
        if (Game.time % 100 === 0) creep.room.memory.requestingPioneer = creep.room.constructionSites.length > 0;
        //If source is set mine
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
            //Find Source
        } else {
            creep.findSource();
        }
    }
}

module.exports.role = profiler.registerFN(role, 'remoteHarvesterRole');

function depositEnergy(creep) {
    if (!creep.memory.containerID) {
        creep.memory.containerID = creep.harvestDepositContainer();
    } else if (creep.memory.containerID) {
        if (!creep.memory.buildAttempt) remoteRoads(creep);
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
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
        if (neighboring && Game.rooms[creep.memory.overlord].controller.level >= 6) {
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
        costCallback: function (roomName, costMatrix) {
            for (let site of room.constructionSites) {
                if (site.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(site.pos.x, site.pos.y, 1);
                }
            }
        },
        maxOps: 10000,
        serialize: false,
        ignoreCreeps: true,
        maxRooms: 1,
        ignoreRoads: false,
        swampCost: 15,
        plainCost: 15
    });
    for (let point of path) {
        let pos = new RoomPosition(point.x, point.y, room.name);
        buildRoad(pos, room);
    }
}
function buildRoadAround(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                if (_.size(Game.constructionSites) >= 50) break;
                if (!position || !position.x || !position.y || !room.name) continue;
                buildRoad(new RoomPosition(position.x + xOff, position.y + yOff, room.name), room);
            }
        }
    }
}

function buildRoad(position, room) {
    if (position.checkForImpassible() || _.size(room.constructionSites) >= 5) return;
    position.createConstructionSite(STRUCTURE_ROAD);
}