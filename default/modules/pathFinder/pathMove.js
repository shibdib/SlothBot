/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Core shibMove path execution and creep bumping.

 */


const {DEFAULT_MAXOPS, STATE_STUCK, TOW_TRUCK_CACHE} = require('pathState');

const {normalizePos, clearTrailerTowState, pickTowTruck} = require('pathUtils');

const {findRoute, deleteRoute, estimateClaimRouteTicks} = require('pathRoute');

function applyClaimRouting(creep, options, target) {
    if (!(creep instanceof Creep) || !creep.hasActiveBodyparts(CLAIM)) return;

    options.shortest = true;

    const ticksRemaining = creep.ticksToLive;
    const destRoom = target?.roomName;
    if (!ticksRemaining || !destRoom) return;

    const route = options.route || creep.memory._shibMove?.route;
    if (!route?.length) return;

    const roomIdx = route.indexOf(creep.room.name);
    const remainingRooms = roomIdx >= 0 ? route.length - roomIdx : route.length;
    if (ticksRemaining < estimateClaimRouteTicks(remainingRooms)) {
        delete creep.memory._shibMove?.route;
        delete creep.memory._shibMove?.path;
        deleteRoute(creep.room.name, destRoom);
    }
}

const {getPath, cachePath, serializePath} = require('pathPathCache');

const {getMatrix} = require('pathMatrix');

function shibMove(creep, heading, options = {}, pathOnly = false) {
    // Handle move blocked by another creep this tick
    if (heading instanceof Creep && creep.memory.moveBlocked === Game.time) {
        return true;
    }

    // Handle multi-heading (find shared position)
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

    // Cross-room creep target â†’ head to room center first
    if (heading instanceof Creep && heading.room.name !== creep.room.name &&
        Game.map.getRoomLinearDistance(creep.room.name, heading.room.name) > 1) {
        heading = new RoomPosition(25, 25, heading.room.name);
        options.range = 23;
    }

    let origin = normalizePos(creep);
    let target = normalizePos(heading);
    if (!origin || !target) return;

    _.defaults(options, {
        maxOps: DEFAULT_MAXOPS,
        range: 1,
        maxRooms: 7,
        useCache: true,
        ignoreCreeps: true
    });

    applyClaimRouting(creep, options, target);

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

    if (creep.spawning) return false;

    // Fatigue handling
    if (!creep.className && creep.fatigue > 0 && creep.hasActiveBodyparts(MOVE)) {
        if (!creep.memory.military) creep.idleFor(1);
        return creep.room.visual.circle(creep.pos, {
            fill: 'transparent',
            radius: 0.55,
            stroke: 'black'
        });
    }

    if (creep.memory.keeper) options.ignoreKeeper = creep.memory.keeper;

    // Tow truck handling
    if (creep.memory.towDestination && creep.memory.towCreep) {
        let towCreep = Game.getObjectById(creep.memory.towCreep);
        if (!towCreep || towCreep.pos.roomName !== creep.pos.roomName) {
            creep.memory.towCreep = undefined;
        } else return;
    }

    // Repathing override
    if (creep.memory.repathing) {
        if (creep.memory.repathing !== creep.room.name) {
            heading = new RoomPosition(25, 25, creep.memory.repathing);
            options.range = 23;
        } else {
            creep.memory.repathing = undefined;
            creep.memory._shibMove = undefined;
        }
    }

    // Recreate pathInfo if target changed
    const pathState = creep.memory._shibMove;
    const prevRange = pathState?.pathOptions?.range ?? 1;
    const targetChanged = !pathState?.target ||
        pathState.targetRoom !== target.roomName ||
        pathState.target.x !== target.x ||
        pathState.target.y !== target.y ||
        prevRange !== (options.range ?? 1);
    if (!pathState || targetChanged) {
        creep.memory._shibMove = {};
    }

    // Stuck detection
    if (creep.memory._shibMove?.pathPosTime >= STATE_STUCK) {
        if (creepBumping(creep, creep.memory._shibMove, options)) {
            if (creep.memory._shibMove) creep.memory._shibMove.pathPosTime--;
            return;
        }
        if (!creep.memory._shibStuckRepath || creep.memory._shibStuckRepath + 10 < Game.time) {
            creep.memory._shibStuckRepath = Game.time;
            if (!creep.memory._shibMove) creep.memory._shibMove = {};
            creep.memory._shibMove.pathPosTime = 0;
            delete creep.memory._shibMove.path;
            delete creep.memory._shibMove.pathPos;
            return shibPath(creep, heading, creep.memory._shibMove, origin, target, options);
        }
        return false;
    }

    // Execute existing path
    if (creep.memory._shibMove?.path?.length && !options.getPath) {
        return executePath(creep, creep.memory._shibMove, options, origin, heading);
    }

    // Tow request for heavy creeps
    if (creep.memory.willNeedTow === undefined) {
        creep.memory.willNeedTow = _.filter(creep.body, (p) => p.type !== MOVE && p.type !== CARRY).length / 2 >
            _.filter(creep.body, (p) => p.type === MOVE).length;
    }
    // Heavy creeps re-request tow when more than 1 tile from heading. Was previously > 3,
    // which left dropped trailers slow-walking the last few tiles (and looking "stuck"
    // when terrain or blockers made self-move impractical). At distance â‰¤ 1 self-move is
    // either unnecessary (already in range) or trivially short, so no cost to lowering.
    if (!creep.className && creep.memory.willNeedTow && (creep.pos.getRangeTo(heading) > 1 || !creep.hasActiveBodyparts(MOVE))) {
        if (!creep.memory.towDestination) {
            creep.memory.towDestination = heading.id || heading;
            creep.memory.towOptions = options;
            // Snapshot the destination's position so a mid-tow rebuild (container destroyed
            // and re-placed under a new id) doesn't strand the trailer â€” see getTowDestination.
            if (heading.pos) {
                creep.memory.towDestinationPos = {x: heading.pos.x, y: heading.pos.y, roomName: heading.pos.roomName};
            }
        } else if (heading.id && creep.hasActiveBodyparts(MOVE) && creep.pos.isNearTo(heading)) {
            clearTrailerTowState(creep);
        } else if (creep.pos.isNearTo(heading) && ((heading instanceof RoomPosition && heading.checkForCreep()) ||
            (heading instanceof RoomObject && heading.pos.checkForCreep()))) {
            clearTrailerTowState(creep);
        }

        if (!creep.memory.towCreep || !Game.getObjectById(creep.memory.towCreep)) {
            const roomName = creep.room.name;
            if (!TOW_TRUCK_CACHE[roomName] || Game.time !== TOW_TRUCK_CACHE[roomName].tick) {
                TOW_TRUCK_CACHE[roomName] = {
                    candidates: creep.room.myCreeps.filter(c => c.memory.canTow && !c.memory.trailer && !c.store.getUsedCapacity()),
                    tick: Game.time
                };
            }
            const towTruck = pickTowTruck(creep, TOW_TRUCK_CACHE[roomName].candidates);
            if (towTruck) {
                creep.memory.towCreep = towTruck.id;
                towTruck.memory.trailer = creep.id;
                _.pull(TOW_TRUCK_CACHE[roomName].candidates, towTruck);
            }
        }
        return true;
    }

    if (options.tunnel) options.maxOps = 15000;
    if (options.showMatrix) return getMatrix(creep.room.name, creep, options);

    // Portal handling
    if (options.portal) {
        if (creep.room.name === options.portalDestination) {
            heading = new RoomPosition(25, 25, options.originalDestination);
            options.portal = undefined;
            options.range = 23;
        } else if (creep.room.name !== creep.memory.portal) {
            heading = new RoomPosition(25, 25, options.portal);
            options.range = 23;
        } else {
            heading = creep.room.portals[0];
            options.range = 0;
        }
    }

    let pathInfo = creep.memory._shibMove;
    creep.memory._shibMove.targetRoom = target.roomName;

    if (pathInfo.path && pathInfo.path.length && !options.getPath) {
        return executePath(creep, pathInfo, options, origin, heading);
    }
    return shibPath(creep, heading, pathInfo, origin, target, options);
}

function executePath(creep, pathInfo, options, origin, heading) {
    if (!pathInfo.path?.length) {
        if (!options.flee && creep.pos.getRangeTo(heading) <= options.range) {
            creep.memory._shibMove = undefined;
            clearTrailerTowState(creep);
        }
        return false;
    }

    const posKey = `${creep.pos.x}.${creep.pos.y}.${creep.pos.roomName}`;

    if (pathInfo.pathPos) {
        if (pathInfo.pathPos !== posKey) {
            pathInfo.path = ([0, 49].includes(creep.pos.x) || [0, 49].includes(creep.pos.y))
                ? pathInfo.path.slice(2)
                : pathInfo.path.slice(1);
            if (!pathInfo.path.length) {
                if (!options.flee && creep.pos.getRangeTo(heading) <= options.range) {
                    creep.memory._shibMove = undefined;
                    clearTrailerTowState(creep);
                }
                return false;
            }
            pathInfo.pathPosTime = 0;
        } else {
            pathInfo.pathPosTime = (pathInfo.pathPosTime || 0) + 1;
        }
    }
    pathInfo.pathPos = posKey;

    const nextDirection = parseInt(pathInfo.path[0], 10);
    if (!nextDirection) return false;

    pathInfo.newPos = origin.positionAtDirection(nextDirection);

    if (pathInfo.pathPosTime && handleBarrier(creep, pathInfo, options)) return true;

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
    if (!barrier || (INTEL[pathInfo.newPos.roomName]?.owner && FRIENDLIES.includes(INTEL[pathInfo.newPos.roomName].owner))) return false;

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
    pathInfo.pathOptions = options;
    applyClaimRouting(creep, options, target);
    const pathKey = `${origin.roomName}_${origin.x}_${origin.y}_${target.roomName}_${target.x}_${target.y}`;

    // Early exit for adjacent same-room targets
    if (origin.roomName === target.roomName && creep.pos.isNearTo(heading)) {
        creep.memory._shibMove = undefined;
        return creep.move(creep.pos.getDirectionTo(heading));
    }

    // Cached path?
    let cached;
    if (options.useCache && (!INTEL[creep.room.name] || !INTEL[creep.room.name].threatLevel) && !options.tunnel) {
        cached = getPath(creep, origin, target, pathInfo);
    }
    if (cached && options.ignoreCreeps) {
        pathInfo.target = target;
        pathInfo.path = cached;
        pathInfo.usingCached = true;
        pathInfo.newPos = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
        pathInfo.pathPos = undefined;
        pathInfo.pathPosTime = 0;
        creep.memory._shibMove = pathInfo;
        delete creep.memory.repathAttempt;
        delete creep.memory.badPathing;
        return executePath(creep, pathInfo, options, origin, heading);
    }

    let roomDistance = origin.roomName !== target.roomName
        ? Game.map.getRoomLinearDistance(origin.roomName, target.roomName)
        : 0;

    if (roomDistance) {
        options.maxOps = DEFAULT_MAXOPS * (roomDistance + 4);
    } else {
        options.maxOps = DEFAULT_MAXOPS;
    }

    let allowedRooms = pathInfo.route || options.route;
    if (roomDistance) {
        let route = findRoute(origin.roomName, target.roomName, options);
        if (route) {
            if (!route.includes(creep.room.name)) route.unshift(creep.room.name);
            allowedRooms = route;
            pathInfo.route = route;
        }
    }
    if (!allowedRooms) {
        allowedRooms = [origin.roomName].concat(Object.values(Game.map.describeExits(origin.roomName)));
    }

    const result = PathFinder.search(origin, {pos: target, range: options.range}, {
        maxOps: roomDistance ? options.maxOps * roomDistance : options.maxOps,
        maxRooms: allowedRooms.length ? allowedRooms.length + 2 : 1,
        heuristicWeight: 1,
        roomCallback: (roomName) => {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            return getMatrix(roomName, creep, options);
        }
    });

    if (!result.incomplete) {
        const direction = parseInt(result.path[0], 10);
        pathInfo.target = target;
        pathInfo.path = serializePath(creep.pos, result.path);
        pathInfo.pathKey = pathKey;
        pathInfo.pathAge = 0;
        pathInfo.newPos = creep.pos.positionAtDirection(direction);
        pathInfo.pathPos = undefined;
        pathInfo.pathPosTime = 0;
        creep.memory._shibMove = pathInfo;

        if (options.ignoreCreeps) cachePath(creep, origin, target, pathInfo);
        if (options.getPath) return creep.memory.getPath = pathInfo.path;

        // Success - clear failure state
        delete creep.memory.repathAttempt;
        delete creep.memory.badPathing;

        return executePath(creep, pathInfo, options, origin, heading);
    }

    // Pathfinding failed
    if (!creep.memory.repathAttempt || creep.memory.repathAttempt + 10 < Game.time) {
        creep.memory.repathAttempt = Game.time;
        options.range = (options.range ?? 1) + 1;
        return shibPath(creep, heading, pathInfo, origin, target, options);
    }

    // Permanent failure path
    if (!creep.memory.badPathing && roomDistance) {
        creep.memory.badPathing = 1;
        deleteRoute(origin.roomName, target.roomName);
        deleteRoute(creep.room.name, target.roomName);
    } else {
        creep.memory.badPathing = (creep.memory.badPathing || 0) + 1;
        if (creep.memory.badPathing > 10) {
            if (!roomDistance) {
                log.d(`${creep.name} is stuck in ${creep.room.name} and is unable to path from ${creep.pos} to ${target}. Suiciding for the good of the CPU.`);
                log.d('Ret - ' + JSON.stringify(result));
                if (allowedRooms) log.d('Path - ' + allowedRooms);
                if (creep.memory.destination && (Memory.targetRooms[creep.memory.destination] || Memory.auxiliaryTargets[creep.memory.destination])) {
                    delete Memory.targetRooms[creep.memory.destination];
                    delete Memory.auxiliaryTargets[creep.memory.destination];
                    delete INTEL[creep.memory.destination];
                    log.d('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot find a path.', 'HIGH COMMAND: ');
                }
                return creep.suicide();
            }
            return creep.moveTo(target);
        }
    }

    return creep.moveTo(target);
}


function creepBumping(creep, pathInfo, options) {
    // Grouped creeps are positioned by their leader's squadMove. A random or
    // priority-swap bump here would yank them out of the 2Ã—2 mid-move and the
    // squad would visibly unform until reform kicks in. Defer: let squadMove
    // re-queue a coordinated move next tick instead of randomising now.
    const isGrouped = !!creep.memory?.grouped;

    if (!pathInfo?.newPos) {
        if (isGrouped) return false;
        return creep.moveRandom();
    }

    const nextPosition = creep.pos.positionAtDirection(parseInt(pathInfo.path[0], 10));
    if (!nextPosition) return false;

    const potentialObstacles = nextPosition.lookFor(LOOK_CREEPS).concat(nextPosition.lookFor(LOOK_POWER_CREEPS));
    // Excluding grouped creeps from the bump pool too â€” pushing a squad-mate
    // off their slot to make room for an outsider breaks formation just as badly.
    const bumpCreep = _.find(potentialObstacles, c =>
        c.my &&
        (c.className || !c.fatigue) &&
        (!c.memory?.other?.stationary) &&
        !c.memory?.grouped &&
        (c.className || c.hasActiveBodyparts(MOVE))
    );

    if (bumpCreep) {
        const myPriority = PRIORITIES[creep.memory.role] || 10;
        const theirPriority = PRIORITIES[bumpCreep.memory.role] || 10;

        if (creep.memory.trailer) {
            const trailer = Game.getObjectById(creep.memory.trailer);
            if (trailer && trailer.pos.isNearTo(creep)) bumpCreep.moveRandom();
        } else if (!creep.className && !creep.memory.trailer) {
            if (myPriority < theirPriority || bumpCreep.store.getUsedCapacity() === 0) {
                bumpCreep.move(bumpCreep.pos.getDirectionTo(creep));
                creep.move(creep.pos.getDirectionTo(bumpCreep));
                if (bumpCreep.memory?._shibMove) bumpCreep.memory._shibMove.pathPosTime = 0;
            } else {
                bumpCreep.move(bumpCreep.pos.getDirectionTo(creep));
                if (!isGrouped) creep.moveRandom();
                if (creep.memory?._shibMove) creep.memory._shibMove.pathPosTime = 0;
            }
        } else {
            bumpCreep.moveRandom();
            creep.move(creep.pos.getDirectionTo(bumpCreep));
        }

        bumpCreep.say(ICONS.traffic, true);
        if (bumpCreep.memory) bumpCreep.memory.moveBlocked = Game.time;
        return true;
    }

    if (!isGrouped && Math.random() > 0.75) creep.moveRandom();
    creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});

    // Don't wipe the squad-mate's path cache â€” squadMove relies on it for
    // continuity across ticks. Only clear for solo creeps where the bump
    // already disrupted their plan.
    if (!isGrouped) delete creep.memory._shibMove;
    return false;
}

module.exports = {

    shibMove,

    executePath,

    handleBarrier,

    shibPath,

    creepBumping,

};