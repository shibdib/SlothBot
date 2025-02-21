/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const DEFAULT_MAXOPS = 7500;
const DEFAULT_HEURISTIC = 2.5;
const STATE_STUCK = 2;
const FLEE_RANGE = 4;

const terrainMatrixCache = CACHE.terrainMatrixCache = {};
const exitsMatrixCache = CACHE.exitsMatrixCache = {};
const structureMatrixCache = CACHE.structureMatrixCache = {};
const creepMatrixCache = CACHE.creepMatrixCache = {};
const stationaryCreepMatrixCache = CACHE.stationaryCreepMatrixCache = {};
const hostileMatrixCache = CACHE.hostileMatrixCache = {};
const outsideHubMatrixCache = CACHE.outsideHubMatrixCache = {};
const skMatrixCache = CACHE.skMatrixCache = {};
const TOW_TRUCK_CACHE = {};

function shibMove(creep, heading, options = {}, pathOnly = false) {
    // Handle move blocked
    if (heading instanceof Creep && creep.memory.moveBlocked === Game.time) {
        return true;
    }
    // Handle multi heading
    if (Array.isArray(heading)) {
        let multiHeading = findMultiHeadingPos(heading, options.range);
        if (!multiHeading) {
            options.range = 1;
            heading = heading[0];
        } else {
            options.range = 0;
            heading = multiHeading;
        }
    }

    // If the target is a creep in another room, change the heading to that room
    if (heading instanceof Creep && heading.room.name !== creep.room.name &&
        Game.map.getRoomLinearDistance(creep.room.name, heading.room.name) > 1) {
        heading = new RoomPosition(25, 25, heading.room.name);
        options.range = 23;
    }
    // Make sure origin and target are good
    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    if (!origin || !target) return;

    // Default options
    _.defaults(options, {
        maxOps: DEFAULT_MAXOPS,
        range: 1,
        maxRooms: 7,
        useCache: true,
        ignoreCreeps: true,
        heuristicWeight: DEFAULT_HEURISTIC
    });

    if (pathOnly) {
        const cached = getPath(creep, origin, target, undefined);
        if (cached) return cached;
        return PathFinder.search(origin, {pos: target, range: options.range}, {
            maxOps: options.maxOps || DEFAULT_MAXOPS,
            maxRooms: options.maxRooms || 16,
            heuristicWeight: options.heuristicWeight || 1,
            roomCallback: (roomName) => getMatrix(roomName, creep, options),
        });
    }

    // If creep is still spawning, return false
    if (creep.spawning) return false;

    // If in an SK room and no matrix exists, reset it
    if (INTEL[creep.room.name].sk && (!skMatrixCache[creep.room.name] || skMatrixCache[creep.room.name].tick + 150 < Game.time)) {
        options.useCache = false;
        creep.memory._shibMove = undefined;
    }

    // Store source keeper
    if (creep.memory.keeper) options.ignoreKeeper = creep.memory.keeper;

    // Handle tow being set
    if (creep.memory.towDestination && creep.memory.towCreep) {
        let towCreep = Game.getObjectById(creep.memory.towCreep);
        if (!towCreep) {
            creep.memory.towCreep = undefined;
        } else return;
    }

    // Handle fatigue
    if (!creep.className && creep.hasActiveBodyparts(MOVE) && (creep.fatigue > 0 || !heading)) {
        if (!creep.memory.military) creep.idleFor(1);
        return creep.room.visual.circle(creep.pos, {
            fill: 'transparent',
            radius: 0.55,
            stroke: 'black'
        });
    }

    // Handle re-pathing cases
    if (creep.memory.repathing) {
        if (creep.memory.repathing !== creep.room.name) {
            heading = new RoomPosition(25, 25, creep.memory.repathing);
            options.range = 23;
        } else {
            creep.memory.repathing = undefined;
            creep.memory._shibMove = undefined;
        }
    }

    // If the pathing memory entry is missing or wrong recreate it
    if (!creep.memory._shibMove || !creep.memory._shibMove.target || creep.memory._shibMove.targetRoom !== target.roomName
        || creep.memory._shibMove.target.x !== target.x || creep.memory._shibMove.target.y !== target.y) creep.memory._shibMove = {};

    //Clear path if stuck
    if (creep.memory._shibMove.pathPosTime && creep.memory._shibMove.pathPosTime >= STATE_STUCK) {
        if (creepBumping(creep, creep.memory._shibMove, options)) {
            creep.memory._shibMove.pathPosTime--;
            return;
        } else {
            return false;
        }
    }

    // If a path exists, just execute
    if (creep.memory._shibMove && creep.memory._shibMove.path && creep.memory._shibMove.path.length && !options.getPath) {
        return executePath(creep, creep.memory._shibMove, options, origin, heading);
    }

    // Request a tow truck if needed
    if (creep.memory.willNeedTow === undefined) creep.memory.willNeedTow = _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length / 2 > _.filter(creep.body, (p) => p.type === MOVE).length;
    if (!creep.className && creep.memory.willNeedTow && (creep.pos.getRangeTo(heading) > 3 || !creep.hasActiveBodyparts(MOVE))) {
        if (!creep.memory.towDestination) {
            creep.memory.towDestination = heading.id || heading;
            creep.memory.towOptions = options;
        } else if (heading.id && creep.hasActiveBodyparts(MOVE) && creep.pos.isNearTo(heading)) {
            creep.memory.towDestination = undefined;
        } else if (creep.pos.isNearTo(heading) && ((heading instanceof RoomPosition && heading.checkForCreep()) || (heading instanceof RoomObject && heading.pos.checkForCreep()))) {
            creep.memory.towDestination = undefined;
        }
        if (!creep.memory.towCreep || !Game.getObjectById(creep.memory.towCreep)) {
            const roomName = creep.room.name;
            if (!TOW_TRUCK_CACHE[roomName] || TOW_TRUCK_CACHE[roomName].tick !== Game.time) {
                const towCandidates = [];
                for (let c of creep.room.myCreeps) {
                    const moveParts = c.getActiveBodyparts(MOVE);
                    if (moveParts >= 2 && !_.sum(c.store) && !c.memory.trailer &&
                        !c.hasActiveBodyparts(ATTACK) && !c.hasActiveBodyparts(RANGED_ATTACK) && !c.hasActiveBodyparts(HEAL)) {
                        towCandidates.push({creep: c, priority: moveParts >= creep.body.length * 0.5 ? 1 : 0});
                    }
                }
                TOW_TRUCK_CACHE[roomName] = {candidates: towCandidates, tick: Game.time};
            }

            const candidates = TOW_TRUCK_CACHE[roomName].candidates;
            if (candidates.length) {
                const sorted = _.sortBy(candidates, 'priority').reverse();
                const closest = creep.pos.findClosestByRange(_.map(sorted, 'creep'));
                creep.memory.towCreep = closest.id;
                closest.memory.trailer = creep.id;
            }
        }
        return true;
    }

    // If tunneling up the ops
    if (options.tunnel) options.maxOps = 15000;

    // Show matrix
    if (options.showMatrix) return getMatrix(creep.room.name, creep, options)

    // Handle portal
    if (options.portal) {
        // Handle arriving
        if (creep.room.name === options.portalDestination) {
            heading = new RoomPosition(25, 25, options.originalDestination);
            options.portal = undefined;
            options.range = 23;
        } else if (creep.room.name !== creep.memory.portal) {
            heading = new RoomPosition(25, 25, options.portal);
            options.range = 23;
        } else {
            heading = _.find(creep.room.structures, (s) => s.structureType === STRUCTURE_PORTAL);
            options.range = 0;
        }
    }

    // Set var
    let pathInfo = creep.memory._shibMove;
    creep.memory._shibMove.targetRoom = target.roomName;

    //Execute path if target is valid and path is set
    if (pathInfo.path && pathInfo.path.length && !options.getPath) {
        return executePath(creep, pathInfo, options, origin, heading);
    } else {
        return shibPath(creep, heading, pathInfo, origin, target, options);
    }
}

function executePath(creep, pathInfo, options, origin, heading) {
    if (!pathInfo.path || !pathInfo.path.length) {
        if (!options.flee && creep.pos.getRangeTo(heading) <= options.range) {
            creep.memory._shibMove = undefined;
            creep.memory.towDestination = undefined;
        }
        return false;
    }

    if (pathInfo.newPos && pathInfo.newPos.x === creep.pos.x && pathInfo.newPos.y === creep.pos.y &&
        pathInfo.newPos.roomName === creep.pos.roomName) {
        pathInfo.path = pathInfo.path.slice(1);
    }

    const nextDirection = parseInt(pathInfo.path[0], 10);
    if (!nextDirection) return false;

    pathInfo.newPos = origin.positionAtDirection(nextDirection);
    const posKey = creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName;

    if (pathInfo.pathPos === posKey) {
        if (handleBarrier(creep, pathInfo, options)) return true;
        pathInfo.pathPosTime = (pathInfo.pathPosTime || 0) + 1;
    } else {
        pathInfo.pathPos = posKey;
        pathInfo.pathPosTime = 0;
    }

    const moveResult = creep.move(nextDirection);
    if (moveResult === OK || moveResult === ERR_TIRED) {
        creep.memory._shibMove = pathInfo;
        return true;
    }
    if (moveResult === ERR_BUSY) creep.idleFor(10);
    return false;
}

function handleBarrier(creep, pathInfo, options) {
    if (!pathInfo.newPos) return false;
    const barrier = pathInfo.newPos.checkForBarrierStructure();
    if (!barrier || (INTEL[pathInfo.newPos.roomName].owner && FRIENDLIES.includes(INTEL[pathInfo.newPos.roomName].owner))) return false;

    if (options.tunnel || creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(WORK) || creep.hasActiveBodyparts(RANGED_ATTACK)) {
        creep.memory.barrierClearing = barrier.id;
        if (creep.attack(barrier) === OK || creep.dismantle(barrier) === OK || creep.rangedAttack(barrier) === OK) {
            pathInfo.pathPosTime = 0;
            return true;
        }
    }
    creep.memory._shibMove = undefined;
    return false;
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    let cached, roomDistance, allowedRooms;
    pathInfo.pathOptions = options;
    // Early exit for adjacent targets
    if (origin.roomName === target.roomName && creep.pos.isNearTo(heading) && options.range === 0) {
        creep.memory._shibMove = undefined;
        const direction = creep.pos.getDirectionTo(heading);
        if (creep.move(direction) === OK) return true;
    }
    // Check for a cached path
    if (options.useCache && !INTEL[creep.room.name].threatLevel && !options.tunnel) cached = getPath(creep, origin, target, pathInfo);
    // If cache path exists use it;
    if (cached && options.ignoreCreeps) {
        pathInfo.target = target;
        pathInfo.path = cached;
        pathInfo.usingCached = true;
        pathInfo.newPos = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
        creep.memory._shibMove = pathInfo;
        switch (creep.move(parseInt(pathInfo.path[0], 10))) {
            case OK:
                return true;
            case ERR_TIRED:
                return true;
            case ERR_NO_BODYPART:
                return false;
            case ERR_BUSY:
                creep.idleFor(10);
                return false;
        }
        return true;
    }
    // Check if its multi room or not
    if (origin.roomName !== target.roomName) {
        roomDistance = Game.map.getRoomLinearDistance(origin.roomName, target.roomName)
        options.maxOps = DEFAULT_MAXOPS * (roomDistance + 4);
    } else {
        options.maxOps = DEFAULT_MAXOPS;
    }
    // Set allowed rooms if they were manually set
    allowedRooms = pathInfo.route || options.route;
    // If multi room find the route
    if (roomDistance) {
        let route = findRoute(origin.roomName, target.roomName, options);
        if (route) {
            // If the current room name is missing, add it to the front
            if (!route.includes(creep.room.name)) route.unshift(creep.room.name);
            allowedRooms = route;
            pathInfo.route = route;
        }
    }
    // If no route/allowed rooms got set, use the current room and neighbors
    if (!allowedRooms) allowedRooms = [origin.roomName].concat(Object.values(Game.map.describeExits(origin.roomName)));
    // Pathfinder
    const result = PathFinder.search(origin, {pos: target, range: options.range}, {
        maxOps: options.maxOps,
        maxRooms: allowedRooms.length * 1.5,
        heuristicWeight: options.heuristicWeight,
        roomCallback: function (roomName) {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            return getMatrix(roomName, creep, options);
        }
    });
    // Handle success
    if (!result.incomplete) {
        pathInfo.target = target;
        pathInfo.path = serializePath(creep.pos, result.path);
        pathInfo.usingCached = true;
        pathInfo.newPos = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
        creep.memory._shibMove = pathInfo;
        // Cache the path
        if (options.ignoreCreeps) cachePath(creep, origin, target, pathInfo);
        // Store path if requested
        if (options.getPath) return creep.memory.getPath = pathInfo.path;
        switch (creep.move(parseInt(pathInfo.path[0], 10))) {
            case OK:
                return true;
            case ERR_TIRED:
                return true;
            case ERR_NO_BODYPART:
                return false;
            case ERR_BUSY:
                creep.idleFor(10);
                return false;
        }
        return true;
    }
    // Handle failed
    if (!creep.memory.badPathing && roomDistance) {
        creep.memory.badPathing = 1;
        deleteRoute(origin.roomName, target.roomName);
        deleteRoute(creep.roomName, target.roomName);
    } else {
        if (creep.memory.badPathing) creep.memory.badPathing++; else creep.memory.badPathing = 1;
        if (creep.memory.badPathing > 10) {
            log.d(creep.name + ' is stuck in ' + creep.room.name + ' and is unable to path from ' + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + '. Suiciding for the good of the CPU.');
            log.d('Ret - ' + JSON.stringify(result));
            if (allowedRooms) log.d('Path - ' + allowedRooms);
            if (creep.memory.destination && (Memory.targetRooms[creep.memory.destination] || Memory.auxiliaryTargets[creep.memory.destination])) {
                delete Memory.targetRooms[creep.memory.destination];
                delete Memory.auxiliaryTargets[creep.memory.destination];
                log.d('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot find a path.', 'HIGH COMMAND: ');
            }
            //return creep.suicide();
        }
    }
}

function findRoute(origin, destination, options = {}) {
    if (origin === destination) return [origin];
    _.defaults(options, {useCache: true});

    const cacheKey = origin + '_' + destination;
    const cached = options.useCache && ROUTE_CACHE[cacheKey];
    if (cached && cached.tick + 500 > Game.time) {
        return cached.failed ? [] : JSON.parse(cached.route);
    }

    const roomDistance = Game.map.getRoomLinearDistance(origin, destination);
    if (roomDistance > 15) return; // Early exit for unreachable distances

    const route = Game.map.findRoute(origin, destination, {
        routeCallback: (roomName) => {
            if (roomName === origin || roomName === destination) return 1;
            const intel = INTEL[roomName];
            if (roomStatus(roomName) === 'closed' ||
                (intel && !intel.isHighway && roomStatus(roomName) !== roomStatus(origin))) return Infinity;
            if (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) return 1;
            if (Memory.avoidRooms && Memory.avoidRooms.includes(roomName)) return 250;
            if (!intel) return 10;
            if (intel.user && FRIENDLIES.includes(intel.user)) return 5;
            if (intel.user && !FRIENDLIES.includes(intel.user)) return intel.towers ? Infinity : 75;
            if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) return 120;
            if (intel.obstacles) return 200;
            if (intel.sk && intel.towers) return 250;
            if (intel.threatLevel) return 60 * intel.threatLevel;
            return intel.isHighway ? 5 : 7;
        }
    });

    const path = route.length ? route.map(r => r.room) : [];
    cacheRoute(origin, destination, path.length ? path : undefined, !path.length);
    return path;
}

//FUNCTIONS
function creepBumping(creep, pathInfo, options) {
    if (!pathInfo.newPos) return creep.moveRandom();
    let nextPosition = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
    if (nextPosition) {
        let bumpCreep = _.find(nextPosition.lookFor(LOOK_CREEPS), (c) => c.my && !c.fatigue && (!c.memory.other || !c.memory.other.stationary) && c.hasActiveBodyparts(MOVE) && !c.memory.grouped);
        if (bumpCreep) {
            // Handle duos
            if (creep.memory.partner && bumpCreep.id === creep.memory.partner) return false;
            if (!creep.className && !creep.memory.trailer) {
                bumpCreep.move(bumpCreep.pos.getDirectionTo(creep));
                creep.move(creep.pos.getDirectionTo(bumpCreep));
                bumpCreep.say(ICONS.traffic, true)
            } else {
                bumpCreep.moveRandom();
                creep.move(creep.pos.getDirectionTo(bumpCreep));
                bumpCreep.say(ICONS.traffic, true)
            }
            if (bumpCreep.memory._shibMove) {
                bumpCreep.memory._shibMove.path = undefined;
                bumpCreep.memory._shibMove.pathPosTime = undefined;
            }
            bumpCreep.memory.moveBlocked = Game.time;
            return true;
        } else {
            creep.moveRandom();
            creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
        }
    }
    delete creep.memory._shibMove;
    return false;
}

function normalizePos(destination) {
    if (!(destination instanceof RoomPosition)) {
        if (destination) {
            return destination.pos;
        } else {
            return;
        }
    }
    return destination;
}

function getMatrix(roomName, creep, options) {
    const room = Game.rooms[roomName];
    let armedEnemies = [];
    if (room) armedEnemies = room.hostileCreeps.filter((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    let matrix = getTerrainMatrix(roomName, options);
    matrix = getStructureMatrix(roomName, creep, matrix, options);
    if (!options.ignoreCreeps) matrix = getCreepMatrix(roomName, creep, matrix, options);
    matrix = getStationaryCreepsMatrix(roomName, creep, matrix, options);
    if (creep instanceof Creep && armedEnemies.length && (creep.className || (!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(RANGED_ATTACK)) || options.avoidEnemies)) {
        matrix = getHostileMatrix(roomName, matrix, options);
        matrix = getOutsideHubMatrix(roomName, matrix, options);
    }
    matrix = getSKMatrix(roomName, matrix, options);
    return matrix;
}

function getTerrainMatrix(roomName, options) {
    let type = 1;
    if (options.offRoad || options.tunnel) type = 3; else if (options.ignoreRoads) type = 2;
    // Handle squad stuff
    if (options.squad) type = 4;
    if ((!INTEL[roomName] || !INTEL[roomName].refreshCaches) && (!terrainMatrixCache[roomName + type] || options.showMatrix)) {
        terrainMatrixCache[roomName + type] = addTerrainToMatrix(roomName, type).serialize();
    }
    return PathFinder.CostMatrix.deserialize(terrainMatrixCache[roomName + type]);

    function addTerrainToMatrix(roomName, type) {
        let matrix = new PathFinder.CostMatrix();
        let terrain = Game.map.getRoomTerrain(roomName);
        let plainCost, swampCost;
        switch (type) {
            case 2:
                plainCost = 1;
                swampCost = 25;
                break;
            case 3:
                plainCost = 1;
                swampCost = 1;
                break;
            default:
                plainCost = 5;
                swampCost = 25;
        }
        // Squad matrix has higher costs in tiles neighboring swamps and walls
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                let tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 256);
                    if (options.squad) {
                        for (let i = -1; i < 2; i++) {
                            for (let j = -1; j < 2; j++) {
                                matrix.set(x + i, y + j, 200);
                            }
                        }
                    }
                }
                // Handle exits
                else if (x === 0 || x === 49 || y === 0 || y === 49) matrix.set(x, y, 10);
                else if (tile === TERRAIN_MASK_SWAMP) {
                    matrix.set(x, y, swampCost);
                    if (options.squad) {
                        for (let i = -1; i < 2; i++) {
                            for (let j = -1; j < 2; j++) {
                                matrix.set(x + i, y + j, plainCost * 5);
                            }
                        }
                    }
                }
                else matrix.set(x, y, plainCost);
            }
        }
        return matrix;
    }
}

function getStructureMatrix(roomName, creep, matrix, options) {
    let room = Game.rooms[roomName];
    let type = 1;
    if (options.offRoad || options.tunnel) type = 3; else if (options.ignoreRoads) type = 2;
    if (options.squad) type = 4;
    // If we can't see into the room, try to use an old matrix
    if (!room) {
        if (structureMatrixCache[roomName + type]) return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type]);
        else return matrix;
    }
    // Check if matrix is cached and usable
    if ((!INTEL[roomName] || !INTEL[roomName].refreshCaches) && (!structureMatrixCache[roomName + type] || options.showMatrix || options.tunnel
        || Game.time > structureMatrixCache[roomName + type].tick + (CREEP_LIFE_TIME * 25) || structureMatrixCache[roomName + type].count !== (room.structures.length + room.constructionSites.length))) {
        structureMatrixCache[roomName + type] = addStructuresToMatrix(room, creep, matrix, type, options).serialize();
        structureMatrixCache[roomName + type].tick = Game.time;
        structureMatrixCache[roomName + type].count = room.structures.length + room.constructionSites.length;
    }
    return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type]);

    function addStructuresToMatrix(room, creep, matrix, type, options) {
        if (!room) return matrix;
        let roadCost;
        switch (type) {
            case 2:
            case 3:
                roadCost = 5;
                break;
            default:
                roadCost = 1;
        }
        let noWallWrecker = (creep instanceof Creep && ((INTEL[room.name] && FRIENDLIES.includes(INTEL[room.name].owner)) || (!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(WORK))));
        for (let structure of room.structures) {
            if (options.squad && structure.structureType === STRUCTURE_ROAD) {
                continue;
            }
            if (structure instanceof StructureWall) {
                if (noWallWrecker) {
                    matrix.set(structure.pos.x, structure.pos.y, 256);
                } else {
                    matrix.set(structure.pos.x, structure.pos.y, 200);
                }
            } else if (room.hostileCreeps.length && structure instanceof StructureRoad && !structure.pos.checkForObstacleStructure() && !structure.pos.checkForContainer()
                && structure.pos.checkForRampart()) {
                matrix.set(structure.pos.x, structure.pos.y, roadCost * 0.5);
            } else if (structure instanceof StructureRoad && !structure.pos.checkForObstacleStructure() && !structure.pos.checkForContainer()) {
                matrix.set(structure.pos.x, structure.pos.y, roadCost);
            } else if (structure instanceof StructurePortal) {
                matrix.set(structure.pos.x, structure.pos.y, 200);
            } else if (structure instanceof StructureRampart && (structure.my || structure.isPublic) && !structure.pos.checkForObstacleStructure()) {
                if (room.hostileCreeps.length) matrix.set(structure.pos.x, structure.pos.y, roadCost);
            } else if (structure instanceof StructureRampart && (FRIENDLIES.includes(structure.owner.username) && !structure.pos.checkForObstacleStructure())) {
                matrix.set(structure.pos.x, structure.pos.y, 250);
            } else if (structure instanceof StructureRampart && (!structure.my || !structure.isPublic || structure.pos.checkForObstacleStructure())) {
                if (noWallWrecker) {
                    matrix.set(structure.pos.x, structure.pos.y, 256);
                } else {
                    matrix.set(structure.pos.x, structure.pos.y, 150);
                }
            } else if (structure instanceof StructureContainer) {
                matrix.set(structure.pos.x, structure.pos.y, 75);
            } else if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                matrix.set(structure.pos.x, structure.pos.y, 256);
            } else if (structure instanceof StructureRoad && !structure.pos.checkForObstacleStructure()) {
                matrix.set(structure.pos.x, structure.pos.y, roadCost * 5);
            } else {
                matrix.set(structure.pos.x, structure.pos.y, 256);
            }
            // Handle setting the position around the structure for squads
            if (options.squad && OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                let positions = structure.pos.lookForNearby(LOOK_TERRAIN, 1);
                for (let position of positions) {
                    const currentCost = matrix.get(position.x, position.y);
                    if (currentCost > 200) continue;
                    else matrix.set(position.x, position.y, 200);
                }
            }
        }
        let blockingSites = _.filter(room.constructionSites, (s) => (s.my && OBSTACLE_OBJECT_TYPES.includes(s.structureType)) || (!s.my && _.includes(FRIENDLIES, s.owner.username)));
        for (let site of blockingSites) {
            matrix.set(site.pos.x, site.pos.y, 256);
        }
        //Sources
        for (let source of room.sources) {
            matrix.set(source.pos.x, source.pos.y, 256);
        }
        if (room.mineral) {
            matrix.set(room.mineral.pos.x, room.mineral.pos.y, 256);
        }
        // Handle tunnel/finding lowest wall/ramp path
        if (type === 4) {
            let barriers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART);
            if (barriers.length) {
                let maxHp = _.max(barriers, 'hits').hits;
                for (let s of barriers) {
                    matrix.set(s.pos.x, s.pos.y, _.floor((s.hits / maxHp) * 50));
                    if (options.showMatrix) new RoomVisual(room.name).text(_.floor((s.hits / maxHp) * 100), s.pos.x, s.pos.y, {
                        color: 'white',
                        font: 0.4
                    });
                }
            }
        }
        return matrix;
    }
}

function getCreepMatrix(roomName, creep, matrix, options) {
    let room = Game.rooms[roomName];
    if (!room || !(creep instanceof Creep)) return matrix;
    if (!creepMatrixCache[roomName] || options.showMatrix || Game.time !== creepMatrixCache[roomName].tick) {
        creepMatrixCache[roomName] = addCreepsToMatrix(room, matrix, creep, options).serialize();
        creepMatrixCache[roomName].tick = Game.time;
    }
    return PathFinder.CostMatrix.deserialize(creepMatrixCache[roomName]);

    function addCreepsToMatrix(room, matrix, creep = undefined, options) {
        if (!room) return matrix;
        let creeps = room.creeps;
        if (!room.hostileCreeps.length && creep) {
            creeps = creep.pos.findInRange(FIND_CREEPS, 5);
            creeps = creeps.concat(creep.pos.findInRange(FIND_POWER_CREEPS, 5));
        }
        for (let key in creeps) {
            matrix.set(creeps[key].pos.x, creeps[key].pos.y, 0xff);
            if (options.showMatrix) new RoomVisual(room.name).text('IMP', creeps[key].pos.x, creeps[key].pos.y, {
                color: 'white',
                font: 0.4
            });
        }
        return matrix;
    }
}

function getStationaryCreepsMatrix(roomName, creep, matrix, options) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;
    if (!stationaryCreepMatrixCache[roomName] || options.showMatrix || Game.time !== stationaryCreepMatrixCache[roomName].tick) {
        stationaryCreepMatrixCache[roomName] = addStationaryCreepsToMatrix(room, matrix, creep, options).serialize();
        stationaryCreepMatrixCache[roomName].tick = Game.time;
    }
    return PathFinder.CostMatrix.deserialize(stationaryCreepMatrixCache[roomName]);

    function addStationaryCreepsToMatrix(room, matrix, creep = undefined, options) {
        if (!room) return matrix;
        let creeps = room.myCreeps;
        for (let creep of creeps) {
            // Sanity check
            if (!creep.memory || !creep.memory.other) continue;
            if (creep.memory.other.stationary || !creep.hasActiveBodyparts(MOVE) || creep.memory.grouped) {
                matrix.set(creep.pos.x, creep.pos.y, 200);
                if (options.showMatrix) new RoomVisual(room.name).text('IMP', creep.pos.x, creep.pos.y, {
                    color: 'white',
                    font: 0.4
                });
            }
        }
        return matrix;
    }
}

function getHostileMatrix(roomName, matrix, options) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;
    if (!hostileMatrixCache[roomName] || options.showMatrix || Game.time !== hostileMatrixCache[roomName].tick) {
        hostileMatrixCache[roomName] = addHostilesToMatrix(room, matrix).serialize();
        hostileMatrixCache[roomName].tick = Game.time;
    }
    return PathFinder.CostMatrix.deserialize(hostileMatrixCache[roomName]);

    function addHostilesToMatrix(room, matrix) {
        if (!room || (room.controller && room.controller.owner && room.controller.owner.username === MY_USERNAME && room.controller.safeMode)) {
            return matrix;
        }
        const enemyCreeps = room.hostileCreeps.filter(c => !c.className && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
        for (const creep of enemyCreeps) {
            matrix.set(creep.pos.x, creep.pos.y, 250);
            const sites = creep.room.lookForAtArea(LOOK_TERRAIN, creep.pos.y - 6, creep.pos.x - 6, creep.pos.y + 6, creep.pos.x + 6, true);
            for (let site of sites) {
                let position;
                try {
                    position = new RoomPosition(site.x, site.y, room.name);
                    if (position && !position.checkForWall()) {
                        const value = 200 / creep.pos.getRangeTo(position);
                        matrix.set(position.x, position.y, value)
                    }
                } catch (e) {
                }
            }
        }
        return matrix;
    }
}

function getOutsideHubMatrix(roomName, matrix, options) {
    let room = Game.rooms[roomName];
    if (!room || 2 > 1) return matrix;
    if (!outsideHubMatrixCache[roomName] || options.showMatrix || outsideHubMatrixCache[roomName].tick + CREEP_LIFE_TIME < Game.time) {
        outsideHubMatrixCache[roomName] = markOutsideHubAsImpassable(room, matrix).serialize();
        outsideHubMatrixCache[roomName].tick = Game.time;
    }
    return PathFinder.CostMatrix.deserialize(outsideHubMatrixCache[roomName]);

    function markOutsideHubAsImpassable(room, matrix) {
        if (!room) return matrix;// Mark positions outside the hub as impassable
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                const pos = new RoomPosition(x, y, room.name);
                if (!pos.isInBunker()) {
                    matrix.set(x, y, 250);
                }
            }
        }
        return matrix;
    }
}

function getSKMatrix(roomName, matrix = undefined, options) {
    let room = Game.rooms[roomName];
    if (!INTEL[roomName] || !INTEL[roomName].sk || !room) return matrix;
    if (!skMatrixCache[roomName] || options.showMatrix || (skMatrixCache[roomName].tick + 150 < Game.time && Game.rooms[roomName])) {
        skMatrixCache[roomName] = addSksToMatrix(room, matrix, options).serialize();
        skMatrixCache[roomName].tick = Game.time;
    }
    return PathFinder.CostMatrix.deserialize(skMatrixCache[roomName]);

    function addSksToMatrix(room, matrix, options) {
        const activeMining = room.find(FIND_MY_CREEPS, {filter: (c) => c.memory.role === 'SKAttacker' && c.memory.destination === room.name})[0];
        if (!activeMining) {
            let sks = room.find(FIND_CREEPS, {filter: (c) => c.owner.username === 'Source Keeper'});
            if (options.ignoreKeeper) sks = _.filter(sks, (c) => c.id !== options.ignoreKeeper)
            if (sks.length) {
                for (let sk of sks) {
                    matrix.set(sk.pos.x, sk.pos.y, Infinity);
                    let sites = sk.room.lookForAtArea(LOOK_TERRAIN, sk.pos.y - 3, sk.pos.x - 3, sk.pos.y + 3, sk.pos.x + 3, true);
                    for (let site of sites) {
                        let position;
                        try {
                            position = new RoomPosition(site.x, site.y, room.name);
                            if (position && !position.checkForWall()) {
                                matrix.set(position.x, position.y, Infinity)
                            }
                        } catch (e) {
                        }
                    }
                }
            } else {
                let lairs = room.find(room.structures, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn && s.ticksToSpawn < 25});
                let avoid = _.union(lairs, room.sources, room.mineral);
                for (let lair of avoid) {
                    let sites = lair.room.lookForAtArea(LOOK_TERRAIN, lair.pos.y - 5, lair.pos.x - 5, lair.pos.y + 5, lair.pos.x + 5, true);
                    for (let site of sites) {
                        let position;
                        try {
                            position = new RoomPosition(site.x, site.y, room.name);
                            if (position && !position.checkForWall()) {
                                matrix.set(position.x, position.y, 250)
                            }
                        } catch (e) {
                        }
                    }
                }
            }
        }
        return matrix;
    }
}

function serializePath(startPos, path, color = _.sample(["orange", "blue", "green", "red", "yellow", "black", "gray", "purple"])) {
    let serializedPath = "";
    for (let position of path) {
        if (position.roomName === startPos.roomName) {
            new RoomVisual(position.roomName)
                .line(position, startPos, {color: color, lineStyle: "dashed"});
            serializedPath += startPos.getDirectionTo(position);
        }
        startPos = position;
    }
    return serializedPath;
}

function cacheRoute(from, to, route, failed = undefined) {
    let key = from + '_' + to;
    let cache = ROUTE_CACHE || {};
    if (typeof cache !== 'object') cache = {};
    let tick = Game.time;
    cache[key] = {
        route: JSON.stringify(route),
        failed: failed,
        uses: 1,
        tick: tick
    };
    CACHE.ROUTE_CACHE = cache;
}

function getRoute(from, to) {
    if (ROUTE_CACHE) {
        let cachedRoute = ROUTE_CACHE[from + '_' + to];
        if (cachedRoute) {
            if (cachedRoute.tick + (CREEP_LIFE_TIME * 2) > Game.time) {
                if (cachedRoute.failed) return 'failed';
                cachedRoute.uses += 1;
                CACHE.ROUTE_CACHE[from + '_' + to] = cachedRoute;
                return JSON.parse(cachedRoute.route);
            } else {
                delete CACHE.ROUTE_CACHE[from + '_' + to];
            }
        }
    }
}

function deleteRoute(from, to) {
    let key = from + '_' + to;
    if (CACHE.ROUTE_CACHE[key]) delete CACHE.ROUTE_CACHE[key];
}

function cachePath(creep, from, to, pathInfo) {
    if (!pathInfo.path || !pathInfo.path.length) return;
    const options = pathInfo.pathOptions || {};
    const weight = options.offRoad ? 1 : options.ignoreRoads ? 2 : 3;
    const key = getPathKey(from, to, weight);

    if (!CACHE.globalPathCache) CACHE.globalPathCache = {};
    const room = creep.room;
    CACHE.globalPathCache[key] = {
        path: pathInfo.path,
        key: key,
        tick: Game.time,
        structuresHash: hashStructures(room.impassibleStructures),
        uses: 1
    };
}

function getPath(creep, from, to, pathInfo) {
    if (!CACHE.globalPathCache) return;
    const options = pathInfo ? pathInfo.pathOptions : {};
    const weight = options.offRoad ? 1 : options.ignoreRoads ? 2 : 3;
    const key = getPathKey(from, to, weight);
    const cache = CACHE.globalPathCache;
    let cached = cache[key];

    if (!cached) {
        const reverseKey = getPathKey(to, from, weight);
        if (cache[reverseKey]) {
            cached = cache[reverseKey];
            cached.path = reverseString(cached.path);
        }
    }

    if (cached && cached.tick + 100 > Game.time &&
        cached.structuresHash === hashStructures(creep.room.impassibleStructures) &&
        creep.memory._shibMove.pathPosTime < STATE_STUCK) {
        cached.uses++;
        return cached.path;
    }
    delete cache[key]; // Clear outdated cache
}

function hashStructures(structures) {
    let hash = 0;
    for (const s of structures) hash += s.pos.x + s.pos.y * 50; // Simple position-based hash
    return hash;
}

function reverseString(str) {
    return str.split('').reverse().join('');
}

function getMoveWeight(creep, options = {}) {
    // Handle PC
    if (creep.className) {
        //options.heuristicWeight = 1.1;
        return options;
    }
    let move = creep.getActiveBodyparts(MOVE);
    // Get weight of creep
    let weight = creep.body.filter((p) => p.type !== MOVE && p.type !== CARRY).length;
    // Add weight of used carry parts
    weight += _.ceil(_.sum(creep.store) / 50) || 0;
    // Add weight of trailer
    if (creep.memory.trailer) {
        const trailer = Game.getObjectById(creep.memory.trailer);
        if (trailer && creep.pos.isNearTo(trailer)) {
            weight += trailer.body.filter((p) => p.type !== MOVE && p.type !== CARRY).length;
        } else if (!trailer) {
            creep.memory.trailer = undefined;
        }
    }
    if (move >= weight * 5) {
        options.offRoad = true;
    } else if (move >= weight || (move === weight && COMBAT_ROLES.contains(creep.memory.role))) {
        options.ignoreRoads = true;
    } else {
        options.offRoad = undefined;
        options.ignoreRoads = undefined;
    }
    return options;
}

function findMultiHeadingPos(heading, range) {
    let positions = [];
    for (let target of heading) {
        let inRange = target.room.lookForAtArea(LOOK_TERRAIN, target.pos.y - range, target.pos.x - range, target.pos.y + range, target.pos.x + range, true);
        for (let pos of inRange) {
            let position = new RoomPosition(pos.x, pos.y, heading[0].room.name);
            if (position.checkForImpassible()) continue;
            positions.push({x: position.x, y: position.y, t: target.id});
        }
    }
    let goodPos;
    positions.forEach(function (p) {
        if (_.find(positions, (o) => o.t !== p.t && o.x === p.x && o.y === p.y)) {
            goodPos = _.find(positions, (o) => o.t !== p.t && o.x === p.x && o.y === p.y);
        }
    })
    if (goodPos) return new RoomPosition(goodPos.x, goodPos.y, heading[0].room.name); else return undefined;
}

function getPathKey(from, to, weight) {
    return getPosKey(from) + '$' + getPosKey(to) + '$' + weight;
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y + pos.roomName;
}

/**
 * Movement code
 * @param destination
 * @param options
 * @returns {*|boolean|boolean|void|string}
 */
PowerCreep.prototype.shibMove = function (destination, options = {}) {
    return shibMove(this, destination, options);
};

/**
 * Movement code
 * @param destination
 * @param options
 * @returns {*|boolean|boolean|void|string}
 */
Creep.prototype.shibMove = function (destination, options = {}) {
    if (options.squad || this.memory.squadMembers) return this.shibSquadMovement(destination, options);
    return shibMove(this, destination, options);
};

/**
 * Movement code
 * @param destination
 * @param options
 * @returns {*|boolean|boolean|void|string}
 */
RoomPosition.prototype.shibMove = function (destination, options = {}) {
    return shibMove(this, destination, options, true);
};

/**
 * Find route to destination
 * @param destination
 * @param options
 * @returns {[*]|[]|string|any|[*,*]|string}
 */
Room.prototype.shibRoute = function (destination, options = {}) {
    let route = getRoute(this.name, destination);
    if (route) return route;
    return findRoute(this.name, destination, options);
};

/**
 * Show pathing matrix
 * @param destination
 * @param tunnel
 * @returns {*|boolean|boolean|void|string}
 */
Creep.prototype.showMatrix = function (destination, tunnel = undefined) {
    let options = {};
    options.tunnel = tunnel
    options.showMatrix = true;
    return shibMove(this, destination, options);
};

let routeSafetyCache = {};
/**
 * Check if route is safe
 * @param destination
 * @param maxThreat
 * @param maxHeat
 * @param range
 * @returns {*|boolean}
 */
Room.prototype.routeSafe = function (destination = this.name, maxThreat = 2, maxHeat = 1000, range = 20) {
    if (routeSafetyCache[this.name + '.' + destination] && routeSafetyCache[this.name + '.' + destination].expire > Game.time) return routeSafetyCache[this.name + '.' + destination].status;
    let route = findRoute(this.name, destination);
    let state = true;
    if (route && route.length > range) state = false;
    else if (route && route.length) route.forEach(function (r) {
        // Return false for super long routes
        if (INTEL[r] && (INTEL[r].threatLevel >= maxThreat || INTEL[r].roomHeat >= maxHeat || INTEL[r].hostilePower > INTEL[r].friendlyPower)) return state = false;
    })
    let cache = routeSafetyCache[this.name + '.' + destination] || {};
    cache.status = state;
    cache.expire = Game.time + 50;
    routeSafetyCache[this.name + '.' + destination] = cache;
    return state;
};

/**
 * Handle squad movement
 * @param {RoomPosition} [target] - The primary target to flee from, if specific
 * @param {object} [options] - Pathing options
 * @returns {boolean} - Returns true if kiting was performed, false otherwise
 */
Creep.prototype.shibSquadMovement = function (target = undefined, options = {}) {
    if (!this.memory._shibSquadMove) this.memory._shibSquadMove = {};
    options.squad = true;

    target = normalizePos(target);
    const targetKey = getPosKey(target);

    // Check if the target hasn't change and we still have a path
    if (this.memory._shibSquadMove.target === targetKey && this.memory._shibSquadMove.path && this.memory._shibSquadMove.path.length) {
        if (squadMove(this, this.memory._shibSquadMove.path)) return true; else return false;
    }

    const origin = this.pos;
    this.memory._shibSquadMove.target = targetKey;

    let allowedRooms;
    const range = Game.map.getRoomLinearDistance(this.room.name, target.roomName)
    if (range > 2) {
        let route = findRoute(origin.roomName, target.roomName, options);
        if (route) {
            // If the current room name is missing, add it to the front
            if (!route.includes(this.room.name)) route.unshift(this.room.name);
            allowedRooms = route;
        }
    }
    // If no route/allowed rooms got set, use the current room and neighbors
    if (!allowedRooms) allowedRooms = [origin.roomName].concat(Object.values(Game.map.describeExits(origin.roomName)));

    // Prepare pathfinding options
    options = getMoveWeight(this, options);

    let result = PathFinder.search(this.pos, target, {
        maxOps: DEFAULT_MAXOPS * range,
        maxRooms: allowedRooms.length * 1.5,
        heuristicWeight: options.heuristicWeight,
        roomCallback: function (roomName) {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            return getMatrix(roomName, this, options);
        }
    });

    // If a path is found, move the creep
    if (result.path.length > 0) {
        if (squadMove(this, serializePath(this.pos, result.path))) return true;
    }

    return false;
};

/**
 * Handle squad kiting
 * @param {number} [fleeRange=FLEE_RANGE] - The minimum range to keep from threats
 * @param {object} [options] - Pathing options
 * @returns {boolean} - Returns true if kiting was performed, false otherwise
 */
Creep.prototype.shibSquadKite = function (fleeRange = FLEE_RANGE, options = {}) {
    if (!this.memory._shibSquadMove) this.memory._shibSquadMove = {};
    options.squad = true;

    // Gather threats to avoid
    let threats = gatherThreats(this, fleeRange);

    // Use pathfinder to flee from threats
    let fleeGoals = threats.map(a => ({pos: a.pos, range: fleeRange + 2}));
    let result = PathFinder.search(this.pos, fleeGoals, {
        flee: true,
        swampCost: 180,
        plainCost: 3,
        maxRooms: 2,
        roomCallback: roomName => getMatrix(roomName, this, options)
    });

    // If a path is found, move the creep
    if (result.path.length > 0) {
        if (squadMove(this, serializePath(this.pos, result.path))) return true;
    }

    return false;
};

function squadMove(creep, path) {
    const move = parseInt(path[0], 10);
    path = path.slice(1);
    if (creep.memory.squadMembers) {
        // Check if all squad members will be able to move
        let blocked = false;
        if (creep.memory.groupUp) {
            for (let member of creep.memory.squadMembers) {
                let memberCreep = Game.getObjectById(member);
                const posAtDirection = memberCreep.pos.positionAtDirection(move);
                if (!posAtDirection || !(posAtDirection instanceof RoomPosition)) continue;
                const creepAtPos = posAtDirection.checkForCreep();
                if ((creepAtPos && !creepAtPos.my) || posAtDirection.checkForImpassible(false, true)) {
                    blocked = true;
                    break;
                }
            }
        }
        if (!blocked) {
            creep.move(move);
            for (let member of creep.memory.squadMembers) {
                let memberCreep = Game.getObjectById(member);
                if (memberCreep && memberCreep.pos.getRangeTo(creep) <= 1) {
                    const posAtDirection = memberCreep.pos.positionAtDirection(move);
                    if (!posAtDirection || !(posAtDirection instanceof RoomPosition)) continue;
                    if (posAtDirection.checkForImpassible(false, true)) {
                        memberCreep.shibMove(creep, {range: 0});
                    } else memberCreep.move(move);
                }
            }
        } else {
            creep.memory.findRegroup = true;
            creep.memory._shibSquadMove = undefined;
            return false;
        }
    }
    creep.memory._shibSquadMove.path = path;
    return true;
}

/**
 * Handle kiting with optimized movement and target avoidance
 * @param {number} [fleeRange=FLEE_RANGE] - The minimum range to keep from threats
 * @param {Creep|Structure} [target] - The primary target to flee from, if specific
 * @returns {boolean} - Returns true if kiting was performed, false otherwise
 */
Creep.prototype.shibKite = function (fleeRange = FLEE_RANGE, target = undefined) {
    // Handle squad kiting
    if (this.memory.squadMembers) return this.shibSquadKite(fleeRange);

    // Early exit if kiting isn't possible or necessary
    if (!this.hasActiveBodyparts(MOVE) || (this.room.controller && this.room.controller.safeMode) || this.pos.checkForRampart()) {
        return false;
    }

    // Gather threats to avoid
    let threats = gatherThreats(this, fleeRange);
    if (!threats.length) return false;

    this.memory.kiteRoom = this.memory.room;

    // Prepare pathfinding options
    let options = getMoveWeight(this);

    // Use pathfinder to flee from threats
    let fleeGoals = threats.map(a => ({pos: a.pos, range: fleeRange + 2}));
    let result = PathFinder.search(this.pos, fleeGoals, {
        flee: true,
        swampCost: 180,
        plainCost: 3,
        maxRooms: 2,
        roomCallback: roomName => getMatrix(roomName, this, options)
    });

    // If a path is found, move the creep
    if (result.path.length > 0) {
        let direction = this.pos.getDirectionTo(result.path[0]);
        this.move(direction);
        return true;
    }

    return false;
};

// Helper to gather threats in the vicinity
function gatherThreats(creep, fleeRange) {
    return creep.room.find(FIND_HOSTILE_CREEPS, {
        filter: (c) => !_.includes(FRIENDLIES, c.owner.username) &&
            (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) &&
            creep.pos.getRangeTo(c) <= fleeRange + 1
    }).concat(creep.pos.findInRange(FIND_STRUCTURES, fleeRange + 1, {
        filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR &&
            s.ticksToSpawn && s.ticksToSpawn <= fleeRange + 2
    }));
}
