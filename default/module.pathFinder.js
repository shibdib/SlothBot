/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const DEFAULT_MAXOPS = 3000;
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
let globalPathCache = CACHE.globalPathCache = {};
let globalRouteCache = CACHE.globalRouteCache = {};

function shibMove(creep, heading, options = {}, pathOnly = false) {
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
        heuristicWeight: 3
    });

    if (pathOnly) {
        const cached = getPath(creep, origin, target);
        if (cached) return cached;
        return PathFinder.search(origin, {pos: target, range: options.range}, {
            maxOps: options.maxOps,
            maxRooms: options.maxRooms,
            heuristicWeight: options.heuristicWeight,
            roomCallback: function (roomName) {
                return getMatrix(roomName, creep, options);
            },
        });
    }

    // Reset path in SK rooms if necessary
    if (INTEL[creep.room.name] && INTEL[creep.room.name].sk && (!skMatrixCache[creep.room.name] || skMatrixCache[creep.room.name].tick + 150 < Game.time)) {
        options.useCache = false;
        creep.memory._shibMove = undefined;
    }

    // Store source keeper
    if (creep.memory.keeper) options.ignoreKeeper = creep.memory.keeper;

    // Handle towing scenarios
    handleTowing(creep);

    // Handle fatigue or invalid heading
    if (!creep.className && creep.hasActiveBodyparts(MOVE) && (creep.fatigue > 0 || !heading)) {
        if (!creep.memory.military) creep.idleFor(1);
        return creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'black'});
    }

    // Handle re-pathing
    if (creep.memory.repathing) heading = handleRepathing(creep, heading, options);

    // Reset path memory if target has changed
    if (!isValidPathMemory(creep.memory._shibMove, target)) {
        creep.memory._shibMove = {};
    }

    // Adjust heuristic for certain structures
    if (heading instanceof StructureContainer || heading instanceof StructureStorage || heading instanceof StructureTerminal || heading instanceof Source) {
        options.heuristicWeight = 1;
    }

    // Clear path if stuck
    if (creep.memory._shibMove && creep.memory._shibMove.pathPosTime && creep.memory._shibMove.pathPosTime >= STATE_STUCK) {
        if (!creepBumping(creep, creep.memory._shibMove, options)) return false;
    }

    // Execute existing path if available
    if (creep.memory._shibMove && creep.memory._shibMove.path && creep.memory._shibMove.path.length && !options.getPath) {
        return executePath(creep, creep.memory._shibMove, options, origin, heading);
    }

    // Request towing if necessary
    if (!creep.className && handleTowRequest(creep, heading, options)) {
        return true;
    }

    // If tunneling, increase ops
    if (options.tunnel) options.maxOps = 15000;

    // Show matrix
    if (options.showMatrix) return getMatrix(creep.room.name, creep, options);

    // Handle portal
    if (options.portal) {
        heading = handlePortal(creep, heading, options);
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

    // Check if target moved
    if (creep.memory._shibMove && creep.memory._shibMove.target && (creep.memory._shibMove.target.x !== target.x || creep.memory._shibMove.target.y !== target.y) && creep.room.name === target.roomName) {
        creep.memory._shibMove.path = undefined;
    }

    // Set var
    let pathInfo = creep.memory._shibMove;
    pathInfo.targetRoom = target.roomName;

    // Execute path if target is valid and path is set
    if (pathInfo.path && pathInfo.path.length && !options.getPath) {
        return executePath(creep, pathInfo, options, origin, heading);
    } else {
        return shibPath(creep, heading, pathInfo, origin, target, options);
    }
}

function handleTowing(creep) {
    if (creep.memory.towDestination && creep.memory.towCreep) {
        let towCreep = Game.getObjectById(creep.memory.towCreep);
        if (!towCreep) {
            creep.memory.towCreep = undefined;
        } else {
            return;
        }
    }
}

function handleRepathing(creep, heading, options) {
    if (creep.memory.repathing !== creep.room.name) {
        heading = new RoomPosition(25, 25, creep.memory.repathing);
        options.range = 23;
    } else {
        creep.memory.repathing = undefined;
        creep.memory._shibMove = undefined;
    }
    return heading;
}

function isValidPathMemory(pathMemory, target) {
    return pathMemory && pathMemory.target && pathMemory.targetRoom === target.roomName && pathMemory.target.x === target.x && pathMemory.target.y === target.y;
}

function handleTowRequest(creep, heading, options) {
    if (creep.memory.willNeedTow === undefined) {
        creep.memory.willNeedTow = _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length / 2 > _.filter(creep.body, (p) => p.type === MOVE).length;
    }
    if (creep.memory.willNeedTow && (creep.pos.getRangeTo(heading) > 3 || !creep.hasActiveBodyparts(MOVE))) {
        if (!creep.memory.towDestination) {
            creep.memory.towDestination = heading.id || heading;
            creep.memory.towOptions = options;
        } else if (heading.id && creep.hasActiveBodyparts(MOVE) && creep.pos.isNearTo(heading)) {
            creep.memory.towDestination = undefined;
        } else if (creep.pos.isNearTo(heading) && ((heading instanceof RoomPosition && heading.checkForCreep()) || (heading.pos && heading.pos.checkForCreep()))) {
            creep.memory.towDestination = undefined;
        }
        if (!creep.memory.towCreep || !Game.getObjectById(creep.memory.towCreep)) {
            let towTruck = findTowTruck(creep);
            if (towTruck) {
                creep.memory.towCreep = towTruck.id;
                towTruck.memory.trailer = creep.id;
            }
        }
        return true;
    }
    return false;
}

function findTowTruck(creep) {
    let towTrucks = _.filter(creep.room.creeps, (c) => c.getActiveBodyparts(MOVE) >= creep.body.length * 0.5 && !_.sum(c.store) && !c.memory.trailer);
    if (!towTrucks.length) {
        towTrucks = _.filter(creep.room.creeps, (c) => c.getActiveBodyparts(MOVE) >= 2 && !_.sum(c.store) && !c.memory.trailer);
    }
    return creep.pos.findClosestByRange(towTrucks);
}

function handlePortal(creep, heading, options) {
    if (options.portal) {
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
    return heading;  // Return the potentially modified heading
}

function executePath(creep, pathInfo, options, origin, heading) {
    // Update path if the creep has already moved to the next position
    if (pathInfo.newPos &&
        pathInfo.newPos.x === creep.pos.x &&
        pathInfo.newPos.y === creep.pos.y &&
        pathInfo.newPos.roomName === creep.pos.roomName) {
        pathInfo.path = pathInfo.path.slice(1);
    }

    let nextDirection = parseInt(pathInfo.path[0], 10);
    if (nextDirection && pathInfo.newPos) {
        pathInfo.newPos = origin.positionAtDirection(nextDirection);
        let currentPosKey = creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName;

        if (pathInfo.pathPos === currentPosKey && pathInfo.newPos) {
            handleObstacle(creep, pathInfo, options);
        } else {
            // Reset path position tracking
            pathInfo.pathPos = currentPosKey;
            pathInfo.pathPosTime = 0;
        }

        creep.memory._shibMove = pathInfo;
        handleMovement(creep, nextDirection);
    } else {
        checkIfTargetReached(creep, options, heading);
        delete pathInfo.path;
        return false;
    }
}

function handleObstacle(creep, pathInfo, options) {
    if (pathInfo.newPos.checkForBarrierStructure() &&
        (!INTEL[pathInfo.newPos.roomName] ||
            !INTEL[pathInfo.newPos.roomName].owner ||
            !FRIENDLIES.includes(INTEL[pathInfo.newPos.roomName].owner))) {
        let barrier = pathInfo.newPos.checkForBarrierStructure();
        if (canHandleBarrier(creep, options, barrier, pathInfo)) {
            manageBarrier(creep, barrier, pathInfo);
        } else {
            creep.memory._shibMove = undefined; // Clear path if we can't handle the barrier
        }
    }
    pathInfo.pathPosTime++;
}

function canHandleBarrier(creep, options, barrier, pathInfo) {
    return (options.tunnel ||
            creep.hasActiveBodyparts(ATTACK) ||
            creep.hasActiveBodyparts(WORK) ||
            creep.hasActiveBodyparts(RANGED_ATTACK)) &&
        barrier && pathInfo.path;
}

function manageBarrier(creep, barrier, pathInfo) {
    creep.memory._shibMove.pathPosTime = 0;
    if (creep.hasActiveBodyparts(ATTACK) && creep.attack(barrier) === OK) return;
    if (creep.hasActiveBodyparts(WORK) && creep.dismantle(barrier) === OK) return;
    if (creep.rangedAttack(barrier) === OK) return;

    // If no attack/dismantle/ranged attack possible, set up trailer for clearing
    creep.memory.barrierClearing = barrier.id;
    let trailer = Game.getObjectById(creep.memory.trailer);
    if (trailer) {
        trailer.memory.barrierClearing = barrier.id;
        trailer.memory.towDestination = barrier.id;
    }
}

function handleMovement(creep, nextDirection) {
    switch (creep.move(nextDirection)) {
        case OK:
        case ERR_TIRED:
        case ERR_NO_BODYPART:
            return;
        case ERR_BUSY:
            creep.idleFor(10);
    }
}

function checkIfTargetReached(creep, options, heading) {
    if (!options.flee && creep.pos.inRangeTo(heading, options.range)) {
        creep.memory.towDestination = undefined;
        creep.memory._shibMove = undefined;
    }
}

function shibPath(creep, heading, pathInfo, origin, target, options = {}) {
    // Early return if target is adjacent
    if (creep.pos.isNearTo(heading) && options.range === 0) {
        creep.memory._shibMove = undefined;
        return creep.move(creep.pos.getDirectionTo(heading));
    }

    pathInfo.pathOptions = options;
    if (!target) return creep.moveRandom();

    let cached;
    if (options.useCache && (!INTEL[creep.room.name] || !INTEL[creep.room.name].threatLevel) && !options.tunnel) {
        cached = getPath(creep, origin, target, pathInfo);
    }

    if (cached && options.ignoreCreeps) {
        return useCachedPath(creep, pathInfo, cached);
    }

    return findNewPath(creep, origin, target, pathInfo, options);
}

function useCachedPath(creep, pathInfo, cached) {
    pathInfo.findAttempt = undefined;
    pathInfo.target = pathInfo.target || pathInfo.pathOptions.target;
    pathInfo.path = cached;
    pathInfo.usingCached = true;
    pathInfo.newPos = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
    creep.memory._shibMove = pathInfo;

    return moveCreep(creep, parseInt(pathInfo.path[0], 10));
}

function findNewPath(creep, origin, target, pathInfo, options) {
    let roomDistance = getRoomDistance(origin, target);
    options.maxOps = calculateMaxOps(roomDistance);

    let allowedRooms = getAllowedRooms(pathInfo, creep, roomDistance, origin, target, options);
    if (!allowedRooms) return false;

    let callback = function (roomName) {
        if (allowedRooms && !_.includes(allowedRooms, roomName)) return false;
        return getMatrix(roomName, creep, options);
    };

    let ret = PathFinder.search(origin, {pos: target, range: options.range}, {
        maxOps: options.maxOps,
        maxRooms: allowedRooms ? allowedRooms.length + 1 : 2,
        heuristicWeight: options.heuristicWeight,
        roomCallback: callback,
    });

    return handlePathResult(creep, pathInfo, ret, origin, target, options, roomDistance);
}

function getRoomDistance(origin, target) {
    return origin.roomName !== target.roomName ? Game.map.getRoomLinearDistance(origin.roomName, target.roomName) : 0;
}

function calculateMaxOps(roomDistance) {
    return roomDistance ? DEFAULT_MAXOPS * (roomDistance + 2) : DEFAULT_MAXOPS;
}

function getAllowedRooms(pathInfo, creep, roomDistance, origin, target, options) {
    if (roomDistance) {
        let route = findRoute(origin.roomName, target.roomName, options);
        if (!route) {
            return handleNoPathScenario(creep, pathInfo, origin, target, options);
        }
        if (!_.includes(route, creep.room.name)) route.unshift(creep.room.name);
        let immediateArea = expandRoomArea(creep.room.name);
        return _.uniq(route.concat(immediateArea));
    }
    return (pathInfo.route || options.route || [origin.roomName].concat(_.map(Game.map.describeExits(origin.roomName))));
}

function expandRoomArea(roomName) {
    let exits = Game.map.describeExits(roomName);
    if (!exits) return [];
    return _.uniq(_.flatten(_.map(exits, function (r) {
        let furtherExits = Game.map.describeExits(r);
        return furtherExits ? furtherExits : [];
    })));
}

function handleNoPathScenario(creep, pathInfo, origin, target, options) {
    let exitDir = Game.map.findExit(origin.roomName, pathInfo.targetRoom);
    if (exitDir === ERR_NO_PATH) {
        let nextRoom = Game.map.findRoute(origin.roomName, pathInfo.targetRoom)[0];
        exitDir = Game.map.findExit(target.roomName, nextRoom);
        if (exitDir === ERR_NO_PATH) {
            return creep.moveTo(target);
        }
    }
    let exit = creep.pos.findClosestByPath(exitDir);
    target = normalizePos(exit);
    delete pathInfo.path;
    options.useFindRoute = false;
    options.range = 0;
    return shibPath(creep, target, pathInfo, origin, target, options);
}

function handlePathResult(creep, pathInfo, ret, origin, target, options, roomDistance) {
    if (ret.incomplete) {
        return handleIncompletePath(creep, pathInfo, ret, origin, target, options, roomDistance);
    }
    if (options.confirmPath && ret.path) return ret.path; // Return path if path confirmation is requested

    pathInfo.path = serializePath(creep.pos, ret.path);
    let nextDirection = parseInt(pathInfo.path[0], 10);
    pathInfo.newPos = creep.pos.positionAtDirection(nextDirection);
    pathInfo.target = target;
    if (options.ignoreCreeps && !options.ignoreStructures) cachePath(creep, origin, target, pathInfo);
    delete pathInfo.findAttempt;

    if (options.getPath) return creep.memory.getPath = pathInfo.path;
    creep.memory._shibMove = pathInfo;

    return moveCreep(creep, nextDirection);
}

function handleIncompletePath(creep, pathInfo, ret, origin, target, options, roomDistance) {
    if (!creep.memory.badPathing && roomDistance) {
        options.maxOps = DEFAULT_MAXOPS * (roomDistance + 5);
        creep.memory.badPathing = 1;
        if (origin.roomName !== target.roomName) {
            deleteRoute(origin.roomName, target.roomName);
            deleteRoute(creep.roomName, target.roomName);
            log.e(`Creep ${creep.name} in ${roomLink(creep.room.name)} could not find a path from ${creep.pos.x}.${creep.pos.y}.${creep.pos.roomName} to ${target.x}.${target.y}.${target.roomName} retrying.`, "PATHING ERROR:");
        }
        return shibPath(creep, pathInfo.target || pathInfo.pathOptions.target, pathInfo, origin, target, options);
    } else if (creep.memory.badPathing) {
        creep.memory.badPathing++;
        if (creep.memory.badPathing > 8) {
            // Handle stuck creep logic here
            return handleStuckCreep(creep, ret, options);
        } else if (creep.memory.badPathing >= 3) {
            creep.memory.repathing = Game.map.describeExits(creep.room.name)[Game.map.findExit(creep.room.name, creep.memory.destination)];
        }
    } else {
        creep.memory.badPathing--;
    }
    return false; // Or some default action
}

function handleStuckCreep(creep, ret, options) {
    log.e(`${creep.name} is stuck in ${creep.room.name} and is unable to path. Suiciding for CPU efficiency.`);
    log.e(`Ret - ${JSON.stringify(ret)}`);
    if (creep.memory.military && creep.memory.destination && (Memory.targetRooms[creep.memory.destination] || Memory.auxiliaryTargets[creep.memory.destination])) {
        delete Memory.targetRooms[creep.memory.destination];
        delete Memory.auxiliaryTargets[creep.memory.destination];
        delete INTEL[creep.memory.destination];
        log.a(`Canceling operation in ${roomLink(creep.memory.destination)} as we cannot find a path.`, 'HIGH COMMAND: ');
    }
    return creep.suicide();
}

function moveCreep(creep, direction) {
    switch (creep.move(direction)) {
        case OK:
        case ERR_TIRED:
            return true;
        case ERR_NO_BODYPART:
            return false;
        case ERR_BUSY:
            creep.idleFor(10);
            return false;
        default:
            return false;
    }
}

function findRoute(origin, destination, options = {}) {
    // Handle same room edge case
    if (origin === destination) return [origin];

    // Default options
    _.defaults(options, {
        useCache: true,
    });

    let route;
    if (options.useCache && !options.distance) {
        route = getRoute(origin, destination);
        if (route === 'failed') return [];
        if (route) return route;
    }

    options.portal = undefined;
    let portalRoom;
    const roomDistance = Game.map.getRoomLinearDistance(origin, destination);

    if (roomDistance > 12) {
        portalRoom = _.find(INTEL, r => r.portal &&
            Game.map.getRoomLinearDistance(origin, r.name) < 10 &&
            Game.map.getRoomLinearDistance(r.portal, destination) < 10);

        if (portalRoom && portalRoom.name) {
            options.portal = portalRoom.name;
            options.portalDestination = INTEL[portalRoom.name].portal;
            options.originalDestination = destination;
            options.portalDistance = Game.map.getRoomLinearDistance(INTEL[portalRoom.name].portal, destination);
            destination = portalRoom.name;
        } else if (roomDistance > 20) {
            return;
        }
    }

    route = routeLogic(origin, destination, roomDistance, portalRoom);

    // Handle route caching and operations
    if (route && route.length) {
        if (options.originalDestination) destination = options.originalDestination;
        cacheRoute(origin, destination, route);
    } else {
        cacheRoute(origin, destination, undefined, true);
        const isTargetRoom = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
        if (isTargetRoom) {
            delete Memory.targetRooms[destination];
            delete Memory.auxiliaryTargets[destination];
            delete INTEL[destination];
            log.a(`Canceling operation in ${roomLink(destination)} as we cannot find a route.`, 'HIGH COMMAND: ');
        }
        log.a(`No route found between ${roomLink(origin)} and ${roomLink(destination)}`, 'PATHING:');
    }

    return route;
}

function routeLogic(origin, destination, roomDistance, portalRoom) {
    // If destination is a direct neighbor, return direct path
    if (Object.values(Game.map.describeExits(origin)).includes(destination)) {
        return [origin, destination];
    }

    let portalRoute, start;
    // Get portal room route if needed
    if (portalRoom) {
        portalRoute = routeLogic(origin, portalRoom.name, roomDistance);
        start = portalRoute ? INTEL[portalRoom.name].portal : portalRoom.name;
    } else {
        start = origin;
    }

    let routeSearch = Game.map.findRoute(start, destination, {
        routeCallback: function (roomName) {
            // Skip origin/destination
            if (roomName === origin || roomName === destination) return 1;

            // Check room status
            let status = roomStatus(roomName);
            if (status === 'closed') return Infinity; // Use Infinity for impassable rooms

            let matches = roomName.match(/\d+/);
            let EW = matches ? matches[0] : '0';
            let NS = matches ? matches[1] || EW : '0'; // If only one match, use it for both EW and NS
            let highway = (INTEL[roomName] && INTEL[roomName].isHighway) || EW % 10 === 0 || NS % 10 === 0;

            // Room type checks
            if (!highway && status !== roomStatus(origin)) return Infinity;
            if (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) return 1; // My rooms

            // Check for avoid flagged rooms
            if (Memory.avoidRooms && Memory.avoidRooms.includes(roomName)) return 250;

            if (INTEL[roomName]) {
                let intel = INTEL[roomName];
                if (intel.user && FRIENDLIES.includes(intel.user)) return 5; // Friendly Rooms
                if (intel.pathingPenalty && intel.pathingPenalty + CREEP_LIFE_TIME > Game.time) {
                    return intel.pathingPenalty; // Use penalty directly if still valid
                } else if (intel.pathingPenalty) {
                    delete intel.pathingPenalty; // Clear old penalty
                }
                if (intel.obstacles) return 250; // Avoid rooms with obstacles
                if (intel.sk && intel.towers) return Infinity; // Avoid strongholds
                if (intel.threatLevel) return 60 * intel.threatLevel; // High Threat
                if (intel.user && !FRIENDLIES.includes(intel.user)) {
                    return intel.towers ? Infinity : 75; // Avoid rooms used by others
                }
                if (intel.obstructions) return 200; // Room with observed obstructions
                if (intel.hostilePower > intel.friendlyPower && intel.tickDetected + 150 > Game.time) return 100; // Room under attack
                if (intel.sk && intel.user !== MY_USERNAME) return 25; // Avoid SK rooms if not being mined
            } else {
                return 10; // Default cost for rooms without intel
            }

            // Highway
            if (highway) return 5;
            return 7; // Default cost for normal rooms
        }
    });

    let path = [];
    if (portalRoom && portalRoute && portalRoute.length) {
        path.push(origin);
        portalRoute.forEach((r) => path.push(r));
    } else if (portalRoom && portalRoom.name === origin) {
        path.push(portalRoom.name);
    }
    if (routeSearch.length) {
        routeSearch.forEach((r) => path.push(r.room));
    }
    if (path.length) {
        if (roomDistance > 2 && path[1] === destination) {
            path.splice(1, 1);
        }
        return path;
    } else {
        return undefined;
    }
}

//FUNCTIONS
function creepBumping(creep, pathInfo, options = {}) {
    if (!pathInfo.newPos) return creep.moveRandom();

    const nextPosition = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
    if (!nextPosition) return creep.moveRandom();

    const bumpCreep = nextPosition.lookFor(LOOK_CREEPS).find(c => c.my && !c.fatigue && (!c.memory.other || !c.memory.other.stationary));

    if (bumpCreep) {
        handleBump(creep, bumpCreep);
        return true;
    } else {
        // Visual feedback for no bump situation
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
    }

    // Clear path memory if no bump occurred
    delete creep.memory._shibMove;
    creep.moveRandom();
    return false;

    function handleBump(creep, bumpCreep) {
        if (!creep.className && !creep.memory.trailer) {
            if (bumpCreep.hasActiveBodyparts(MOVE)) {
                bumpCreep.move(bumpCreep.pos.getDirectionTo(creep));
            } else {
                creep.pull(bumpCreep);
                bumpCreep.move(bumpCreep.pos.getDirectionTo(creep));
            }
            creep.move(creep.pos.getDirectionTo(bumpCreep));
        } else {
            bumpCreep.moveRandom();
            creep.move(creep.pos.getDirectionTo(bumpCreep));
        }
        bumpCreep.say(ICONS.traffic, true);

        // Reset bump creep's pathfinding memory
        if (bumpCreep.memory._shibMove) {
            bumpCreep.memory._shibMove.path = undefined;
            bumpCreep.memory._shibMove.pathPosTime = undefined;
        }
        bumpCreep.memory.blocked = Game.time;
    }
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

function getMatrix(roomName, creep, options = {}) {
    let room = Game.rooms[roomName];
    let matrix = getTerrainMatrix(roomName, options);

    if (!options.ignoreStructures) matrix = getStructureMatrix(roomName, creep, matrix, options);
    if (room && !options.ignoreCreeps) matrix = getCreepMatrix(roomName, creep, matrix, options);
    if (room) matrix = getStationaryCreepsMatrix(roomName, creep, matrix, options);

    // Check if we need to apply hostile and outside hub matrices
    if (creep instanceof Creep && room && room.hostileCreeps.length) {
        let shouldAvoid = creep.className || (!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(RANGED_ATTACK)) || options.avoidEnemies;
        if (shouldAvoid) {
            matrix = getHostileMatrix(roomName, matrix, options);
            matrix = getOutsideHubMatrix(roomName, matrix, options);
        }
    }

    return getSKMatrix(roomName, matrix, options);
}

function getTerrainMatrix(roomName, options = {}) {
    let type = determineMatrixType(options);
    if (!terrainMatrixCache[roomName + type] || options.showMatrix) {
        terrainMatrixCache[roomName + type] = {
            matrix: addTerrainToMatrix(roomName, type).serialize(),
            tick: Game.time
        };
    }
    return PathFinder.CostMatrix.deserialize(terrainMatrixCache[roomName + type].matrix);

    function determineMatrixType(options) {
        return options.offRoad || options.tunnel ? 3 : (options.ignoreRoads ? 2 : 1);
    }

    function addTerrainToMatrix(roomName, type) {
        let matrix = new PathFinder.CostMatrix();
        let terrain = Game.map.getRoomTerrain(roomName);

        // Define costs based on type
        let {plainCost, swampCost} = getCosts(type);

        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                let tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) matrix.set(x, y, 256);
                // Handle exits
                else if (isExit(x, y)) matrix.set(x, y, 10);
                else matrix.set(x, y, tile === TERRAIN_MASK_SWAMP ? swampCost : plainCost);
            }
        }
        return matrix;
    }

    function getCosts(type) {
        switch (type) {
            case 2:
                return {plainCost: 1, swampCost: 25};
            case 3:
            case 4:
                return {plainCost: 0, swampCost: 0};
            default:
                return {plainCost: 5, swampCost: 25};
        }
    }

    function isExit(x, y) {
        return x === 0 || x === 49 || y === 0 || y === 49;
    }
}

function getStructureMatrix(roomName, creep, matrix = new PathFinder.CostMatrix(), options = {}) {
    let room = Game.rooms[roomName];
    let type = determineMatrixType(options);

    // If room not visible, return cached or default matrix
    if (!room) {
        return structureMatrixCache[roomName + type]
            ? PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type])
            : matrix;
    }

    // Check if matrix should be recalculated
    if (shouldRecalculateMatrix(roomName, type, room, options)) {
        matrix = addStructuresToMatrix(room, creep, matrix, type, options);
        structureMatrixCache[roomName + type] = {
            matrix: matrix.serialize(),
            tick: Game.time,
            count: room.structures.length
        };
    }

    return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type].matrix);

    function determineMatrixType(options) {
        return options.tunnel ? 4 : (options.offRoad ? 3 : (options.ignoreRoads ? 2 : 1));
    }

    function shouldRecalculateMatrix(roomName, type, room, options) {
        let cache = structureMatrixCache[roomName + type];
        return !cache || options.showMatrix || options.tunnel ||
            Game.time > (cache.tick + (CREEP_LIFE_TIME * 25)) ||
            cache.count !== room.structures.length;
    }

    function addStructuresToMatrix(room, creep, matrix, type, options) {
        if (!room) return matrix;
        let roadCost = type === 2 || type === 3 ? 2 : 1;
        let noWallWrecker = (creep instanceof Creep && creep.memory.wallWrecker && !creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(WORK)) ||
            (INTEL[room.name] && FRIENDLIES.includes(INTEL[room.name].owner));

        room.structures.forEach(structure => {
            const obstacle = structure.pos.checkForObstacleStructure();
            switch (structure.structureType) {
                case STRUCTURE_WALL:
                    matrix.set(structure.pos.x, structure.pos.y, noWallWrecker ? 256 : 150);
                    break;
                case STRUCTURE_PORTAL:
                    matrix.set(structure.pos.x, structure.pos.y, 150);
                    break;
                case STRUCTURE_CONTROLLER:
                    matrix.set(structure.pos.x, structure.pos.y, 256);
                    break;
                case STRUCTURE_RAMPART:
                    if (structure.my || structure.isPublic) {
                        if (!obstacle && room.hostileCreeps.length) matrix.set(structure.pos.x, structure.pos.y, roadCost);
                    } else if (FRIENDLIES.includes(structure.owner.username) && !obstacle) {
                        matrix.set(structure.pos.x, structure.pos.y, 250);
                    } else {
                        matrix.set(structure.pos.x, structure.pos.y, noWallWrecker ? 256 : 150);
                    }
                    break;
                case STRUCTURE_CONTAINER:
                    matrix.set(structure.pos.x, structure.pos.y, 75);
                    break;
                case STRUCTURE_ROAD:
                    if (!obstacle && !structure.pos.checkForContainer()) matrix.set(structure.pos.x, structure.pos.y, roadCost);
                    break;
                default:
                    if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                        matrix.set(structure.pos.x, structure.pos.y, 256);
                    }
            }
        });

        // Handle construction sites
        room.constructionSites.filter(site =>
            (site.my && !['STRUCTURE_CONTAINER', 'STRUCTURE_ROAD', 'STRUCTURE_RAMPART'].includes(site.structureType)) ||
            (!site.my && FRIENDLIES.includes(site.owner.username))
        ).forEach(site => matrix.set(site.pos.x, site.pos.y, 256));

        // Handle sources and minerals
        [...room.sources, room.mineral].filter(Boolean).forEach(source => matrix.set(source.pos.x, source.pos.y, 256));

        // Handle tunnel/finding lowest wall/ramp path
        if (type === 4) {
            let barriers = room.structures.filter(s => ['STRUCTURE_WALL', 'STRUCTURE_RAMPART'].includes(s.structureType));
            if (barriers.length) {
                let maxHp = Math.max(...barriers.map(s => s.hits));
                barriers.forEach(s => {
                    let cost = Math.floor((s.hits / maxHp) * 50);
                    matrix.set(s.pos.x, s.pos.y, cost);
                    if (options.showMatrix) new RoomVisual(room.name).text(Math.floor((s.hits / maxHp) * 100), s.pos.x, s.pos.y, {
                        color: 'white',
                        font: 0.4
                    });
                });
            }
        }

        return matrix;
    }
}

function getCreepMatrix(roomName, creep, matrix = new PathFinder.CostMatrix(), options = {}) {
    let room = Game.rooms[roomName];
    if (!room || !(creep instanceof Creep)) return matrix;

    if (!creepMatrixCache[roomName] || options.showMatrix || Game.time !== creepMatrixCache[roomName].tick) {
        matrix = addCreepsToMatrix(room, matrix, creep, options);
        creepMatrixCache[roomName] = {
            matrix: matrix.serialize(),
            tick: Game.time
        };
    }

    return PathFinder.CostMatrix.deserialize(creepMatrixCache[roomName].matrix);

    function addCreepsToMatrix(room, matrix, creep = undefined, options) {
        if (!room) return matrix;

        let creeps = room.creeps;

        // If no hostile creeps and we have a specific creep, only check nearby creeps
        if (!room.hostileCreeps.length && creep) {
            creeps = creep.pos.findInRange(FIND_CREEPS, 5).concat(creep.pos.findInRange(FIND_POWER_CREEPS, 5));
        } else {
            // If there are hostile creeps or no specific creep, consider all creeps in the room
            creeps = [...room.creeps, ...room.powerCreeps];
        }

        for (let aCreep of creeps) {
            matrix.set(aCreep.pos.x, aCreep.pos.y, 0xff);
            if (options.showMatrix) {
                new RoomVisual(room.name).text('IMP', aCreep.pos.x, aCreep.pos.y, {
                    color: 'white',
                    font: 0.4
                });
            }
        }

        return matrix;
    }
}

function getStationaryCreepsMatrix(roomName, creep, matrix = new PathFinder.CostMatrix(), options = {}) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;

    if (!stationaryCreepMatrixCache[roomName] || options.showMatrix || Game.time !== stationaryCreepMatrixCache[roomName].tick) {
        matrix = addStationaryCreepsToMatrix(room, matrix, creep, options);
        stationaryCreepMatrixCache[roomName] = {
            matrix: matrix.serialize(),
            tick: Game.time
        };
    }

    return PathFinder.CostMatrix.deserialize(stationaryCreepMatrixCache[roomName].matrix);

    function addStationaryCreepsToMatrix(room, matrix, creep = undefined, options) {
        if (!room) return matrix;

        for (let myCreep of room.myCreeps) {
            if (!myCreep.memory.other) continue; // Optional chaining for cleaner check
            if (myCreep.memory.other.stationary || !myCreep.hasActiveBodyparts(MOVE)) {
                matrix.set(myCreep.pos.x, myCreep.pos.y, 200);
                if (options.showMatrix) {
                    new RoomVisual(room.name).text('IMP', myCreep.pos.x, myCreep.pos.y, {
                        color: 'white',
                        font: 0.4
                    });
                }
            }
        }

        return matrix;
    }
}

function getHostileMatrix(roomName, matrix = new PathFinder.CostMatrix(), options = {}) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;

    if (!hostileMatrixCache[roomName] || options.showMatrix || Game.time !== hostileMatrixCache[roomName].tick) {
        matrix = addHostilesToMatrix(room, matrix, options);
        hostileMatrixCache[roomName] = {
            matrix: matrix.serialize(),
            tick: Game.time
        };
    }

    return PathFinder.CostMatrix.deserialize(hostileMatrixCache[roomName].matrix);

    function addHostilesToMatrix(room, matrix, options) {
        if (!room || (room.controller && room.controller.owner && room.controller.owner.username === MY_USERNAME && room.controller.safeMode)) {
            return matrix;
        }

        const enemyCreeps = room.hostileCreeps.filter(c => !c.className && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
        const range = 4; // Maximum range to apply weights around hostiles

        for (const creep of enemyCreeps) {
            const {x, y} = creep.pos;

            // Set maximum penalty for hostile positions
            matrix.set(x, y, 256);

            // Avoid area around the hostile creep
            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    const posX = x + dx;
                    const posY = y + dy;

                    // Check if position is within room bounds
                    if (posX < 0 || posX >= 50 || posY < 0 || posY >= 50) continue;

                    // Calculate weight based on distance
                    const distance = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance
                    const weight = 10 * (range + 1 - distance);

                    // Avoid overwriting higher penalties already set in the matrix
                    matrix.set(posX, posY, Math.max(matrix.get(posX, posY), weight));
                }
            }
        }

        return matrix;
    }
}

function getOutsideHubMatrix(roomName, matrix = new PathFinder.CostMatrix(), options = {}) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;

    if (!outsideHubMatrixCache[roomName] || options.showMatrix || outsideHubMatrixCache[roomName].tick + 10000 < Game.time) {
        matrix = markOutsideHubAsImpassable(room, matrix);
        outsideHubMatrixCache[roomName] = {
            matrix: matrix.serialize(),
            tick: Game.time
        };
    }

    return PathFinder.CostMatrix.deserialize(outsideHubMatrixCache[roomName].matrix);

    function markOutsideHubAsImpassable(room, matrix) {
        if (!room) return matrix;

        const terrain = new Room.Terrain(room.name);
        const ramparts = room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_RAMPART}});
        const spawn = room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_SPAWN}})[0];

        if (ramparts.length === 0 || !spawn) return matrix; // No hub detected

        const startPos = spawn.pos;
        const queue = [startPos];
        const visited = new Set();
        visited.add(`${startPos.x},${startPos.y}`);

        // Flood-fill to mark accessible tiles within rampart boundaries
        while (queue.length > 0) {
            const pos = queue.shift();

            matrix.set(pos.x, pos.y, 1); // Mark as walkable inside hub

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;

                    const newX = pos.x + dx;
                    const newY = pos.y + dy;

                    if (newX < 0 || newX >= 50 || newY < 0 || newY >= 50) continue;
                    const key = `${newX},${newY}`;

                    if (visited.has(key) || terrain.get(newX, newY) === TERRAIN_MASK_WALL) continue;

                    // Check if the new position is inside or touching a rampart
                    if (ramparts.some(r => r.pos.isNearTo(newX, newY))) {
                        visited.add(key);
                        queue.push(new RoomPosition(newX, newY, room.name));
                    }
                }
            }
        }

        // Mark all unvisited positions as impassable (outside of hub)
        for (let x = 0; x < 50; x++) {
            for (let y = 0; y < 50; y++) {
                if (!visited.has(`${x},${y}`)) {
                    matrix.set(x, y, 255);
                }
            }
        }

        return matrix;
    }
}

function getSKMatrix(roomName, matrix = new PathFinder.CostMatrix(), options = {}) {
    // Early exit if conditions for SK room are not met
    let room = Game.rooms[roomName];
    if (!INTEL[roomName] || !INTEL[roomName].sk || !room) return matrix;

    // Check cache or refresh matrix
    if (!skMatrixCache[roomName] || options.showMatrix || (skMatrixCache[roomName].tick + 150 < Game.time && room)) {
        matrix = addSksToMatrix(room, matrix, options);
        skMatrixCache[roomName] = {
            matrix: matrix.serialize(),
            tick: Game.time
        };
    }
    return PathFinder.CostMatrix.deserialize(skMatrixCache[roomName].matrix);

    function addSksToMatrix(room, matrix, options) {
        // Check if there's active mining in the room
        const activeMining = room.find(FIND_MY_CREEPS, {filter: (c) => c.memory.role === 'SKAttacker' && c.memory.destination === room.name})[0];
        if (!activeMining) {
            let sks = room.find(FIND_CREEPS, {filter: (c) => c.owner.username === 'Source Keeper'});
            if (options.ignoreKeeper) sks = sks.filter(c => c.id !== options.ignoreKeeper);

            if (sks.length) {
                for (let sk of sks) {
                    // Set cost for the SK position itself
                    matrix.set(sk.pos.x, sk.pos.y, 256);
                    // Set costs for surrounding positions
                    setSurroundingCosts(matrix, sk.pos, 7, 250, room.name);
                }
            } else {
                // If no SK, set costs based on keeper lairs, sources, and minerals
                let lairs = room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn && s.ticksToSpawn < 25});
                let avoid = [...lairs, ...room.find(FIND_SOURCES), room.find(FIND_MINERALS)[0]].filter(Boolean);
                for (let entity of avoid) {
                    setSurroundingCosts(matrix, entity.pos, 5, 250, room.name);
                }
            }
        }
        return matrix;
    }

    // Helper function to set costs for surrounding positions
    function setSurroundingCosts(matrix, pos, range, cost, roomName) {
        for (let y = pos.y - range; y <= pos.y + range; y++) {
            for (let x = pos.x - range; x <= pos.x + range; x++) {
                try {
                    let position = new RoomPosition(x, y, roomName);
                    if (position && position.getTerrain() !== 'wall') {
                        matrix.set(x, y, cost);
                    }
                } catch (e) {
                    // Silently fail on out of bounds or other errors
                }
            }
        }
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
    let cache = globalRouteCache || {};
    if (typeof cache !== 'object') cache = {};
    let tick = Game.time;
    cache[key] = {
        route: route,
        failed: failed,
        uses: 1,
        tick: tick,
        created: tick
    };
    globalRouteCache = cache;
}

function getRoute(from, to) {
    if (globalRouteCache) {
        let cachedRoute = globalRouteCache[from + '_' + to];
        if (cachedRoute) {
            if (cachedRoute.tick + (CREEP_LIFE_TIME * 2) > Game.time) {
                if (cachedRoute.failed) return 'failed';
                cachedRoute.uses += 1;
                return cachedRoute.route;
            } else {
                delete globalRouteCache[from + '_' + to];
            }
        }
    }
}

function deleteRoute(from, to) {
    let key = from + '_' + to;
    if (globalRouteCache[key]) delete globalRouteCache[key];
}

function cachePath(creep, from, to, pathInfo) {
    let weight = getMoveWeight(creep, pathInfo.pathOptions);
    let key = getPathKey(from, to, weight);
    globalPathCache[key] = {
        path: pathInfo.path,
        key: key,
        structures: creep.room.structures.length,
        constructionSites: creep.room.constructionSites.length,
        uses: 1,
        tick: Game.time,
        expire: Game.time + (CREEP_LIFE_TIME * 2) // Adjust as needed
    };
}

function getPath(creep, from, to, pathInfo = {}) {
    if (!globalPathCache || !_.size(globalPathCache)) return;
    let weight = getMoveWeight(creep, pathInfo.pathOptions);
    let key = getPathKey(from, to, weight);
    let cachedPath = globalPathCache[key];
    if (!cachedPath) {
        // Check reversed path
        cachedPath = globalPathCache[getPathKey(to, from, weight)];
        if (cachedPath) cachedPath.path = reverseString(cachedPath.path);
    }
    if (cachedPath) {
        if (checkPathValidity(cachedPath, creep)) {
            cachedPath.uses += 1;
            return cachedPath.path;
        } else {
            delete globalPathCache[cachedPath.key];
        }
    }
}

function checkPathValidity(cachedPath, creep) {
    if (!cachedPath.path[0]) return false;
    let room = Game.rooms[cachedPath.path[0].roomName];
    if (!room) return false;

    // Check for major changes in the room
    return !(room.structures.length !== cachedPath.structures ||
        room.constructionSites.length !== cachedPath.constructionSites ||
        Game.time > cachedPath.expire);
}

function reverseString(str) {
    return str.split('').reverse().join('');
}

/**
 * Determines the movement strategy for a creep based on its composition and current load.
 * This function adjusts the movement options to optimize pathfinding for different
 * scenarios such as off-road, ignoring roads, or standard movement.
 *
 * @param {Creep} creep - The creep whose movement options are being adjusted.
 * @param {Object} [options={}] - Existing pathfinding options to be modified.
 * @returns {Object} Updated pathfinding options object with 'offRoad' or 'ignoreRoads' set accordingly.
 */
function getMoveWeight(creep, options = {}) {
    if (!creep || !(creep instanceof Creep)) return options;
    // Check if the creep is a PC or if offRoad is explicitly set
    if (creep.className || options.offRoad) {
        options.offRoad = true;
        return options;
    }

    // Check if ignoreRoads is explicitly set
    if (options.ignoreRoads) {
        return options;
    }

    // Calculate move parts and weight
    const moveParts = creep.getActiveBodyparts(MOVE);
    let weight = creep.body.filter(part => part.type !== MOVE && part.type !== CARRY).length;

    // Add weight for carried resources
    weight += Math.ceil((_.sum(creep.store) || 0) / 50);

    // Initialize or update weight in memory if not present
    if (!creep.memory._shibMove) creep.memory._shibMove = {};
    creep.memory._shibMove.weight = weight;

    // Add weight of trailer if applicable
    if (creep.memory.trailer) {
        const trailer = Game.getObjectById(creep.memory.trailer);
        if (trailer) {
            weight += trailer.body.filter(part => part.type !== MOVE && part.type !== CARRY).length;
        }
    }

    // Determine movement strategy based on move parts vs. weight
    if (moveParts >= weight * 5) {
        options.offRoad = true;
    } else if (moveParts >= weight || (moveParts === weight && COMBAT_ROLES.includes(creep.memory.role))) {
        options.ignoreRoads = true;
    } else {
        options.offRoad = undefined;
        options.ignoreRoads = undefined;
    }

    return options;
}

/**
 * Finds a position within range of multiple targets that is accessible by all.
 *
 * @param {Array} heading - Array of targets to find a common position for.
 * @param {number} range - The range to search around each target.
 * @returns {RoomPosition|undefined} A RoomPosition that's within range of all targets, or undefined if none found.
 */
function findMultiHeadingPos(heading, range) {
    // Use Set for faster lookup of positions
    const allPositions = new Set();

    // Collect all valid positions around each target
    for (let target of heading) {
        const inRange = target.room.lookForAtArea(LOOK_TERRAIN, target.pos.y - range, target.pos.x - range, target.pos.y + range, target.pos.x + range, true);
        for (let {x, y} of inRange) {
            const position = new RoomPosition(x, y, target.room.name);
            if (!position.checkForWall() && !position.checkForImpassible()) {
                allPositions.add(`${x},${y}`); // Store as string for uniqueness
            }
        }
    }

    // Find positions that are common to all targets
    const commonPositions = [];
    for (let posStr of allPositions) {
        const [x, y] = posStr.split(',').map(Number);
        if (heading.every(target => Game.map.getRoomTerrain(target.room.name).get(x, y) !== TERRAIN_MASK_WALL)) {
            if (heading.every(target => target.pos.inRangeTo(x, y, range))) {
                commonPositions.push({x, y});
            }
        }
    }

    // Return the first common position found or undefined
    if (commonPositions.length > 0) {
        const {x, y} = commonPositions[0];
        return new RoomPosition(x, y, heading[0].room.name);
    } else {
        return undefined;
    }
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
 * Check if a route between rooms is safe based on threat, heat, and route length.
 * @param {string} [destination=this.name] - The name of the destination room.
 * @param {number} [maxThreat=2] - Maximum allowed threat level for rooms.
 * @param {number} [maxHeat=1000] - Maximum allowed heat level for rooms.
 * @param {number} [range=20] - Maximum route length considered safe.
 * @returns {boolean} - True if the route is considered safe, false otherwise.
 */
Room.prototype.routeSafe = function (destination = this.name, maxThreat = 2, maxHeat = 1000, range = 20) {
    const cacheKey = `${this.name}.${destination}`;
    const cachedResult = routeSafetyCache[cacheKey];
    if (cachedResult && cachedResult.expire > Game.time) {
        return cachedResult.status;
    }
    let route = findRoute(this.name, destination);
    let isSafe = true;
    if (route.length > range) {
        isSafe = false;
    } else if (route.length) {
        isSafe = route.every(roomName => {
            const intel = INTEL[roomName];
            return intel && intel.threatLevel < maxThreat && intel.roomHeat < maxHeat && intel.hostilePower <= intel.friendlyPower;
        });
    }
    routeSafetyCache[cacheKey] = {
        status: isSafe,
        expire: Game.time + 50
    };
    return isSafe;
};

/**
 * Handle kiting with optimized movement and target avoidance
 * @param {number} [fleeRange=FLEE_RANGE] - The minimum range to keep from threats
 * @param {Creep|Structure} [target] - The primary target to flee from, if specific
 * @returns {boolean} - Returns true if kiting was performed, false otherwise
 */
Creep.prototype.shibKite = function (fleeRange = FLEE_RANGE, target = undefined) {
    // Early exit if kiting isn't possible or necessary
    if (!this.hasActiveBodyparts(MOVE) || (this.room.controller && this.room.controller.safeMode) || this.pos.checkForRampart()) {
        return false;
    }

    // Gather threats to avoid
    let threats = gatherThreats(this, fleeRange);
    if (!threats.length) return false;

    // Indicate fleeing
    this.say('!!RUN!!', true);
    this.memory.kiteRoom = this.memory.room;

    // Prepare pathfinding options
    let options = getMoveWeight(this);

    // Use pathfinder to flee from threats
    let fleeGoals = threats.map(a => ({pos: a.pos, range: fleeRange}));
    let result = PathFinder.search(this.pos, fleeGoals, {
        flee: true,
        swampCost: 75,
        plainCost: 3,
        maxRooms: 2,
        roomCallback: roomName => generateCostMatrix(roomName, this, options)
    });

    // If a path is found, move the creep
    if (result.path.length > 0) {
        let direction = this.pos.getDirectionTo(result.path[0]);
        if (this.memory.squadLeader === this.id) {
            this.memory.squadKite = direction;
        }
        this.memory.lastKite = direction;
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

// Helper to generate the cost matrix for pathfinding
function generateCostMatrix(roomName, creep, options) {
    let matrix = new PathFinder.CostMatrix();
    matrix = getTerrainMatrix(roomName, matrix);
    matrix = getStructureMatrix(roomName, creep, matrix, options);
    matrix = getCreepMatrix(roomName, creep, matrix, options);
    matrix = getHostileMatrix(roomName, matrix, options);
    return getSKMatrix(roomName, matrix, options);
}
