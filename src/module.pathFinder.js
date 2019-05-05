let shib = require("shibBench");

const DEFAULT_MAXOPS = 10000;
const STATE_STUCK = 4;

const structureMatrixCache = {};
const creepMatrixCache = {};
const hostileMatrixCache = {};
const skMatrixCache = {};
let routeCache = {};
let pathCache = {};

//TODO:Creep Specific Path Cache
function shibMove(creep, heading, options = {}) {
    let pathingStart = Game.cpu.getUsed();
    _.defaults(options, {
        useCache: true,
        ignoreCreeps: true,
        maxOps: DEFAULT_MAXOPS,
        range: 1,
        ignoreStructures: false,
        allowHostile: false,
        allowSK: false,
        forceRepath: false,
        findRoute: false,
        repathChance: 1,
        preferHighway: false,
        highwayBias: 2.5,
        maxRooms: 1,
        checkPath: false,
        returnDistance: false,
        badRoom: undefined,
        returnIncomplete: false,
        stayInHub: false,
        ignoreBorder: false
    });
    if (creep.fatigue > 0) {
        if (!creep.memory.military) creep.idleFor(1);
        return creep.room.visual.circle(creep.pos, {
            fill: 'transparent',
            radius: 0.55,
            stroke: 'black'
        });
    }
    // Set these for creeps that can afford them
    if (!creep.className && (!options.ignoreRoads || !options.offRoad)) {
        let move = creep.getActiveBodyparts(MOVE);
        let weight = _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length;
        let fullCarry = 0;
        if (_.sum(creep.carry)) fullCarry = _.ceil(_.sum(creep.carry) / 50);
        weight += fullCarry;
        if (move >= weight * 5) {
            options.offRoad = true;
        } else if (move >= weight) {
            options.ignoreRoads = true;
        } else {
            options.offRoad = undefined;
            options.ignoreRoads = undefined;
        }
    }
    let rangeToDestination = creep.pos.getRangeTo(heading);
    // CPU Saver for moving to 0 on creeps
    if (heading instanceof Creep && options.range === 0 && rangeToDestination > 2) options.range = 1;
    // Check if target reached or within 1
    if (rangeToDestination <= options.range) {
        creep.memory._shibMove = undefined;
        shib.shibBench('pathfinding', pathingStart);
        shib.shibBench('pathfinding[' + creep.memory.role + ']', pathingStart);
        return false;
    } else if (rangeToDestination === 1) {
        let direction = creep.pos.getDirectionTo(heading);
        shib.shibBench('pathfinding', pathingStart);
        shib.shibBench('pathfinding[' + creep.memory.role + ']', pathingStart);
        return creep.move(direction);
    }
    if (creep.memory.military) options.useCache = false;
    if (!heading instanceof RoomPosition) if (creep.room.name !== heading.room.name) return creep.shibMove(new RoomPosition(25, 25, heading.room.name), {range: 18});
    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    // Make sure origin and target are good
    if (!origin || !target) return;
    updateRoomStatus(creep.room);
    if (!creep.memory._shibMove || Math.random() > options.repathChance || options.forceRepath || (creep.memory._shibMove.path && (creep.memory._shibMove.path.length < 1 || !creep.memory._shibMove.path))) creep.memory._shibMove = {};
    if (creep.memory._shibMove && ((creep.memory._shibMove.path && creep.memory._shibMove.path.length < 1) || !creep.memory._shibMove.path)) creep.memory._shibMove = {};
    // Check if target moved
    if (creep.memory._shibMove.target && (creep.memory._shibMove.target.x !== target.x || creep.memory._shibMove.target.y !== target.y)) creep.memory._shibMove = {};
    // Set var
    let pathInfo = creep.memory._shibMove;
    pathInfo.targetRoom = targetRoom(heading);
    //Clear path if stuck
    if (pathInfo.pathPosTime && pathInfo.pathPosTime >= STATE_STUCK) {
        let bumpCreep = _.filter(creep.room.creeps, (c) => c.memory && c.pos.x === pathInfo.newPos.x && c.pos.y === pathInfo.newPos.y && (!c.memory._shibMove || !c.memory._shibMove.path) && c.memory.role !== 'stationaryHarvester' && c.memory.role !== 'upgrader' && c.memory.role !== 'reserver' && c.memory.role !== 'remoteHarvester')[0];
        if (bumpCreep) {
            bumpCreep.shibMove(creep, {range: 0});
            bumpCreep.say(ICONS.traffic, true)
        } else {
            delete pathInfo.path;
            pathInfo.pathPosTime = 0;
            options.ignoreCreeps = false;
            options.freshMatrix = true;
            options.useCache = false;
            creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
            if (Math.random() > .9) return creep.moveRandom();
        }
    }
    //Execute path if target is valid and path is set
    if (pathInfo.path && !options.checkPath) {
        if (pathInfo.newPos && pathInfo.newPos.x === creep.pos.x && pathInfo.newPos.y === creep.pos.y && pathInfo.newPos.roomName === creep.pos.roomName) pathInfo.path = pathInfo.path.slice(1);
        if (pathInfo.pathPos === creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName) {
            pathInfo.pathPosTime++;
        } else {
            pathInfo.pathPos = creep.pos.x + '.' + creep.pos.y + '.' + creep.pos.roomName;
            pathInfo.pathPosTime = 0;
        }
        let nextDirection = parseInt(pathInfo.path[0], 10);
        if (nextDirection && pathInfo.newPos) {
            pathInfo.newPos = positionAtDirection(origin, nextDirection);
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
                    break;
            }
            shib.shibBench('pathfinding', pathingStart);
            shib.shibBench('pathfinding[' + creep.memory.role + ']', pathingStart);
        } else {
            delete pathInfo.path;
            shib.shibBench('pathfinding', pathingStart);
            shib.shibBench('pathfinding[' + creep.memory.role + ']', pathingStart);
        }
    } else {
        shibPath(creep, heading, pathInfo, origin, target, options);
        shib.shibBench('pathfinding', pathingStart);
        shib.shibBench('pathfinding[' + creep.memory.role + ']', pathingStart);
    }
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    //check for cached
    let cached;
    if (!target) return creep.moveRandom();
    let roomDistance = Game.map.findRoute(origin.roomName, target.roomName).length;
    if (options.useCache && !options.checkPath && !creep.room.memory.responseNeeded) cached = getPath(creep, origin, target);
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
        pathInfo.usingCached = undefined;
        let originRoomName = origin.roomName;
        let destRoomName = target.roomName;
        let allowedRooms = pathInfo.route || options.route;
        if (!allowedRooms && roomDistance > 0) {
            let route;
            if (!route && Game.map.findRoute(origin.roomName, target.roomName)[0]) route = findRoute(origin.roomName, target.roomName, options);
            if (route) {
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
                options.maxRooms = 1;
                return shibPath(creep, target, pathInfo, origin, target, options);
            }
        }
        let callback = (roomName) => {
            if (allowedRooms && !_.includes(allowedRooms, roomName)) return false;
            if (!options.allowHostile && checkAvoid(roomName) && roomName !== destRoomName && roomName !== originRoomName) return false;
            if (!Game.rooms[roomName]) return;
            let matrix;
            let room = Game.rooms[roomName];
            if (options.ignoreStructures) {
                matrix = new PathFinder.CostMatrix();
                if (!options.ignoreCreeps) {
                    addCreepsToMatrix(room, matrix, creep);
                    addSksToMatrix(room, matrix);
                }
            } else if (options.ignoreCreeps || roomName !== originRoomName) {
                matrix = getStructureMatrix(room, options.freshMatrix);
                getSKMatrix(room, matrix)
            } else {
                matrix = getCreepMatrix(room, creep);
                getSKMatrix(room, matrix)
            }
            if (room.hostileCreeps.length) getHostileMatrix(room, matrix);
            addBorderToMatrix(room, matrix);
            return matrix;
        };
        let ret = PathFinder.search(origin, {pos: target, range: options.range}, {
            maxOps: options.maxOps,
            maxRooms: options.maxRooms,
            plainCost: options.offRoad ? 1 : options.ignoreRoads ? 1 : 5,
            swampCost: options.offRoad ? 1 : options.ignoreRoads ? 10 : 20,
            roomCallback: callback,
        });
        if ((ret.incomplete || options.ensurePath) && !options.returnIncomplete) {
            if (options.checkPath) return false;
            if (roomDistance === 0) return creep.idleFor(1);
            target = new RoomPosition(25, 25, target.roomName);
            options.range = 23;
            if (!pathInfo.findAttempt) {
                options.useFindRoute = true;
                options.returnIncomplete = true;
                options.allowSK = true;
                options.maxRooms = 16;
                pathInfo.findAttempt = true;
                options.maxOps = 30000;
                //console.log("<font color='#ff0000'>PATHING ERROR: Creep " + creep.name + " could not find a path from " + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + " retrying.</font>");
                return shibPath(creep, heading, pathInfo, origin, target, options);
            } else if (pathInfo.findAttempt) {
                if (!creep.memory.badPathing) creep.memory.badPathing = 1;
                if (creep.memory.badPathing) creep.memory.badPathing++;
                if (creep.memory.badPathing > 500) {
                    log.e(creep.name + ' is stuck in ' + creep.room.name + ' and is unable to path from ' + creep.pos.x + "." + creep.pos.y + "." + creep.pos.roomName + " to " + target.x + "." + target.y + "." + target.roomName + '. Suiciding for the good of the CPU.');
                    log.e('Ret - ' + JSON.stringify(ret));
                    if (allowedRooms) log.e('Path - ' + allowedRooms);
                    if (creep.memory.military && creep.memory.targetRoom) {
                        delete Memory.targetRooms[creep.memory.targetRoom];
                        delete Memory.roomCache[creep.memory.targetRoom];
                    }
                    return creep.suicide();
                }
                return creep.moveTo(target);
            }
        }
        if (options.checkPath) return true;
        pathInfo.path = serializePath(creep.pos, ret.path);
        if (options.returnDistance) return pathInfo.path.length;
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
    let restrictDistance = Game.map.getRoomLinearDistance(origin, destination) + 7;
    let roomDistance = Game.map.findRoute(origin, destination).length;
    let route;
    if (options.useCache) route = getRoute(origin, destination);
    if (route) return route;
    route = Game.map.findRoute(origin, destination, {
        routeCallback: function (roomName) {
            let rangeToRoom = Game.map.getRoomLinearDistance(origin, roomName);
            if (rangeToRoom > restrictDistance) {
                // room is too far out of the way
                return 256;
            }
            // If room is under attack
            if ((Game.rooms[roomName] && Game.rooms[roomName].memory.responseNeeded) || (Memory.roomCache[roomName] && Memory.roomCache[roomName].threatLevel)) return 100;
            // Get special rooms via name
            let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
            let isHighway = (parsed[1] % 10 === 0) ||
                (parsed[2] % 10 === 0);
            let isMyRoom = Game.rooms[roomName] &&
                Game.rooms[roomName].controller &&
                Game.rooms[roomName].controller.my;
            if (isMyRoom) {
                return 0.5;
            } else
            // SK rooms are avoided when there is no vision in the room, harvested-from SK rooms are allowed
            if (!options.allowSK && !Game.rooms[roomName]) {
                let fMod = parsed[1] % 10;
                let sMod = parsed[2] % 10;
                let isSK = !(fMod === 5 && sMod === 5) &&
                    ((fMod >= 4) && (fMod <= 6)) &&
                    ((sMod >= 4) && (sMod <= 6));
                if (isSK) {
                    return 4;
                }
            }
            // Check for manual flagged rooms
            if (Memory.avoidRooms && _.includes(Memory.avoidRooms, roomName)) return 254;
            if (Memory.roomCache && Memory.roomCache[roomName]) {
                // Friendly Rooms
                if (Memory.roomCache[roomName].user && _.includes(FRIENDLIES, Memory.roomCache[roomName].user)) {
                    return 1;
                }
                // Avoid rooms owned by others
                if (Memory.roomCache[roomName].user && !_.includes(FRIENDLIES, Memory.roomCache[roomName].user) && !Memory.roomCache[roomName].needsCleaning) {
                    if (Memory.roomCache[roomName].controller && JSON.parse(Memory.roomCache[roomName].controller).level >= 3) return 254; else return 15;
                }
                // Avoid rooms reserved by others
                if (Memory.roomCache[roomName].user && !_.includes(FRIENDLIES, Memory.roomCache[roomName].user)) {
                    return 10;
                }
            } else
            // Unknown rooms have a slightly higher weight
            if (!Memory.roomCache[roomName]) return 7;
            if (isHighway && options.preferHighway) return 1.25;
            if (isHighway) return 1.5;
            return 2.25;
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

function getStructureMatrix(room, freshMatrix) {
    if (!structureMatrixCache[room.name] || (freshMatrix || (!room.memory.structureMatrixTick || Game.time > room.memory.structureMatrixTick + 150))) {
        room.memory.structureMatrixTick = Game.time;
        let matrix = new PathFinder.CostMatrix();
        structureMatrixCache[room.name] = addStructuresToMatrix(room, matrix, 1).serialize();
    }
    return PathFinder.CostMatrix.deserialize(structureMatrixCache[room.name]);
}

function getCreepMatrix(room, creep) {
    if (!creepMatrixCache[room.name] || (!room.memory.creepMatrixTick || Game.time !== room.memory.creepMatrixTick + 3)) {
        room.memory.creepMatrixTick = Game.time;
        creepMatrixCache[room.name] = addCreepsToMatrix(room, getStructureMatrix(room, true).clone(), creep).serialize();
    }
    return PathFinder.CostMatrix.deserialize(creepMatrixCache[room.name]);
}

function addCreepsToMatrix(room, matrix, creep = undefined) {
    let creeps = room.creeps;
    if (!room.hostileCreeps.length && creep) creeps = creep.pos.findInRange(FIND_CREEPS, 5);
    for (let key in creeps) {
        matrix.set(creeps[key].pos.x, creeps[key].pos.y, 0xff);
    }
    return matrix;
}

function getHostileMatrix(room, matrix) {
    if (!hostileMatrixCache[room.name] || (!room.memory.hostileMatrixTick || Game.time !== room.memory.hostileMatrixTick)) {
        room.memory.hostileMatrixTick = Game.time;
        hostileMatrixCache[room.name] = addHostilesToMatrix(room, matrix).serialize();
    }
    return PathFinder.CostMatrix.deserialize(hostileMatrixCache[room.name]);
}

function getSKMatrix(room, matrix) {
    if (!skMatrixCache[room.name] || (!room.memory.skeMatrixTick || Game.time !== room.memory.skeMatrixTick)) {
        room.memory.skeMatrixTick = Game.time;
        skMatrixCache[room.name] = addSksToMatrix(room, matrix).serialize();
    }
    return PathFinder.CostMatrix.deserialize(skMatrixCache[room.name]);
}

function addHostilesToMatrix(room, matrix) {
    let enemyCreeps = _.filter(room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    for (let key in enemyCreeps) {
        matrix.set(enemyCreeps[key].pos.x, enemyCreeps[key].pos.y, 0xff);
        let range = 8;
        if (!enemyCreeps[key].getActiveBodyparts(RANGED_ATTACK)) range = 4;
        let avoidZone = enemyCreeps[key].room.lookForAtArea(LOOK_TERRAIN, enemyCreeps[key].pos.y - range, enemyCreeps[key].pos.x - range, enemyCreeps[key].pos.y + range, enemyCreeps[key].pos.x + range, true);
        for (let key in avoidZone) {
            let position;
            try {
                position = new RoomPosition(avoidZone[key].x, avoidZone[key].y, room.name);
            } catch (e) {
                continue;
            }
            if (!position || matrix.get(position.x, position.y)) continue;
            if (!position.checkForWall()) {
                let inRange = position.findInRange(enemyCreeps, range);
                matrix.set(position.x, position.y, 40 * inRange)
            }
        }
    }
    return matrix;
}

function addSksToMatrix(room, matrix) {
    let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(room.name);
    let fMod = parsed[1] % 10;
    let sMod = parsed[2] % 10;
    let isSK = !(fMod === 5 && sMod === 5) &&
        ((fMod >= 4) && (fMod <= 6)) &&
        ((sMod >= 4) && (sMod <= 6));
    if (isSK) {
        let sk = room.find(FIND_CREEPS, {filter: (c) => c.owner.username === 'Source Keeper'});
        if (sk.length > 0) {
            for (let c = 0; c < sk.length; c++) {
                matrix.set(sk[c].pos.x, sk[c].pos.y, 0xff);
                let sites = sk[c].room.lookForAtArea(LOOK_TERRAIN, sk[c].pos.y - 5, sk[c].pos.x - 5, sk[c].pos.y + 5, sk[c].pos.x + 5, true);
                for (let key in sites) {
                    let position;
                    try {
                        position = new RoomPosition(sites[key].x, sites[key].y, room.name);
                    } catch (e) {
                        continue;
                    }
                    if (position && !position.checkForWall()) {
                        matrix.set(position.x, position.y, 254)
                    }
                }
            }
        }
    }
    return matrix;
}

function addStructuresToMatrix(room, matrix, roadCost) {
    for (let structure of room.structures) {
        if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureWall) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureController) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRampart && ((!structure.my && !structure.isPublic) || structure.pos.checkForObstacleStructure())) {
            matrix.set(structure.pos.x, structure.pos.y, 256);
        } else if (structure instanceof StructureRampart && (structure.my || structure.isPublic)) {
            matrix.set(structure.pos.x, structure.pos.y, roadCost + 1);
        } else if (structure instanceof StructureRoad) {
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
    let stationaryCreeps = _.filter(room.creeps, (c) => c.my && (c.memory.role === 'stationaryHarvester' || c.memory.role === 'upgrader' || c.memory.role === 'reserver' || c.memory.role === 'remoteHarvester'));
    for (let site of stationaryCreeps) {
        matrix.set(site.pos.x, site.pos.y, 150);
    }
    //Sources
    for (let source of room.sources) {
        matrix.set(source.pos.x, source.pos.y, 256);
    }
    if (room.mineral[0]) {
        matrix.set(room.mineral[0].pos.x, room.mineral[0].pos.y, 256);
    }
    return matrix;
}

function addBorderToMatrix(room, matrix) {
    let exits = Game.map.describeExits(room.name);
    if (exits === undefined) {
        return matrix;
    }
    let top = ((_.get(exits, TOP, undefined) === undefined) ? 1 : 0);
    let right = ((_.get(exits, RIGHT, undefined) === undefined) ? 48 : 49);
    let bottom = ((_.get(exits, BOTTOM, undefined) === undefined) ? 48 : 49);
    let left = ((_.get(exits, LEFT, undefined) === undefined) ? 1 : 0);
    for (let y = top; y <= bottom; ++y) {
        for (let x = left; x <= right; x += ((y % 49 === 0) ? 1 : 49)) {
            if (matrix.get(x, y) < 0x03 && Game.map.getRoomTerrain(room.name).get(x, y) !== TERRAIN_MASK_WALL) {
                matrix.set(x, y, 0x03);
            }
        }
    }
    return matrix;
}

function serializePath(startPos, path, color = _.sample(["orange", "blue", "green", "red", "yellow", "black", "gray", "purple"])) {
    let serializedPath = "";
    let lastPosition = startPos;
    for (let position of path) {
        if (position.roomName === lastPosition.roomName) {
            new RoomVisual(position.roomName)
                .line(position, lastPosition, {color: color, lineStyle: "dashed"});
            serializedPath += lastPosition.getDirectionTo(position);
        }
        lastPosition = position;
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
    let cache;
    if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') cache = Memory._routeCache || {}; else cache = routeCache;
    if (cache instanceof Array) cache = {};
    let tick = Game.time;
    cache[key] = {
        route: JSON.stringify(route),
        uses: 1,
        tick: tick
    };
    if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') Memory._routeCache = cache; else routeCache = cache;
}

function getRoute(from, to) {
    let cache;
    if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') cache = Memory._routeCache || {}; else cache = routeCache;
    if (cache) {
        let cachedRoute = cache[from + '_' + to];
        if (cachedRoute) {
            cachedRoute.uses += 1;
            if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') Memory._routeCache = cache; else routeCache = cache;
            return JSON.parse(cachedRoute.route);
        }
    } else {
        return;
    }
}

function cachePath(creep, from, to, path) {
    //Don't store short paths
    if (path.length < 5) return;
    let key = getPathKey(from, to);
    let cache;
    if (creep.memory.localCache) cache = creep.memory.localPathCache || {}; else if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') cache = Memory._pathCache || {}; else cache = pathCache;
    if (cache instanceof Array) cache = {};
    let tick = Game.time;
    cache[key] = {
        path: path,
        uses: 1,
        tick: tick
    };
    if (creep.memory.localCache) creep.memory.localPathCache = cache; else if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') Memory._pathCache = cache; else pathCache = cache;
}

function getPath(creep, from, to) {
    let cache;
    if (creep.memory.localPathCache && creep.memory.localPathCache[getPathKey(from, to)]) return creep.memory.localPathCache[getPathKey(from, to)].path; else if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') cache = Memory._pathCache || {}; else cache = pathCache;
    if (!cache) return;
    let cachedPath = cache[getPathKey(from, to)];
    if (cachedPath) {
        cachedPath.uses += 1;
        if (Game.shard.name === 'shard0' || Game.shard.name === 'shard1' || Game.shard.name === 'shard2' || Game.shard.name === 'shard3') Memory._pathCache = cache; else pathCache = cache;
        return cachedPath.path;
    } else {
        return;
    }
}

function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
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
RoomPosition.prototype.shibMove = function (destination, options) {
    return shibMove(this, destination, options);
};