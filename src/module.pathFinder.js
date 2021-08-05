/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let tools = require('tools.cpuTracker');

const DEFAULT_MAXOPS = 2500;
const STATE_STUCK = 2;
const FLEE_RANGE = 3;

const terrainMatrixCache = {};
const structureMatrixCache = {};
const creepMatrixCache = {};
const hostileMatrixCache = {};
const skMatrixCache = {};
let globalPathCache = {};
let globalRouteCache = {};
let tempAvoidRooms = [];

function shibMove(creep, heading, options = {}) {
    if (!creep.memory._shibMove) creep.memory._shibMove = {};

    // Default options
    _.defaults(options, {
        useCache: true,
        ignoreCreeps: true,
        maxOps: DEFAULT_MAXOPS,
        range: 1,
        ignoreStructures: false,
        maxRooms: 1,
        ignoreRoads: false,
        offRoad: false,
        confirmPath: false,
        tunnel: false,
        showMatrix: false,
        getNextDirection: false
    });

    // Handle fatigue
    if (!creep.className && (creep.fatigue > 0 || !heading)) {
        if (!creep.memory.military) creep.idleFor(1);
        return creep.room.visual.circle(creep.pos, {
            fill: 'transparent',
            radius: 0.55,
            stroke: 'black'
        });
    }

    // Handle tow being set
    if (creep.memory.towDestination && creep.memory.towCreep) {
        let towCreep = Game.getObjectById(creep.memory.towCreep);
        if (!towCreep) {
            creep.memory.towCreep = undefined;
        }
        return;
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
                heading = new RoomPosition(25, 25, creep.memory.portal);
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
        skNoVision = _.filter(skNoVision, (r) = r !== creep.room.name);
        return creep.memory._shibMove = undefined;
    }

    // Set these for creeps that can afford them
    if (!creep.className && (!options.ignoreRoads || !options.offRoad)) {
        options = getMoveWeight(creep, options);
    } else if (creep.className) options.offRoad = true;

    // Request a tow truck if needed
    if (creep.memory.willNeedTow === undefined) creep.memory.willNeedTow = _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length / 2 > _.filter(creep.body, (p) => p.type === MOVE).length;
    if (!creep.className && creep.memory.willNeedTow && (creep.pos.getRangeTo(heading) > 3 || !creep.hasActiveBodyparts(MOVE))) {
        if (!creep.memory.towDestination) {
            creep.memory.towDestination = heading.id || heading;
            creep.memory.towOptions = options;
        } else if (heading.id && creep.hasActiveBodyparts(MOVE) && creep.pos.isNearTo(heading)) {
            creep.memory.towDestination = undefined;
        }
        return;
    }

    // Make sure origin and target are good
    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    if (!origin || !target) return;

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

    //Clear path if stuck
    if (pathInfo.pathPosTime && pathInfo.pathPosTime >= STATE_STUCK && !options.tunnel) {
        if (Math.random() > 0.95) structureMatrixCache[creep.room.name] = undefined;
        creepBumping(creep, pathInfo, options);
    }

    //Execute path if target is valid and path is set
    if (pathInfo.path && pathInfo.path.length && !options.getPath) {
        if (pathInfo.newPos && pathInfo.newPos.x === creep.pos.x && pathInfo.newPos.y === creep.pos.y && pathInfo.newPos.roomName === creep.pos.roomName) pathInfo.path = pathInfo.path.slice(1);
        let nextDirection = parseInt(pathInfo.path[0], 10);
        if (nextDirection && pathInfo.newPos) {
            pathInfo.newPos = positionAtDirection(origin, nextDirection);
            if (pathInfo.pathPos === creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName) {
                // Handle tunneling thru walls/ramps
                if (options.tunnel && pathInfo.path) {
                    if (pathInfo.newPos.checkForBarrierStructure()) {
                        let barrier = pathInfo.newPos.checkForBarrierStructure();
                        creep.memory.barrierClearing = barrier.id;
                        if (Game.getObjectById(creep.memory.trailer)) {
                            Game.getObjectById(creep.memory.trailer).barrierClearing = barrier.id;
                            Game.getObjectById(creep.memory.trailer).memory.towDestination = barrier.id;
                        }
                        return;
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
                    creep.memory._shibMove.lastMoveTick = Game.time;
                    creep.memory._shibMove.lastDirection = nextDirection;
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
    } else {
        return shibPath(creep, heading, pathInfo, origin, target, options);
    }
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    let cached;
    if (!Memory.roomCache[creep.room.name]) creep.room.cacheRoomIntel(true, creep);
    if (!target) return creep.moveRandom();
    if (options.useCache && !Memory.roomCache[creep.room.name].threatLevel && !options.tunnel) cached = getPath(creep, origin, target);
    if (cached && options.ignoreCreeps) {
        if (options.confirmPath) return cached;
        pathInfo.findAttempt = undefined;
        creep.memory.badPathing = undefined;
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
            options.maxOps = DEFAULT_MAXOPS + (2500 * roomDistance);
        } else {
            // Ops for single room travel much lower
            options.maxOps = 1250;
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
        let callback = (roomName) => {
            if (allowedRooms && !_.includes(allowedRooms, roomName)) return false;
            if (checkAvoid(roomName) && roomName !== target.roomName && roomName !== origin.roomName) return false;
            return getMatrix(roomName, creep, options);
        };
        if (!allowedRooms) allowedRooms = [origin.roomName];
        let ret = PathFinder.search(origin, {pos: target, range: options.range}, {
            maxOps: options.maxOps,
            maxRooms: allowedRooms.length + 1,
            roomCallback: callback,
        });
        if (ret.incomplete) {
            options.maxOps *= 3;
            if (!pathInfo.findAttempt && roomDistance) {
                options.useFindRoute = true;
                pathInfo.findAttempt = true;
                if (origin.roomName !== target.roomName) deleteRoute(origin.roomName, target.roomName);
                creep.memory._pathCache = undefined;
                log.e("Creep " + creep.name + " in " + roomLink(creep.room.name) + " could not find a path from " + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + " retrying.", "PATHING ERROR:");
                return shibPath(creep, heading, pathInfo, origin, target, options);
            } else if (pathInfo.findAttempt) {
                if (!creep.memory.badPathing) creep.memory.badPathing = 1;
                if (creep.memory.badPathing) creep.memory.badPathing++;
                if (creep.memory.badPathing > 20) {
                    log.e(creep.name + ' is stuck in ' + creep.room.name + ' and is unable to path from ' + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + '. Suiciding for the good of the CPU.');
                    log.e('Ret - ' + JSON.stringify(ret));
                    if (allowedRooms) log.e('Path - ' + allowedRooms);
                    if (creep.memory.military && creep.memory.destination && (Memory.targetRooms[creep.memory.destination] || Memory.auxiliaryTargets[creep.memory.destination])) {
                        delete Memory.targetRooms[creep.memory.destination];
                        delete Memory.auxiliaryTargets[creep.memory.destination];
                        delete Memory.roomCache[creep.memory.destination];
                        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot find a path.', 'HIGH COMMAND: ');
                    }
                    return creep.suicide();
                } else if (creep.memory.badPathing > 10) {
                    if (allowedRooms) {
                        target = new RoomPosition(25, 25, allowedRooms[_.round(allowedRooms.length * 0.5)]);
                    }
                    return shibPath(creep, heading, pathInfo, origin, target, options);
                }
            }
        }
        if (options.confirmPath && ret.path && !ret.incomplete) return ret.path; else if (options.confirmPath && ret.incomplete) return false;
        pathInfo.path = serializePath(creep.pos, ret.path);
        let nextDirection = parseInt(pathInfo.path[0], 10);
        pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
        pathInfo.target = target;
        pathInfo.portal = portal;
        if (options.ignoreCreeps && !options.ignoreStructures) cachePath(creep, origin, target, pathInfo.path);
        delete pathInfo.findAttempt;
        delete creep.memory.badPathing;
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
    portal = undefined;
    let portalRoom;
    let roomDistance = Game.map.getRoomLinearDistance(origin, destination);
    if (roomDistance > 7) {
        // Check for portals and don't use cached if one exists
        portalRoom = _.filter(Memory.roomCache, (r) => r.portal && Game.map.getRoomLinearDistance(origin, r.name) < roomDistance * 0.5 &&
            JSON.parse(r.portal)[0].destination.roomName && Game.map.getRoomLinearDistance(JSON.parse(r.portal)[0].destination.roomName, destination) < roomDistance * 0.5)[0];
        if (portalRoom) {
            portal = portalRoom.name;
            destination = portalRoom.name;
        }
    }
    let route;
    if (options.useCache && !options.distance) route = getRoute(origin, destination);
    if (route) return route; else route = pathFunction(origin, destination, roomDistance, portalRoom);
    if (options.distance) {
        if (!route) route = [];
        if (!portalRoom) return route.length; else if (portalRoom) {
            let portalDestination = JSON.parse(Memory.roomCache[portalRoom.name].portal)[0].destination.roomName || JSON.parse(Memory.roomCache[portalRoom.name].portal)[0].destination.room;
            if (Memory.roomCache[portalDestination]) return route.length + Memory.roomCache[portalDestination].closestRoom; else return route.length + 1
        }
    } else return route;
}

function pathFunction(origin, destination, roomDistance, portalRoom) {
    let portalRoute, start;
    // Get portal room route first if needed
    if (portalRoom) portalRoute = pathFunction(origin, portalRoom.name, roomDistance)
    if (portalRoute) start = JSON.parse(Memory.roomCache[portalRoom.name].portal)[0].destination.roomName; else start = origin;
    let routeSearch = Game.map.findRoute(start, destination, {
        routeCallback: function (roomName, fromRoomName) {
            // Skip origin/destination
            if (roomName === origin || roomName === destination) return 1;
            // Regex highway check
            let [EW, NS] = roomName.match(/\d+/g);
            let isAlleyRoom = EW % 10 == 0 || NS % 10 == 0;
            [EW, NS] = fromRoomName.match(/\d+/g);
            let comingFromAlley = EW % 10 == 0 || NS % 10 == 0;
            // Add a check for novice/respawn
            if (!isAlleyRoom && Game.map.getRoomStatus(roomName).status !== Game.map.getRoomStatus(origin).status) return 256;
            // My rooms
            if (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) return 1;
            // Check for avoid flagged rooms
            if (Memory.avoidRooms && _.includes(_.union(Memory.avoidRooms, tempAvoidRooms), roomName)) return 254;
            if (Memory.roomCache && Memory.roomCache[roomName]) {
                // Season check for barrier highway
                if (Game.shard.name === 'shardSeason' && !sameSectorCheck(origin, destination) && isAlleyRoom) {
                    if (Memory.roomCache[roomName].seasonHighwayPath) return 1; else return 256;
                }
                // Temp avoid
                if (Memory.roomCache[roomName].tempAvoid) {
                    if (Memory.roomCache[roomName].tempAvoid + 3000 > Game.time) return 256; else delete Memory.roomCache[roomName].tempAvoid;
                }
                // Pathing Penalty Rooms
                if (Memory.roomCache[roomName].pathingPenalty) return 150;
                // Friendly Rooms
                if (Memory.roomCache[roomName].user && _.includes(FRIENDLIES, Memory.roomCache[roomName].user)) return 5;
                // Highway
                if (Memory.roomCache[roomName].isHighway) return 5;
                // Avoid strongholds
                if (Memory.roomCache[roomName].sk && Memory.roomCache[roomName].towers) return 256;
                // Avoid rooms owned by others
                if (Memory.roomCache[roomName].owner && !_.includes(FRIENDLIES, Memory.roomCache[roomName].owner)) {
                    if (Memory.roomCache[roomName].towers) return 256; else return 125;
                }
                // If room has observed obstructions
                if (Memory.roomCache[roomName] && Memory.roomCache[roomName].obstructions) return 200;
                // If room is under attack
                if (Memory.roomCache[roomName] && Memory.roomCache[roomName].hostilePower > Memory.roomCache[roomName].friendlyPower && Memory.roomCache[roomName].tickDetected + 150 > Game.time) return 100;
                // SK rooms are avoided if not being mined
                if (Memory.roomCache[roomName].sk && Memory.roomCache[roomName].mined + 150 < Game.time) return 100;
                // Avoid rooms reserved by others
                if (Memory.roomCache[roomName].reservation && !_.includes(FRIENDLIES, Memory.roomCache[roomName].reservation)) return 50;
                if (Memory.roomCache[roomName].user && !_.includes(FRIENDLIES, Memory.roomCache[roomName].user)) return 45;
            } else
                // Unknown rooms have a slightly higher weight
            if (!Memory.roomCache[roomName]) return 20;
            return 12;
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
    let bumpCreep = _.find(creep.room.creeps, (c) => c.memory && !c.memory.trailer && c.pos.x === pathInfo.newPos.x && c.pos.y === pathInfo.newPos.y && (!c.memory.other || !c.memory.other.noBump));
    if (bumpCreep) {
        if (!creep.memory.trailer && creep.pos.isNearTo(Game.getObjectById(creep.memory.trailer))) {
            if (bumpCreep.hasActiveBodyparts(MOVE)) {
                bumpCreep.move(bumpCreep.pos.getDirectionTo(creep));
            } else {
                creep.pull(bumpCreep);
                creep.move(creep.pos.getDirectionTo(bumpCreep));
            }
            bumpCreep.say(ICONS.traffic, true)
            pathInfo.pathPosTime = 0;
        } else {
            bumpCreep.moveRandom();
            bumpCreep.say(ICONS.traffic, true)
            pathInfo.pathPosTime = 0;
        }
        bumpCreep.memory._shibMove = undefined;
    } else {
        delete pathInfo.path;
        pathInfo.pathPosTime = 0;
        options.ignoreCreeps = false;
        options.freshMatrix = true;
        options.useCache = false;
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
        if (Math.random() > 0.9) return creep.moveRandom();
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

function checkAvoid(roomName) {
    return Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].avoid;
}

function getMatrix(roomName, creep, options) {
    let room = Game.rooms[roomName];
    let matrix = getTerrainMatrix(roomName, options);
    if (!options.ignoreStructures) matrix = getStructureMatrix(roomName, matrix, options);
    if (room && !options.ignoreCreeps) matrix = getCreepMatrix(roomName, creep, matrix, options);
    if (room && room.hostileCreeps.length && !creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(RANGED_ATTACK)) matrix = getHostileMatrix(roomName, matrix, options);
    matrix = getSKMatrix(roomName, matrix, options);
    return matrix;
}

function getTerrainMatrix(roomName, options) {
    let type = 1;
    if (options.ignoreRoads) type = 2; else if (options.offRoad || options.tunnel) type = 3;
    if (!terrainMatrixCache[roomName + type] || options.showMatrix) {
        terrainMatrixCache[roomName + type] = addTerrainToMatrix(roomName, type, options).serialize();
    }
    return PathFinder.CostMatrix.deserialize(terrainMatrixCache[roomName + type]);
}

function addTerrainToMatrix(roomName, type, options) {
    let matrix = new PathFinder.CostMatrix();
    let terrain = Game.map.getRoomTerrain(roomName);
    let plainCost = type === 4 ? 0 : type === 3 ? 1 : type === 2 ? 1 : 5;
    let swampCost = type === 4 ? 0 : type === 3 ? 1 : type === 2 ? 15 : 25;
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
let siteCount = {};

function getStructureMatrix(roomName, matrix, options) {
    let room = Game.rooms[roomName];
    let type = 1;
    if (options.ignoreRoads) type = 2; else if (options.offRoad) type = 3;
    if (Memory.roomCache[roomName] && Memory.roomCache[roomName].user && Memory.roomCache[roomName].user !== MY_USERNAME) type = 1;
    if (options.tunnel) type = 4;
    if (!room) {
        if (structureMatrixCache[roomName + type]) return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type]);
        return matrix;
    }
    if (!structureMatrixCache[roomName + type] || options.showMatrix || options.tunnel || (!structureMatrixTick[room.name] || Game.time > structureMatrixTick[room.name] + 6000 || structureCount[roomName] !== room.structures.length || siteCount[roomName] !== room.constructionSites.length)) {
        structureMatrixTick[room.name] = Game.time;
        structureCount[roomName] = room.structures.length;
        siteCount[roomName] = room.constructionSites.length;
        structureMatrixCache[roomName + type] = addStructuresToMatrix(room, matrix, type, options).serialize();
    }
    return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type]);
}

function addStructuresToMatrix(room, matrix, type, options) {
    if (!room) return matrix;
    let roadCost = type === 4 ? 1 : type === 3 ? 2 : type === 2 ? 2 : 1;
    for (let structure of room.structures) {
        if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureWall) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureController) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRampart && (structure.my || structure.isPublic) && !structure.pos.checkForObstacleStructure()) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost - 1);
        } else if (structure instanceof StructureRampart && (!structure.my || !structure.isPublic || structure.pos.checkForObstacleStructure())) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRoad && (!structure.pos.checkForRampart() || structure.pos.checkForRampart().my || structure.pos.checkForRampart().isPublic)) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost);
        } else if (structure instanceof StructureContainer) {
            matrix.set(structure.pos.x, structure.pos.y, 45);
        } else {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        }
    }
    let blockingSites = _.filter(room.constructionSites, (s) => (s.my && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART) || (!s.my && _.includes(FRIENDLIES, s.owner.username)));
    for (let site of blockingSites) {
        matrix.set(site.pos.x, site.pos.y, 256);
    }
    //Stationary creeps
    let stationaryCreeps = _.filter(room.creeps, (c) => c.my && c.memory.noBump);
    for (let site of stationaryCreeps) {
        matrix.set(site.pos.x, site.pos.y, 125);
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

let hostileMatrixTick = {};

function getHostileMatrix(roomName, matrix, options) {
    let room = Game.rooms[roomName];
    if (!room) return matrix;
    if (!hostileMatrixCache[roomName] || options.showMatrix || (!hostileMatrixTick[room.name] || Game.time !== hostileMatrixTick[room.name])) {
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
        matrix.set(enemyCreeps[key].pos.x, enemyCreeps[key].pos.y, 0xff);
        let range = 6;
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
    if (!Memory.roomCache[roomName] || !Memory.roomCache[roomName].sk || !room) return matrix;
    if (!room && !_.includes(skNoVision)) {
        skNoVision.push(roomName);
        return matrix;
    }
    if (!skMatrixCache[room.name] || options.showMatrix || (Game.time !== skMatrixTick[room.name] + 5 && Game.rooms[room.name])) {
        room.memory.skMatrixTick = undefined;
        skMatrixTick[room.name] = Game.time;
        skMatrixCache[room.name] = addSksToMatrix(room, matrix, options).serialize();
    }
    return PathFinder.CostMatrix.deserialize(skMatrixCache[roomName]);
}

function addSksToMatrix(room, matrix, options) {
    if (room && Memory.roomCache[room.name] && Memory.roomCache[room.name].sk) {
        let sks = room.find(FIND_CREEPS, {filter: (c) => c.owner.username === 'Source Keeper'});
        let lairs = room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn < 25});
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
                        let weight = 40 * (6 - position.getRangeTo(sk));
                        matrix.set(position.x, position.y, weight)
                    }
                }
            }
        }
        if (lairs.length) {
            for (let lair of lairs) {
                matrix.set(lair.pos.x, lair.pos.y, 256);
                let sites = lair.room.lookForAtArea(LOOK_TERRAIN, lair.pos.y - 4, lair.pos.x - 4, lair.pos.y + 4, lair.pos.x + 4, true);
                for (let site of sites) {
                    let position;
                    try {
                        position = new RoomPosition(site.x, site.y, room.name);
                    } catch (e) {
                        continue;
                    }
                    if (position && !position.checkForWall() && !position.checkForRoad()) {
                        let weight = 40 * (5 - position.getRangeTo(lair));
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
    let cache;
    cache = globalRouteCache;
    if (cache) {
        let cachedRoute = cache[from + '_' + to];
        if (cachedRoute) {
            cachedRoute.uses += 1;
            cachedRoute.tick = Game.time;
            globalRouteCache = cache;
            return JSON.parse(cachedRoute.route);
        }
    }
}

function deleteRoute(from, to) {
    let key = from + '_' + to;
    let cache = globalRouteCache || {};
    if (cache[key]) delete cache[key];
    globalRouteCache = cache;
}

function cachePath(creep, from, to, path) {
    if (!path || !path.length) return;
    Memory._pathCache = undefined;
    //Store path based off move weight
    let options = getMoveWeight(creep);
    let weight = 3;
    if (options.offRoad) {
        weight = 1;
    } else if (options.ignoreRoads) {
        weight = 2;
    }
    let key = getPathKey(from, to, weight);
    if (!globalPathCache && RawMemory.segments[0]) globalPathCache = JSON.parse(RawMemory.segments[0]);
    let cache = globalPathCache || {};
    if (cache instanceof Array) cache = {};
    let tick = Game.time;
    cache[key] = {
        path: path,
        uses: 1,
        tick: tick,
        created: tick
    };
    globalPathCache = cache;
    //if (Math.random() > 0.95) RawMemory.segments[0] = JSON.stringify(cache);
}

function getPath(creep, from, to) {
    let cache = globalPathCache || {};
    //Store path based off move weight
    let options = getMoveWeight(creep);
    let weight = 3;
    if (options.offRoad) {
        weight = 1;
    } else if (options.ignoreRoads) {
        weight = 2;
    }
    let cachedPath = cache[getPathKey(from, to, weight)];
    // Check for the path reversed
    if (!cachedPath && cache[getPathKey(to, from, weight)]) {
        cachedPath = cache[getPathKey(to, from, weight)];
        cachedPath.path = reverseString(cachedPath.path);
    }
    if (cachedPath) {
        cachedPath.uses += 1;
        cachedPath.tick = Game.time;
        globalPathCache = cache;
        return cachedPath.path;
    }
}

function reverseString(str) {
    return str.split('').reverse().join('');
}

function getMoveWeight(creep, options = {}) {
    // Handle PC
    if (creep.className) {
        options.offRoad = true;
        return options;
    }
    let move = creep.hasActiveBodyparts(MOVE);
    let weight = _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length;
    if (creep.memory.trailer && Game.getObjectById(creep.memory.trailer)) weight += _.filter(Game.getObjectById(creep.memory.trailer).body, (p) => p.type !== MOVE && p.type !== CARRY).length;
    let fullCarry = 0;
    if (_.sum(creep.store)) fullCarry = _.ceil(_.sum(creep.store) / 50);
    weight += fullCarry;
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
    let pathfindingCPU = Game.cpu.getUsed();
    shibMove(this, destination, options);
    tools.taskCPU('pathfinding', Game.cpu.getUsed() - pathfindingCPU);
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
Room.prototype.routeSafe = function (destination = this.name, maxThreat = 2, maxHeat = 500) {
    if (routeSafetyCache[this.name + '.' + destination] && routeSafetyCache[this.name + '.' + destination].expire > Game.time) return routeSafetyCache[this.name + '.' + destination].status;
    let safe = true;
    let route = findRoute(this.name, destination);
    if (route && route.length) route.forEach(function (r) {
        if (Memory.roomCache[r] && (Memory.roomCache[r].threatLevel >= maxThreat || Memory.roomCache[r].roomHeat >= maxHeat)) return safe = false;
    })
    let cache = routeSafetyCache[this.name + '.' + destination] || {};
    cache.status = safe;
    cache.expire = Game.time + 100;
    routeSafetyCache[this.name + '.' + destination] = cache;
    return safe;
};
RoomPosition.prototype.shibMove = function (destination, options) {
    return shibMove(this, destination, options);
};


Creep.prototype.shibKite = function (fleeRange = FLEE_RANGE, target = undefined) {
    if (!this.hasActiveBodyparts(MOVE) || (this.room.controller && this.room.controller.safeMode)) return false;
    // If in a rampart you're safe
    if (this.pos.checkForRampart()) return true;
    let avoid = _.filter(this.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) && this.pos.getRangeTo(c) <= fleeRange + 1).concat(this.pos.findInRange(this.room.structures, fleeRange + 1, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR})) || target;
    if (!avoid || !avoid.length) return false;
    this.say('!!RUN!!', true);
    this.memory.kiteRoom = this.memory.room;
    // Border hump if it's safe and nearby
    let closestExit = this.pos.findClosestByRange(FIND_EXIT);
    if (this.pos.getRangeTo(closestExit) <= 5) return this.shibMove(closestExit, {range: 0});
    this.memory._shibMove = undefined;
    let avoidance = _.map(avoid, (c) => {
        return {pos: c.pos, range: fleeRange + 1};
    });
    let options = getMoveWeight(this, {});
    let creep = this;
    let ret = PathFinder.search(this.pos, avoidance, {
        flee: true,
        swampCost: 75,
        plainCost: 3,
        maxRooms: 2,
        roomCallback: function () {
            let matrix = getTerrainMatrix(creep.room.name, options);
            matrix = getStructureMatrix(creep.room.name, matrix, options);
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