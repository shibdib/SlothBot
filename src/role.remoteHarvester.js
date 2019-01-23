/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Invader detection
    if (creep.fleeHome()) return;
    //Set destination reached
    creep.memory.destinationReached = creep.pos.roomName === creep.memory.destination;
    //Harvest
    if (creep.memory.onContainer) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container && creep.carry[RESOURCE_ENERGY] && container.hits < container.hitsMax * 0.5) return creep.repair(container);
        switch (creep.harvest(Game.getObjectById(creep.memory.source))) {
            case OK:
                if (!creep.memory.containerID || !container) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
                if (container && _.sum(container.store) >= 1900) {
                    if (creep.memory.hauler && !Game.getObjectById(creep.memory.hauler)) creep.memory.hauler = undefined;
                    creep.idleFor(20);
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(Game.getObjectById(creep.memory.source));
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(Game.getObjectById(creep.memory.source).ticksToRegeneration + 1)
        }
        return;
    }
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        //Suicide and cache intel if room is reserved by someone else
        if (creep.room.controller && creep.room.controller.reservation && creep.room.controller.reservation.username !== USERNAME) {
            creep.room.cacheRoomIntel(true);
            return creep.suicide();
        }
        //If source is set mine
        if (creep.memory.source) {
            //Make sure you're on the container
            if (creep.memory.containerID && !creep.memory.onContainer) {
                let container = Game.getObjectById(creep.memory.containerID);
                if (container && creep.pos.getRangeTo(container) > 0) {
                    return creep.shibMove(container, {range: 0});
                } else if (container) {
                    creep.memory.onContainer = true;
                    remoteRoads(creep);
                }
            } else if (!creep.memory.containerID) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
            //Find Source
        } else {
            creep.findSource();
        }
    }
};

function remoteRoads(creep) {
    if (creep.room.name !== creep.memory.destination) return;
    creep.memory.buildAttempt = true;
    let sources = creep.room.sources;
    let goHome = Game.map.findExit(creep.room.name, creep.memory.overlord);
    let homeExit = creep.room.find(goHome);
    let homeMiddle = _.round(homeExit.length / 2);
    for (let key in sources){
        if (_.size(Game.constructionSites) >= 70) return;
        buildRoadFromTo(creep.room, sources[key], homeExit[homeMiddle]);
    }
    buildRoadFromTo(creep.room, creep.room.controller, homeExit[homeMiddle]);
}

function buildRoadFromTo(room, start, end) {
    let path = start.pos.findPathTo(end, {
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
                    if (tile === 1) costMatrix.set(x, y, 175);
                    if (tile === 2) costMatrix.set(x, y, 35);
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
    for (let point of path) {
        let pos = new RoomPosition(point.x, point.y, room.name);
        if (!buildRoad(pos, room)) return;
    }
}

function buildRoad(position, room) {
    if (position.checkForImpassible(true) || _.size(room.constructionSites) >= 5) return false;
    return position.createConstructionSite(STRUCTURE_ROAD);
}

function harvestDepositContainer(source, creep) {
    switch (creep.harvest(Game.getObjectById(creep.memory.source))) {
        case OK:
            let container = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) === 1});
            if (container) {
                return container.id;
            } else {
                let site = source.pos.findClosestByRange(creep.room.constructionSites, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
                if (!site && creep.pos.getRangeTo(source) === 1) {
                    creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
                }
                if (site && Game.rooms[creep.memory.overlord].controller.level >= 4) creep.build(site);
            }
            break;
        case ERR_NOT_IN_RANGE:
            creep.shibMove(Game.getObjectById(creep.memory.source));
            break;
        case ERR_NOT_ENOUGH_RESOURCES:
            creep.idleFor(Game.getObjectById(creep.memory.source).ticksToRegeneration + 1)
    }
}