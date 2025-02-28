/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const DEFAULT_MAXOPS = 1500;
const STATE_STUCK = 2;
const FLEE_RANGE = 4;

const MATRIX_CACHE = {};
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
        ignoreCreeps: true
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

    // Handle fatigue
    if (!creep.className && creep.fatigue > 0 && creep.hasActiveBodyparts(MOVE)) {
        if (!creep.memory.military) creep.idleFor(1);
        return creep.room.visual.circle(creep.pos, {
            fill: 'transparent',
            radius: 0.55,
            stroke: 'black'
        });
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
            if (!TOW_TRUCK_CACHE[roomName] || Game.time !== TOW_TRUCK_CACHE[roomName].tick) {
                TOW_TRUCK_CACHE[roomName] = {
                    candidates: creep.room.myCreeps.filter(c =>
                        c.memory.canTow && !c.memory.trailer && !c.store.getUsedCapacity()),
                    tick: Game.time
                };
            }
            const closest = creep.pos.findClosestByRange(TOW_TRUCK_CACHE[roomName].candidates);
            if (closest) {
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
    const pathKey = `${origin.roomName}_${origin.x}_${origin.y}_${target.roomName}_${target.x}_${target.y}`;
    // Early exit for adjacent targets
    if (origin.roomName === target.roomName && creep.pos.isNearTo(heading)) {
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
        return executePath(creep, pathInfo, options, origin, heading);
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
        maxOps: roomDistance ? options.maxOps * roomDistance : options.maxOps,
        maxRooms: allowedRooms.length ? allowedRooms.length + 2 : 1,
        roomCallback: function (roomName) {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            return getMatrix(roomName, creep, options);
        }
    });
    // YES
    if (!result.incomplete) {
        const direction = parseInt(result.path[0], 10);
        pathInfo.target = target;
        pathInfo.path = serializePath(creep.pos, result.path);
        pathInfo.pathKey = pathKey;
        pathInfo.pathAge = 0;
        pathInfo.newPos = creep.pos.positionAtDirection(direction);
        creep.memory._shibMove = pathInfo;
        if (options.ignoreCreeps) cachePath(creep, origin, target, pathInfo);
        if (options.getPath) return creep.memory.getPath = pathInfo.path;
        return executePath(creep, pathInfo, options, origin, heading);
    } else {
        return creep.moveTo(target);
    }
    if (!creep.memory.repathAttempt || creep.memory.repathAttempt + 10 < Game.time) {
        creep.memory.repathAttempt = Game.time;
        options.range = options.range + 1;
        return shibPath(creep, heading, pathInfo, origin, target, options);
    }
    // Handle failed
    if (!creep.memory.badPathing && roomDistance) {
        creep.memory.badPathing = 1;
        deleteRoute(origin.roomName, target.roomName);
        deleteRoute(creep.roomName, target.roomName);
    } else {
        if (creep.memory.badPathing) creep.memory.badPathing++; else creep.memory.badPathing = 1;
        if (creep.memory.badPathing > 10) {
            if (!roomDistance) {
                log.e(creep.name + ' is stuck in ' + creep.room.name + ' and is unable to path from ' + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + '. Suiciding for the good of the CPU.');
                log.e('Ret - ' + JSON.stringify(result));
                if (allowedRooms) log.d('Path - ' + allowedRooms);
                if (creep.memory.destination && (Memory.targetRooms[creep.memory.destination] || Memory.auxiliaryTargets[creep.memory.destination])) {
                    delete Memory.targetRooms[creep.memory.destination];
                    delete Memory.auxiliaryTargets[creep.memory.destination];
                    delete INTEL[creep.memory.destination]
                    log.e('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot find a path.', 'HIGH COMMAND: ');
                }
                return creep.suicide();
            } else {
                creep.moveTo(target);
            }
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
    if (roomDistance > 15) return;

    const route = Game.map.findRoute(origin, destination, {
        routeCallback: (roomName) => {
            if (roomName === origin || roomName === destination) return 1;
            const intel = INTEL[roomName];
            if (roomStatus(roomName) === 'closed' ||
                (intel && !intel.isHighway && roomStatus(roomName) !== roomStatus(origin))) return Infinity;
            if (Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my) return 1;
            if (Memory.avoidRooms && Memory.avoidRooms.includes(roomName)) return 250;
            if (!intel || intel.cached + 10000 < Game.time) return 50;
            if (intel.user && FRIENDLIES.includes(intel.user)) return 5;
            if (intel.user && !FRIENDLIES.includes(intel.user)) return intel.towers ? Infinity : 10;
            if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) return 50;
            if (intel.obstacles) return 200;
            if (intel.sk && intel.towers) return 250;
            if (intel.threatLevel) return 60 * intel.threatLevel;
            return intel.isHighway ? 3 : 7;
        }
    });

    const path = route.length ? route.map(r => r.room) : [];
    cacheRoute(origin, destination, path.length ? path : undefined, !path.length);
    return path;
}

//FUNCTIONS
function creepBumping(creep, pathInfo, options) {
    if (!pathInfo || !pathInfo.newPos) return creep.moveRandom();
    let nextPosition = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
    if (nextPosition) {
        let bumpCreep = _.find(nextPosition.lookFor(LOOK_CREEPS), (c) => c.my && !c.fatigue && (!c.memory.other || !c.memory.other.stationary));
        if (bumpCreep) {
            if (!bumpCreep.hasActiveBodyparts(MOVE)) {
                creep.pull(bumpCreep);
                creep.move(creep.pos.getDirectionTo(bumpCreep));
            } else if (!creep.className && !creep.memory.trailer) {
                bumpCreep.move(bumpCreep.pos.getDirectionTo(creep));
                creep.move(creep.pos.getDirectionTo(bumpCreep));
            } else {
                bumpCreep.moveRandom();
                creep.move(creep.pos.getDirectionTo(bumpCreep));
            }
            bumpCreep.say(ICONS.traffic, true)
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

function visualizeCostMatrix(costMatrix, roomName) {
    const visual = new RoomVisual(roomName);

    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            const cost = costMatrix.get(x, y);
            if (cost > 0) { // Only show non-zero costs for clarity
                visual.text(cost, x, y, {color: '#ffffff', font: 0.5});
                // Or use circles: visual.circle(x, y, { radius: 0.2, fill: getColorForCost(cost) });
            }
        }
    }
}

function getMatrix(roomName, creep, options) {
    const room = Game.rooms[roomName];
    let armedEnemies = [];
    if (room) armedEnemies = room.hostileCreeps.filter((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    let matrix = getTerrainMatrix(roomName, options);
    matrix = getStructureMatrix(roomName, creep, matrix, options);
    if (!options.ignoreCreeps) matrix = getCreepMatrix(roomName, creep, matrix, options);
    matrix = getStationaryCreepsMatrix(roomName, creep, matrix, options);
    if (creep instanceof Creep && armedEnemies.length) {
        if (!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(RANGED_ATTACK)) matrix = getHostileMatrix(roomName, matrix, options);
        //matrix = getOutsideHubMatrix(roomName, matrix, options);
    }
    matrix = getSKMatrix(roomName, matrix, options);
    //if (roomName === 'W4N9' && options.squad) visualizeCostMatrix(matrix, roomName);
    return matrix;
}

function getCachedMatrix(roomName, type, tickTTL, computeFn) {
    const key = `${roomName}_${type}`;
    if (MATRIX_CACHE[key] && Game.time - MATRIX_CACHE[key].tick < tickTTL) {
        return MATRIX_CACHE[key].matrix.clone(); // Assumes CostMatrix has .clone()
    }
    const matrix = computeFn();
    MATRIX_CACHE[key] = {matrix: matrix, tick: Game.time}; // Explicit property names
    return matrix;
}

function getTerrainMatrix(roomName, options) {
    const type = options.offRoad || options.tunnel ? 3 : options.ignoreRoads ? 2 : options.squad ? 4 : 1;
    return getCachedMatrix(roomName, `terrain_${type}`, 100000, () => addTerrainToMatrix(roomName, type));

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
                plainCost = 1;
                swampCost = 25;
        }
        // Squad matrix has higher costs in tiles neighboring swamps and walls
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                let tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 256);
                } else if (x === 0 || x === 49 || y === 0 || y === 49) {
                    matrix.set(x, y, 10);
                } else if (tile === TERRAIN_MASK_SWAMP) {
                    matrix.set(x, y, swampCost);
                } else {
                    matrix.set(x, y, plainCost);
                }
            }
        }
        return matrix;
    }
}

function getStructureMatrix(roomName, creep, matrix, options) {
    const type = options.offRoad || options.tunnel ? 3 : options.ignoreRoads ? 2 : options.squad ? 4 : 1;
    const room = Game.rooms[roomName];
    if (!room) return matrix;
    return getCachedMatrix(roomName, `struct_${type}`, 50, () => addStructuresToMatrix(room, creep, matrix, type, options));

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
            if (room.hostileCreeps.length && structure instanceof StructureRoad && !structure.pos.checkForObstacleStructure() && !structure.pos.checkForContainer()
                && structure.pos.checkForRampart()) {
                matrix.set(structure.pos.x, structure.pos.y, roadCost * 0.5);
            } else if (structure instanceof StructureRoad && !structure.pos.checkForObstacleStructure() && !structure.pos.checkForContainer()) {
                matrix.set(structure.pos.x, structure.pos.y, roadCost);
            } else if (structure instanceof StructurePortal) {
                matrix.set(structure.pos.x, structure.pos.y, 200);
            } else if (structure instanceof StructureRampart && (structure.my || structure.isPublic) && !structure.pos.checkForObstacleStructure()) {
                if (room.hostileCreeps.length) matrix.set(structure.pos.x, structure.pos.y, roadCost);
            } else if (structure instanceof StructureRampart && (FRIENDLIES.includes(structure.owner.username) && !structure.pos.checkForObstacleStructure())) {
                matrix.set(structure.pos.x, structure.pos.y, 200);
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
                matrix.set(structure.pos.x, structure.pos.y, 255);
            }
        }
        let blockingSites = _.filter(room.constructionSites, (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType) && (s.my || (!s.my && _.includes(FRIENDLIES, s.owner.username))));
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
        return matrix;
    }
}

function getCreepMatrix(roomName, creep, matrix, options) {
    const room = Game.rooms[roomName];
    if (!room || !(creep instanceof Creep)) return matrix;
    return getCachedMatrix(roomName, 'creeps', 1, () => addCreepsToMatrix(room, matrix, creep, options));

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
    const room = Game.rooms[roomName];
    if (!room) return matrix;
    return getCachedMatrix(roomName, 'stationary', 5, () => addStationaryCreepsToMatrix(room, matrix, creep, options));

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
    const room = Game.rooms[roomName];
    if (!room) return matrix;
    return getCachedMatrix(roomName, 'hostile', 1, () => addHostilesToMatrix(room, matrix));

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
    const room = Game.rooms[roomName];
    if (!room) return matrix;
    return getCachedMatrix(roomName, 'outsideHub', 1500, () => markOutsideHubAsImpassable(room, matrix));

    function markOutsideHubAsImpassable(room, matrix) {
        if (!room || !MY_ROOMS.includes(room.name)) return matrix;// Mark positions outside the hub as impassable
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
    const room = Game.rooms[roomName];
    if (!INTEL[roomName] || !INTEL[roomName].sk || !room) return matrix;
    return getCachedMatrix(roomName, 'sk', 25, () => addSksToMatrix(room, matrix, options));

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

function getSquadMatrix(roomName) {
    return getCachedMatrix(roomName, `squad`, 10, () => buildSquadMatrix(roomName));

    function buildSquadMatrix(roomName) {
        let matrix = new PathFinder.CostMatrix();
        let terrain = Game.map.getRoomTerrain(roomName);
        const plainCost = 1;
        const swampCost = 25
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                let tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    matrix.set(x, y, 256);
                    for (let vector of formationVectors) {
                        const newX = x + vector.x;
                        const newY = y + vector.y;
                        if (newX < 0 || newX > 49 || newY < 0 || newY > 49) continue;
                        const currentCost = matrix.get(newX, newY);
                        if (currentCost >= 256) continue;
                        matrix.set(newX, newY, 256);
                    }
                } else if (x <= 1 || x >= 48 || y <= 1 || y >= 48) {
                    matrix.set(x, y, 10);
                } else if (tile === TERRAIN_MASK_SWAMP) {
                    matrix.set(x, y, swampCost);
                    for (let vector of formationVectors) {
                        const newX = x + vector.x;
                        const newY = y + vector.y;
                        if (newX < 0 || newX > 49 || newY < 0 || newY > 49) continue;
                        const currentCost = matrix.get(newX, newY);
                        if (currentCost >= swampCost) continue;
                        matrix.set(newX, newY, swampCost);
                    }
                } else {
                    matrix.set(x, y, plainCost);
                }
            }
        }
        const room = Game.rooms[roomName];
        if (room) {
            for (let structure of room.structures) {
                if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                    matrix.set(structure.pos.x, structure.pos.y, 256);
                    for (let vector of formationVectors) {
                        const newX = structure.pos.x + vector.x
                        const newY = structure.pos.y + vector.y
                        if (newX < 0 || newX > 49 || newY < 0 || newY > 49) continue;
                        const currentCost = matrix.get(newX, newY);
                        if (currentCost >= 255) continue;
                        matrix.set(newX, newY, 255);
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

function cacheRoute(from, to, route, failed = false) {
    const key = `${from}_${to}`;
    const tick = Game.time;
    const entry = CACHE.ROUTE_CACHE[key] || {};

    entry.route = route || [];
    entry.failed = failed;
    entry.uses = (entry.uses || 0) + 1;
    entry.tick = tick;

    CACHE.ROUTE_CACHE[key] = entry;
}

function getRoute(from, to) {
    const key = `${from}_${to}`;
    const cachedRoute = CACHE.ROUTE_CACHE[key];

    if (cachedRoute && Game.time < cachedRoute.tick + 500) {
        if (cachedRoute.failed) return 'failed';
        cachedRoute.uses++;
        return cachedRoute.route;
    }
    return null;
}

function deleteRoute(from, to) {
    const key = `${from}_${to}`;
    delete CACHE.ROUTE_CACHE[key];
}

function cachePath(creep, from, to, pathInfo) {
    if (!pathInfo.path || !pathInfo.path.length) return;
    const {pathOptions: options = {}} = pathInfo;
    const weight = options.offRoad ? 1 : options.ignoreRoads ? 2 : 3;
    const key = getPathKey(from, to, weight);
    const room = creep.room;
    const tick = Game.time;

    const entry = CACHE.PATH_CACHE[key] || {};
    entry.path = pathInfo.path;
    entry.key = key;
    entry.tick = tick;
    entry.structuresHash = hashStructures(room.impassibleStructures);
    entry.uses = (entry.uses || 0) + 1;

    const reverseKey = getPathKey(to, from, weight);
    if (!CACHE.PATH_CACHE[reverseKey]) {
        CACHE.PATH_CACHE[reverseKey] = {
            ...entry,
            path: pathInfo.path.split('').reverse().map(reverseDirection).join(''),
            key: reverseKey
        };
    }
    CACHE.PATH_CACHE[key] = entry;
}

function getPath(creep, from, to, pathInfo) {
    const options = pathInfo ? pathInfo.pathOptions : {};
    const weight = options.offRoad ? 1 : options.ignoreRoads ? 2 : 3;
    const key = getPathKey(from, to, weight);
    let cached = CACHE.PATH_CACHE[key];

    if (!cached) {
        const reverseKey = getPathKey(to, from, weight);
        cached = CACHE.PATH_CACHE[reverseKey];
    }

    if (cached && Game.time < cached.tick + 200 &&
        cached.structuresHash === hashStructures(creep.room.impassibleStructures) &&
        (creep.memory._shibMove.pathPosTime || 0) < STATE_STUCK) {
        cached.uses++;
        return cached.path;
    }
    return null;
}

const reverseDirection = (dir) => {
    return (9 - parseInt(dir, 10)) % 8 + 1;
};

const getPathKey = (from, to, weight) => `${from.x},${from.y},${from.roomName}_${to.x},${to.y},${to.roomName}_${weight}`;

const hashStructures = (structs) => {
    return structs.map(s => `${s.x},${s.y},${s.structureType}`).join('|');
};

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

function getPosKey(pos) {
    return pos.x + 'x' + pos.y + pos.roomName;
}

function parsePosKey(key) {
    // Match the pattern: digits, 'x', digits, room name
    const match = key.match(/^(\d+)x(\d+)([EW]\d+[NS]\d+)$/);
    if (!match) {
        throw new Error(`Invalid position key: ${key}`);
    }

    const [, x, y, roomName] = match;
    return {
        x: parseInt(x, 10),
        y: parseInt(y, 10),
        roomName
    };
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
    if (!options.forceSolo && (options.squad || this.memory.grouped)) return this.shibSquadMovement(destination, options);
    this.memory._shibSquadMove = undefined;
    if (this.memory.grouped) options.squad = true;
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
    if (this.memory._shibSquadMove.target && this.memory._shibSquadMove.path && this.memory._shibSquadMove.path.length) {
        if (this.memory._shibSquadMove.target === targetKey) {
            return squadMove(this, this.memory._shibSquadMove.path);
        } else {
            const parsed = parsePosKey(this.memory._shibSquadMove.target);
            const oldPos = new RoomPosition(parsed.x, parsed.y, parsed.roomName);
            if (oldPos.getRangeTo(target) <= options.range) {
                return squadMove(this, this.memory._shibSquadMove.path);
            }
        }
    }

    const origin = this.pos;
    this.memory._shibSquadMove.target = targetKey;

    let allowedRooms;
    let route = findRoute(origin.roomName, target.roomName, options);
    if (route) {
        // If the current room name is missing, add it to the front
        if (!route.includes(this.room.name)) route.unshift(this.room.name);
        allowedRooms = route;
    }
    // If no route/allowed rooms got set, use the current room and neighbors
    if (!allowedRooms) allowedRooms = [origin.roomName].concat(Object.values(Game.map.describeExits(origin.roomName)));

    // Prepare pathfinding options
    options = getMoveWeight(this, options);

    let result = PathFinder.search(this.pos, {pos: target, range: options.range}, {
        maxOps: DEFAULT_MAXOPS * allowedRooms.length,
        maxRooms: allowedRooms.length * 1.5,
        roomCallback: function (roomName) {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            return getSquadMatrix(roomName);
        }
    });

    // If a path is found, move the creep
    if (result.path.length > 0) {
        return squadMove(this, serializePath(this.pos, result.path));
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
    let allowedRooms = [this.pos.roomName].concat(Object.values(Game.map.describeExits(this.pos.roomName)));
    let result = PathFinder.search(this.pos, fleeGoals, {
        flee: true,
        maxRooms: allowedRooms.length * 1.5,
        roomCallback: function (roomName) {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            if (INTEL[roomName] && INTEL[roomName].owner && !FRIENDLIES.includes(INTEL[roomName].owner)) return false;
            return getSquadMatrix(roomName);
        }
    });

    // If a path is found, move the creep
    if (result.path.length > 0) {
        if (squadMove(this, serializePath(this.pos, result.path))) return true;
    }

    return false;
};

function squadMove(creep, path) {
    // Check if any member has fatigue
    let wait = false;
    if (!creep.memory.squadMembers) return false;
    creep.memory.squadMembers.forEach(function (c) {
        const member = Game.getObjectById(c);
        if (member && (member.fatigue || creep.fatigue)) return wait = true;
    })
    if (wait) return false;
    const move = parseInt(path[0], 10);
    // Check position at direction
    const newPos = creep.pos.positionAtDirection(move);
    if (newPos && newPos.checkForImpassible(false, true)) return creep.memory._shibSquadMove = undefined;
    path = path.slice(1);
    if (creep.memory.squadMembers) {
        // Check if all squad members will be able to move
        if (!canSquadMove(creep, move)) {
            creep.memory._shibSquadMove = undefined;
            return false;
        } else {
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
        }
    }
    creep.memory._shibSquadMove.path = path;
    return true;

    function canSquadMove(creep, direction) {
        return creep.memory.squadMembers.every(memberId => {
            const member = Game.getObjectById(memberId);
            if (!member) return true; // Skip missing members
            const nextPos = member.pos.positionAtDirection(direction);
            if (!nextPos) return true;
            return nextPos && !nextPos.checkForImpassible(false, true) && !isOccupiedByEnemy(creep, nextPos);
        });
    }

    function isOccupiedByEnemy(creep, pos) {
        const creepAtPos = pos.lookFor(LOOK_CREEPS)[0];
        if (creepAtPos && !FRIENDLIES.includes(creepAtPos.owner.username)) creep.memory.blockingCreep = creepAtPos.id;
        else creep.memory.blockingCreep = undefined;
        return creepAtPos && !creepAtPos.my;
    }
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
    let allowedRooms = [this.pos.roomName].concat(Object.values(Game.map.describeExits(this.pos.roomName)));
    let result = PathFinder.search(this.pos, fleeGoals, {
        flee: true,
        maxRooms: allowedRooms.length * 1.5,
        roomCallback: function (roomName) {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            if (INTEL[roomName] && INTEL[roomName].owner && !FRIENDLIES.includes(INTEL[roomName].owner)) return false;
            return getMatrix(roomName, this, options);
        }
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

const formationVectors = [
    {x: 0, y: 0}, // top-left
    {x: 0, y: -1}, // top-right
    {x: -1, y: 0}, // bottom-left
    {x: -1, y: -1}, // bottom-right
]