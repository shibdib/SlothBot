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
        this.creep.say('🚧', true);
        if (this.creep.fleeHome() || this.creep.skSafety()) return;

        if (!this.creep.memory.destination) {
            this.setDestination();
            return;
        }

        if (!this.creep.memory.working) {
            this.harvestOrMove();
        } else {
            this.buildOrMove();
        }
    }

    setDestination() {
        if (!this.creep.memory.possibles) {
            this.creep.memory.possibles = this.creep.memory.misc.filter(p =>
                !INTEL[p] || (!INTEL[p].sk || (SK_MINING && Game.rooms[this.creep.memory.overlord].level >= SK_MINING_LEVEL))
            );
        }
        this.creep.memory.destination = _.sample(this.creep.memory.possibles);
    }

    harvestOrMove() {
        if (this.creep.isFull) {
            this.creep.memory.working = true;
            return;
        }

        if (this.creep.pos.roomName !== this.creep.memory.destination) {
            this.moveToDestination();
            return;
        }

        let source = Game.getObjectById(this.creep.memory.other.source) || this.creep.pos.getClosestSource();
        if (source) {
            this.creep.memory.other.source = source.id;
            if (this.creep.harvest(source) === ERR_NOT_IN_RANGE) {
                this.creep.shibMove(source);
            }
        } else {
            delete this.creep.memory.harvest;
            delete this.creep.memory.destination;
        }
    }

    buildOrMove() {
        if (!this.creep.store[RESOURCE_ENERGY]) {
            this.creep.memory.working = undefined;
            return;
        }

        if (this.creep.pos.roomName !== this.creep.memory.destination) {
            this.moveToDestination();
            return;
        }

        if (this.creep.memory.constructionSite || this.creep.constructionWork()) {
            let site = Game.getObjectById(this.creep.memory.constructionSite);
            if (!site) this.creep.memory.constructionSite = undefined;
            else this.creep.builderFunction();
        } else {
            this.creep.memory.destination = undefined;
            if (this.creep.memory.overlord === this.creep.room.name) this.creep.idleFor(15);
        }

        if (this.creep.room.name !== this.creep.memory.overlord) {
            this.updateRoadStatus();
        }
    }

    moveToDestination() {
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 23});
    }

    updateRoadStatus() {
        if (this.remoteRoads() === false) {
            INTEL[this.creep.room.name].roadsBuilt = true;
        } else {
            INTEL[this.creep.room.name].roadsBuilt = undefined;
        }
    }

    remoteRoads() {
        if (this.creep.room.name !== this.creep.memory.destination || this.creep.room.constructionSites.length >= 2) return;

        let homeExit = this.getHomeExit();
        if (!homeExit) return;

        return this.buildRoads(homeExit);
    }

    getHomeExit() {
        if (!this.creep.memory.homeExit) {
            let goHome = Game.map.findExit(this.creep.room.name, this.creep.memory.overlord);
            let homeExit = this.creep.room.find(goHome);
            if (homeExit.length) {
                this.creep.memory.homeExit = homeExit[Math.floor(homeExit.length / 2)];
            }
        }
        return this.creep.memory.homeExit;
    }

    buildRoads(homeExit) {
        if (!INTEL[this.creep.room.name] || !INTEL[this.creep.room.name].owner) {
            this.buildFromContainers(homeExit);
        }
        return this.buildFromStructures(homeExit);
    }

    buildFromContainers(homeExit) {
        let containers = this.creep.room.structures.filter(s => s.structureType === STRUCTURE_CONTAINER);
        for (let container of containers) {
            if (_.size(Game.constructionSites) < 70) {
                this.buildRoadFromTo(container.pos, homeExit);
            }
        }
    }

    buildFromStructures(homeExit) {
        let structures = [
            ...this.creep.room.impassibleStructures.filter(s => s.structureType === STRUCTURE_KEEPER_LAIR),
            this.creep.room.find(FIND_MINERALS)[0],
            this.creep.room.controller
        ].filter(Boolean);

        for (let structure of structures) {
            if (_.size(Game.constructionSites) >= 70) break;
            if (this.buildRoadFromTo(structure.pos, homeExit)) return true;
        }
        return false;
    }

    buildRoadFromTo(start, end) {
        let key = this.getPathKey(start, end);
        let cachedPath = this.getCachedPath(key);

        if (cachedPath && cachedPath.tick + 1000 > Game.time) {
            return this.constructFromCachedPath(cachedPath.path);
        } else {
            let path = this.findNewPath(start, end);
            if (path.length) {
                this.cachePath(key, path);
                return this.constructFromCachedPath(path);
            }
        }
        return false;
    }

    getPathKey(from, to) {
        return `${from.x}x${from.y}$${to.x}x${to.y}`;
    }

    getCachedPath(key) {
        let cache = this.creep.memory.pathCache && this.creep.memory.pathCache[key];
        if (cache && typeof cache.path === 'string') {
            try {
                JSON.parse(cache.path);
                return cache;
            } catch (e) {
                console.log(`Invalid path cache for key ${key}`, e);
                delete this.creep.memory.pathCache[key];
            }
        }
        return null;
    }

    cachePath(key, path) {
        if (!this.creep.memory.pathCache) this.creep.memory.pathCache = {};
        // Convert path to an array of directions
        let directions = path.map((point, index) => {
            if (index === 0) return null; // first point has no direction from previous
            let prev = path[index - 1];
            return this.getDirection(prev, point);
        }).filter(d => d !== null).join(''); // Join directions into a string
        this.creep.memory.pathCache[key] = {
            path: directions,
            tick: Game.time
        };
    }

    getDirection(from, to) {
        let dx = to.x - from.x;
        let dy = to.y - from.y;
        if (dx === 0 && dy === -1) return '8';
        if (dx === 1 && dy === -1) return '9';
        if (dx === 1 && dy === 0) return '6';
        if (dx === 1 && dy === 1) return '3';
        if (dx === 0 && dy === 1) return '2';
        if (dx === -1 && dy === 1) return '1';
        if (dx === -1 && dy === 0) return '4';
        if (dx === -1 && dy === -1) return '7';
        return '5'; // Stay in place or error case
    }

    findNewPath(start, end) {
        let path = PathFinder.search(start, {pos: end, range: 1}, {
            maxOps: 5000,
            roomCallback: this.buildCostMatrix.bind(this)
        }).path;

        if (path.length) {
            this.cachePath(this.getPathKey(start, end), path);
        }
        return path;
    }

    constructFromCachedPath(pathString) {
        let pos = this.creep.pos;
        let directions = pathString.split('');
        for (let dir of directions) {
            let newPos = this.getNewPosition(pos, dir);
            if (this.canBuildRoad(newPos)) {
                if (newPos.createConstructionSite(STRUCTURE_ROAD) === OK) {
                    return true;
                }
            }
            pos = newPos; // Move to the next position for the next iteration
        }
        return false;
    }

    getNewPosition(pos, dir) {
        let moveMap = {
            '8': {dx: 0, dy: -1}, '9': {dx: 1, dy: -1}, '6': {dx: 1, dy: 0}, '3': {dx: 1, dy: 1},
            '2': {dx: 0, dy: 1}, '1': {dx: -1, dy: 1}, '4': {dx: -1, dy: 0}, '7': {dx: -1, dy: -1},
            '5': {dx: 0, dy: 0} // Stay in place
        };
        let move = moveMap[dir] || moveMap['5']; // Default to stay if direction is invalid
        return new RoomPosition(pos.x + move.dx, pos.y + move.dy, pos.roomName);
    }

    canBuildRoad(position) {
        return !position.checkForImpassible(true) &&
            !position.checkForRoad() &&
            !position.checkForConstructionSites() &&
            _.size(this.creep.room.constructionSites) < 5;
    }

    buildCostMatrix(roomName) {
        let matrix = new PathFinder.CostMatrix();
        let terrain = Game.map.getRoomTerrain(this.creep.room.name);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) matrix.set(x, y, 255); // Wall
                else matrix.set(x, y, 1); // Plain or Swamp
            }
        }

        this.creep.room.structures.forEach(s => {
            if (_.includes(OBSTACLE_OBJECT_TYPES, s.structureType)) matrix.set(s.pos.x, s.pos.y, 255);
        });

        return matrix;
    }
}

profiler.registerClass(RoleRoadBuilder, 'RoadBuilder');
module.exports = RoleRoadBuilder;