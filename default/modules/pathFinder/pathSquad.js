/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Squad movement pathfinding and execution.

 */


const {DEFAULT_MAXOPS, MAZE_MAXOPS, FLEE_RANGE} = require('pathState');

const {
    normalizePos,
    getPosKey,
    getMoveWeight,
    endpointInRange,
    gatherThreats,
    isImmobileBlocker,
    roomNeedsMazeOps
} = require('pathUtils');

const {findRoute, attachStagingAvoid, filterAvoidedRooms, exitHopTarget, onExitToward} = require('pathRoute');

const {serializePath} = require('pathPathCache');

const {getSquadMatrix, getFormationVectors, posAfterMove, formationRange, exitDirectionTo} = require('pathFormation');
const {
    findOccupyingCreep,
    yieldOccupant,
    isBumperCandidate,
    isHomeRoomYieldingSquad,
} = require('pathTraffic');

function resolveAllowedRooms(originRoom, targetRoom, options) {
    let rooms;
    if (options.route && options.route.length) {
        rooms = options.route.includes(originRoom) ? options.route.slice() : [originRoom].concat(options.route);
    } else {
        const route = findRoute(originRoom, targetRoom, options);
        if (route?.length) {
            rooms = route.includes(originRoom) ? route.slice() : [originRoom].concat(route);
        } else {
            rooms = [originRoom].concat(Object.values(Game.map.describeExits(originRoom)));
        }
    }
    return filterAvoidedRooms(rooms, options, [originRoom, targetRoom]);
}

// Same window as shibMove: PathFinder cannot finish a 2×2 search 3+ rooms out.
const HOP_WINDOW = 2;
const HOP_AFTER = 2;

function applySquadHop(origin, target, options) {
    if (origin.roomName === target.roomName) return null;
    if (options.noHop) return null;

    let route = options.fullRoute || options.route;
    if (!route || !route.length || !route.includes(target.roomName)) {
        route = findRoute(origin.roomName, target.roomName, options);
    }
    if (!route || !route.length) return null;

    if (!route.includes(origin.roomName)) {
        const fresh = findRoute(origin.roomName, target.roomName, options);
        if (fresh && fresh.length) {
            route = fresh.includes(origin.roomName) ? fresh : [origin.roomName].concat(fresh);
        } else {
            route = [origin.roomName].concat(route);
        }
    }

    const idx = route.indexOf(origin.roomName);
    if (idx < 0 || idx >= route.length - 1) return null;

    options.fullRoute = route;
    const remaining = route.length - idx;
    const nextRoom = route[idx + 1];
    if (nextRoom === target.roomName || remaining <= HOP_AFTER) {
        options.route = route.slice(idx);
        return null;
    }

    // 2-room search to the next room's landings so the serialized path includes
    // the cross (diagonal or cardinal). Stopping on this room's exit and then
    // forcing hopExitDir skipped the PathFinder step.
    const lookAhead = route[idx + 2] || target.roomName;
    const hop = exitHopTarget(origin.roomName, nextRoom, origin, lookAhead,
        {squadSize: options.squadSize});
    options.route = route.slice(idx, idx + HOP_WINDOW);
    options.maxRooms = HOP_WINDOW;
    if (hop && hop.landingGoals && hop.landingGoals.length) {
        options.hopGoals = hop.landingGoals;
        options.range = 0;
        return hop.landingGoals[0].pos;
    }
    options.range = 23;
    return new RoomPosition(25, 25, nextRoom);
}

// getRangeTo is Infinity across rooms, so an incomplete path that reached the
// exit toward the target used to be discarded and the 2×2 stalled.
function squadEndpointUsable(end, target, range) {
    if (!end || !target) return false;
    if (end.roomName === target.roomName) {
        return Math.max(Math.abs(end.x - target.x), Math.abs(end.y - target.y)) <= (range || 1);
    }
    const toward = exitDirectionTo(end.roomName, target.roomName);
    return !!(toward && onExitToward(end, toward));
}


function squadMove(creep, path) {
    if (!creep.memory.squadMembers || !path?.length) return false;

    const members = creep.memory.squadMembers.map(id => Game.getObjectById(id)).filter(Boolean);
    if (creep.fatigue || members.some(m => m.fatigue)) return false;

    const move = parseInt(path[0], 10);
    if (!(move >= TOP && move <= TOP_LEFT)) {
        creep.memory._shibSquadMove = undefined;
        return false;
    }

    const orientation = creep.memory.squadOrientation || 0;
    const squadSize = members.length + 1;
    const newLeaderPos = posAfterMove(creep.pos, move);
    const dest = creep.memory.destination;
    const leaderLeaving = !!(newLeaderPos && newLeaderPos.roomName !== creep.pos.roomName);
    const leaderEnteringDest = !!(dest && leaderLeaving && newLeaderPos.roomName === dest);
    const destEdgeSlide = isDestEdgeSlide(creep, dest, members);
    // 1-wide exit: the hole is still this room's exit tile, so leaderLeaving
    // is false until the following tick. Slide onto it the same way we slide
    // across. First dest hop into dest still needs the dest-exit 2×2.
    const ontoExit = !!(newLeaderPos && newLeaderPos.roomName === creep.pos.roomName
        && onDestExitTile(newLeaderPos));
    const roomEdgeSlide = destEdgeSlide || !!(newLeaderPos && !leaderEnteringDest
        && (leaderLeaving || ontoExit)
        && !roomCrossBlocked(newLeaderPos)
        && !isFootprintWalkable(newLeaderPos, orientation, squadSize, true));

    if (newLeaderPos) {
        if (newLeaderPos.checkForImpassible(false, true)) {
            creep.memory._shibSquadMove = undefined;
            return false;
        }
        // Full 2×2 inland often hits the bunker wall 1 tile off dest-exit.
        // Aborting here left the front row on dest-exit and the back row
        // parked in staging. Dest-edge slides still move whoever can.
        if (!isFootprintWalkable(newLeaderPos, orientation, squadSize, leaderLeaving || destEdgeSlide)
            && !roomEdgeSlide) {
            creep.memory._shibSquadMove = undefined;
            return false;
        }
    }

    if (!canSquadMove(creep, members, move, roomEdgeSlide)) {
        creep.memory._shibSquadMove = undefined;
        return false;
    }

    // Dest hop is a 2-tick 2×2 slide: leader (front row) crosses with the
    // dest-side column, back row occupies the exit. Abort if anyone would
    // enter dest while the leader is still stepping onto the exit — that is
    // the "front row leaks in, re-form under towers" case.
    const misc = creep.memory.misc;
    const destAdjacent = !!(dest && exitDirectionTo(creep.pos.roomName, dest));
    const stagingBypass = !!(dest && misc && misc.stagingRoom && misc.stagingRoom !== dest
        && !misc.staged && creep.pos.roomName !== dest && !destAdjacent);
    // Don't walk through dest to reach the dest-adjacent staging room.
    // Dest-adjacent hops ARE the dest entry — blocking them parked the 2×2
    // on the neighbor's dest-facing exit.
    if (leaderEnteringDest && stagingBypass) {
        creep.memory._shibSquadMove = undefined;
        return false;
    }
    if (leaderLeaving && members.some(m => formationRange(m.pos, creep.pos) > 1)) {
        creep.memory._shibSquadMove = undefined;
        return false;
    }
    for (const member of members) {
        if (formationRange(member.pos, creep.pos) > 1) continue;
        const memberNext = posAfterMove(member.pos, move);
        if (memberNext && memberNext.roomName !== member.pos.roomName
            && (!leaderLeaving || memberNext.roomName !== newLeaderPos.roomName)) {
            creep.memory._shibSquadMove = undefined;
            return false;
        }
    }

    if (!clearSquadFootprint(creep, members, move)) return false;

    if (roomEdgeSlide && !destEdgeSlide) creep.memory.quadSnake = true;

    creep.move(move);
    for (const member of members) {
        // Same-room adjacency plus the 2×2 split across an exit (range 1 through
        // the edge). getRangeTo is Infinity across rooms, which used to drop the
        // back row and send only 2 into dest.
        if (formationRange(member.pos, creep.pos) > 1) continue;
        const nextPos = posAfterMove(member.pos, move);
        if (!nextPos) {
            member.move(move);
        } else if (nextPos.roomName !== member.pos.roomName) {
            // In-formation dest landings were already gated in canSquadMove.
            // A blocked tile here means this body stays; others still step.
            if (roomCrossBlocked(nextPos)) continue;
            member.move(move);
        } else if (nextPos.checkForImpassible(false, true)) {
            // Stay on the square. forceSolo peels off the 2×2 and will cross a
            // room edge if this body is already on an exit tile.
            if (roomEdgeSlide || leaderLeaving || onDestExitTile(member.pos)) continue;
            member.shibMove(creep, {range: 0, forceSolo: true});
        } else {
            member.move(move);
        }
    }

    // Followers run in undefined order; this tick's intent wins over getInPosition.
    creep.memory.squadMoveTick = Game.time;

    if (creep.memory._shibSquadMove) creep.memory._shibSquadMove.path = path.slice(1);
    return true;
}

function squadIdSet(leader, members) {
    const ids = new Set([leader.id]);
    for (let i = 0; i < members.length; i++) ids.add(members[i].id);
    return ids;
}

function occupantOn(pos, squadIds, leaderId) {
    if (!pos) return null;
    const room = Game.rooms[pos.roomName];
    if (!room) return null;
    const creep = pos.checkForCreep();
    if (creep && !squadIds.has(creep.id)) return creep;
    const mine = findOccupyingCreep(room, pos, leaderId);
    return mine && !squadIds.has(mine.id) ? mine : null;
}

function isPermanentSquadBlocker(blocker) {
    if (!blocker || !blocker.my) return true;
    if (blocker.memory && blocker.memory.other && blocker.memory.other.stationary) return true;
    if (isImmobileBlocker(blocker)) return true;
    return !!(blocker.memory && blocker.memory.grouped && !isHomeRoomYieldingSquad(blocker));
}

// Shove civilians off the next 2×2. Squad-mates on those tiles are moving
// the same direction (vacate). Permanent blockers (stationary, other squads,
// enemies) abort and drop the path so we repath around. Fatigue / no yield
// tile keeps the path and retries next tick.
function clearSquadFootprint(leader, members, direction) {
    const squadIds = squadIdSet(leader, members);
    const consider = [leader];
    for (let i = 0; i < members.length; i++) consider.push(members[i]);

    const footprint = new Set();
    const occupied = [];
    for (let i = 0; i < consider.length; i++) {
        const c = consider[i];
        if (c.id !== leader.id && formationRange(c.pos, leader.pos) > 1) continue;
        const next = posAfterMove(c.pos, direction);
        if (!next) continue;
        footprint.add(`${next.x},${next.y},${next.roomName}`);
        const occupant = occupantOn(next, squadIds, leader.id);
        if (occupant) occupied.push({occupant, pos: next});
    }
    if (!occupied.length) return true;

    const seen = new Set();
    const claimed = new Set();
    const ignoreIds = new Set(squadIds);
    for (let i = 0; i < occupied.length; i++) {
        const blocker = occupied[i].occupant;
        if (seen.has(blocker.id)) continue;
        seen.add(blocker.id);
        if (isPermanentSquadBlocker(blocker)) {
            leader.memory._shibSquadMove = undefined;
            return false;
        }
        if (!isBumperCandidate(blocker)) return false;
        if (!yieldOccupant(blocker, occupied[i].pos, {ignoreIds, forbidden: footprint, claimed})) {
            return false;
        }
    }
    return true;
}

function roomCrossBlocked(nextPos) {
    if (!nextPos) return true;
    const terrain = Game.map.getRoomTerrain(nextPos.roomName);
    if (terrain.get(nextPos.x, nextPos.y) === TERRAIN_MASK_WALL) return true;
    return !!(Game.rooms[nextPos.roomName] && nextPos.checkForImpassible(false, true));
}

function onDestExitTile(pos) {
    return !!(pos && (pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49));
}

function isDestEdgeSlide(leader, dest, members) {
    if (!dest) return false;
    // First hop (nobody in dest yet) still needs the dest-exit footprint so
    // we don't leak a single body in. Relax only once the 2×2 straddles dest
    // or is clearing dest-exit inland.
    if (leader.pos.roomName !== dest) {
        return !!(members && members.some(m => m && m.pos.roomName === dest
            && formationRange(m.pos, leader.pos) <= 1));
    }
    const p = leader.pos;
    if (onDestExitTile(p)) return true;
    if (members && members.some(m => m && m.pos.roomName === dest && onDestExitTile(m.pos))) return true;
    return !!(members && members.some(m => m && m.pos.roomName !== p.roomName
        && formationRange(m.pos, p) <= 1));
}

function canSquadMove(leader, members, direction, destEdgeSlide) {
    const hostiles = !!leader.room.hostileCreeps.length;
    for (const member of members) {
        if (formationRange(member.pos, leader.pos) > 1) continue;
        const nextPos = posAfterMove(member.pos, direction);
        if (!nextPos) continue;
        if (nextPos.roomName !== member.pos.roomName) {
            // Dest-edge: a blocked landing parks that body; others still step.
            if (roomCrossBlocked(nextPos) && !destEdgeSlide) return false;
            continue;
        }
        if (nextPos.checkForImpassible(false, true) || (hostiles && isOccupiedByEnemy(leader, nextPos))) {
            if (destEdgeSlide) continue;
            return false;
        }
    }
    return true;
}

function isOccupiedByEnemy(leader, pos) {
    if (!pos || !Game.rooms[pos.roomName]) return false;
    const occupant = pos.lookFor(LOOK_CREEPS)[0];
    leader.memory.blockingCreep = occupant && !occupant.my ? occupant.id : undefined;
    return occupant && !occupant.my;
}

function isFootprintWalkable(leaderPos, orientation, squadSize = 4, straddle = false) {
    const vectors = getFormationVectors(orientation, squadSize);
    const terrain = Game.map.getRoomTerrain(leaderPos.roomName);
    for (const v of vectors) {
        const mx = leaderPos.x - v.x;
        const my = leaderPos.y - v.y;
        if (mx < 0 || mx > 49 || my < 0 || my > 49) {
            // Rest of the 2×2 is still in the previous room during an exit hop.
            // Walking along an edge is not a hop — a hanging 2×2 must fail.
            if (straddle) continue;
            return false;
        }
        if (terrain.get(mx, my) === TERRAIN_MASK_WALL) return false;
        // Invisible dest: only terrain. Ramparts need a scout/creep in dest.
        if (Game.rooms[leaderPos.roomName]
            && new RoomPosition(mx, my, leaderPos.roomName).checkForImpassible(false, true)) return false;
    }
    return true;
}


Creep.prototype.shibSquadMovement = function (target, options = {}) {
    target = normalizePos(target);
    if (!target) return false;

    if (!this.memory._shibSquadMove) this.memory._shibSquadMove = {};
    options.squad = true;
    _.defaults(options, {range: 1});
    attachStagingAvoid(this, target, options);

    const cache = this.memory._shibSquadMove;
    const orientation = this.memory.squadOrientation || 0;
    const squadSize = (this.memory.squadMembers || []).length + 1;
    const targetKey = getPosKey(target);

    if (cache.path?.length && cache.orientation === orientation && cache.squadSize === squadSize && cache.endpoint) {
        if (cache.target === targetKey || endpointInRange(cache.endpoint, target, options.range)) {
            return squadMove(this, cache.path);
        }
    }

    const origin = this.pos;
    options.squadSize = squadSize;
    const searchTarget = applySquadHop(origin, target, options) || target;

    const allowedRooms = resolveAllowedRooms(origin.roomName, searchTarget.roomName, options);
    options = getMoveWeight(this, options);

    const maze = roomNeedsMazeOps(origin.roomName) || roomNeedsMazeOps(searchTarget.roomName);
    let maxOps = Math.max(DEFAULT_MAXOPS * Math.max(1, allowedRooms.length), maze ? MAZE_MAXOPS : DEFAULT_MAXOPS);
    const searchOpts = {
        maxRooms: options.maxRooms || Math.max(1, Math.ceil(allowedRooms.length * 1.5)),
        heuristicWeight: 1,
        roomCallback: roomName => allowedRooms.includes(roomName) ? getSquadMatrix(roomName, orientation, squadSize) : false,
    };
    const goals = options.hopGoals && options.hopGoals.length
        ? options.hopGoals
        : {pos: searchTarget, range: options.range};
    let result = PathFinder.search(origin, goals, Object.assign({maxOps}, searchOpts));
    if (result.incomplete && maxOps < MAZE_MAXOPS) {
        maxOps = MAZE_MAXOPS;
        result = PathFinder.search(origin, goals, Object.assign({maxOps}, searchOpts));
    }

    if (!result.path.length) {
        cache.path = undefined;
        cache.endpoint = undefined;
        return false;
    }
    // Incomplete walks into the nearest wall and never explores the tunnel.
    if (result.incomplete && !squadEndpointUsable(result.path[result.path.length - 1], searchTarget, options.range)) {
        cache.path = undefined;
        cache.endpoint = undefined;
        return false;
    }

    cache.target = targetKey;
    cache.orientation = orientation;
    cache.squadSize = squadSize;
    cache.endpoint = getPosKey(result.path[result.path.length - 1]);
    cache.path = serializePath(origin, result.path);
    return squadMove(this, cache.path);
};

Creep.prototype.shibSquadKite = function (fleeRange = FLEE_RANGE, options = {}) {
    if (!this.memory._shibSquadMove) this.memory._shibSquadMove = {};
    options.squad = true;
    options.flee = true;

    const threats = gatherThreats(this, fleeRange);
    if (!threats.length) return false;

    const fleeGoals = threats.map(t => ({pos: t.pos, range: fleeRange + 2}));
    const currentRoom = this.pos.roomName;
    const orientation = this.memory.squadOrientation || 0;
    const squadSize = (this.memory.squadMembers || []).length + 1;
    const allowedRooms = [currentRoom].concat(Object.values(Game.map.describeExits(currentRoom)));

    const result = PathFinder.search(this.pos, fleeGoals, {
        flee: true,
        maxRooms: allowedRooms.length * 1.5,
        roomCallback: roomName => {
            if (!allowedRooms.includes(roomName)) return false;
            if (roomName !== currentRoom && INTEL[roomName]?.owner && !FRIENDLIES.includes(INTEL[roomName].owner)) return false;
            return getSquadMatrix(roomName, orientation, squadSize);
        },
    });

    if (!result.path.length) return false;
    return !!squadMove(this, serializePath(this.pos, result.path));
};

Creep.prototype.shibSquadStep = function (direction) {
    if (!(direction >= TOP && direction <= TOP_LEFT)) return false;
    return squadMove(this, String(direction));
};

module.exports = {

    resolveAllowedRooms,

    squadMove,

    canSquadMove,

    isOccupiedByEnemy,

    isFootprintWalkable,

};