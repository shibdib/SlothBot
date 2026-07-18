/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Core shibMove path execution and creep bumping.

 */


const {DEFAULT_MAXOPS, STATE_STUCK} = require('pathState');

const {
    normalizePos, clearTrailerTowState,
    tryPullSwapThrough, isPullSwapBlocker, isImmobileBlocker,
} = require('pathUtils');

const {requestTow, needsTow} = require('pathTow');

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
        if (creep.memory._shibMove) {
            delete creep.memory._shibMove.newPos;
            delete creep.memory._shibMove.pathPos;
            creep.memory._shibMove.pathPosTime = 0;
        }
        deleteRoute(creep.room.name, destRoom);
    }
}

const {getPath, cachePath, serializePath} = require('pathPathCache');

const {getMatrix} = require('pathMatrix');

const {
    creepWinsTraffic,
    findOccupyingCreep,
    findYieldDirection,
    isBumperCandidate,
    markMoveBlocked,
} = require('pathTraffic');

function shibMove(creep, heading, options = {}, pathOnly = false) {
    // Same-tick yield/bump: last move() wins in Screeps — do not let role pathing overwrite it.
    if (!pathOnly && creep.memory?.moveBlocked === Game.time) {
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
        let allowedRooms = options.route;
        if (!allowedRooms && origin.roomName !== target.roomName) {
            const route = findRoute(origin.roomName, target.roomName, options);
            if (route && route.length) {
                allowedRooms = route.includes(origin.roomName) ? route : [origin.roomName].concat(route);
            }
        }
        if (!allowedRooms) allowedRooms = [origin.roomName];
        return PathFinder.search(origin, {pos: target, range: options.range || 1}, {
            maxOps: options.maxOps || DEFAULT_MAXOPS,
            maxRooms: allowedRooms.length ? allowedRooms.length + 2 : (options.maxRooms || 16),
            heuristicWeight: options.heuristicWeight || 1,
            roomCallback: (roomName) => {
                if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
                return getMatrix(roomName, creep, options);
            },
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

    if (needsTow(creep) && requestTow(creep, heading, options)) return true;

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
            delete creep.memory._shibMove.newPos;
            // Route around creeps once — ignoreCreeps caches often re-enter the same jam.
            const stuckOptions = Object.assign({}, options, {ignoreCreeps: false, useCache: false});
            return shibPath(creep, heading, creep.memory._shibMove, origin, target, stuckOptions);
        }
        return false;
    }

    // Execute existing path
    if (creep.memory._shibMove?.path?.length && !options.getPath) {
        return executePath(creep, creep.memory._shibMove, options, origin, heading);
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

    if (!creep.memory._shibMove) creep.memory._shibMove = {};
    const pathInfo = creep.memory._shibMove;
    pathInfo.targetRoom = target.roomName;

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

    pathInfo.newPos = creep.pos.positionAtDirection(nextDirection);

    if (pathInfo.pathPosTime && handleBarrier(creep, pathInfo, options)) return true;

    const moveResult = creep.move(nextDirection);
    if (moveResult === OK || moveResult === ERR_TIRED) {
        creep.memory._shibMove = pathInfo;
        return true;
    }
    if (moveResult === ERR_BUSY) return true;
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
                const dest = creep.memory.destination;
                const hasTargetOp = dest && Memory.targetRooms && Memory.targetRooms[dest];
                const hasAuxOp = dest && Memory.auxiliaryTargets && Memory.auxiliaryTargets[dest];
                if (hasTargetOp || hasAuxOp) {
                    log.d(`${creep.name} is stuck in ${creep.room.name} and is unable to path from ${creep.pos} to ${target}. Suiciding for the good of the CPU.`);
                    log.d('Ret - ' + JSON.stringify(result));
                    if (allowedRooms) log.d('Path - ' + allowedRooms);
                    if (Memory.targetRooms) delete Memory.targetRooms[dest];
                    if (Memory.auxiliaryTargets) delete Memory.auxiliaryTargets[dest];
                    if (INTEL) delete INTEL[dest];
                    log.d('Canceling operation in ' + roomLink(dest) + ' as we cannot find a path.', 'HIGH COMMAND: ');
                    return creep.suicide();
                }
                // Non-operation destination (e.g. explorer signing/exploring): just give up this target.
                log.d(`${creep.name} is stuck in ${creep.room.name} and is unable to path from ${creep.pos} to ${target}. Clearing destination.`);
                creep.memory._shibMove = undefined;
                if (dest) creep.memory.destination = undefined;
                return false;
            }
            log.d(`${creep.name} is stuck in ${creep.room.name} and is unable to path from ${creep.pos} to ${target}. Clearing destination.`);
            creep.memory._shibMove = undefined;
            creep.memory.badPathing = undefined;
            if (creep.memory.destination) creep.memory.destination = undefined;
            creep.idleFor(5);
            return false;
        }
    }

    creep.idleFor(3);
    return false;
}


/**
 * Stuck recovery when the next path tile is blocked.
 * Returns true only if this tick issued a move that can free progress.
 * Returns false so the caller can repath — never "succeed" while standing still.
 */
function creepBumping(creep, pathInfo, options) {
    // Squad members are positioned by squadMove; do not yank them out of formation.
    if (creep.memory?.grouped) return false;
    if (!pathInfo?.path?.length) return false;

    const nextDirection = parseInt(pathInfo.path[0], 10);
    if (!nextDirection) return false;

    const nextPosition = creep.pos.positionAtDirection(nextDirection);
    pathInfo.newPos = nextPosition;
    if (!nextPosition) return false;

    const bumpCreep = findOccupyingCreep(creep.room, nextPosition, creep.id);

    // No friendly on the next tile (structure, edge case, enemy): repath — do not random thrash.
    if (!bumpCreep) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
        return false;
    }

    // 1) Pull-swap through immobile / tow-waiting blockers when weight allows.
    if (tryPullSwapThrough(creep, bumpCreep, nextDirection)) {
        if (ICONS?.traffic) bumpCreep.say(ICONS.traffic, true);
        markMoveBlocked(bumpCreep);
        return true;
    }

    // 2) Cannot clear: stationary work, squad, immobile, or tow-waiting (pull-swap failed).
    if (bumpCreep.memory?.other?.stationary ||
        bumpCreep.memory?.grouped ||
        isImmobileBlocker(bumpCreep) ||
        isPullSwapBlocker(bumpCreep) ||
        !isBumperCandidate(bumpCreep)) {
        creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
        return false;
    }

    // 3) Higher priority (lower PRIORITIES number): ask them to yield onto a free tile.
    if (creepWinsTraffic(creep, bumpCreep)) {
        const yieldDir = findYieldDirection(bumpCreep, nextPosition);
        if (!yieldDir) {
            creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
            return false;
        }
        bumpCreep.move(yieldDir);
        if (ICONS?.traffic) bumpCreep.say(ICONS.traffic, true);
        markMoveBlocked(bumpCreep);
        if (bumpCreep.memory?._shibMove) bumpCreep.memory._shibMove.pathPosTime = 0;
        creep.move(nextDirection);
        return true;
    }

    // 4) We lose priority: only step aside onto a free tile (no forced dance / random).
    // Clear path so the next move builds a route that accounts for the higher-priority creep.
    const selfYield = findYieldDirection(creep, nextPosition);
    if (selfYield) {
        creep.move(selfYield);
        markMoveBlocked(creep);
        delete creep.memory._shibMove;
        return true;
    }

    creep.room.visual.circle(creep.pos, {fill: 'transparent', radius: 0.55, stroke: 'blue'});
    return false;
}

module.exports = {

    shibMove,

    executePath,

    handleBarrier,

    shibPath,

    creepBumping,

};