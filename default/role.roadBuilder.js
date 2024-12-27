/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleRoadBuilder {
    constructor(creep) {
        this.creep = creep;
        this.processCreep();
    }

    processCreep() {
        this.creep.say('HIGHWAY', true);
        //Invader detection
        if (this.creep.fleeHome()) return;
        // SK Safety
        if (this.creep.skSafety()) return;
        // Set destination
        if (!this.creep.memory.destination) {
            let possibles = this.creep.memory.misc;
            possibles = _.filter(possibles, (p) => !INTEL[p] || (!INTEL[p].sk || (SK_MINING && Game.rooms[this.creep.memory.overlord].level >= SK_MINING_LEVEL)))
            this.creep.memory.destination = _.sample(possibles);
            this.creep.memory.energyDestination = undefined;
            this.creep.memory.source = undefined;
            return;
        }
        // Checks
        if (!this.creep.memory.working) {
            // Handle movement
            if (this.creep.pos.roomName !== this.creep.memory.destination) return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
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
                            this.creep.memory.other.noBump = undefined;
                            this.creep.shibMove(source);
                            break;
                        case ERR_NOT_ENOUGH_RESOURCES:
                            this.creep.memory.other.source = undefined;
                            break;
                        case OK:
                            this.creep.memory.other.noBump = true;
                            break;
                    }
                } else {
                    delete this.creep.memory.harvest;
                    delete this.creep.memory.destination;
                }
            }
        } else {
            if (!this.creep.store[RESOURCE_ENERGY]) this.creep.memory.working = undefined;
            // Handle movement
            if (!this.creep.memory.constructionSite && this.creep.pos.roomName !== this.creep.memory.destination) return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
            this.creep.memory.other.source = undefined;
            this.creep.memory.harvest = undefined;
            if (this.creep.room.name !== this.creep.memory.overlord && this.remoteRoads(this.creep) === false) {
                INTEL[this.creep.room.name].roadsBuilt = true;
            } else INTEL[this.creep.room.name].roadsBuilt = undefined;
            if (this.creep.memory.constructionSite || this.creep.constructionWork()) {
                if (!Game.getObjectById(this.creep.memory.constructionSite)) return this.creep.memory.constructionSite = undefined;
                this.creep.builderFunction();
            } else {
                this.creep.memory.destination = undefined;
                if (this.creep.memory.overlord === this.creep.room.name) this.creep.idleFor(15);
            }
        }
    }

    remoteRoads(creep) {
        if (creep.room.name !== creep.memory.destination || creep.room.constructionSites.length >= 2) return;
        let skLairs = _.filter(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR);
        let goHome = Game.map.findExit(creep.room.name, creep.memory.overlord);
        let homeExit = creep.room.find(goHome);
        let homeMiddle = _.round(homeExit.length / 2);
        if (!INTEL[creep.room.name] || !INTEL[creep.room.name].owner) {
            let containers = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER);
            for (let container of containers) {
                if (_.size(Game.constructionSites) >= 70) return;
                if (this.buildRoadFromTo(creep.room, container, homeExit[homeMiddle])) return true;
            }
        }
        // Lairs
        for (let lair of skLairs) {
            if (_.size(Game.constructionSites) >= 70) return;
            if (this.buildRoadFromTo(creep.room, lair, homeExit[homeMiddle])) return true;
        }
        let mineral = creep.room.find(FIND_MINERALS)[0];
        if (mineral && INTEL[creep.room.name].sources > 2 && this.buildRoadFromTo(creep.room, mineral, homeExit[homeMiddle])) return true;
        return !!(creep.room.controller && this.buildRoadFromTo(creep.room, creep.room.controller, homeExit[homeMiddle]));
    }

    buildRoadFromTo(room, start, end) {
        if (!room || !start || !end) return false;
        let target = end instanceof RoomPosition ? end : end.pos;
        let path = this.getRoad(room, start, target); // No need for start.pos since start is already a position

        if (!path) {
            path = PathFinder.search(start, {pos: target, range: 1}, {
                maxOps: 5000, // Reduced from 10000, since often you don't need that many operations
                plainCost: 2, // Instead of using 15 for plains
                swampCost: 10, // Instead of 235 for swamps; these are more standard costs
                roomCallback: this.buildCostMatrix.bind(this, room.name)
            }).path;

            if (path.length) {
                this.cacheRoad(room, start, target, path);
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

    buildCostMatrix(roomName, costMatrix) {
        if (!costMatrix) costMatrix = new PathFinder.CostMatrix();
        let terrain = Game.map.getRoomTerrain(roomName);

        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                let tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    costMatrix.set(x, y, 255); // Wall is impassable
                } else {
                    costMatrix.set(x, y, tile === TERRAIN_MASK_SWAMP ? 10 : 2); // Swamp or plain
                }
            }
        }

        let room = Game.rooms[roomName];
        if (room) {
            room.find(FIND_STRUCTURES).forEach(structure => {
                if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 255);
                } else if (structure.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 1);
                } else if (structure.structureType === STRUCTURE_CONTAINER) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 15); // Changed from 71 to a lower cost
                }
            });
        }

        return costMatrix;
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
        if (room.memory._roadCache) room.memory._roadCache = undefined;
        let cache = ROAD_CACHE[room.name] || undefined;
        if (!cache) return;
        let cachedPath = cache[getPathKey(from, to)];
        if (cachedPath) {
            return cachedPath.path;
        } else {

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