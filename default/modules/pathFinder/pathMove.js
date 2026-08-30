/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Core shibMove path execution and creep bumping.

 */


const profiler = require('tools.profiler');
const {DEFAULT_MAXOPS, MAZE_MAXOPS, STATE_STUCK} = require('pathState');

const {
    normalizePos, clearTrailerTowState,
    tryPullSwapThrough, isPullSwapBlocker, isImmobileBlocker,
    getShibMove, setShibMove, ensureShibMove, clearShibMove,
    roomNeedsMazeOps, getMoveWeight,
} = require('pathUtils');

const {requestTow, needsTow} = require('pathTow');

const {
    findRoute,
    deleteRoute,
    estimateClaimRouteTicks,
    exitHopTarget,
    onExitToward,
    attachStagingAvoid,
    filterAvoidedRooms
} = require('pathRoute');

const {isSquadCreep, wouldEnterDest, posAfterMove} = require('pathFormation');

/**
 * Claim/reserver TTL gate for *mission* travel only.
 * @returns {boolean} true if the creep cannot reach its claim destination in time.
 *   Caller must stop mission pathing (role recycles). Never call recycleCreep from
 *   shibMove — recycleCreep uses shibMove and that recursion blew the stack.
 */
function applyClaimRouting(creep, options, target) {
    if (!(creep instanceof Creep) || !creep.hasActiveBodyparts(CLAIM)) return false;
    // Allow free pathing home / to spawn once recycling.
    if (creep.memory.recycling) return false;

    // Prefer shortest only when discovering a route. Precomputed mining routes already
    // encode the intended rooms (often road-optimized); forcing shortest re-finds a
    // different route and defeats options.route.
    if (!options.route && !getShibMove(creep)?.route) {
        options.shortest = true;
    }

    // Only gate travel toward the assigned claim/reserve room — never colony/home.
    const missionDest = creep.memory.destination;
    if (!missionDest) return false;
    if (missionDest === creep.memory.colony) return false;
    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS.includes(missionDest)) return false;

    const ticksRemaining = creep.ticksToLive;
    if (!ticksRemaining) return false;

    // Sticky abort: one decision, no PathFinder thrash for the rest of the TTL.
    if (creep.memory._claimAbort === missionDest) return true;

    // claimRoute = full remaining rooms (hops pass a 2-room PathFinder slice in options.route).
    const route = options.claimRoute || options.route || getShibMove(creep)?.route;
    if (!route?.length) return false;

    const roomIdx = route.indexOf(creep.room.name);
    const remainingRooms = roomIdx >= 0 ? route.length - roomIdx : route.length;
    if (ticksRemaining < estimateClaimRouteTicks(remainingRooms)) {
        creep.memory._claimAbort = missionDest;
        const moveState = getShibMove(creep);
        if (moveState) {
            delete moveState.route;
            delete moveState.path;
            delete moveState.pathPos;
            moveState.pathPosTime = 0;
        }
        // Do not deleteRoute here — that poisoned the shared route cache every tick.
        return true;
    }
    return false;
}

// Hop until dest is the next room. PathFinder default maxRooms is 7, so a
// single search to a far target is incomplete even with a valid findRoute.
const HOP_WINDOW = 2;
const HOP_AFTER = 2;

function applyLongDistanceHop(creep, origin, target, options) {
    if (origin.roomName === target.roomName) return null;
    if (options.noHop) return null;
    // Caller already scoped a 1–2 room search (reserver hops).
    if (options.route && options.route.length <= HOP_WINDOW + 1 &&
        options.maxRooms != null && options.maxRooms <= HOP_WINDOW + 1) {
        return null;
    }

    const stored = getShibMove(creep);
    const destRoom = target.roomName;
    let route = options.fullRoute || options.claimRoute || stored?.fullRoute || options.route || stored?.route;
    if (!route || !route.length || !route.includes(destRoom)) {
        route = findRoute(origin.roomName, destRoom, options);
    }
    if (!route || !route.length) return null;

    if (!route.includes(origin.roomName)) {
        const fresh = findRoute(origin.roomName, destRoom, options);
        if (fresh && fresh.length) {
            route = fresh.includes(origin.roomName) ? fresh : [origin.roomName].concat(fresh);
        } else {
            route = [origin.roomName].concat(route);
        }
    }

    const idx = route.indexOf(origin.roomName);
    if (idx < 0 || idx >= route.length - 1) return null;

    options.fullRoute = route;
    if (!options.claimRoute) options.claimRoute = route.slice(idx);

    const remaining = route.length - idx;
    const nextRoom = route[idx + 1];
    if (nextRoom === destRoom || remaining <= HOP_AFTER) {
        options.route = route.slice(idx);
        return null;
    }

    const lookAhead = route[idx + 2] || destRoom;
    const hop = exitHopTarget(origin.roomName, nextRoom, origin, lookAhead);
    if (!hop) {
        options.route = route.slice(idx, idx + HOP_WINDOW);
        options.maxRooms = HOP_WINDOW;
        options.range = 23;
        if (options.maxOps == null || options.maxOps > 3000) options.maxOps = 2500;
        return new RoomPosition(25, 25, nextRoom);
    }

    // Stay in this room and walk to the aligned exit. Cheaper than a 2-room
    // search to (25,25) range 23, which just takes the nearest exit.
    options.route = [origin.roomName];
    options.maxRooms = 1;
    options.range = 0;
    options.hopGoals = hop.goals;
    options.hopExitDir = hop.exitDir;
    const hopCap = roomNeedsMazeOps(origin.roomName) ? MAZE_MAXOPS : 2000;
    if (options.maxOps == null || options.maxOps > hopCap) options.maxOps = hopCap;
    return hop.pos;
}

const {getPath, cachePath, serializePath} = require('pathPathCache');

const {getMatrix} = require('pathMatrix');

const {
    creepWinsTraffic,
    findOccupyingCreep,
    findYieldDirection,
    yieldOccupant,
    isBumperCandidate,
    isHomeRoomYieldingSquad,
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

    attachStagingAvoid(creep, target, options);

    if (options.maxOps == null) options.maxOps = DEFAULT_MAXOPS;
    if (options.range == null) options.range = 1;
    if (options.maxRooms == null) options.maxRooms = 7;
    if (options.useCache == null) options.useCache = true;
    if (options.ignoreCreeps == null) options.ignoreCreeps = true;

    if (typeof creep.getActiveBodyparts === 'function') getMoveWeight(creep, options);

    if (creep.memory && creep.memory._shibMove !== undefined) delete creep.memory._shibMove;

    // Long-distance: walk the findRoute room list one hop at a time so
    // PathFinder is never asked to search more rooms than it is allowed.
    if (!pathOnly && !options.flee && !options.portal) {
        const hopped = applyLongDistanceHop(creep, origin, target, options);
        if (hopped) {
            heading = hopped;
            target = hopped;
        }
    }

    // On the correct edge: step through. Must run before the range check or
    // we "arrive" on the exit tile and sit there.
    if (!pathOnly && !options.flee && options.hopExitDir && onExitToward(origin, options.hopExitDir)) {
        if (!creep.className && creep.fatigue > 0) {
            if (creep.memory && !creep.memory.military) creep.idleFor(1);
            return true;
        }
        const hopPos = posAfterMove(origin, options.hopExitDir);
        const avoid = options.avoid && (Array.isArray(options.avoid) ? options.avoid : [options.avoid]);
        if (hopPos && avoid && avoid.includes(hopPos.roomName)) {
            clearShibMove(creep);
            return false;
        }
        const dest = creep.memory && creep.memory.destination;
        // Grouped duos/quads only enter dest via squadMove so the formation
        // slides in together. Solo shibMove hops are 1-at-a-time entry.
        if (dest && isSquadCreep(creep) && wouldEnterDest(origin, options.hopExitDir, dest)) {
            clearShibMove(creep);
            return false;
        }
        clearShibMove(creep);
        creep.move(options.hopExitDir);
        return true;
    }

    if (!pathOnly && !options.flee && !options.portal && !(creep.memory && creep.memory.repathing)
        && origin.getRangeTo(target) <= options.range) {
        if (getShibMove(creep)) {
            clearShibMove(creep);
            clearTrailerTowState(creep);
        }
        return false;
    }

    // Mission unreachable in CLAIM TTL — role handles recycle. Do not call
    // recycleCreep here (it pathfinds via shibMove → stack overflow).
    if (applyClaimRouting(creep, options, target)) {
        return false;
    }

    if (pathOnly) {
        const cached = getPath(creep, origin, target, undefined);
        if (cached) return cached;
        let allowedRooms = options.route;
        // Scoring / remote distance must not pay Game.map.findRoute on every call.
        // Callers that need a route should pass options.route (mining route) or omit noLiveRoute.
        if (!allowedRooms && origin.roomName !== target.roomName && !options.noLiveRoute) {
            const route = findRoute(origin.roomName, target.roomName, options);
            if (route && route.length) {
                allowedRooms = route.includes(origin.roomName) ? route : [origin.roomName].concat(route);
            }
        }
        if (!allowedRooms || !allowedRooms.length) {
            if (options.noLiveRoute && origin.roomName !== target.roomName) {
                // Incomplete multi-room without a known route — cheap fail for scorers.
                return {path: [], incomplete: true, ops: 0, cost: 0};
            }
            allowedRooms = [origin.roomName];
        }
        allowedRooms = filterAvoidedRooms(allowedRooms, options, [origin.roomName, target.roomName]);
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

    // Fatigue handling — no RoomVisual (was free-but-not-free CPU every tired tick).
    if (!creep.className && creep.fatigue > 0 && creep.hasActiveBodyparts(MOVE)) {
        if (!creep.memory.military) creep.idleFor(1);
        return true;
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
            clearShibMove(creep);
        }
    }

    // Recreate pathInfo if target changed
    let pathState = getShibMove(creep);
    const prevRange = pathState?.pathOptions?.range ?? 1;
    const targetChanged = !pathState?.target ||
        pathState.targetRoom !== target.roomName ||
        pathState.target.x !== target.x ||
        pathState.target.y !== target.y ||
        prevRange !== (options.range ?? 1);
    if (!pathState || targetChanged) {
        pathState = setShibMove(creep, {});
        if (creep.memory) delete creep.memory._mazeOpsRetry;
    } else {
        const prevOff = pathState.pathOptions && pathState.pathOptions.offRoad;
        const prevIgnore = pathState.pathOptions && pathState.pathOptions.ignoreRoads;
        if (prevOff !== (options.offRoad || undefined) || prevIgnore !== (options.ignoreRoads || undefined)) {
            delete pathState.path;
            delete pathState.pathPos;
            pathState.pathPosTime = 0;
        }
    }

    // Stuck detection
    if (pathState.pathPosTime >= STATE_STUCK) {
        if (creepBumping(creep, pathState, options)) {
            if (pathState) pathState.pathPosTime--;
            return;
        }
        if (!creep.memory._shibStuckRepath || creep.memory._shibStuckRepath + 10 < Game.time) {
            creep.memory._shibStuckRepath = Game.time;
            pathState = ensureShibMove(creep);
            pathState.pathPosTime = 0;
            delete pathState.path;
            delete pathState.pathPos;
            const stuckOptions = Object.assign({}, options, {ignoreCreeps: false, useCache: false});
            return shibPath(creep, heading, pathState, origin, target, stuckOptions);
        }
        return false;
    }

    // Execute existing path
    if (pathState.path && pathState.path.length && !options.getPath) {
        return executePath(creep, pathState, options, origin, heading);
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

    const pathInfo = ensureShibMove(creep);
    pathInfo.targetRoom = target.roomName;

    if (pathInfo.path && pathInfo.path.length && !options.getPath) {
        return executePath(creep, pathInfo, options, origin, heading);
    }
    return shibPath(creep, heading, pathInfo, origin, target, options);
}

function executePath(creep, pathInfo, options, origin, heading) {
    if (!options.flee && heading && creep.pos.getRangeTo(heading) <= (options.range ?? 1)) {
        clearShibMove(creep);
        clearTrailerTowState(creep);
        return false;
    }

    if (!pathInfo.path?.length) {
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
                    clearShibMove(creep);
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

    // Grouped duos/quads only enter dest via squadMove. Solo shibMove hops
    // here are how a squad walked in 1-at-a-time chasing the leader.
    const dest = creep.memory && creep.memory.destination;
    if (dest && isSquadCreep(creep) && wouldEnterDest(creep.pos, nextDirection, dest)) {
        clearShibMove(creep);
        return false;
    }

    const nextPos = creep.pos.positionAtDirection(nextDirection);

    if (pathInfo.pathPosTime && handleBarrier(creep, nextPos, options)) return true;

    const moveResult = creep.move(nextDirection);
    if (moveResult === OK || moveResult === ERR_TIRED) {
        return true;
    }
    if (moveResult === ERR_BUSY) return true;
    return false;
}

function handleBarrier(creep, nextPos, options) {
    if (!nextPos) return false;
    const barrier = nextPos.checkForBarrierStructure();
    if (!barrier || (INTEL[nextPos.roomName]?.owner && FRIENDLIES.includes(INTEL[nextPos.roomName].owner))) return false;

    if (options.tunnel || creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(WORK) || creep.hasActiveBodyparts(RANGED_ATTACK)) {
        creep.memory.barrierClearing = barrier.id;
        if (creep.attack(barrier) === OK || creep.dismantle(barrier) === OK || creep.rangedAttack(barrier) === OK) {
            const moveState = getShibMove(creep);
            if (moveState) moveState.pathPosTime = 0;
            return true;
        }
    }
    clearShibMove(creep);
    return false;
}

function shibPath(creep, heading, pathInfo, origin, target, options) {
    pathInfo.pathOptions = {
        range: options.range,
        offRoad: options.offRoad || undefined,
        ignoreRoads: options.ignoreRoads || undefined,
    };
    if (applyClaimRouting(creep, options, target)) {
        return false;
    }
    const pathKey = `${origin.roomName}_${origin.x}_${origin.y}_${target.roomName}_${target.x}_${target.y}`;

    // Early exit for adjacent same-room targets
    if (origin.roomName === target.roomName && creep.pos.isNearTo(heading)) {
        clearShibMove(creep);
        return creep.move(creep.pos.getDirectionTo(heading));
    }

    // Cached path?
    let cached;
    if (options.useCache && (!INTEL[creep.room.name] || !INTEL[creep.room.name].threatLevel) && !options.tunnel) {
        cached = getPath(creep, origin, target, pathInfo);
    }
    if (cached && options.ignoreCreeps) {
        pathInfo.target = {x: target.x, y: target.y, roomName: target.roomName};
        pathInfo.path = cached;
        pathInfo.usingCached = true;
        pathInfo.pathPos = undefined;
        pathInfo.pathPosTime = 0;
        if (options.fullRoute && options.fullRoute.length) pathInfo.fullRoute = options.fullRoute;
        if (options.route && options.route.length) pathInfo.route = options.route;
        setShibMove(creep, pathInfo);
        delete creep.memory.repathAttempt;
        delete creep.memory.badPathing;
        return executePath(creep, pathInfo, options, origin, heading);
    }

    let roomDistance = origin.roomName !== target.roomName
        ? Game.map.getRoomLinearDistance(origin.roomName, target.roomName)
        : 0;

    // Single scale by distance. Previous code did (distance+4)*distance which pushed
    // multi-room CLAIM searches into 40k–60k maxOps and multi-CPU repaths.
    if (roomDistance) {
        const scaled = Math.min(12000, DEFAULT_MAXOPS * (roomDistance + 2));
        options.maxOps = Math.max(options.maxOps || 0, scaled);
    } else {
        options.maxOps = options.maxOps || DEFAULT_MAXOPS;
    }
    if (roomNeedsMazeOps(origin.roomName) || roomNeedsMazeOps(target.roomName)) {
        options.maxOps = Math.max(options.maxOps, MAZE_MAXOPS);
    }

    // Prefer precomputed / in-progress route. Always re-calling findRoute ignored
    // reserver mining routes and paid Game.map.findRoute on every repath.
    let allowedRooms = pathInfo.route || options.route;
    if (roomDistance) {
        if (allowedRooms && allowedRooms.length) {
            if (!allowedRooms.includes(creep.room.name)) {
                allowedRooms = [creep.room.name].concat(allowedRooms);
            }
            pathInfo.route = allowedRooms;
        } else {
            let route = findRoute(origin.roomName, target.roomName, options);
            if (route && route.length) {
                if (!route.includes(creep.room.name)) route = [creep.room.name].concat(route);
                allowedRooms = route;
                pathInfo.route = route;
            }
        }
    }
    if (options.fullRoute && options.fullRoute.length) pathInfo.fullRoute = options.fullRoute;
    if (!allowedRooms || !allowedRooms.length) {
        allowedRooms = roomDistance
            ? [origin.roomName].concat(Object.values(Game.map.describeExits(origin.roomName)))
            : [origin.roomName];
    }
    allowedRooms = filterAvoidedRooms(allowedRooms, options, [origin.roomName, target.roomName]);

    const goals = options.hopGoals && options.hopGoals.length
        ? options.hopGoals
        : {pos: target, range: options.range};
    const result = PathFinder.search(origin, goals, {
        maxOps: options.maxOps,
        // Same-room searches never need to leave. Multi-room: never cap below
        // the allowed list (Math.min with maxRooms=7 used to abort 8+ room trips).
        maxRooms: origin.roomName === target.roomName
            ? 1
            : (allowedRooms.length ? allowedRooms.length + 2 : (options.maxRooms || 1)),
        heuristicWeight: 1,
        roomCallback: (roomName) => {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            return getMatrix(roomName, creep, options);
        }
    });

    if (!result.incomplete) {
        pathInfo.target = {x: target.x, y: target.y, roomName: target.roomName};
        pathInfo.path = serializePath(creep.pos, result.path);
        pathInfo.pathKey = pathKey;
        pathInfo.pathAge = 0;
        pathInfo.pathPos = undefined;
        pathInfo.pathPosTime = 0;
        setShibMove(creep, pathInfo);

        if (options.ignoreCreeps) cachePath(creep, origin, target, pathInfo);
        if (options.getPath) return pathInfo.path;

        // Success - clear failure state
        delete creep.memory.repathAttempt;
        delete creep.memory.badPathing;
        delete creep.memory._mazeOpsRetry;

        return executePath(creep, pathInfo, options, origin, heading);
    }

    // Incomplete often means the tunnel was not explored. Retry once with maze ops.
    if (!creep.memory._mazeOpsRetry && (options.maxOps || 0) < MAZE_MAXOPS) {
        creep.memory._mazeOpsRetry = Game.time;
        options.maxOps = MAZE_MAXOPS;
        return shibPath(creep, heading, pathInfo, origin, target, options);
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
                clearShibMove(creep);
                if (dest) creep.memory.destination = undefined;
                return false;
            }
            // Multi-room path failure: idle and repath later. Do not clear destination
            // for active ops — operation handlers (e.g. strongholdAttack) still need it
            // and RoomPosition throws on undefined roomName.
            log.d(`${creep.name} is stuck in ${creep.room.name} and is unable to path from ${creep.pos} to ${target}. Clearing path state.`);
            clearShibMove(creep);
            creep.memory.badPathing = undefined;
            const dest = creep.memory.destination;
            const hasOp = dest && (
                (Memory.targetRooms && Memory.targetRooms[dest]) ||
                (Memory.auxiliaryTargets && Memory.auxiliaryTargets[dest])
            );
            if (dest && !hasOp && !creep.memory.operation) {
                creep.memory.destination = undefined;
            }
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
    if (!pathInfo?.path?.length) return false;

    const nextDirection = parseInt(pathInfo.path[0], 10);
    if (!nextDirection) return false;

    const nextPosition = creep.pos.positionAtDirection(nextDirection);
    if (!nextPosition) return false;

    const bumpCreep = findOccupyingCreep(creep.room, nextPosition, creep.id);

    // No friendly on the next tile (structure, edge case, enemy): repath — do not random thrash.
    if (!bumpCreep) {
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
        (bumpCreep.memory?.grouped && !isHomeRoomYieldingSquad(bumpCreep)) ||
        isImmobileBlocker(bumpCreep) ||
        isPullSwapBlocker(bumpCreep) ||
        !isBumperCandidate(bumpCreep)) {
        return false;
    }

    const groupedMover = !!creep.memory?.grouped;
    // Packed/packing squads always shove civilians. longbowSquad is not in
    // PRIORITIES so they default to 10 and would lose to haulers.
    if (groupedMover || creepWinsTraffic(creep, bumpCreep)) {
        if (!yieldOccupant(bumpCreep, nextPosition)) return false;
        const bumpMove = getShibMove(bumpCreep);
        if (bumpMove) bumpMove.pathPosTime = 0;
        creep.move(nextDirection);
        return true;
    }

    // Committed squads stay in formation — never self-yield off the 2×2.
    if (groupedMover && !isHomeRoomYieldingSquad(creep)) return false;

    // 4) We lose priority: only step aside onto a free tile (no forced dance / random).
    // Clear path so the next move builds a route that accounts for the higher-priority creep.
    const selfYield = findYieldDirection(creep, nextPosition);
    if (selfYield) {
        creep.move(selfYield);
        markMoveBlocked(creep);
        clearShibMove(creep);
        return true;
    }

    return false;
}

executePath = profiler.registerFN(executePath, 'shibMove.executePath');
shibPath = profiler.registerFN(shibPath, 'shibMove.shibPath');
creepBumping = profiler.registerFN(creepBumping, 'shibMove.creepBumping');

module.exports = {
    shibMove,
    executePath,
    handleBarrier,
    shibPath,
    creepBumping,
};