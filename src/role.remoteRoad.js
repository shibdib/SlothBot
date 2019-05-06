/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function role(creep) {
    //Invader detection
    if (creep.fleeHome()) return;
    if (creep.borderCheck()) return;
    // Handle remote drones
    if (creep.memory.destination && creep.room.name !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
    // Checks
    if (creep.carry.energy === 0) {
        creep.memory.working = undefined;
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
    }
    if (_.sum(creep.carry) === creep.carryCapacity) {
        creep.memory.working = true;
        creep.memory.source = undefined;
        creep.memory.harvest = undefined;
    }
    // Work
    if (creep.memory.working === true) {
        if (creep.memory.constructionSite || creep.findConstruction()) {
            creep.builderFunction();
        } else {
            if (!remoteRoads(creep)) creep.idleFor(25);
        }
    } else {
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.findEnergy())) {
            creep.say('Energy!', true);
            creep.withdrawEnergy();
        } else {
            creep.memory.harvest = true;
            let source = Game.getObjectById(creep.memory.source) || creep.pos.getClosestSource();
            if (source) {
                creep.say('Harvest!', true);
                creep.memory.source = source.id;
                switch (creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.memory.source = undefined;
                        break;
                    case OK:
                        break;
                }
            } else {
                delete creep.memory.harvest;
                if (!creep.pos.findClosestByRange(FIND_SOURCES)) return creep.memory.recycle = true;
                creep.idleFor(5);
            }
        }
    }
};

function remoteRoads(creep) {
    if (creep.room.name !== creep.memory.destination) return false;
    let sources = creep.room.sources;
    let goHome = Game.map.findExit(creep.room.name, creep.memory.overlord);
    let homeExit = creep.room.find(goHome);
    let homeMiddle = _.round(homeExit.length / 2);
    for (let key in sources) {
        if (_.size(Game.constructionSites) >= 70) return false;
        if (buildRoadFromTo(creep.room, sources[key], homeExit[homeMiddle])) return true;
    }
    if (buildRoadFromTo(creep.room, creep.room.controller, homeExit[homeMiddle])) return true;
    let neighboring = Game.map.describeExits(creep.pos.roomName);
    if (neighboring['1'] && neighboring['1'] !== creep.memory.overlord) {
        let exits = creep.room.find(FIND_EXIT_TOP);
        let middle = _.round(exits.length / 2);
        if (buildRoadFromTo(creep.room, creep.room.controller, exits[middle])) return true;
    }
    if (neighboring['3'] && neighboring['3'] !== creep.memory.overlord) {
        let exits = creep.room.find(FIND_EXIT_RIGHT);
        let middle = _.round(exits.length / 2);
        if (buildRoadFromTo(creep.room, creep.room.controller, exits[middle])) return true;
    }
    if (neighboring['5'] && neighboring['5'] !== creep.memory.overlord) {
        let exits = creep.room.find(FIND_EXIT_BOTTOM);
        let middle = _.round(exits.length / 2);
        if (buildRoadFromTo(creep.room, creep.room.controller, exits[middle])) return true;
    }
    if (neighboring['7'] && neighboring['7'] !== creep.memory.overlord) {
        let exits = creep.room.find(FIND_EXIT_LEFT);
        let middle = _.round(exits.length / 2);
        if (buildRoadFromTo(creep.room, creep.room.controller, exits[middle])) return true;
    }
}

function buildRoadFromTo(room, start, end) {
    let target;
    if (!room || !start || !end) return false;
    if (end instanceof RoomPosition) target = end; else target = end.pos;
    let path = getRoad(room, start.pos, target);
    if (!path) {
        path = start.pos.findPathTo(end, {
            maxOps: 10000,
            serialize: false,
            ignoreCreeps: true,
            maxRooms: 1,
            costCallback: function (roomName, costMatrix) {
                let terrain = new Room.Terrain(room.name);
                for (let y = 0; y < 50; y++) {
                    for (let x = 0; x < 50; x++) {
                        let tile = terrain.get(x, y);
                        if (tile === 0) costMatrix.set(x, y, 25);
                        if (tile === 1) costMatrix.set(x, y, 225);
                        if (tile === 2) costMatrix.set(x, y, 35);
                    }
                }
                for (let structures of room.structures) {
                    if (_.includes(OBSTACLE_OBJECT_TYPES, structures.structureType)) {
                        costMatrix.set(structures.pos.x, structures.pos.y, 256);
                    }
                }
                for (let site of room.constructionSites) {
                    if (site.structureType === STRUCTURE_ROAD) {
                        costMatrix.set(site.pos.x, site.pos.y, 1);
                    }
                }
                for (let road of room.structures) {
                    if (road.structureType === STRUCTURE_ROAD) {
                        costMatrix.set(road.pos.x, road.pos.y, 1);
                    }
                }
            },
        });
        if (path.length) cacheRoad(room, start.pos, target, path); else return;
        for (let point of path) {
            let pos = new RoomPosition(point.x, point.y, room.name);
            if (buildRoad(pos, room)) return true;
        }
    } else {
        for (let point of JSON.parse(path)) {
            let pos = new RoomPosition(point.x, point.y, room.name);
            if (buildRoad(pos, room)) return true;
        }
    }
}

function buildRoad(position, room) {
    if (position.checkForImpassible(true) || position.checkForRoad() || position.checkForConstructionSites() || _.size(room.constructionSites) >= 5) return false;
    if (position.createConstructionSite(STRUCTURE_ROAD) === OK) return true;
}

function cacheRoad(room, from, to, path) {
    let key = getPathKey(from, to);
    let cache = roadCache[room.name] || {};
    let tick = Game.time;
    cache[key] = {
        path: JSON.stringify(path),
        tick: tick
    };
    roadCache[room.name] = cache;
}

function getRoad(room, from, to) {
    if (room.memory._roadCache) room.memory._roadCache = undefined;
    let cache = roadCache[room.name] || undefined;
    if (!cache) return;
    let cachedPath = cache[getPathKey(from, to)];
    if (cachedPath) {
        return cachedPath.path;
    } else {
        return;
    }
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y;
}