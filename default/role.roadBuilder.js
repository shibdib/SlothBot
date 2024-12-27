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
        let target;
        if (!room || !start || !end) return false;
        if (end instanceof RoomPosition) target = end; else target = end.pos;
        let path = this.getRoad(room, start.pos, target);
        if (!path) {
            path = start.pos.findPathTo(end, {
                maxOps: 10000,
                serialize: false,
                ignoreCreeps: true,
                maxRooms: 1,
                costCallback: function (roomName, costMatrix) {
                    let terrain = Game.map.getRoomTerrain(room.name);
                    for (let y = 0; y < 50; y++) {
                        for (let x = 0; x < 50; x++) {
                            let tile = terrain.get(x, y);
                            if (tile === 0) costMatrix.set(x, y, 15);
                            if (tile === 1) {
                                let tilePos = new RoomPosition(x, y, room.name);
                                if (tilePos.findInRange(FIND_SOURCES, 1).length || tilePos.findInRange(FIND_MINERALS, 1).length) costMatrix.set(x, y, 256); else costMatrix.set(x, y, 235);
                            }
                            if (tile === 2) costMatrix.set(x, y, 15);
                        }
                    }
                    for (let structures of room.structures) {
                        if (_.includes(OBSTACLE_OBJECT_TYPES, structures.structureType)) {
                            costMatrix.set(structures.pos.x, structures.pos.y, 256);
                        } else if (structures.structureType === STRUCTURE_ROAD) {
                            costMatrix.set(structures.pos.x, structures.pos.y, 1);
                        } else if (structures.structureType === STRUCTURE_CONTAINER) {
                            costMatrix.set(structures.pos.x, structures.pos.y, 71);
                        }
                    }
                },
            });
            if (path.length) this.cacheRoad(room, start.pos, target, path); else return;
            for (let point of path) {
                let pos = new RoomPosition(point.x, point.y, room.name);
                if (this.buildRoad(pos, room)) return true;
            }
        } else {
            for (let point of JSON.parse(path)) {
                let pos = new RoomPosition(point.x, point.y, room.name);
                if (this.buildRoad(pos, room)) return true;
            }
        }
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