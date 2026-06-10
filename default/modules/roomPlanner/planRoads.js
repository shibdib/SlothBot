/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Road pathfinding and construction.

 */


const {cacheRoad, getPathKey} = require('planUtils');

function roadBuilder(room, layout) {
    let spawn = room.spawns[0];
    if (!spawn) return false;

    // Source roads
    let sourceContainers = room.sources.map(source => Game.getObjectById(source.memory.container)).filter(container => container);
    for (let container of sourceContainers) {
        if (buildRoadFromTo(room, spawn, container)) {
            return true;
        }
    }

    // Controller roads
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    if (controllerContainer && buildRoadFromTo(room, spawn, controllerContainer)) {
        return true;
    }

    // Exit Roads
    if (buildRoadToNeighborExits(spawn, room)) return true;

    // Layout roads
    if (buildLayoutRoads(room, layout)) return true;

    // Tower roads
    if (room.memory.towerHubs && room.memory.towerHubs.length && buildTowerRoads(room)) return true;

    // RCL 6+ lab and mineral roads
    if (room.level >= 6 && buildMineralLinkAndLabRoads(room)) return true;

    // RCL 7+ we build rampart roads
    if (room.level >= 7 && buildRoadsForRamparts(room)) return true;

    // Handle redundant roads
    removeRedundantRoads(room, layout);

    function buildRoadToNeighborExits(spawn, room) {
        let neighboring = Game.map.describeExits(spawn.pos.roomName);
        if (!neighboring) return false;

        let directionToExit = {
            '1': FIND_EXIT_TOP,
            '3': FIND_EXIT_RIGHT,
            '5': FIND_EXIT_BOTTOM,
            '7': FIND_EXIT_LEFT
        };

        for (let direction in directionToExit) {
            if (neighboring[direction]) {
                let exits = spawn.room.find(directionToExit[direction]);
                let middle = _.round(exits.length / 2);
                if (buildRoadFromTo(spawn.room, spawn, exits[middle])) {
                    return true;
                }
            }
        }

        return false;
    }

    function buildLayoutRoads(room, layout) {
        let roadStructures = _.filter(layout, (s) => s.structureType === STRUCTURE_ROAD);
        let allPositions = [].concat(...roadStructures.map(s => s.pos));
        for (let structure of allPositions) {
            let pos = new RoomPosition(room.hub.x + structure.x, room.hub.y + structure.y, room.name);
            if (buildRoad(pos)) {
                return true;
            }
        }
        return false;
    }

    function buildTowerRoads(room) {
        const towers = room.towers;
        const spawn = room.spawns[0];
        for (const tower of towers) {
            if (buildRoadFromTo(room, spawn, tower)) return true;
        }
        return false;
    }

    function buildMineralLinkAndLabRoads(room) {
        let container = Game.getObjectById(room.memory.extractorContainer);
        let spawn = room.spawns[0];
        if (container && spawn && buildRoadFromTo(room, spawn, container)) return true;
        let labsLinks = room.labs.concat(room.links);
        if (labsLinks.length) {
            let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
            for (let lab of labsLinks) {
                if (buildRoadFromTo(room, lab, hub)) return true;
            }
        }
        return false;
    }

    function buildRoadsForRamparts(room) {
        if (!ROOM_RAMPART_SPOTS || !ROOM_RAMPART_SPOTS[room.name]) return false;
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!ramparts || !ramparts.length) return false;
        const rampartPositions = ramparts.map(p => new RoomPosition(p.x, p.y, room.name));
        const spawn = room.spawns[0];
        let buildCounter = 0;
        for (let pos of rampartPositions) {
            if (buildCounter >= 5) return true;
            if (!pos.checkForRoad() && pos.checkForRampart()) {
                if (buildRoad(pos)) buildCounter++
            }
        }
        for (const rampart of rampartPositions) {
            if (buildCounter >= 5) return true;
            if (buildRoadFromTo(room, rampart, spawn)) buildCounter++
        }
        return false;
    }

    function buildRoadFromTo(room, start, end) {
        let target, begin;
        if (start instanceof RoomPosition) begin = start; else begin = start.pos;
        if (end instanceof RoomPosition) target = end; else target = end.pos;

        const key = getPathKey(begin, target);
        const roomCache = ROAD_CACHE[room.name];
        const cached = roomCache && roomCache[key];

        if (cached && cached.complete) return false;

        let points;
        if (cached) {
            points = JSON.parse(cached.path);
        } else {
            const result = PathFinder.search(begin, {pos: target, range: 1}, {
                heuristicWeight: 0.8,
                roomCallback: roomName => buildCostMatrix(roomName)
            });
            if (!result.path.length) return false;
            cacheRoad(room, begin, target, result.path);
            points = result.path;
        }

        for (const point of points) {
            const pos = new RoomPosition(point.x, point.y, room.name);
            if (buildRoad(pos)) return true;
        }

        // Every tile already has a road — skip future iterations for this path
        if (ROAD_CACHE[room.name] && ROAD_CACHE[room.name][key]) {
            ROAD_CACHE[room.name][key].complete = true;
        }
    }

    function buildCostMatrix(roomName) {
        let costMatrix = new PathFinder.CostMatrix();
        let terrain = Game.map.getRoomTerrain(roomName);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                let tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    costMatrix.set(x, y, Infinity);
                } else if (tile === TERRAIN_MASK_SWAMP) {
                    costMatrix.set(x, y, 60);
                } else {
                    costMatrix.set(x, y, 20);
                }
            }
        }
        let room = Game.rooms[roomName];
        if (room) {
            room.structures.forEach(structure => {
                if (structure.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 1);
                } else if (structure.structureType === STRUCTURE_CONTAINER) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 100);
                } else if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                    costMatrix.set(structure.pos.x, structure.pos.y, Infinity);
                }
            });
            room.constructionSites.forEach(site => {
                if (site.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(site.pos.x, site.pos.y, 1);
                }
            });
        }
        return costMatrix;
    }

    function buildRoadAround(room, position) {
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (xOff !== 0 || yOff !== 0) {
                    let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                    if (buildRoad(pos)) return true;
                }
            }
        }
    }

    function buildRoad(pos) {
        if (pos.checkForRoad() || pos.checkForConstructionSites() || pos.checkForImpassible() || pos.checkForWall()) {
            return false;
        } else if (pos.createConstructionSite(STRUCTURE_ROAD) === OK) {
            return true;
        }
    }

    function removeRedundantRoads(room, layout) {
        const lastReset = Memory.lastGlobalReset;
        if (lastReset && lastReset + 5000 > Game.time) return;
        const spawn = room.spawns[0];
        if (!spawn) return;

        const needed = new Set();
        const rampartTiles = new Set();
        const addPos = (x, y) => needed.add(`${x}x${y}`);

        const addPath = (from, to) => {
            if (!from || !to) return;
            const begin = from instanceof RoomPosition ? from : from.pos;
            const target = to instanceof RoomPosition ? to : to.pos;
            const key = getPathKey(begin, target);
            const cached = ROAD_CACHE[room.name] && ROAD_CACHE[room.name][key];
            let points;
            if (cached) {
                points = JSON.parse(cached.path);
            } else {
                const result = PathFinder.search(begin, {pos: target, range: 1}, {
                    heuristicWeight: 0.8,
                    roomCallback: roomName => buildCostMatrix(roomName)
                });
                if (!result.path.length) return;
                cacheRoad(room, begin, target, result.path);
                points = result.path;
            }
            for (const p of points) addPos(p.x, p.y);
            addPos(target.x, target.y);
        };

        if (layout) {
            const roadStructures = _.filter(layout, s => s.structureType === STRUCTURE_ROAD);
            for (const r of roadStructures) {
                for (const s of r.pos) addPos(room.hub.x + s.x, room.hub.y + s.y);
            }
        }

        const sourceContainers = room.sources
            .map(s => Game.getObjectById(s.memory.container))
            .filter(c => c);
        for (const c of sourceContainers) addPath(spawn, c);

        const controllerContainer = Game.getObjectById(room.memory.controllerContainer);
        if (controllerContainer) addPath(spawn, controllerContainer);

        const neighboring = Game.map.describeExits(room.name);
        if (neighboring) {
            const dirToExit = {
                '1': FIND_EXIT_TOP,
                '3': FIND_EXIT_RIGHT,
                '5': FIND_EXIT_BOTTOM,
                '7': FIND_EXIT_LEFT
            };
            for (const d in dirToExit) {
                if (!neighboring[d]) continue;
                const exits = room.find(dirToExit[d]);
                if (!exits.length) continue;
                addPath(spawn, exits[_.round(exits.length / 2)]);
            }
        }

        if (room.memory.towerHubs && room.memory.towerHubs.length) {
            for (const tower of room.towers) addPath(spawn, tower);
        }

        if (room.level >= 6) {
            const extractorContainer = Game.getObjectById(room.memory.extractorContainer);
            if (extractorContainer) addPath(spawn, extractorContainer);
            const hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
            for (const s of room.labs.concat(room.links)) addPath(s, hub);
        }

        if (room.level >= 7) {
            if (ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]) {
                const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
                if (ramparts) {
                    for (const p of ramparts) {
                        rampartTiles.add(`${p.x}x${p.y}`);
                        addPath(new RoomPosition(p.x, p.y, room.name), spawn);
                    }
                }
            }
            for (const rampart of room.ramparts) {
                rampartTiles.add(`${rampart.pos.x}x${rampart.pos.y}`);
            }
        }

        const roomCache = ROAD_CACHE[room.name];
        if (roomCache) {
            for (const entry of Object.values(roomCache)) {
                if (!entry.path) continue;
                for (const p of JSON.parse(entry.path)) addPos(p.x, p.y);
            }
        }

        const isRampartApproach = (x, y) => {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (rampartTiles.has(`${x + dx}x${y + dy}`)) return true;
                }
            }
            return false;
        };

        for (const road of room.roads) {
            if (road.pos.checkForRampart()) continue;
            if (rampartTiles.size && isRampartApproach(road.pos.x, road.pos.y)) continue;
            if (!needed.has(`${road.pos.x}x${road.pos.y}`)) road.destroy();
        }
    }
}

module.exports = {

    roadBuilder,

};