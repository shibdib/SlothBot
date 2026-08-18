/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Squad movement pathfinding and execution.

 */


const {DEFAULT_MAXOPS, FLEE_RANGE} = require('pathState');

const {normalizePos, getPosKey, getMoveWeight, endpointInRange, gatherThreats} = require('pathUtils');

const {findRoute} = require('pathRoute');

const {serializePath} = require('pathPathCache');

const {getSquadMatrix, getFormationVectors} = require('pathFormation');

function resolveAllowedRooms(originRoom, targetRoom, options) {
    const route = findRoute(originRoom, targetRoom, options);
    if (route?.length) {
        if (!route.includes(originRoom)) route.unshift(originRoom);
        return route;
    }
    return [originRoom].concat(Object.values(Game.map.describeExits(originRoom)));
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
    const newLeaderPos = creep.pos.positionAtDirection(move);

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

    creep.move(move);
    for (const member of members) {
        if (member.pos.getRangeTo(creep) > 1) continue;
        const nextPos = member.pos.positionAtDirection(move);
        if (!nextPos) {
            // Room-edge step: same direction crosses with the leader.
            // shibMove(leader) would path to 25,25 of the next room.
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

function canSquadMove(leader, members, direction) {
    if (!leader.room.hostileCreeps.length) return true;
    for (const member of members) {
        const nextPos = member.pos.positionAtDirection(direction);
        if (!nextPos) continue;
        if (nextPos.checkForImpassible(false, true) || isOccupiedByEnemy(leader, nextPos)) return false;
    }
    return true;
}

function isOccupiedByEnemy(leader, pos) {
    const occupant = pos.lookFor(LOOK_CREEPS)[0];
    leader.memory.blockingCreep = occupant && !occupant.my ? occupant.id : undefined;
    return occupant && !occupant.my;
}

function isFootprintWalkable(leaderPos, orientation, squadSize = 4) {
    const vectors = squadSize >= 3 ? getFormationVectors(orientation) : [{x: 0, y: 0}];
    const terrain = Game.map.getRoomTerrain(leaderPos.roomName);
    for (const v of vectors) {
        const mx = leaderPos.x - v.x;
        const my = leaderPos.y - v.y;
        if (mx < 0 || mx > 49 || my < 0 || my > 49) return false;
        if (terrain.get(mx, my) === TERRAIN_MASK_WALL) return false;
        if (new RoomPosition(mx, my, leaderPos.roomName).checkForImpassible(false, true)) return false;
    }
    return true;
}


Creep.prototype.shibSquadMovement = function (target, options = {}) {
    target = normalizePos(target);
    if (!target) return false;

    if (!this.memory._shibSquadMove) this.memory._shibSquadMove = {};
    options.squad = true;
    _.defaults(options, {range: 1});

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

module.exports = {

    resolveAllowedRooms,

    squadMove,

    canSquadMove,

    isOccupiedByEnemy,

    isFootprintWalkable,

};