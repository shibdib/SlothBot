/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Road pathfinding and construction.

 */

const {
    cacheRoad,
    getRoad,
    getPathKey,
    isRoadPathComplete,
    markRoadPathComplete,
    resolveSourceContainer
} = require('planUtils');
const {getExtensionPositions} = require('planExtensions');

const ROAD_CONNECT_TYPES = new Set([
    STRUCTURE_EXTENSION,
    STRUCTURE_SPAWN,
    STRUCTURE_TOWER,
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_LAB,
    STRUCTURE_LINK,
    STRUCTURE_EXTRACTOR,
]);

const BUNKER_LAYOUT_ROAD_TYPES = new Set([
    STRUCTURE_EXTENSION,
    STRUCTURE_SPAWN,
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
]);

function isInRoomBounds(x, y) {
    return x >= 0 && x <= 49 && y >= 0 && y <= 49;
}

function toRoomPosition(point, fallbackRoomName) {
    const roomName = point.roomName || fallbackRoomName;
    if (!isInRoomBounds(point.x, point.y) || !roomName) return null;
    return new RoomPosition(point.x, point.y, roomName);
}

function getRoadOrigin(room) {
    if (room.hub) {
        if (!room.hub.checkForImpassible(true)) return room.hub;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const pos = new RoomPosition(room.hub.x + dx, room.hub.y + dy, room.name);
                if (!pos.checkForImpassible(true)) return pos;
            }
        }
        return room.hub;
    }
    const spawn = room.spawns[0];
    return spawn || null;
}

function isLayoutRoadPlaceable(pos) {
    if (pos.checkForRoad()) return false;
    const site = pos.checkForConstructionSites();
    if (site) return false;
    if (pos.checkForWall() || pos.checkForImpassible(true)) return false;
    const structures = pos.lookFor(LOOK_STRUCTURES);
    for (const s of structures) {
        if (s.structureType === STRUCTURE_ROAD || s.structureType === STRUCTURE_RAMPART) continue;
        return false;
    }
    return true;
}

function getMiddleExitTile(room, exitConstant) {
    const exits = room.find(exitConstant);
    if (!exits.length) return undefined;
    return exits[Math.floor((exits.length - 1) / 2)];
}

function collectStructureTargets(room, layout) {
    const seen = new Set();
    const targets = [];
    const add = (pos) => {
        if (!pos) return;
        const key = `${pos.x}x${pos.y}`;
        if (seen.has(key)) return;
        seen.add(key);
        targets.push(pos);
    };

    const skipType = (type) => layout && BUNKER_LAYOUT_ROAD_TYPES.has(type);

    for (const structure of room.structures) {
        if (!ROAD_CONNECT_TYPES.has(structure.structureType) || skipType(structure.structureType)) continue;
        add(structure.pos);
    }
    for (const site of room.constructionSites) {
        if (!ROAD_CONNECT_TYPES.has(site.structureType) || skipType(site.structureType)) continue;
        add(site.pos);
    }

    if (room.memory.dynamicLayout) {
        for (const {x, y} of getExtensionPositions(room)) {
            add(new RoomPosition(x, y, room.name));
        }
    }

    return targets;
}

function layoutRoadsComplete(room, layout) {
    if (!layout) return true;
    const roadStructures = _.filter(layout, s => s.structureType === STRUCTURE_ROAD);
    const allPositions = [].concat(...roadStructures.map(s => s.pos));
    for (const structure of allPositions) {
        const pos = new RoomPosition(room.hub.x + structure.x, room.hub.y + structure.y, room.name);
        if (pos.checkForRoad()) continue;
        const site = pos.checkForConstructionSites();
        if (site && site.structureType === STRUCTURE_ROAD) continue;
        if (!isLayoutRoadPlaceable(pos)) continue;
        return false;
    }
    return true;
}

function roadBuilder(room, layout) {
    const origin = getRoadOrigin(room);
    if (!origin) return false;

    if (layout && !layoutRoadsComplete(room, layout) && buildLayoutRoads(room, layout)) return true;
    if (buildStructureRoads(room, origin, layout)) return true;

    const sourceContainers = room.sources
        .map(source => resolveSourceContainer(source, room))
        .filter(container => container);
    for (const container of sourceContainers) {
        if (buildRoadFromTo(room, origin, container)) return true;
    }
    for (const source of room.sources) {
        if (!resolveSourceContainer(source, room) && buildRoadFromTo(room, origin, source)) return true;
    }

    const controllerContainer = global.resolveControllerContainer(room);
    if (controllerContainer && buildRoadFromTo(room, origin, controllerContainer)) return true;
    if (!controllerContainer && room.controller && buildRoadFromTo(room, origin, room.controller)) return true;

    if (buildRoadToExits(room, origin)) return true;

    if (room.level >= 6 && buildMineralRoads(room, origin)) return true;

    if (room.level >= 7 && buildRoadsForRamparts(room)) return true;

    if (hasPendingConnectorPaths(room, origin, layout)) return true;

    removeRedundantRoads(room, layout, origin);
    return false;

    function buildStructureRoads(room, start, layout) {
        for (const target of collectStructureTargets(room, layout)) {
            if (buildRoadFromTo(room, start, target)) return true;
        }
        return false;
    }

    function buildLayoutRoads(room, layout) {
        const roadStructures = _.filter(layout, s => s.structureType === STRUCTURE_ROAD);
        const allPositions = [].concat(...roadStructures.map(s => s.pos));
        for (const structure of allPositions) {
            const pos = new RoomPosition(room.hub.x + structure.x, room.hub.y + structure.y, room.name);
            if (!isLayoutRoadPlaceable(pos)) continue;
            if (buildRoad(pos)) return true;
        }
        return false;
    }

    function buildMineralRoads(room, start) {
        const container = Game.getObjectById(room.memory.extractorContainer);
        if (container && buildRoadFromTo(room, start, container)) return true;
        const mineral = room.mineral;
        if (mineral && buildRoadFromTo(room, start, mineral)) return true;
        return false;
    }

    function buildRoadToExits(room, start) {
        const neighboring = Game.map.describeExits(room.name);
        if (!neighboring) return false;

        const directionToExit = {
            '1': FIND_EXIT_TOP,
            '3': FIND_EXIT_RIGHT,
            '5': FIND_EXIT_BOTTOM,
            '7': FIND_EXIT_LEFT,
        };

        for (const direction in directionToExit) {
            if (!neighboring[direction]) continue;
            const exitTile = getMiddleExitTile(room, directionToExit[direction]);
            if (exitTile && buildRoadFromTo(room, start, exitTile)) return true;
        }
        return false;
    }

    function buildRoadsForRamparts(room) {
        if (!ROOM_RAMPART_SPOTS || !ROOM_RAMPART_SPOTS[room.name]) return false;
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!ramparts || !ramparts.length) return false;

        // Roads on rampart tiles only (wall patrol). No hub path per perimeter tile.
        let buildCounter = 0;
        for (const p of ramparts) {
            if (buildCounter >= 3) return true;
            const pos = new RoomPosition(p.x, p.y, room.name);
            if (!pos.checkForRoad() && pos.checkForRampart() && buildRoad(pos)) buildCounter++;
        }
        return false;
    }

    function hasPendingConnectorPaths(room, start, layout) {
        for (const target of collectStructureTargets(room, layout)) {
            if (pathNeedsRoads(room, start, target)) return true;
        }

        const sourceContainers = room.sources
            .map(source => resolveSourceContainer(source, room))
            .filter(container => container);
        for (const container of sourceContainers) {
            if (pathNeedsRoads(room, start, container)) return true;
        }
        for (const source of room.sources) {
            if (!resolveSourceContainer(source, room) && pathNeedsRoads(room, start, source)) return true;
        }

        const controllerContainer = global.resolveControllerContainer(room);
        if (controllerContainer && pathNeedsRoads(room, start, controllerContainer)) return true;
        if (!controllerContainer && room.controller && pathNeedsRoads(room, start, room.controller)) return true;

        const neighboring = Game.map.describeExits(room.name);
        if (neighboring) {
            const directionToExit = {
                '1': FIND_EXIT_TOP,
                '3': FIND_EXIT_RIGHT,
                '5': FIND_EXIT_BOTTOM,
                '7': FIND_EXIT_LEFT,
            };
            for (const direction in directionToExit) {
                if (!neighboring[direction]) continue;
                const exitTile = getMiddleExitTile(room, directionToExit[direction]);
                if (exitTile && pathNeedsRoads(room, start, exitTile)) return true;
            }
        }

        if (room.level >= 6) {
            const container = Game.getObjectById(room.memory.extractorContainer);
            if (container && pathNeedsRoads(room, start, container)) return true;
            if (room.mineral && pathNeedsRoads(room, start, room.mineral)) return true;
        }

        return false;
    }

    function pathNeedsRoads(room, start, end) {
        let target;
        let begin;
        if (start instanceof RoomPosition) begin = start;
        else begin = start.pos;
        if (end instanceof RoomPosition) target = end;
        else target = end.pos;

        let points;
        const path = getRoad(room, begin, target);
        if (path) {
            points = JSON.parse(path);
        } else {
            const result = PathFinder.search(begin, {pos: target, range: 1}, {
                heuristicWeight: 0.8,
                maxRooms: 1,
                roomCallback: roomName => buildCostMatrix(roomName),
            });
            if (result.incomplete || !result.path.length) return false;
            cacheRoad(room, begin, target, result.path);
            points = result.path;
        }

        for (const point of points) {
            const roomName = point.roomName || room.name;
            if (roomName !== room.name) continue;
            const pos = toRoomPosition(point, room.name);
            if (!pos) continue;
            const site = pos.checkForConstructionSites();
            if (!pos.checkForRoad() && !(site && site.structureType === STRUCTURE_ROAD)) {
                clearRoadPathComplete(room, begin, target);
                return true;
            }
        }
        if (!isPathFullyRoaded(room, points, target)) {
            clearRoadPathComplete(room, begin, target);
            return true;
        }
        return false;
    }

    function clearRoadPathComplete(room, from, to) {
        const key = getPathKey(from, to);
        if (ROAD_CACHE[room.name] && ROAD_CACHE[room.name][key]) {
            delete ROAD_CACHE[room.name][key].complete;
        }
    }

    function buildRoadFromTo(room, start, end) {
        let target;
        let begin;
        if (start instanceof RoomPosition) begin = start;
        else begin = start.pos;
        if (end instanceof RoomPosition) target = end;
        else target = end.pos;

        if (isRoadPathComplete(room, begin, target) && !pathNeedsRoads(room, start, end)) return false;

        let points;
        const path = getRoad(room, begin, target);
        if (path) {
            points = JSON.parse(path);
        } else {
            const result = PathFinder.search(begin, {pos: target, range: 1}, {
                heuristicWeight: 0.8,
                maxRooms: 1,
                roomCallback: roomName => buildCostMatrix(roomName),
            });
            if (result.incomplete || !result.path.length) return false;
            cacheRoad(room, begin, target, result.path);
            points = result.path;
        }

        for (const point of points) {
            const roomName = point.roomName || room.name;
            if (roomName !== room.name) continue;
            const pos = toRoomPosition(point, room.name);
            if (pos && buildRoad(pos)) return true;
        }

        if (!isPathFullyRoaded(room, points, target) && tryPlaceRoadNearTarget(room, target)) return true;

        if (isPathFullyRoaded(room, points, target)) {
            markRoadPathComplete(room, begin, target);
        }
        return false;
    }

    function tryPlaceRoadNearTarget(room, target) {
        const targetPos = target instanceof RoomPosition ? target : target.pos;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const ax = targetPos.x + dx;
                const ay = targetPos.y + dy;
                if (!isInRoomBounds(ax, ay)) continue;
                const pos = new RoomPosition(ax, ay, targetPos.roomName || room.name);
                if (buildRoad(pos)) return true;
            }
        }
        return false;
    }

    function isPathFullyRoaded(room, points, target) {
        for (const point of points) {
            const roomName = point.roomName || room.name;
            if (roomName !== room.name) continue;
            const pos = toRoomPosition(point, room.name);
            if (!pos) continue;
            const site = pos.checkForConstructionSites();
            if (!pos.checkForRoad() && !(site && site.structureType === STRUCTURE_ROAD)) return false;
        }
        const targetPos = target instanceof RoomPosition ? target : target.pos;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const ax = targetPos.x + dx;
                const ay = targetPos.y + dy;
                if (!isInRoomBounds(ax, ay)) continue;
                const adj = new RoomPosition(ax, ay, targetPos.roomName || room.name);
                const adjSite = adj.checkForConstructionSites();
                if (adj.checkForRoad() || (adjSite && adjSite.structureType === STRUCTURE_ROAD)) return true;
            }
        }
        return false;
    }

    function buildCostMatrix(roomName) {
        const costMatrix = new PathFinder.CostMatrix();
        const terrain = Game.map.getRoomTerrain(roomName);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                const tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    costMatrix.set(x, y, Infinity);
                } else if (tile === TERRAIN_MASK_SWAMP) {
                    costMatrix.set(x, y, 60);
                } else {
                    costMatrix.set(x, y, 20);
                }
            }
        }
        const pathRoom = Game.rooms[roomName];
        if (pathRoom) {
            pathRoom.structures.forEach(structure => {
                if (structure.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 1);
                } else if (structure.structureType === STRUCTURE_CONTAINER) {
                    costMatrix.set(structure.pos.x, structure.pos.y, 100);
                } else if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                    costMatrix.set(structure.pos.x, structure.pos.y, Infinity);
                }
            });
            pathRoom.constructionSites.forEach(site => {
                if (site.structureType === STRUCTURE_ROAD) {
                    costMatrix.set(site.pos.x, site.pos.y, 1);
                }
            });
        }
        return costMatrix;
    }

    function buildRoad(pos) {
        if (pos.roomName !== room.name || !Game.rooms[pos.roomName]) return false;
        if (pos.checkForRoad() || pos.checkForConstructionSites()) return false;
        if (pos.checkForImpassible(true) || pos.checkForWall()) return false;
        return pos.createConstructionSite(STRUCTURE_ROAD) === OK;
    }

    function removeRedundantRoads(room, layout, start) {
        const lastReset = Memory.lastGlobalReset;
        if (lastReset && lastReset + 5000 > Game.time) return;
        if (!start) return;

        const needed = new Set();
        const addPos = (x, y) => needed.add(`${x}x${y}`);

        const addPath = (from, to) => {
            if (!from || !to) return;
            const begin = from instanceof RoomPosition ? from : from.pos;
            const target = to instanceof RoomPosition ? to : to.pos;
            let points;
            const path = getRoad(room, begin, target);
            if (path) {
                points = JSON.parse(path);
            } else {
                const result = PathFinder.search(begin, {pos: target, range: 1}, {
                    heuristicWeight: 0.8,
                    maxRooms: 1,
                    roomCallback: roomName => buildCostMatrix(roomName),
                });
                if (result.incomplete || !result.path.length) return;
                cacheRoad(room, begin, target, result.path);
                points = result.path;
            }
            for (const p of points) {
                if ((p.roomName || room.name) !== room.name) continue;
                addPos(p.x, p.y);
            }
            addPos(target.x, target.y);
        };

        if (layout) {
            const roadStructures = _.filter(layout, s => s.structureType === STRUCTURE_ROAD);
            for (const r of roadStructures) {
                for (const s of r.pos) addPos(room.hub.x + s.x, room.hub.y + s.y);
            }
        }

        for (const target of collectStructureTargets(room, layout)) addPath(start, target);

        const sourceContainers = room.sources
            .map(s => resolveSourceContainer(s, room))
            .filter(c => c);
        for (const c of sourceContainers) addPath(start, c);
        for (const source of room.sources) {
            if (!resolveSourceContainer(source, room)) addPath(start, source);
        }

        const controllerContainer = global.resolveControllerContainer(room);
        if (controllerContainer) addPath(start, controllerContainer);
        else if (room.controller) addPath(start, room.controller);

        const neighboring = Game.map.describeExits(room.name);
        if (neighboring) {
            const dirToExit = {
                '1': FIND_EXIT_TOP,
                '3': FIND_EXIT_RIGHT,
                '5': FIND_EXIT_BOTTOM,
                '7': FIND_EXIT_LEFT,
            };
            for (const d in dirToExit) {
                if (!neighboring[d]) continue;
                const exitTile = getMiddleExitTile(room, dirToExit[d]);
                if (exitTile) addPath(start, exitTile);
            }
        }

        if (room.level >= 6) {
            const extractorContainer = Game.getObjectById(room.memory.extractorContainer);
            if (extractorContainer) addPath(start, extractorContainer);
            else if (room.mineral) addPath(start, room.mineral);
        }

        if (room.level >= 7) {
            if (ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name]) {
                const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
                if (ramparts) {
                    for (const p of ramparts) addPos(p.x, p.y);
                }
            }
            for (const rampart of room.ramparts) addPos(rampart.pos.x, rampart.pos.y);
        }

        purgeStaleRampartPaths(room);

        for (const road of room.roads) {
            if (!needed.has(`${road.pos.x}x${road.pos.y}`)) road.destroy();
        }
    }

    function purgeStaleRampartPaths(room) {
        const cache = ROAD_CACHE[room.name];
        if (!cache || !ROOM_RAMPART_SPOTS || !ROOM_RAMPART_SPOTS[room.name]) return;
        const rampartSet = new Set(JSON.parse(ROOM_RAMPART_SPOTS[room.name]).map(p => `${p.x}x${p.y}`));
        const hub = getRoadOrigin(room);
        if (!hub) return;
        const hubKey = `${hub.x}x${hub.y}`;
        for (const key of Object.keys(cache)) {
            const toKey = key.split('$')[1];
            if (rampartSet.has(toKey) || rampartSet.has(key.split('$')[0])) {
                delete cache[key];
            }
        }
    }
}

module.exports = {
    roadBuilder,
    getRoadOrigin,
    layoutRoadsComplete,
};