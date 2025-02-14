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
            let towTruck = _.filter(creep.room.myCreeps, (c) => c.getActiveBodyparts(MOVE) >= creep.body.length * 0.5 && !_.sum(c.store) && !c.memory.trailer && !c.memory.military);
            if (!towTruck.length) towTruck = _.filter(creep.room.myCreeps, (c) => c.getActiveBodyparts(MOVE) >= 2 && !_.sum(c.store) && !c.memory.trailer && !c.memory.military);
            if (towTruck.length) {
                const closest = creep.pos.findClosestByRange(towTruck);
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
    if (pathInfo.newPos && pathInfo.newPos.x === creep.pos.x && pathInfo.newPos.y === creep.pos.y && pathInfo.newPos.roomName === creep.pos.roomName) pathInfo.path = pathInfo.path.slice(1);
    let nextDirection = parseInt(pathInfo.path[0], 10);
    if (nextDirection && pathInfo.newPos) {
        pathInfo.newPos = origin.positionAtDirection(nextDirection);
        if (pathInfo.pathPos === creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName && pathInfo.newPos) {
            // Handle tunneling thru walls/ramps
            if (pathInfo.newPos.checkForBarrierStructure() && (!INTEL[pathInfo.newPos.roomName] || !INTEL[pathInfo.newPos.roomName].owner || !FRIENDLIES.includes(INTEL[pathInfo.newPos.roomName].owner))) {
                if ((options.tunnel || creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(WORK) || creep.hasActiveBodyparts(RANGED_ATTACK)) && pathInfo.path) {
                    let barrier = pathInfo.newPos.checkForBarrierStructure();
                    creep.memory.barrierClearing = barrier.id;
                    if (creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(WORK) || creep.hasActiveBodyparts(RANGED_ATTACK)) {
                        creep.memory._shibMove.pathPosTime = 0;
                        if (creep.hasActiveBodyparts(ATTACK) && creep.attack(barrier)) return; else if (creep.hasActiveBodyparts(WORK) && creep.dismantle(barrier)) return; else if (creep.rangedAttack(barrier)) return;
                    } else {
                        if (Game.getObjectById(creep.memory.trailer)) {
                            Game.getObjectById(creep.memory.trailer).barrierClearing = barrier.id;
                            Game.getObjectById(creep.memory.trailer).memory.towDestination = barrier.id;
                        }
                    }
                    return;
                } else {
                    return creep.memory._shibMove = undefined;
                }
            }
            pathInfo.pathPosTime++;
        } else {
            pathInfo.pathPos = creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName;
            pathInfo.pathPosTime = 0;
        }
        creep.memory._shibMove = pathInfo;
        switch (creep.move(nextDirection)) {
            case OK:
                break;
            case ERR_TIRED:
                break;
            case ERR_NO_BODYPART:
                break;
            case ERR_BUSY:
                creep.idleFor(10);
                return;
        }
    } else {
        // Check if target reached
        if (!options.flee && creep.pos.getRangeTo(heading) <= options.range) {
            creep.memory.towDestination = undefined;
            creep.memory._shibMove = undefined;
        }
        delete pathInfo.path;
        return false;
    }
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    let cached, roomDistance, allowedRooms;
    pathInfo.pathOptions = options;
    // If we're right next to it just move
    if (creep.pos.isNearTo(heading) && options.range === 0) {
        creep.memory._shibMove = undefined;
        return creep.move(creep.pos.getDirectionTo(heading));
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
        options.maxOps = DEFAULT_MAXOPS * (roomDistance + 1);
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
        maxRooms: allowedRooms.length,
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
                purgeIntel(creep.memory.destination);
                log.d('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot find a path.', 'HIGH COMMAND: ');
            }
            //return creep.suicide();
        }
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
    if (options.useCache && !options.distance) route = getRoute(origin, destination);
    if (route === 'failed') return []; else if (route) return route;
    options.portal = undefined;
    let portalRoom;
    let roomDistance = Game.map.getRoomLinearDistance(origin, destination);
    if (roomDistance > 8) {
        // Check for portals and don't use cached if one exists, if no portal and range is absurd just return
        portalRoom = _.find(INTEL, (r) => r.portal && Game.map.getRoomLinearDistance(origin, r.name) + Game.map.getRoomLinearDistance(r.portal, destination) <= 8);
        if (portalRoom && portalRoom.name) {
            options.portal = portalRoom.name;
            options.portalDestination = INTEL[portalRoom.name].portal;
            options.originalDestination = destination;
            options.portalDistance = Game.map.getRoomLinearDistance(INTEL[portalRoom.name].portal, destination);
            destination = portalRoom.name;
        } else if (roomDistance > 15) {
            return;
        }
    }
    route = routeLogic(origin, destination, roomDistance, portalRoom);
    // If we have a route, cache it. Otherwise, cache a failure and remove operations/queued creeps for it.
    if (route && route.length) {
        if (options.originalDestination) destination = options.originalDestination;
        cacheRoute(origin, destination, route);
    } else {
        cacheRoute(origin, destination, undefined, true);
        if (Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination]) {
            delete Memory.targetRooms[destination];
            delete Memory.auxiliaryTargets[destination];
            purgeIntel(destination);
            log.a('Canceling operation in ' + roomLink(destination) + ' as we cannot find a route.', 'HIGH COMMAND: ');
        }
        log.a('No route found between ' + roomLink(origin) + ' and ' + roomLink(destination), 'PATHING:');
    }
    return route;
}

function routeLogic(origin, destination, roomDistance, portalRoom) {
    let portalRoute, start;
    // if it's a neighbor we can just go
    if (_.find(Game.map.describeExits(origin), (r) => r === destination)) {
        return [origin, destination];
    }
    // Get portal room route first if needed
    if (portalRoom) portalRoute = routeLogic(origin, portalRoom.name, roomDistance)
    if (portalRoute) start = INTEL[portalRoom.name].portal; else start = origin;
    let routeSearch = Game.map.findRoute(start, destination, {
        routeCallback: function (roomName) {
            // Skip origin/destination
            if (roomName === origin || roomName === destination) return 1;
            // Check for closed rooms
            if (roomStatus(roomName) === 'closed') return Infinity;
            // Regex highway check
            let [EW, NS] = roomName.match(/\d+/g);
            let highway = (INTEL[roomName] && INTEL[roomName].isHighway) || EW % 10 === 0 || NS % 10 === 0;
            // Add a check for novice/respawn
            if (!highway && roomStatus(roomName) !== roomStatus(origin)) return Infinity;
            // My rooms
            if (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) return 1;
            // Check for avoid flagged rooms
            if (Memory.avoidRooms && _.includes(Memory.avoidRooms, roomName)) return 250;
            if (INTEL && INTEL[roomName]) {
                // Friendly Rooms
                if (INTEL[roomName].user && _.includes(FRIENDLIES, INTEL[roomName].user)) return 5;
                // Avoid rooms used by others
                if (INTEL[roomName].user && !_.includes(FRIENDLIES, INTEL[roomName].user)) {
                    if (INTEL[roomName].towers) return Infinity; else return 75;
                }
                // Avoid rooms with hostile combat creeps
                if (INTEL[roomName].armedHostile && INTEL[roomName].armedHostile + CREEP_LIFE_TIME > Game.time) return 240;
                // Pathing Penalty Rooms
                if (INTEL[roomName].pathingPenalty) {
                    if (INTEL[roomName].pathingPenalty + CREEP_LIFE_TIME < Game.time) return 200; else delete INTEL[roomName].pathingPenalty;
                }
                // Avoid rooms with obstacles
                if (INTEL[roomName].obstacles) return 200;
                // Avoid strongholds
                if (INTEL[roomName].sk && INTEL[roomName].towers) return Infinity;
                // High Threat
                if (INTEL[roomName].threatLevel) return 60 * INTEL[roomName].threatLevel;
                // If room is under attack
                if (INTEL[roomName].hostilePower > INTEL[roomName].friendlyPower && INTEL[roomName].tickDetected + 150 > Game.time) return 100;
                // SK rooms are avoided if not being mined
                if (INTEL[roomName].sk && INTEL[roomName].user !== MY_USERNAME) return 25;
            } else return 10;
            // Highway
            if (highway || INTEL[roomName].isHighway) return 4;
            return 7;
        }
    });
    let path = [];
    if (portalRoom && portalRoute && portalRoute.length) {
        path.push(origin);
        portalRoute.forEach((r) => path.push(r));
    } else if (portalRoom && portalRoom.name === origin) path.push(portalRoom.name);
    if (routeSearch.length) routeSearch.forEach((r) => path.push(r.room));
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
function creepBumping(creep, pathInfo, options) {
    if (!pathInfo.newPos) return creep.moveRandom();
    let nextPosition = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
    if (nextPosition) {
        let bumpCreep = _.find(nextPosition.lookFor(LOOK_CREEPS), (c) => c.my && !c.fatigue && (!c.memory.other || !c.memory.other.stationary) && c.hasActiveBodyparts(MOVE));
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
    if (!terrainMatrixCache[roomName + type] || options.showMatrix) {
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
            case 4:
                plainCost = 0;
                swampCost = 0;
                break;
            default:
                plainCost = 6;
                swampCost = 25;
        }
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                let tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) matrix.set(x, y, 256);
                // Handle exits
                else if (x === 0 || x === 49 || y === 0 || y === 49) matrix.set(x, y, 10);
                else if (tile === TERRAIN_MASK_SWAMP) matrix.set(x, y, swampCost);
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
    // If we can't see into the room, try to use an old matrix
    if (!room) {
        if (structureMatrixCache[roomName + type]) return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type]);
        else return matrix;
    }
    // Check if matrix is cached and usable
    if (!structureMatrixCache[roomName + type] || options.showMatrix || options.tunnel
        || Game.time > structureMatrixCache[roomName + type].tick + (CREEP_LIFE_TIME * 25) || structureMatrixCache[roomName + type].count !== (room.structures.length + room.constructionSites.length)) {
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
                roadCost = 4;
                break;
            default:
                roadCost = 2;
        }
        let noWallWrecker = (creep instanceof Creep && ((INTEL[room.name] && FRIENDLIES.includes(INTEL[room.name].owner)) || (!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(WORK))));
        for (let structure of room.structures) {
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
            if (creep.memory.other.stationary || !creep.hasActiveBodyparts(MOVE)) {
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
    let cache = CACHE.globalRouteCache || {};
    if (typeof cache !== 'object') cache = {};
    let tick = Game.time;
    cache[key] = {
        route: JSON.stringify(route),
        failed: failed,
        uses: 1,
        tick: tick
    };
    CACHE.globalRouteCache = cache;
}

function getRoute(from, to) {
    if (CACHE.globalRouteCache) {
        let cachedRoute = CACHE.globalRouteCache[from + '_' + to];
        if (cachedRoute) {
            if (cachedRoute.tick + (CREEP_LIFE_TIME * 2) > Game.time) {
                if (cachedRoute.failed) return 'failed';
                cachedRoute.uses += 1;
                CACHE.globalRouteCache[from + '_' + to] = cachedRoute;
                return JSON.parse(cachedRoute.route);
            } else {
                delete CACHE.globalRouteCache[from + '_' + to];
            }
        }
    }
}

function deleteRoute(from, to) {
    let key = from + '_' + to;
    if (CACHE.globalRouteCache[key]) delete CACHE.globalRouteCache[key];
}

function cachePath(creep, from, to, pathInfo) {
    if (!pathInfo.path || !pathInfo.path.length) return;
    // Don't store super short paths
    if (pathInfo.path.length <= 5) return;
    //Store path based off move weight
    let options = getMoveWeight(creep, pathInfo.pathOptions);
    let weight = 3;
    if (options.offRoad) {
        weight = 1;
    } else if (options.ignoreRoads) {
        weight = 2;
    }
    let key = getPathKey(from, to, weight);
    if (!CACHE.globalPathCache || !_.size(CACHE.globalPathCache)) CACHE.globalPathCache = {};
    CACHE.globalPathCache[key] = {
        path: pathInfo.path,
        key: key,
        structures: creep.room.impassibleStructures.length,
        uses: 1,
        tick: Game.time
    }
}

function getPath(creep, from, to, pathInfo) {
    if (!CACHE.globalPathCache || !_.size(CACHE.globalPathCache)) return;
    let weight = 3;
    let cache = CACHE.globalPathCache || {};
    if (creep instanceof Creep) {
        // Don't get a cached path if creep is stuck
        if (creep.memory._shibMove && creep.memory._shibMove.pathPosTime && creep.memory._shibMove.pathPosTime >= STATE_STUCK) return;
        // Store path based off move weight
        let options = getMoveWeight(creep, pathInfo.pathOptions);
        if (options.offRoad) {
            weight = 1;
        } else if (options.ignoreRoads) {
            weight = 2;
        }
    }
    let cachedPath = cache[getPathKey(from, to, weight)];
    // Check for the path reversed
    if (!cachedPath && cache[getPathKey(to, from, weight)]) {
        cachedPath = cache[getPathKey(to, from, weight)];
        cachedPath.path = reverseString(cachedPath.path);
    }
    if (cachedPath) {
        if (creep.room.impassibleStructures.length === cachedPath.structures && cachedPath.tick + (CREEP_LIFE_TIME * 2) > Game.time) {
            cachedPath.uses += 1;
            CACHE.globalPathCache = cache;
            return cachedPath.path;
        } else {
            delete cache[cachedPath.key];
            CACHE.globalPathCache = cache;
        }
    }
}

function reverseString(str) {
    return str.split('').reverse().join('');
}

function getMoveWeight(creep, options = {}) {
    // Handle PC or offRoad being set already
    if (creep.className || options.offRoad) {
        options.offRoad = true;
        //options.heuristicWeight = 1.1;
        return options;
    }
    // Handle ignoreRoads being set already
    if (options.ignoreRoads) {
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

    this.memory.kiteRoom = this.memory.room;

    // Prepare pathfinding options
    let options = getMoveWeight(this);

    // Use pathfinder to flee from threats
    let fleeGoals = threats.map(a => ({pos: a.pos, range: fleeRange}));
    let result = PathFinder.search(this.pos, fleeGoals, {
        flee: true,
        swampCost: 180,
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
    // Do not flee into enemy owned rooms with towers
    if (INTEL[roomName] && INTEL[roomName].owner && INTEL[roomName].owner !== MY_USERNAME && INTEL[roomName].towers) return false;
    let matrix = new PathFinder.CostMatrix();
    matrix = getTerrainMatrix(roomName, matrix);
    matrix = getStructureMatrix(roomName, creep, matrix, options);
    matrix = getCreepMatrix(roomName, creep, matrix, options);
    matrix = getHostileMatrix(roomName, matrix, options);
    return getSKMatrix(roomName, matrix, options);
}
