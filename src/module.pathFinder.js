/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

const DEFAULT_MAXOPS = 10000;
const STATE_STUCK = 2;
const FLEE_RANGE = 4;

const terrainMatrixCache = {};
const structureMatrixCache = {};
const creepMatrixCache = {};
const hostileMatrixCache = {};
const skMatrixCache = {};
let tempAvoidRooms = [];

function shibMove(creep, heading, options = {}) {
    if (creep.borderCheck()) return;
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
        tunnel: false
    });
    // Clear bad tow creeps
    if (creep.memory.towCreep && (!Game.getObjectById(creep.memory.towCreep) || Game.getObjectById(creep.memory.towCreep).pos.roomName !== creep.pos.roomName)) creep.memory.towCreep = undefined;
    // Handle fatigue
    if (!creep.className && creep.getActiveBodyparts(MOVE) && (creep.fatigue > 0 || !heading)) {
        if (!creep.memory.military) creep.idleFor(1);
        return creep.room.visual.circle(creep.pos, {
            fill: 'transparent',
            radius: 0.55,
            stroke: 'black'
        });
    }
    // Handle heals before moving
    if (creep.hits < creep.hitsMax && creep.memory.destination && creep.memory.destination !== creep.room.name) {
        let partner = Game.getObjectById(creep.memory.buddyAssigned);
        if (creep.getActiveBodyparts(HEAL) || (partner && partner.getActiveBodyparts(HEAL))) {
            creep.heal(creep);
            creep.shibKite();
            if (partner) {
                partner.shibMove(creep);
                partner.healInRange();
            }
            return;
        }
    }
    // If stuck in room, move
    if (creep.memory._shibMove && creep.memory._shibMove.routeReset) {
        if (creep.memory._shibMove.lastRoom !== creep.room.name) {
            return creep.memory._shibMove = undefined;
        } else {
            creep.moveTo(creep.pos.findClosestByPath(FIND_EXIT));
        }
    }
    // Get range
    let rangeToDestination = creep.pos.getRangeTo(heading);
    // Set these for creeps that can afford them
    if (!creep.className && (!options.ignoreRoads || !options.offRoad)) {
        options = getMoveWeight(creep, options);
    }
    // Use roads with a trailer
    // Request a tow truck if needed
    if (!creep.className) {
        if ((creep.pos.getRangeTo(heading) > 3 || !creep.getActiveBodyparts(MOVE)) && !creep.memory.towDestination && _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length / 2 > _.filter(creep.body, (p) => p.type === MOVE).length && creep.memory.role !== 'responder') {
            creep.memory.towDestination = heading.id || heading;
            creep.memory.towRange = options.range;
        } else if (heading.id && creep.getActiveBodyparts(MOVE) && creep.pos.isNearTo(heading)) {
            creep.memory.towDestination = undefined;
        }
        if (creep.memory.towDestination && creep.memory.towCreep) {
            return;
        }
    }
    // CPU Saver for moving to 0 on creeps
    if (heading instanceof Creep && options.range === 0 && rangeToDestination > 2) options.range = 1;
    // Check if target reached or within 1
    if (!options.flee && rangeToDestination <= options.range) {
        creep.memory.towDestination = undefined;
        creep.memory._shibMove = undefined;
        return false;
    } else if (rangeToDestination === 1) {
        let direction = creep.pos.getDirectionTo(heading);
        return creep.move(direction);
    }
    if (!heading instanceof RoomPosition && creep.room.name !== heading.room.name) return creep.shibMove(new RoomPosition(25, 25, heading.room.name), {range: 24});
    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    // Make sure origin and target are good
    if (!origin || !target) return;
    updateRoomStatus(creep.room);
    if (!creep.memory._shibMove || (creep.memory._shibMove.path && (creep.memory._shibMove.path.length < 1 || !creep.memory._shibMove.path))) creep.memory._shibMove = {};
    if (creep.memory._shibMove && ((creep.memory._shibMove.path && creep.memory._shibMove.path.length < 1) || !creep.memory._shibMove.path)) creep.memory._shibMove = {};
    // Check if target moved
    if (creep.memory._shibMove.target && (target instanceof Creep || target instanceof PowerCreep) && (creep.memory._shibMove.target.x !== target.x || creep.memory._shibMove.target.y !== target.y)) {
        // If the target is still in the general area and we have a ways to go, don't repath
        let storedPos = new RoomPosition(creep.memory._shibMove.target.x, creep.memory._shibMove.target.y, creep.memory._shibMove.target.roomName);
        let currentTargetPos = new RoomPosition(target.x, target.y, target.roomName);
        if (creep.pos.getRangeTo(currentTargetPos) <= 5 || currentTargetPos.getRangeTo(storedPos) >= 3) creep.memory._shibMove = {};
    }
    // Set var
    let pathInfo = creep.memory._shibMove;
    pathInfo.targetRoom = targetRoom(heading);
    //Clear path if stuck
    if (pathInfo.pathPosTime && pathInfo.pathPosTime >= STATE_STUCK) {
        if (pathInfo.pathPosTime >= STATE_STUCK * 2.5) structureMatrixCache[creep.room.name] = undefined;
        creepBumping(creep, pathInfo, options);
    }
    //Handle getting stuck in rooms on multi rooms pathing
    if (pathInfo.route && pathInfo.route.length) {
        if (!creep.memory._shibMove.lastRoom || creep.memory.lastRoom !== creep.room.name) {
            creep.memory._shibMove.roomTimer = 0;
            creep.memory._shibMove.lastRoom = creep.room.name;
        }
        creep.memory._shibMove.roomTimer++;
        if (creep.memory._shibMove.roomTimer >= 100) {
            // Handle this being the desto but the room being inaccessible
            if (creep.memory.targetRoom === creep.room.name) return creep.memory.recycle = true;
            // Otherwise move to closes exit and set stuck room to avoid
            if (!_.includes(tempAvoidRooms, creep.room.name)) tempAvoidRooms.push(creep.room.name);
            delete creep.memory._shibMove;
            return creep.memory._shibMove.routeReset = true;
        }
    }
    //Execute path if target is valid and path is set
    if (pathInfo.path) {
        // Check if room is impassible
        if (pathInfo.route && pathInfo.route.length > 1 && pathInfo.routeCheck !== creep.room.name) {
            pathInfo.routeCheck = creep.room.name;
            if (pathInfo.route[0] === creep.room.name) {
                if (!creep.pos.findClosestByPath(creep.room.findExitTo(pathInfo.route[1]))) {
                    Memory.roomCache[creep.room.name].tempAvoid = Game.time;
                    if (!Memory.roomCache[pathInfo.route[1]]) Memory.roomCache[pathInfo.route[1]] = {};
                    Memory.roomCache[pathInfo.route[1]].tempAvoid = Game.time;
                    log.e(creep.name + ' in ' + roomLink(creep.room.name) + ' has committed suicide due to a pathing error.', 'PATHFINDING:');
                    return creep.suicide();
                }
            }
        }
        if (pathInfo.newPos && pathInfo.newPos.x === creep.pos.x && pathInfo.newPos.y === creep.pos.y && pathInfo.newPos.roomName === creep.pos.roomName) pathInfo.path = pathInfo.path.slice(1);
        let nextDirection = parseInt(pathInfo.path[0], 10);
        if (nextDirection && pathInfo.newPos) {
            pathInfo.newPos = positionAtDirection(origin, nextDirection);
            creep.memory._shibMove = pathInfo;
            if (pathInfo.pathPos === creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName) {
                // Handle tunneling thru walls/ramps
                if (options.tunnel && pathInfo.path) {
                    let nextPos = positionAtDirection(origin, nextDirection);
                    if (nextPos.checkForBarrierStructure()) {
                        if (Math.random() > 0.98) return creep.memory._shibMove = undefined;
                        let barrier = Game.getObjectById(creep.memory.barrierClearing) || nextPos.checkForBarrierStructure();
                        creep.memory.barrierClearing = barrier.id;
                        if (creep.getActiveBodyparts(WORK)) {
                            barrier.say(_.round(barrier.hits / (creep.getActiveBodyparts(WORK) * DISMANTLE_POWER)) + ' ticks.')
                            return creep.dismantle(barrier);
                        } else if (creep.getActiveBodyparts(ATTACK)) {
                            barrier.say(_.round(barrier.hits / (creep.getActiveBodyparts(WORK) * ATTACK_POWER)) + ' ticks.')
                            return creep.attack(barrier);
                        } else if (creep.getActiveBodyparts(RANGED_ATTACK)) {
                            barrier.say(_.round(barrier.hits / (creep.getActiveBodyparts(WORK) * RANGED_ATTACK_POWER)) + ' ticks.')
                            return creep.rangedAttack(barrier);
                        }
                    }
                }
                pathInfo.pathPosTime++;
            } else {
                pathInfo.pathPos = creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName;
                pathInfo.pathPosTime = 0;
            }
            switch (creep.move(nextDirection)) {
                case OK:
                    break;
                case ERR_TIRED:
                    break;
                case ERR_NO_BODYPART:
                    break;
                case ERR_BUSY:
                    creep.idleFor(10);
                    break;
            }
        } else {
            delete pathInfo.path;
        }
    } else {
        shibPath(creep, heading, pathInfo, origin, target, options);
    }
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    let cached, closestPortal, closestDistance;
    if (!Memory.roomCache[creep.room.name]) creep.room.cacheRoomIntel(true);
    if (!target) return creep.moveRandom();
    if (options.useCache && !Memory.roomCache[creep.room.name].threatLevel && !options.tunnel) cached = getPath(creep, origin, target);
    if (cached && options.ignoreCreeps) {
        pathInfo.findAttempt = undefined;
        creep.memory.badPathing = undefined;
        pathInfo.target = target;
        pathInfo.path = cached;
        pathInfo.usingCached = true;
        let nextDirection = parseInt(pathInfo.path[0], 10);
        pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
        creep.room.visual.circle(creep.pos, {
            fill: 'transparent',
            radius: 0.55,
            stroke: 'red'
        });
        return creep.move(nextDirection);
    } else {
        let roomDistance = 0;
        if (origin.roomName !== target.roomName) roomDistance = Game.map.findRoute(origin.roomName, target.roomName).length
        pathInfo.usingCached = undefined;
        let originRoomName = origin.roomName;
        let destRoomName = target.roomName;
        let allowedRooms = pathInfo.route || options.route;
        if (!allowedRooms && roomDistance > 0) {
            // Check for portals and don't use cached if one exists
            let potentialPortal = _.filter(Memory.roomCache, (r) => r.portal && Game.map.getRoomLinearDistance(origin.roomName, r.name) <= roomDistance * 0.2 && JSON.parse(r.portal)[0].destination.roomName && Game.map.findRoute(JSON.parse(r.portal)[0].destination.roomName, target.roomName).length <= roomDistance * 0.5);
            if (potentialPortal.length) {
                for (let portalRoom of potentialPortal) {
                    let distance = Game.map.getRoomLinearDistance(origin.roomName, portalRoom.name);
                    if (!closestPortal || distance < closestPortal) {
                        closestDistance = distance;
                        closestPortal = portalRoom.name;
                        options.usePortal = JSON.parse(portalRoom.portal)[0].destination.roomName;
                        target.roomName = portalRoom.name;
                    }
                }
            }
            let route;
            if (!route && Game.map.findRoute(origin.roomName, target.roomName)[0]) route = findRoute(origin.roomName, target.roomName, options);
            if (route) {
                allowedRooms = route;
                pathInfo.route = route;
                options.maxRooms = route.length
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
                options.maxRooms = 1;
                return shibPath(creep, target, pathInfo, origin, target, options);
            }
        }
        let callback = (roomName) => {
            if (allowedRooms && !_.includes(allowedRooms, roomName)) return false;
            if (checkAvoid(roomName) && roomName !== destRoomName && roomName !== originRoomName) return false;
            if (!Game.rooms[roomName]) return;
            return getMatrix(roomName, creep, options);
        };
        let ret = PathFinder.search(origin, {pos: target, range: options.range}, {
            maxOps: options.maxOps,
            maxRooms: options.maxRooms,
            roomCallback: callback,
        });
        if (ret.incomplete) {
            target = new RoomPosition(25, 25, target.roomName);
            options.range = 23;
            if (!pathInfo.findAttempt && roomDistance) {
                options.useFindRoute = true;
                options.maxRooms = 16;
                pathInfo.findAttempt = true;
                options.maxOps = 50000;
                //log.e("PATHING ERROR: Creep " + creep.name + " could not find a path from " + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + " retrying.");
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
        if (options.confirmPath && ret.path && !ret.incomplete) return true;
        pathInfo.path = serializePath(creep.pos, ret.path);
        let nextDirection = parseInt(pathInfo.path[0], 10);
        pathInfo.newPos = positionAtDirection(creep.pos, nextDirection);
        pathInfo.target = target;
        if (options.ignoreCreeps && !options.ignoreStructures) cachePath(creep, origin, target, pathInfo.path);
        delete pathInfo.findAttempt;
        delete creep.memory.badPathing;
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

function findRoute(origin, destination, options = {}) {
    let restrictDistance = Game.map.getRoomLinearDistance(origin, destination) + 4;
    let roomDistance = Game.map.findRoute(origin, destination).length;
    let route;
    if (options.useCache) route = getRoute(origin, destination);
    if (route) return route;
    route = Game.map.findRoute(origin, destination, {
        routeCallback: function (roomName) {
            // Skip origin/destination
            if (roomName === origin || roomName === destination) return 1;
            // Regex highway check
            let [EW, NS] = roomName.match(/\d+/g);
            let isAlleyRoom = EW%10 == 0 || NS%10 == 0;
            // Add a check for novice/respawn
            if (!isAlleyRoom && Game.map.getRoomStatus(roomName).status !== Game.map.getRoomStatus(origin).status) return 256;
            // room is too far out of the way
            if (Game.map.getRoomLinearDistance(origin, roomName) > restrictDistance) return 256;
            // My rooms
            if (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) return 1;
            // Check for avoid flagged rooms
            if (Memory.avoidRooms && _.includes(_.union(Memory.avoidRooms, tempAvoidRooms), roomName)) return 254;
            if (Memory.roomCache && Memory.roomCache[roomName]) {
                // Temp avoid
                if (Memory.roomCache[roomName].tempAvoid) {
                    if (Memory.roomCache[roomName].tempAvoid + 3000 > Game.time) return 256; else delete Memory.roomCache[roomName].tempAvoid;
                }
                // Highway
                if (Memory.roomCache[roomName].isHighway) return 8;
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
                if (Memory.roomCache[roomName].sk && Memory.roomCache[roomName].mined + 50 < Game.time) return 50;
                // Friendly Rooms
                if (Memory.roomCache[roomName].user && _.includes(FRIENDLIES, Memory.roomCache[roomName].user)) return 10;
                // Avoid rooms reserved by others
                if (Memory.roomCache[roomName].reservation && !_.includes(FRIENDLIES, Memory.roomCache[roomName].reservation)) return 35;
                if (Memory.roomCache[roomName].user && !_.includes(FRIENDLIES, Memory.roomCache[roomName].user)) return 25;
            } else
                // Unknown rooms have a slightly higher weight
            if (!Memory.roomCache[roomName]) return 20;
            return 12;
        }
    });
    let path = undefined;
    if (route.length) {
        path = [];
        path.push(origin);
        for (let key in route) {
            path.push(route[key].room)
        }
    }
    if (path && roomDistance > 2 && path[1] === destination) {
        path.splice(1, 1);
    }
    cacheRoute(origin, destination, path);
    return path;
}

//FUNCTIONS
function creepBumping(creep, pathInfo, options) {
    let bumpCreep = _.filter(creep.room.creeps, (c) => c.memory && !c.memory.trailer && c.pos.x === pathInfo.newPos.x && c.pos.y === pathInfo.newPos.y && ((!c.memory.other || !c.memory.other.noBump) || pathInfo.pathPosTime >= STATE_STUCK * 2))[0];
    if (bumpCreep) {
        if (!creep.memory.trailer && creep.pos.isNearTo(Game.getObjectById(creep.memory.trailer))) {
            if (bumpCreep.getActiveBodyparts(MOVE)) {
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

function targetRoom(destination) {
    if (!(destination instanceof RoomPosition)) {
        if (destination) {
            return destination.pos.roomName;
        } else {
            return;
        }
    }
    return destination.roomName;
}

function checkAvoid(roomName) {
    return Memory.rooms && Memory.rooms[roomName] && Memory.rooms[roomName].avoid;
}

function getMatrix(roomName, creep, options) {
    let room = Game.rooms[roomName];
    let matrix = getTerrainMatrix(roomName, options);
    if (!options.ignoreStructures) matrix = getStructureMatrix(roomName, matrix, options);
    if (!options.ignoreCreeps) matrix = getCreepMatrix(roomName, creep, matrix);
    if (room && room.hostileCreeps.length) matrix = getHostileMatrix(roomName, matrix);
    matrix = getSKMatrix(roomName, matrix);
    return matrix;
}

function getTerrainMatrix(roomName, options) {
    let type = 1;
    if (options.ignoreRoads) type = 2; else if (options.offRoad) type = 3;
    if (options.tunnel) type = 4;
    if (!terrainMatrixCache[roomName + type]) {
        terrainMatrixCache[roomName + type] = addTerrainToMatrix(roomName, type).serialize();
    }
    return PathFinder.CostMatrix.deserialize(terrainMatrixCache[roomName + type]);
}

function addTerrainToMatrix(roomName, type) {
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
            if (matrix.get(x, y) < 0x03 && Game.map.getRoomTerrain(roomName).get(x, y) !== TERRAIN_MASK_WALL) {
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
    if (!structureMatrixCache[roomName + type] || options.tunnel || (!structureMatrixTick[room.name] || Game.time > structureMatrixTick[room.name] + 10000 || structureCount[roomName] !== room.structures.length || siteCount[roomName] !== room.constructionSites.length)) {
        room.memory.structureMatrixTick = undefined;
        structureMatrixTick[room.name] = Game.time;
        structureCount[roomName] = room.structures.length;
        siteCount[roomName] = room.constructionSites.length;
        structureMatrixCache[roomName + type] = addStructuresToMatrix(room, matrix, type).serialize();
    }
    return PathFinder.CostMatrix.deserialize(structureMatrixCache[roomName + type]);
}

function addStructuresToMatrix(room, matrix, type) {
    if (!room) return matrix;
    let roadCost = type === 4 ? 0 : type === 3 ? 10 : type === 2 ? 5 : 1;
    for (let structure of room.structures) {
        if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureWall) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureController) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRampart && ((!structure.my && !structure.isPublic) || structure.pos.checkForObstacleStructure())) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRampart && (structure.my || structure.isPublic) && !structure.pos.checkForObstacleStructure()) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost - 1);
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
    let stationaryCreeps = _.filter(room.creeps, (c) => c.my && (_.filter(c.body, (p) => p.type !== MOVE && p.type !== CARRY).length / 2 > _.filter(c.body, (p) => p.type === MOVE).length || c.memory.role === 'stationaryHarvester' || c.memory.role === 'upgrader' || c.memory.role === 'reserver' || c.memory.role === 'remoteHarvester' || c.memory.role === 'praiseUpgrader'));
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
                matrix.set(s.pos.x, s.pos.y, (s.hits / maxHp) * 100);
            }
        }
    }
    return matrix;
}

let creepMatrixTick = {};
function getCreepMatrix(roomName, creep, matrix) {
    let room = Game.rooms[roomName];
    if (!creepMatrixCache[roomName] || (!creepMatrixTick[room.name] || Game.time !== creepMatrixTick[room.name])) {
        room.memory.creepMatrixTick = undefined;
        creepMatrixTick[room.name] = Game.time;
        creepMatrixCache[roomName] = addCreepsToMatrix(room, matrix, creep).serialize();
    }
    return PathFinder.CostMatrix.deserialize(creepMatrixCache[roomName]);
}

function addCreepsToMatrix(room, matrix, creep = undefined) {
    if (!room) return matrix;
    let creeps = room.creeps;
    if (!room.hostileCreeps.length && creep) {
        creeps = creep.pos.findInRange(FIND_CREEPS, 5);
        creeps = creeps.concat(creep.pos.findInRange(FIND_POWER_CREEPS, 5));
    }
    for (let key in creeps) {
        matrix.set(creeps[key].pos.x, creeps[key].pos.y, 0xff);
    }
    return matrix;
}

let hostileMatrixTick = {};
function getHostileMatrix(roomName, matrix) {
    let room = Game.rooms[roomName];
    if (!hostileMatrixCache[roomName] || (!hostileMatrixTick[room.name] || Game.time !== hostileMatrixTick[room.name])) {
        room.memory.hostileMatrixTick = undefined;
        hostileMatrixTick[room.name] = Game.time;
        hostileMatrixCache[roomName] = addHostilesToMatrix(room, matrix).serialize();
    }
    return PathFinder.CostMatrix.deserialize(hostileMatrixCache[roomName]);
}

function addHostilesToMatrix(room, matrix) {
    if (!room) return matrix;
    let enemyCreeps = _.filter(room.hostileCreeps, (c) => !c.className && (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)));
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
function getSKMatrix(roomName, matrix) {
    let room = Game.rooms[roomName];
    if (!Memory.roomCache[roomName] || !Memory.roomCache[roomName].sk) return matrix;
    if (!skMatrixCache[room.name] || (!skMatrixTick[room.name] || Game.time !== skMatrixTick[room.name] + 5)) {
        room.memory.skMatrixTick = undefined;
        skMatrixTick[room.name] = Game.time;
        skMatrixCache[room.name] = addSksToMatrix(room, matrix).serialize();
    }
    return PathFinder.CostMatrix.deserialize(skMatrixCache[roomName]);
}

function addSksToMatrix(room, matrix) {
    if (room && Memory.roomCache[room.name] && Memory.roomCache[room.name].sk) {
        let sks = room.find(FIND_CREEPS, {filter: (c) => c.owner.username === 'Source Keeper'});
        let lairs = room.find(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR && s.ticksToSpawn < 25});
        if (sks.length) {
            for (let sk of sks) {
                matrix.set(sk.pos.x, sk.pos.y, 256);
                let sites = sk.room.lookForAtArea(LOOK_TERRAIN, sk.pos.y - 4, sk.pos.x - 4, sk.pos.y + 4, sk.pos.x + 4, true);
                for (let site of sites) {
                    let position;
                    try {
                        position = new RoomPosition(site.x, site.y, room.name);
                    } catch (e) {
                        continue;
                    }
                    if (position && !position.checkForWall()) {
                        let weight = 40 * (5 - position.getRangeTo(sk));
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
                    if (position && !position.checkForWall()) {
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

function updateRoomStatus(room) {
    if (!room) return;
    if (room.controller) {
        if (room.controller.owner && !room.controller.my && !_.includes(FRIENDLIES, room.controller.owner.username)) {
            room.memory.avoid = 1;
        }
        else {
            delete room.memory.avoid;
        }
    }
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
    let cache = Memory._routeCache || {};
    if (cache instanceof Array) cache = {};
    let tick = Game.time;
    cache[key] = {
        route: JSON.stringify(route),
        uses: 1,
        tick: tick,
        created: tick
    };
    Memory._routeCache = cache;
}

function getRoute(from, to) {
    let cache;
    cache = Memory._routeCache;
    if (cache) {
        let cachedRoute = cache[from + '_' + to];
        if (cachedRoute) {
            cachedRoute.uses += 1;
            cachedRoute.tick = Game.time;
            Memory._routeCache = cache;
            return JSON.parse(cachedRoute.route);
        }
    }
}

function cachePath(creep, from, to, path) {
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
    let cache = creep.memory._pathCache || {};
    if (cache instanceof Array) cache = {};
    let tick = Game.time;
    cache[key] = {
        path: path,
        uses: 1,
        tick: tick,
        created: tick
    };
    creep.memory._pathCache = cache;
}

function getPath(creep, from, to) {
    let cache = creep.memory._pathCache || {};
    //if (creep.memory.other && creep.memory.other.localPathCache && creep.memory.other.localPathCache[getPathKey(from, to)]) return creep.memory.other.localPathCache[getPathKey(from, to)].path; else if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') cache = Memory._pathCache || {}; else cache = pathCache;
    //Store path based off move weight
    let options = getMoveWeight(creep);
    let weight = 3;
    if (options.offRoad) {
        weight = 1;
    } else if (options.ignoreRoads) {
        weight = 2;
    }
    let cachedPath = cache[getPathKey(from, to, weight)];
    if (cachedPath) {
        cachedPath.uses += 1;
        cachedPath.tick = Game.time;
        creep.memory._pathCache = cache;
        return cachedPath.path;
    }
}

function getMoveWeight(creep, options = {}) {
    // Handle PC
    if (creep.className) {
        options.offRoad = true;
        return options;
    }
    let move = creep.getActiveBodyparts(MOVE);
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
    return shibMove(this, destination, options);
};
Creep.prototype.shibRoute = function (destination, options) {
    return findRoute(this.room.name, destination, options);
};
Room.prototype.shibRoute = function (destination, options) {
    return findRoute(this.name, destination, options);
};
Room.prototype.routeSafe = function (destination = this.name, maxThreat = 2, maxHeat = 500) {
    let safe = true;
    let route = findRoute(this.name, destination);
    if (route && route.length) route.forEach(function (r) {
        if (Memory.roomCache[r] && (Memory.roomCache[r].threatLevel >= maxThreat || Memory.roomCache[r].roomHeat >= maxHeat)) return safe = false;
    })
    return safe;
};
RoomPosition.prototype.shibMove = function (destination, options) {
    return shibMove(this, destination, options);
};


Creep.prototype.shibKite = function (fleeRange = FLEE_RANGE, target = undefined) {
    if (!this.getActiveBodyparts(MOVE) || (this.room.controller && this.room.controller.safeMode)) return false;
    let avoid = _.filter(this.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)) && this.pos.getRangeTo(c) <= fleeRange + 1) || this.pos.findInRange(this.room.structures, fleeRange + 1, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR})[0] || target;
    if ((this.memory.destination === this.room.name || this.memory.other.responseTarget === this.room.name) && Memory.roomCache[this.room.name] && Memory.roomCache[this.room.name].sk) {
        let sk = _.filter(this.room.creeps, (c) => c.owner.username === 'Source Keeper' && this.pos.getRangeTo(c) <= fleeRange + 1);
        avoid = _.union(avoid, sk);
    }
    if (!avoid || !avoid.length) return false;
    // If in a rampart you're safe
    if (this.pos.checkForRampart()) return true;
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
            matrix = getCreepMatrix(creep.room.name, creep, matrix);
            matrix = getHostileMatrix(creep.room.name, matrix);
            return getSKMatrix(creep.room.name, matrix);
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