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

const {findRoute, attachStagingAvoid, filterAvoidedRooms, preferredExitAlong} = require('pathRoute');

const {serializePath} = require('pathPathCache');

const {
    getSquadMatrix,
    posAfterMove,
    formationRange,
    exitDirectionTo,
    tileBlocked,
    isFootprintWalkable,
    collectThroughPairs,
    inlandRoomPos
} = require('pathFormation');
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

    const lookAhead = route[idx + 2] || target.roomName;
    options.route = route.slice(idx, idx + HOP_WINDOW);
    options.maxRooms = HOP_WINDOW;
    const through = squadHopThroughTarget(origin.roomName, nextRoom, lookAhead);
    if (through.goals && through.goals.length) options.hopGoals = through.goals;
    options.range = through.range;
    return through.pos;
}

// Goal is 3 tiles inland of a 2-wide through-portal, not the landing and not
// 25,25. That keeps the serialized path crossing AND stepping off the exit
// so we do not repath (and walk the edge) on the entry tile.
function squadHopThroughTarget(fromRoom, nextRoom, lookAheadRoom) {
    const fallback = {pos: new RoomPosition(25, 25, nextRoom), range: 20};
    const exitDir = Game.map.findExit(fromRoom, nextRoom);
    if (!(exitDir > 0)) return fallback;
    const pairs = collectThroughPairs(fromRoom, nextRoom, exitDir);
    if (!pairs.length) return fallback;
    const preferred = preferredExitAlong(exitDir, nextRoom, lookAheadRoom);
    pairs.sort((a, b) => {
        const da = Math.abs(a - preferred) * 10 + Math.abs(a - 25);
        const db = Math.abs(b - preferred) * 10 + Math.abs(b - 25);
        return da - db;
    });
    const goals = [];
    const seen = new Set();
    for (let i = 0; i < pairs.length && goals.length < 8; i++) {
        const pos = inlandRoomPos(nextRoom, exitDir, pairs[i], 3);
        const key = pos.x + ',' + pos.y;
        if (seen.has(key)) continue;
        seen.add(key);
        goals.push({pos, range: 1});
    }
    if (!goals.length) return fallback;
    return {pos: goals[0].pos, range: 1, goals};
}

// getRangeTo is Infinity across rooms, so an incomplete path that reached the
// exit toward the target used to be discarded and the 2×2 stalled.
function squadEndpointUsable(end, target, range) {
    if (!end || !target) return false;
    if (end.roomName !== target.roomName) return false;
    return Math.max(Math.abs(end.x - target.x), Math.abs(end.y - target.y)) <= (range || 1);
}


function onExitTile(pos) {
    return !!(pos && (pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49));
}

// Engine skips the exit tile, so a 2×2 straddles at chebyshev 2 for one tick.
function inSquadStep(memberPos, leaderPos) {
    const r = formationRange(memberPos, leaderPos);
    if (r <= 1) return true;
    return r <= 2 && (onExitTile(memberPos) || onExitTile(leaderPos)
        || memberPos.roomName !== leaderPos.roomName);
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

    const packed = [];
    for (let i = 0; i < members.length; i++) {
        if (inSquadStep(members[i].pos, creep.pos)) packed.push(members[i]);
    }
    const movers = [creep];
    for (let i = 0; i < packed.length; i++) movers.push(packed[i]);

    const hostiles = !!creep.room.hostileCreeps.length;
    let anyoneLeaving = false;
    for (let i = 0; i < movers.length; i++) {
        const next = posAfterMove(movers[i].pos, move);
        if (!next || tileBlocked(next, true) || (hostiles && isOccupiedByEnemy(creep, next))) {
            creep.memory._shibSquadMove = undefined;
            return false;
        }
        if (next.roomName !== movers[i].pos.roomName) anyoneLeaving = true;
    }

    // A room hop is the same step as any other: every live member must be in
    // the blob. Partial crosses are how the 2×2 turns into a snake.
    if (anyoneLeaving && packed.length !== members.length) {
        creep.memory._shibSquadMove = undefined;
        return false;
    }

    const newLeaderPos = posAfterMove(creep.pos, move);
    const dest = creep.memory.destination;
    const leaderEnteringDest = !!(dest && newLeaderPos && newLeaderPos.roomName === dest
        && creep.pos.roomName !== dest);
    const misc = creep.memory.misc;
    const destAdjacent = !!(dest && exitDirectionTo(creep.pos.roomName, dest));
    const stagingBypass = !!(dest && misc && misc.stagingRoom && misc.stagingRoom !== dest
        && !misc.staged && creep.pos.roomName !== dest && !destAdjacent);
    if (leaderEnteringDest && stagingBypass) {
        creep.memory._shibSquadMove = undefined;
        return false;
    }

    if (!clearSquadFootprint(creep, packed, move)) return false;

    for (let i = 0; i < movers.length; i++) movers[i].move(move);

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
        if (c.id !== leader.id && !inSquadStep(c.pos, leader.pos)) continue;
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

function canSquadMove(leader, members, direction) {
    const hostiles = !!leader.room.hostileCreeps.length;
    const movers = [leader];
    for (let i = 0; i < members.length; i++) {
        if (inSquadStep(members[i].pos, leader.pos)) movers.push(members[i]);
    }
    for (let i = 0; i < movers.length; i++) {
        const nextPos = posAfterMove(movers[i].pos, direction);
        if (!nextPos || tileBlocked(nextPos, true)) return false;
        if (hostiles && isOccupiedByEnemy(leader, nextPos)) return false;
    }
    return true;
}

function isOccupiedByEnemy(leader, pos) {
    if (!pos || !Game.rooms[pos.roomName]) return false;
    const occupant = pos.lookFor(LOOK_CREEPS)[0];
    leader.memory.blockingCreep = occupant && !occupant.my ? occupant.id : undefined;
    return occupant && !occupant.my;
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