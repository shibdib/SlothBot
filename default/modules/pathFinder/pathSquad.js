/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Squad movement pathfinding and execution.

 */


const {DEFAULT_MAXOPS, FLEE_RANGE} = require('pathState');

const {
    normalizePos,
    getPosKey,
    getMoveWeight,
    endpointInRange,
    gatherThreats,
    isImmobileBlocker
} = require('pathUtils');

const {findRoute, attachStagingAvoid, filterAvoidedRooms} = require('pathRoute');

const {serializePath} = require('pathPathCache');

const {getSquadMatrix, getFormationVectors, posAfterMove, formationRange, exitDirectionTo} = require('pathFormation');
const {
    findOccupyingCreep,
    yieldOccupant,
    isBumperCandidate,
    isHomeRoomYieldingSquad,
} = require('pathTraffic');

function resolveAllowedRooms(originRoom, targetRoom, options) {
    const route = findRoute(originRoom, targetRoom, options);
    let rooms;
    if (route?.length) {
        rooms = route.includes(originRoom) ? route.slice() : [originRoom].concat(route);
    } else {
        rooms = [originRoom].concat(Object.values(Game.map.describeExits(originRoom)));
    }
    return filterAvoidedRooms(rooms, options, [originRoom, targetRoom]);
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

    if (newLeaderPos) {
        if (newLeaderPos.checkForImpassible(false, true) || !isFootprintWalkable(newLeaderPos, orientation, squadSize)) {
            creep.memory._shibSquadMove = undefined;
            return false;
        }
    }

    if (!canSquadMove(creep, members, move)) {
        creep.memory._shibSquadMove = undefined;
        return false;
    }

    // Dest hop is a 2-tick 2×2 slide: leader (front row) crosses with the
    // dest-side column, back row occupies the exit. Abort if anyone would
    // enter dest while the leader is still stepping onto the exit — that is
    // the "front row leaks in, re-form under towers" case.
    const dest = creep.memory.destination;
    const leaderEnteringDest = !!(dest && newLeaderPos && newLeaderPos.roomName === dest
        && creep.pos.roomName !== dest);
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
    if (leaderEnteringDest && members.some(m => formationRange(m.pos, creep.pos) > 1)) {
        creep.memory._shibSquadMove = undefined;
        return false;
    }
    if (dest && creep.pos.roomName !== dest) {
        for (const member of members) {
            if (formationRange(member.pos, creep.pos) > 1) continue;
            const memberNext = posAfterMove(member.pos, move);
            if (memberNext && memberNext.roomName === dest && member.pos.roomName !== dest
                && !leaderEnteringDest) {
                creep.memory._shibSquadMove = undefined;
                return false;
            }
        }
    }

    if (!clearSquadFootprint(creep, members, move)) return false;

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
            // A blocked tile here means the hop should not have started.
            if (roomCrossBlocked(nextPos)) continue;
            member.move(move);
        } else if (nextPos.checkForImpassible(false, true)) {
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

function canSquadMove(leader, members, direction) {
    const hostiles = !!leader.room.hostileCreeps.length;
    for (const member of members) {
        if (formationRange(member.pos, leader.pos) > 1) continue;
        const nextPos = posAfterMove(member.pos, direction);
        if (!nextPos) continue;
        if (nextPos.roomName !== member.pos.roomName) {
            if (roomCrossBlocked(nextPos)) return false;
            continue;
        }
        if (!hostiles) continue;
        if (nextPos.checkForImpassible(false, true) || isOccupiedByEnemy(leader, nextPos)) return false;
    }
    return true;
}

function isOccupiedByEnemy(leader, pos) {
    if (!pos || !Game.rooms[pos.roomName]) return false;
    const occupant = pos.lookFor(LOOK_CREEPS)[0];
    leader.memory.blockingCreep = occupant && !occupant.my ? occupant.id : undefined;
    return occupant && !occupant.my;
}

function isFootprintWalkable(leaderPos, orientation, squadSize = 4) {
    const vectors = getFormationVectors(orientation, squadSize);
    const terrain = Game.map.getRoomTerrain(leaderPos.roomName);
    const onEdge = leaderPos.x === 0 || leaderPos.x === 49 || leaderPos.y === 0 || leaderPos.y === 49;
    for (const v of vectors) {
        const mx = leaderPos.x - v.x;
        const my = leaderPos.y - v.y;
        if (mx < 0 || mx > 49 || my < 0 || my > 49) {
            // Rest of the 2×2 is still in the previous room during an exit hop.
            if (onEdge) continue;
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
    const allowedRooms = resolveAllowedRooms(origin.roomName, target.roomName, options);
    options = getMoveWeight(this, options);

    const result = PathFinder.search(origin, {pos: target, range: options.range}, {
        maxOps: DEFAULT_MAXOPS * allowedRooms.length,
        maxRooms: allowedRooms.length * 1.5,
        roomCallback: roomName => allowedRooms.includes(roomName) ? getSquadMatrix(roomName, orientation, squadSize) : false,
    });

    if (!result.path.length) {
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