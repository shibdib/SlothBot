/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

const DEFAULT_MAXOPS = 1000;
const STATE_STUCK = 2;
const FLEE_RANGE = 4;

const terrainMatrixCache = {};
const structureMatrixCache = {};
const creepMatrixCache = {};
const stationaryCreepMatrixCache = {};
const hostileMatrixCache = {};
const skMatrixCache = {};
let globalPathCache = {};
let globalRouteCache = {};

function shibMove(creep, heading, options = {}) {
    // Store source keeper
    if (creep.memory.keeper) options.ignoreKeeper = creep.memory.keeper;

    // Handle fatigue
    if (!creep.className && (creep.fatigue > 0 || !heading)) {
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
        }
    }

    // Make sure origin and target are good
    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    if (!origin || !target) return;

    // If the pathing memory entry is missing or wrong recreate it
    if (!creep.memory._shibMove || !creep.memory._shibMove.target || creep.memory._shibMove.targetRoom !== target.roomName || creep.memory._shibMove.target.x !== target.x || creep.memory._shibMove.target.y !== target.y) creep.memory._shibMove = {};

    // If creep has just entered an SK room force a re-path to make sure it doesn't DIE
    if (INTEL[creep.room.name] && INTEL[creep.room.name].sk && (!creep.memory.skRepath || creep.memory.skRepath !== creep.room.name)) {
        creep.memory.skRepath = creep.room.name;
        return creep.memory._shibMove = undefined;
    } else if (creep.memory.skRepath && creep.memory.skRepath !== creep.room.name) creep.memory.skRepath = undefined;

    // Default options
    _.defaults(options, {
        maxOps: DEFAULT_MAXOPS,
        range: 1,
        maxRooms: 7,
        useCache: true,
        ignoreCreeps: true
    });

    // Handle forced creep notice
    if (creep.memory.noticeCreeps) {
        delete creep.memory.noticeCreeps;
        options.ignoreCreeps = false;
    }

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

    // Handle tow being set
    if (creep.memory.towDestination && creep.memory.towCreep) {
        let towCreep = Game.getObjectById(creep.memory.towCreep);
        if (!towCreep) {
            creep.memory.towCreep = undefined;
        } else if (creep.pos.isNearTo(towCreep)) return;
    }

    // If tunneling up the ops
    if (options.tunnel) options.maxOps = 15000;

    // Show matrix
    if (options.showMatrix) return getMatrix(creep.room.name, creep, options)

    // Handle portal
    if (creep.memory.portal) {
        let portal = creep.memory.portal;
        if (Game.getObjectById(creep.memory.portal)) {
            let portalInfo = Game.getObjectById(creep.memory.portal);
            if (portal instanceof RoomPosition) portal = portal.roomName; else portal = portalInfo.room;
        }
        if (creep.memory.portal === creep.room.name) {
            let portalStructure = _.find(creep.room.structures, (s) => s.structureType === STRUCTURE_PORTAL);
            return creep.moveTo(portalStructure);
        } else {
            if (creep.memory.usedPortal) {
                creep.memory.portal = undefined;
                creep.memory._shibMove = undefined;
                return;
            } else {
                heading = Game.getObjectById(creep.memory.portal);
            }
        }
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

    // If in an SK room and no matrix exists, reset it
    if (_.includes(skNoVision, creep.room.name)) {
        skNoVision = _.filter(skNoVision, (r) => r !== creep.room.name);
        return creep.memory._shibMove = undefined;
    }

    // Request a tow truck if needed
    if (creep.memory.willNeedTow === undefined) creep.memory.willNeedTow = _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length / 2 > _.filter(creep.body, (p) => p.type === MOVE).length;
    if (!creep.className && creep.memory.willNeedTow && (creep.pos.getRangeTo(heading) > 3 || !creep.hasActiveBodyparts(MOVE))) {
        if (!creep.memory.towDestination) {
            creep.memory.towDestination = heading.id || heading;
            creep.memory.towOptions = options;
        } else if (heading.id && creep.hasActiveBodyparts(MOVE) && creep.pos.isNearTo(heading)) {
            creep.memory.towDestination = undefined;
        }
    }

    // Check if target moved
    if (creep.memory._shibMove.target && (creep.memory._shibMove.target.x !== target.x || creep.memory._shibMove.target.y !== target.y || creep.memory._shibMove.target.roomName !== target.roomName) && creep.room.name === target.roomName) {
        if (heading instanceof Creep || heading instanceof PowerCreep) {
            creep.memory._shibMove.path = undefined;
        } else if (creep.memory._shibMove.target.roomName !== target.roomName) {
            return creep.memory._shibMove = undefined;
        }
    }

    // Set var
    let pathInfo = creep.memory._shibMove;
    pathInfo.targetRoom = target.roomName;

    //Execute path if target is valid and path is set
    if (pathInfo.path && pathInfo.path.length && !options.getPath) {
        executePath(creep, pathInfo, options, origin, heading);
    } else {
        return shibPath(creep, heading, pathInfo, origin, target, options);
    }
}

function executePath(creep, pathInfo, options, origin, heading) {
    if (pathInfo.newPos && pathInfo.newPos.x === creep.pos.x && pathInfo.newPos.y === creep.pos.y && pathInfo.newPos.roomName === creep.pos.roomName) pathInfo.path = pathInfo.path.slice(1);
    let nextDirection = parseInt(pathInfo.path[0], 10);
    if (nextDirection && pathInfo.newPos) {
        pathInfo.newPos = positionAtDirection(origin, nextDirection);
        if (pathInfo.pathPos === creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName && pathInfo.newPos) {
            // Handle tunneling thru walls/ramps
            if (pathInfo.newPos.checkForBarrierStructure() && (!INTEL[pathInfo.newPos.roomName] || !INTEL[pathInfo.newPos.roomName].owner || !FRIENDLIES.includes(INTEL[pathInfo.newPos.roomName].owner))) {
                if ((options.tunnel || creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(WORK)) && pathInfo.path) {
                    let barrier = pathInfo.newPos.checkForBarrierStructure();
                    if (creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(WORK)) {
                        creep.memory._shibMove.pathPosTime = 0;
                        if (creep.hasActiveBodyparts(ATTACK) && creep.attack(barrier)) return; else (creep.dismantle(barrier));
                    } else {
                        creep.memory.barrierClearing = barrier.id;
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
            return false;
        }
        delete pathInfo.path;
    }
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    // If we're right next to it just move
    if (creep.pos.isNearTo(heading) && options.range === 0) {
        creep.memory._shibMove = undefined;
        return creep.move(creep.pos.getDirectionTo(heading));
    }
    let cached;
    pathInfo.pathOptions = options;
    if (!target) return creep.moveRandom();
    if (options.useCache && !INTEL[creep.room.name].threatLevel && !options.tunnel) cached = getPath(creep, origin, target, pathInfo);
    if (cached && options.ignoreCreeps) {
        if (options.confirmPath) return cached;
        pathInfo.findAttempt = undefined;
        pathInfo.target = target;
        pathInfo.path = cached;
        pathInfo.usingCached = true;
        pathInfo.newPos = positionAtDirection(creep.pos, parseInt(pathInfo.path[0], 10));
        creep.memory._shibMove = pathInfo;
        switch (creep.move(parseInt(pathInfo.path[0], 10))) {
            case OK:
                creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'red'});
                return true;
            case ERR_TIRED:
                return true;
            case ERR_NO_BODYPART:
                return false;
            case ERR_BUSY:
                creep.idleFor(10);
                return false;
        }
    } else {
        let roomDistance = 0;
        if (origin.roomName !== target.roomName) {
            roomDistance = Game.map.getRoomLinearDistance(origin.roomName, target.roomName)
            options.maxOps = DEFAULT_MAXOPS * (roomDistance + 2);
        } else {
            // Ops for single room travel much lower
            options.maxOps = DEFAULT_MAXOPS;
        }
        pathInfo.usingCached = undefined;
        let allowedRooms = pathInfo.route || options.route;
        if (roomDistance) {
            let route = findRoute(origin.roomName, target.roomName, options);
            if (portal) {
                creep.memory.portal = portal;
                return portal = undefined;
            }
            if (route) {
                if (!_.includes(route, creep.room.name)) route.unshift(creep.room.name);
                allowedRooms = route;
                pathInfo.route = route;
            } else {
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
        }
        if (!allowedRooms) allowedRooms = [origin.roomName].concat(_.map(Game.map.describeExits(origin.roomName)));
        let callback = (roomName) => {
            if (allowedRooms && !_.includes(allowedRooms, roomName)) return false;
            if (checkAvoid(roomName) && roomName !== target.roomName && roomName !== origin.roomName) return false;
            return getMatrix(roomName, creep, options);
        };
        let ret = PathFinder.search(origin, {pos: target, range: options.range}, {
            maxOps: options.maxOps,
            maxRooms: allowedRooms.length + 1,
            roomCallback: callback,
        });
        if (ret.incomplete) {
            if (!creep.memory.badPathing && roomDistance) {
                options.maxOps = DEFAULT_MAXOPS * (roomDistance + 5);
                creep.memory.badPathing = 1;
                if (origin.roomName !== target.roomName) {
                    deleteRoute(origin.roomName, target.roomName);
                    deleteRoute(creep.roomName, target.roomName);
                    log.e("Creep " + creep.name + " in " + roomLink(creep.room.name) + " could not find a path from " + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + " retrying.", "PATHING ERROR:");
                }
                return shibPath(creep, heading, pathInfo, origin, target, options);
            } else if (creep.memory.badPathing) {
                creep.memory.badPathing++;
                if (creep.memory.badPathing > 8) {
                    log.e(creep.name + ' is stuck in ' + creep.room.name + ' and is unable to path from ' + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + '. Suiciding for the good of the CPU.');
                    log.e('Ret - ' + JSON.stringify(ret));
                    if (allowedRooms) log.e('Path - ' + allowedRooms);
                    if (creep.memory.military && creep.memory.destination && (Memory.targetRooms[creep.memory.destination] || Memory.auxiliaryTargets[creep.memory.destination])) {
                        delete Memory.targetRooms[creep.memory.destination];
                        delete Memory.auxiliaryTargets[creep.memory.destination];
                        delete INTEL[creep.memory.destination];
                        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot find a path.', 'HIGH COMMAND: ');
                    }
                    return creep.suicide();
                } else if (creep.memory.badPathing >= 3) {
                    creep.memory.repathing = Game.map.describeExits(creep.room.name)[Game.map.findExit(creep.room.name, creep.memory.destination)];
                    if (creep.memory.repathing) return creep.shibMove(new RoomPosition(25, 25, creep.memory.repathing), {range: 23}); else return log.e('Cannot find a path between ' + creep.room.name + ' and ' + creep.memory.destination);
                }
            }
        } else {
            if (creep.memory.badPathing) creep.memory.badPathing--;
        }
        if (options.confirmPath && ret.path && !ret.incomplete) return ret.path; else if (options.confirmPath && ret.incomplete) return false;
        pathInfo.path = serializePath(creep.pos, ret.path);
        let nextDirection = parseInt(pathInfo.path[0], 10);
        pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
        pathInfo.target = target;
        pathInfo.portal = portal;
        if (options.ignoreCreeps && !options.ignoreStructures) cachePath(creep, origin, target, pathInfo);
        delete pathInfo.findAttempt;
        if (options.getPath) return creep.memory.getPath = pathInfo.path;
        creep.memory._shibMove = pathInfo;
        switch (creep.move(nextDirection)) {
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
    }
}

let portal;
function findRoute(origin, destination, options = {}) {
    // Default options
    _.defaults(options, {
        useCache: true,
    });
    let route;
    if (options.useCache && !options.distance) route = getRoute(origin, destination);
    if (route) return route;
    portal = undefined;
    let portalRoom;
    let roomDistance = Game.map.getRoomLinearDistance(origin, destination);
    if (roomDistance > 7) {
        // Check for portals and don't use cached if one exists
        portalRoom = _.filter(INTEL, (r) => r.portal && Game.map.getRoomLinearDistance(origin, r.name) < roomDistance * 0.5 &&
            JSON.parse(r.portal)[0].destination.roomName && Game.map.getRoomLinearDistance(JSON.parse(r.portal)[0].destination.roomName, destination) < roomDistance * 0.5)[0];
        if (portalRoom) {
            portal = portalRoom.name;
            destination = portalRoom.name;
        }
    }
    route = routeLogic(origin, destination, roomDistance, portalRoom);
    if (options.distance) {
        if (!route) route = [];
        if (!portalRoom) return route.length; else if (portalRoom) {
            let portalDestination = JSON.parse(INTEL[portalRoom.name].portal)[0].destination.roomName || JSON.parse(INTEL[portalRoom.name].portal)[0].destination.room;
            if (INTEL[portalDestination]) return route.length + findClosestOwnedRoom(portalDestination, true); else return route.length + 1
        }
    } else return route;
}

function routeLogic(origin, destination, roomDistance, portalRoom) {
    let portalRoute, start;
    // if it's a neighbor we can just go
    if (_.find(Game.map.describeExits(origin), (r) => r === destination)) {
        return [origin, destination];
    }
    // Get portal room route first if needed
    if (portalRoom) portalRoute = routeLogic(origin, portalRoom.name, roomDistance)
    if (portalRoute) start = JSON.parse(INTEL[portalRoom.name].portal)[0].destination.roomName; else start = origin;
    let routeSearch = Game.map.findRoute(start, destination, {
        routeCallback: function (roomName) {
            // Skip origin/destination
            if (roomName === origin || roomName === destination) return 1;
            // Regex highway check
            let [EW, NS] = roomName.match(/\d+/g);
            let highway = (INTEL[roomName] && INTEL[roomName].isHighway) || EW % 10 == 0 || NS % 10 == 0;
            // Add a check for novice/respawn
            if (Game.map.getRoomStatus(roomName).status !== Game.map.getRoomStatus(origin).status) return 256;
            // My rooms
            if (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) return 1;
            // Check for avoid flagged rooms
            if (Memory.avoidRooms && _.includes(Memory.avoidRooms, roomName)) return 250;
            if (INTEL && INTEL[roomName]) {
                // Friendly Rooms
                if (INTEL[roomName].user && _.includes(FRIENDLIES, INTEL[roomName].user)) return 5;
                // Pathing Penalty Rooms
                if (INTEL[roomName].pathingPenalty) {
                    if (INTEL[roomName].pathingPenalty + CREEP_LIFE_TIME < Game.time) return 200; else delete INTEL[roomName].pathingPenalty;
                }
                // Avoid strongholds
                if (INTEL[roomName].sk && INTEL[roomName].towers) return 256;
                // High Threat
                if (INTEL[roomName].threatLevel) return 60 * INTEL[roomName].threatLevel;
                // Avoid rooms used by others
                if (INTEL[roomName].user && !_.includes(FRIENDLIES, INTEL[roomName].user)) {
                    if (INTEL[roomName].towers) return 256; else return 75;
                }
                // If room has observed obstructions
                if (INTEL[roomName] && INTEL[roomName].obstructions) return 200;
                // If room is under attack
                if (INTEL[roomName] && INTEL[roomName].hostilePower > INTEL[roomName].friendlyPower && INTEL[roomName].tickDetected + 150 > Game.time) return 100;
                // SK rooms are avoided if not being mined
                if (INTEL[roomName].sk && INTEL[roomName].user !== MY_USERNAME) return 50;
            } else return 10;
            // Highway
            if (highway) return 1;
            return 2;
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
        cacheRoute(origin, destination, path);
        return path;
    } else {
        return undefined;
    }
}

//FUNCTIONS
function creepBumping(creep, pathInfo, options) {
    if (!pathInfo.newPos) return creep.moveRandom();
    let nextPosition = positionAtDirection(creep.pos, parseInt(pathInfo.path[0], 10));
    if (nextPosition) {
        let bumpCreep = _.find(nextPosition.lookFor(LOOK_CREEPS), (c) => c.my && !c.fatigue && !c.memory.other.stationary && !c.memory.willNeedTow && !c.memory.trailer && (!c.memory.other.noBump || Math.random() > 0.9));
        if (bumpCreep) {
            if (!creep.memory.trailer) {
                if (bumpCreep.hasActiveBodyparts(MOVE)) {
                    bumpCreep.move(bumpCreep.pos.getDirectionTo(creep));
                } else {
                    creep.pull(bumpCreep);
                }
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
            return true;
        } else {
            creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
        }
    }
    delete creep.memory._shibMove;
    creep.memory.noticeCreeps = true;
    creep.moveRandom();
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

function checkAvoid(roomName) {
    return Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].avoid;
}

function getMatrix(roomName, creep, options) {
    let room = Game.rooms[roomName];
    let matrix = getTerrainMatrix(roomName, options);
    if (!options.ignoreStructures) matrix = getStructureMatrix(roomName, creep, matrix, options);
    if (room && !options.ignoreCreeps) matrix = getCreepMatrix(roomName, creep, matrix, options);
    //if (room) matrix = getStationaryCreepMatrix(roomName, creep, matrix, options);
    if (room && room.hostileCreeps.length && (creep.className || (!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(RANGED_ATTACK)) || options.avoidEnemies)) matrix = getHostileMatrix(roomName, matrix, options);
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
}

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
            swampCost = 30;
    }
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            let tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) matrix.set(x, y, 256);
            else if (tile === TERRAIN_MASK_SWAMP) matrix.set(x, y, swampCost);
            else matrix.set(x, y, plainCost);
        }
    }
    let exits = Game.map.describeExits(roomName);
    if (exits === undefined) return matrix;
    let top = ((_.get(exits, TOP, undefined) === undefined) ? 1 : 0);
    let right = ((_.get(exits, RIGHT, undefined) === undefined) ? 48 : 49);
    let bottom = ((_.get(exits, BOTTOM, undefined) === undefined) ? 48 : 49);
    let left = ((_.get(exits, LEFT, undefined) === undefined) ? 1 : 0);
    for (let y = top; y <= bottom; ++y) {
        for (let x = left; x <= right; x += ((y % 49 === 0) ? 1 : 49)) {
            if (matrix.get(x, y) < 0x03 && terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                matrix.set(x, y, 0x03);
            }
        }
    }
    return matrix;
}

let structureMatrixTick = {};
let structureCount = {};

function getStructureMatrix(roomName, creep, matrix, options) {
    let room = Game.rooms[roomName];
    let type = 1;
    if (options.tunnel) type = 1;
    else if (options.offRoad) type = 3; else if (options.ignoreRoads) type = 2;
    // If we can't see into the room, try to use an old matrix
    if (!room) {
        if (structureMatrixCache[roomName + type]) return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type]);
        else return matrix;
    }
    // Check if matrix is cached and usable
    if (!structureMatrixTick[room.name] || !structureCount[roomName] || !structureMatrixCache[roomName + type] || options.showMatrix || options.tunnel || Game.time > structureMatrixTick[roomName + type] + (CREEP_LIFE_TIME * 25) || structureCount[roomName] !== room.structures.length) {
        structureMatrixTick[roomName + type] = Game.time;
        structureCount[roomName] = room.structures.length;
        structureMatrixCache[roomName + type] = addStructuresToMatrix(room, creep, matrix, type, options).serialize();
    }
    return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type]);
}

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
    let wallWrecker = (!creep.className && !creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(WORK)) || (INTEL[room.name] && FRIENDLIES.includes(INTEL[room.name].owner));
    for (let structure of room.structures) {
        if (structure instanceof StructureWall) {
            if (wallWrecker) {
                matrix.set(structure.pos.x, structure.pos.y, 256);
            } else {
                matrix.set(structure.pos.x, structure.pos.y, 150);
            }
        } else if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureController) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRampart && (structure.my || structure.isPublic) && !structure.pos.checkForObstacleStructure()) {
            if (room.hostileCreeps.length) matrix.set(structure.pos.x, structure.pos.y, roadCost - 1);
            else matrix.set(structure.pos.x, structure.pos.y, 2);
        } else if (structure instanceof StructureRampart && (FRIENDLIES.includes(structure.owner.username) && !structure.pos.checkForObstacleStructure())) {
            matrix.set(structure.pos.x, structure.pos.y, 250);
        } else if (structure instanceof StructureRampart && (!structure.my || !structure.isPublic || structure.pos.checkForObstacleStructure())) {
            if (wallWrecker) {
                matrix.set(structure.pos.x, structure.pos.y, 256);
            } else {
                matrix.set(structure.pos.x, structure.pos.y, 150);
            }
        } else if (structure instanceof StructureContainer) {
            matrix.set(structure.pos.x, structure.pos.y, 75);
        } else if (structure instanceof StructureRoad) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost);
        } else {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        }
    }
    let blockingSites = _.filter(room.constructionSites, (s) => (s.my && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART) || (!s.my && _.includes(FRIENDLIES, s.owner.username)));
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

let creepMatrixTick = {};
function getCreepMatrix(roomName, creep, matrix, options) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;
    if (!creepMatrixCache[roomName] || options.showMatrix || (!creepMatrixTick[room.name] || Game.time !== creepMatrixTick[room.name])) {
        room.memory.creepMatrixTick = undefined;
        creepMatrixTick[room.name] = Game.time;
        creepMatrixCache[roomName] = addCreepsToMatrix(room, matrix, creep, options).serialize();
    }
    return PathFinder.CostMatrix.deserialize(creepMatrixCache[roomName]);
}

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

let stationaryMatrixTick = {};
function getStationaryCreepMatrix(roomName, creep, matrix, options) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;
    if (!stationaryCreepMatrixCache[roomName] || options.showMatrix || (!stationaryMatrixTick[room.name] || Game.time > stationaryMatrixTick[room.name])) {
        room.memory.creepMatrixTick = undefined;
        stationaryCreepMatrixCache[roomName] = addStationaryCreepsToMatrix(room, matrix).serialize();
    }
    return PathFinder.CostMatrix.deserialize(stationaryCreepMatrixCache[roomName]);
}

function addStationaryCreepsToMatrix(room, matrix) {
    if (!room) return matrix;
    //Stationary creeps
    let stationaryCreeps = _.filter(room.myCreeps, (c) => c.memory.other && c.memory.other.stationary);
    for (let site of stationaryCreeps) {
        if (room.name === 'W9S9') console.log(JSON.stringify(site.pos))
        matrix.set(site.pos.x, site.pos.y, 150);
    }
    stationaryMatrixTick[room.name] = Game.time + ((_.round(_.min(stationaryCreeps, 'ticksToLive').ticksToLive * 0.5)) || 10);
    return matrix;
}

let hostileMatrixTick = {};
function getHostileMatrix(roomName, matrix, options) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;
    if (!hostileMatrixCache[roomName] || options.showMatrix || (!hostileMatrixTick[room.name] || Game.time > hostileMatrixTick[room.name] + 1)) {
        room.memory.hostileMatrixTick = undefined;
        hostileMatrixTick[room.name] = Game.time;
        hostileMatrixCache[roomName] = addHostilesToMatrix(room, matrix, options).serialize();
    }
    return PathFinder.CostMatrix.deserialize(hostileMatrixCache[roomName]);
}

function addHostilesToMatrix(room, matrix, options) {
    if (!room || (room.controller && room.controller.owner && room.controller.owner.username === MY_USERNAME && room.controller.safeMode)) return matrix;
    let enemyCreeps = _.filter(room.hostileCreeps, (c) => !c.className && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
    for (let key in enemyCreeps) {
        matrix.set(enemyCreeps[key].pos.x, enemyCreeps[key].pos.y, 256);
        let range = 4;
        let avoidZone = enemyCreeps[key].room.lookForAtArea(LOOK_TERRAIN, enemyCreeps[key].pos.y - range, enemyCreeps[key].pos.x - range, enemyCreeps[key].pos.y + range, enemyCreeps[key].pos.x + range, true);
        for (let pos of avoidZone) {
            let position;
            try {
                position = new RoomPosition(pos.x, pos.y, room.name);
            } catch (e) {
                continue;
            }
            let weight = 10 * ((range + 1) - position.getRangeTo(enemyCreeps[key]));
            if (!position || (matrix.get(position.x, position.y) && matrix.get(position.x, position.y) >= weight)) continue;
            matrix.set(position.x, position.y, weight)
        }
    }
    return matrix;
}

let skMatrixTick = {};
let skNoVision = [];

function getSKMatrix(roomName, matrix = undefined, options) {
    let room = Game.rooms[roomName];
    if (!INTEL[roomName] || !INTEL[roomName].sk) return matrix;
    if (!room) {
        if (!_.includes(skNoVision)) skNoVision.push(roomName);
        return matrix;
    }
    if (!skMatrixCache[roomName] || options.showMatrix || (Game.time !== skMatrixTick[roomName] + CREEP_LIFE_TIME && Game.rooms[roomName])) {
        skMatrixTick[roomName] = Game.time;
        skMatrixCache[roomName] = addSksToMatrix(room, matrix, options).serialize();
    }
    return PathFinder.CostMatrix.deserialize(skMatrixCache[roomName]);
}

function addSksToMatrix(room, matrix, options) {
    if (room && INTEL[room.name] && INTEL[room.name].sk) {
        let sks = room.find(FIND_CREEPS, {filter: (c) => c.owner.username === 'Source Keeper'});
        if (options.ignoreKeeper) sks = _.filter(sks, (c) => c.id !== options.ignoreKeeper)
        if (sks.length) {
            for (let sk of sks) {
                matrix.set(sk.pos.x, sk.pos.y, 256);
                let sites = sk.room.lookForAtArea(LOOK_TERRAIN, sk.pos.y - 5, sk.pos.x - 5, sk.pos.y + 5, sk.pos.x + 5, true);
                for (let site of sites) {
                    let position;
                    try {
                        position = new RoomPosition(site.x, site.y, room.name);
                    } catch (e) {
                        continue;
                    }
                    if (position && !position.checkForWall()) {
                        let weight = 250;
                        matrix.set(position.x, position.y, weight)
                    }
                }
            }
        } else {
            let lairs = room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn < 25});
            let avoid = _.union(lairs, room.sources, room.mineral);
            for (let lair of avoid) {
                let sites = lair.room.lookForAtArea(LOOK_TERRAIN, lair.pos.y - 5, lair.pos.x - 5, lair.pos.y + 5, lair.pos.x + 5, true);
                for (let site of sites) {
                    let position;
                    try {
                        position = new RoomPosition(site.x, site.y, room.name);
                    } catch (e) {
                        continue;
                    }
                    if (position && !position.checkForWall() && !position.checkForRoad()) {
                        let weight = 240;
                        matrix.set(position.x, position.y, weight)
                    }
                }
            }
        }
    }
    return matrix;
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

function positionAtDirection(origin, direction) {
    let offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
    let offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
    let x = origin.x + offsetX[direction];
    let y = origin.y + offsetY[direction];
    if (x > 49 || x < 0 || y > 49 || y < 0 || !x || !y) {
        return;
    }
    return new RoomPosition(x, y, origin.roomName);
}

function cacheRoute(from, to, route) {
    let key = from + '_' + to;
    let cache = globalRouteCache || {};
    if (cache instanceof Array) cache = {};
    let tick = Game.time;
    cache[key] = {
        route: JSON.stringify(route),
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
                cachedRoute.uses += 1;
                return JSON.parse(cachedRoute.route);
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
    if (!globalPathCache || !_.size(globalPathCache)) globalPathCache = {};
    globalPathCache[key] = {
        path: pathInfo.path,
        key: key,
        structures: creep.room.impassibleStructures.length,
        uses: 1,
        tick: Game.time
    }
}

function getPath(creep, from, to, pathInfo) {
    if (!globalPathCache || !_.size(globalPathCache)) return;
    // Don't get a cached path if creep is stuck
    if (creep.memory._shibMove && creep.memory._shibMove.pathPosTime && creep.memory._shibMove.pathPosTime >= STATE_STUCK) return;
    let cache = globalPathCache || {};
    // Store path based off move weight
    let options = getMoveWeight(creep, pathInfo.pathOptions);
    let weight = 3;
    if (options.offRoad) {
        weight = 1;
    } else if (options.ignoreRoads) {
        weight = 2;
    }
    let cachedPath = globalPathCache[getPathKey(from, to, weight)];
    // Check for the path reversed
    if (!cachedPath && globalPathCache[getPathKey(to, from, weight)]) {
        cachedPath = globalPathCache[getPathKey(to, from, weight)];
        cachedPath.path = reverseString(cachedPath.path);
    }
    if (cachedPath) {
        if (creep.room.impassibleStructures.length === cachedPath.structures && cachedPath.tick + (CREEP_LIFE_TIME * 2) > Game.time) {
            cachedPath.uses += 1;
            globalPathCache = cache;
            return cachedPath.path;
        } else {
            delete cache[cachedPath.key];
            globalPathCache = cache;
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
        return options;
    }
    // Handle ignoreRoads being set already
    if (options.ignoreRoads) {
        return options;
    }
    let move = creep.getActiveBodyparts(MOVE);
    // Get weight of creep
    let weight = _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length;
    // Add weight of used carry parts
    weight += _.ceil(_.sum(creep.store) / 50) || 0;
    if (!creep.memory._shibMove) creep.memory._shibMove = {};
    creep.memory._shibMove.weight = weight;
    // Add weight of trailer
    if (creep.memory.trailer && Game.getObjectById(creep.memory.trailer)) weight += _.filter(Game.getObjectById(creep.memory.trailer).body, (p) => p.type !== MOVE && p.type !== CARRY).length;
    if (move >= weight * 5) {
        options.offRoad = true;
    } else if (move >= weight) {
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
            if (position.checkForWall() || position.checkForImpassible()) continue;
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

PowerCreep.prototype.shibMove = function (destination, options) {
    return shibMove(this, destination, options);
};
Creep.prototype.shibMove = function (destination, options) {
    shibMove(this, destination, options);
};
Creep.prototype.shibRoute = function (destination, options) {
    return findRoute(this.room.name, destination, options);
};
Room.prototype.shibRoute = function (destination, options) {
    return findRoute(this.name, destination, options);
};
Creep.prototype.showMatrix = function (destination, tunnel = undefined) {
    let options = {};
    options.tunnel = tunnel
    options.showMatrix = true;
    return shibMove(this, destination, options);
};

let routeSafetyCache = {};
Room.prototype.routeSafe = function (destination = this.name, maxThreat = 2, maxHeat = 1000, range = 20) {
    if (routeSafetyCache[this.name + '.' + destination] && routeSafetyCache[this.name + '.' + destination].expire > Game.time) return routeSafetyCache[this.name + '.' + destination].status;
    let route = findRoute(this.name, destination);
    let state = true;
    if (route && route.length > range) state = false;
    else if (route && route.length) route.forEach(function (r) {
        // Return false for super long routes
        if (INTEL[r] && (INTEL[r].threatLevel >= maxThreat || INTEL[r].roomHeat >= maxHeat)) return state = false;
    })
    let cache = routeSafetyCache[this.name + '.' + destination] || {};
    cache.status = state;
    cache.expire = Game.time + 50;
    routeSafetyCache[this.name + '.' + destination] = cache;
    return state;
};
RoomPosition.prototype.shibMove = function (destination, options) {
    return shibMove(this, destination, options);
};


Creep.prototype.shibKite = function (fleeRange = FLEE_RANGE, target = undefined) {
    if (!this.hasActiveBodyparts(MOVE) || (this.room.controller && this.room.controller.safeMode)) return false;
    let avoid = _.filter(this.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) && this.pos.getRangeTo(c) <= fleeRange + 1).concat(this.pos.findInRange(this.room.structures, fleeRange + 1, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn <= fleeRange + 2})) || target;
    if (!avoid || !avoid.length) return false;
    // If in a rampart you're safe
    if (this.pos.checkForRampart()) return true;
    this.say('!!RUN!!', true);
    this.memory.kiteRoom = this.memory.room;
    let avoidance = _.map(avoid, (c) => {
        return {pos: c.pos, range: fleeRange};
    });
    let options = getMoveWeight(this);
    let creep = this;
    let ret = PathFinder.search(this.pos, avoidance, {
        flee: true,
        swampCost: 75,
        plainCost: 3,
        maxRooms: 2,
        roomCallback: function () {
            let matrix = getTerrainMatrix(creep.room.name, options);
            matrix = getStructureMatrix(creep.room.name, creep, matrix, options);
            matrix = getCreepMatrix(creep.room.name, creep, matrix, options);
            matrix = getHostileMatrix(creep.room.name, matrix, options);
            return getSKMatrix(creep.room.name, matrix, options);
        }
    });
    if (ret.path.length > 0) {
        if (this.memory.squadLeader === this.id) {
            this.memory.squadKite = this.pos.getDirectionTo(ret.path[0]);
        }
        this.memory.lastKite = this.pos.getDirectionTo(ret.path[0]);
        this.move(this.pos.getDirectionTo(ret.path[0]));
        return true;
    } else {
        return false;
    }
};