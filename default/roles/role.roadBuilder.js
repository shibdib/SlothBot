/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleRoadBuilder {
    constructor(creep) {
        this.creep = creep;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (!this.creep.memory.working) {
            this.notWorking();
        } else {
            this.working();
        }
    }

    housekeeping() {
        this.creep.say('HIGHWAY', true);
        //Invader detection
        if (this.creep.fleeHome()) return true;
        // SK Safety
        if (this.creep.skSafety()) return true;
        // Set destination
        if (!this.creep.memory.destination) {
            const remoteHarvesters = _.filter(Game.creeps, (c) => c.my && c.memory.colony === this.creep.memory.colony && c.memory.role === 'remoteHarvester');
            if (_.size(remoteHarvesters)) {
                this.creep.memory.destination = _.sample(_.pluck(remoteHarvesters, 'memory.destination'));
                if (this.creep.memory.destination === this.creep.room.name) this.creep.idleFor(15);
            } else {
                this.creep.fleeHome(true);
            }
            return true;
        }
    }

    working() {
        if (!this.creep.store[RESOURCE_ENERGY]) return this.creep.memory.working = undefined;
        // Handle movement
        if (!this.creep.memory.constructionSite && this.creep.pos.roomName !== this.creep.memory.destination) return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
        this.creep.memory.other.source = undefined;
        this.creep.memory.harvest = undefined;
        // Handle construction
        if (this.creep.memory.constructionSite || this.creep.constructionWork()) {
            this.creep.builderFunction();
        } else if (this.creep.room.name !== this.creep.memory.colony && !this.remoteRoads(this.creep)) {
            INTEL[this.creep.room.name].roadsBuilt = true;
            INTEL[this.creep.room.name].roadCount = this.creep.room.structures.filter((s) => s.structureType === STRUCTURE_ROAD).length;
            this.creep.memory.destination = undefined;
            if (this.creep.memory.colony === this.creep.room.name) this.creep.idleFor(15);
        } else {
            INTEL[this.creep.room.name].roadsBuilt = undefined;
        }
    }

    notWorking() {
        if (this.creep.isFull) return this.creep.memory.working = true;
        this.creep.memory.constructionSite = undefined;
        this.creep.memory.task = undefined;
        if (!this.creep.memory.harvest && (this.creep.memory.energyDestination || this.creep.locateEnergy())) {
            this.creep.say('Energy!', true);
            this.creep.withdrawResource();
        } else if (!this.creep.room.level || this.creep.room.level < 3) {
            this.creep.memory.harvest = true;
            let source = Game.getObjectById(this.creep.memory.other.source) || this.creep.pos.getClosestSource();
            if (source) {
                this.creep.say('Harvest!', true);
                this.creep.memory.other.source = source.id;
                switch (this.creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        this.creep.memory.other.stationary = undefined;
                        this.creep.shibMove(source);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.creep.memory.other.source = undefined;
                        break;
                    case OK:
                        this.creep.memory.other.stationary = true;
                        break;
                }
            } else {
                delete this.creep.memory.harvest;
                delete this.creep.memory.destination;
            }
        } else {
            this.creep.memory.harvest = undefined;
        }
    }

    remoteRoads(creep) {
        if (creep.room.constructionSites.length >= 2 || INTEL[creep.room.name].owner) return false;

        // If the intel cache says roads are built compare the road count
        if (INTEL[creep.room.name].roadsBuilt && Math.random() > 0.75) {
            if (INTEL[creep.room.name].roadCount <= creep.room.structures.filter((s) => s.structureType === STRUCTURE_ROAD).length) return true;
        }

        // Containers
        let goHome = Game.map.findExit(creep.room.name, creep.memory.colony);
        let homeExit = creep.room.find(goHome);
        let homeMiddle = _.round(homeExit.length / 2);
        let containers = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER);
        let destination = Game.rooms[creep.memory.colony].storage;
        if (!destination) destination = new RoomPosition(Game.rooms[creep.memory.colony].memory.bunkerHub.x, Game.rooms[creep.memory.colony].memory.bunkerHub.y, creep.memory.colony);
        for (let container of containers) {
            if (_.size(Game.constructionSites) >= 70) return false;
            if (this.buildRoadFromTo(creep.room, container, homeExit[homeMiddle])) return true;
        }

        // SK Room
        if (INTEL[creep.room.name].sk) {
            let mineral = creep.room.find(FIND_MINERALS)[0];
            if (mineral && this.buildRoadFromTo(creep.room, mineral, homeExit[homeMiddle])) return true;
            let skLairs = _.filter(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR);
            for (let lair of skLairs) {
                if (_.size(Game.constructionSites) >= 70) return;
                if (this.buildRoadFromTo(creep.room, lair, homeExit[homeMiddle])) return true;
            }
        }

        // Controller
        if (creep.room.controller && this.buildRoadFromTo(creep.room, creep.room.controller, homeExit[homeMiddle])) return true;

        // Active neighbors
        const neighboringRooms = Object.values(Game.map.describeExits(creep.room.name));
        for (const neighbor of neighboringRooms) {
            if (!Game.rooms[neighbor]) continue;
            const neighborRoom = Game.rooms[neighbor];
            const neighborHarvester = neighborRoom.myCreeps.find((c) => c.memory.role === 'remoteHarvester');
            if (neighborHarvester) {
                let exit = Game.map.findExit(creep.room.name, neighbor);
                let exitTiles = creep.room.find(exit);
                let exitMiddle = _.round(exitTiles.length / 2);
                if (_.size(Game.constructionSites) >= 70) return false;
                const start = creep.room.controller || creep.room.sources[0];
                if (this.buildRoadFromTo(creep.room, start, exitTiles[exitMiddle])) return true;
            }
        }
    }

    buildRoadFromTo(room, start, end) {
        if (!room || !start || !end) return false;
        let begin = start instanceof RoomPosition ? start : start.pos;
        let target = end instanceof RoomPosition ? end : end.pos;
        let path = this.getRoad(room, begin, target);
        if (!path) {
            path = PathFinder.search(begin, {pos: target, range: 1}, {
                heuristicWeight: 0.8,
                roomCallback: function (roomName) {
                    return buildCostMatrix(roomName);
                }
            }).path;

            if (path.length) {
                this.cacheRoad(room, begin, target, path);
            } else {
                return false;
            }
        } else {
            path = JSON.parse(path); // If path is cached, it will be a string
        }

        for (let point of path) {
            let pos = new RoomPosition(point.x, point.y, room.name);
            if (this.buildRoad(pos, room)) return true;
        }

        return false;
    }

    buildRoad(position, room) {
        if (position.checkForImpassible(true) || position.checkForRoad() || position.checkForConstructionSites() || _.size(room.constructionSites) >= 5) {
            return false;
        } else if (position.createConstructionSite(STRUCTURE_ROAD) === OK) {
            return true;
        }
    }

    cacheRoad(room, from, to, path) {
        let key = getPathKey(from, to);
        let cache = ROAD_CACHE[room.name] || {};
        let tick = Game.time;
        cache[key] = {
            path: JSON.stringify(path),
            tick: tick
        };
        ROAD_CACHE[room.name] = cache;
    }

    getRoad(room, from, to) {
        let cache = ROAD_CACHE[room.name] || undefined;
        if (!cache) return;
        let cachedPath = cache[getPathKey(from, to)];
        if (cachedPath) {
            return cachedPath.path;
        }
    }
}

profiler.registerClass(RoleRoadBuilder, 'RoadBuilder');
module.exports = RoleRoadBuilder;

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y;
}


let roomMatrix = {};

function buildCostMatrix(roomName) {
    if (roomMatrix[roomName]) return roomMatrix[roomName];
    let costMatrix = new PathFinder.CostMatrix();
    let terrain = Game.map.getRoomTerrain(roomName);

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            let tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) {
                costMatrix.set(x, y, Infinity);
            } else if (tile === TERRAIN_MASK_SWAMP) {
                costMatrix.set(x, y, 45);
            } else {
                costMatrix.set(x, y, 10);
            }
        }
    }

    let room = Game.rooms[roomName];
    if (room) {
        room.find(FIND_STRUCTURES).forEach(structure => {
            if (structure.structureType === STRUCTURE_ROAD) {
                costMatrix.set(structure.pos.x, structure.pos.y, 1);
            } else if (structure.structureType === STRUCTURE_CONTAINER) {
                costMatrix.set(structure.pos.x, structure.pos.y, 15);
            } else if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                costMatrix.set(structure.pos.x, structure.pos.y, Infinity);
            }
        });
    }

    roomMatrix[roomName] = costMatrix;
    return roomMatrix[roomName];
}