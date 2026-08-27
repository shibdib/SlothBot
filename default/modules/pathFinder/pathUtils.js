/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Shared pathfinding helpers and position utilities.
 */

const SHIB_MOVE_STATE = Object.create(null);

function getShibMove(creep) {
    return creep && creep.name ? SHIB_MOVE_STATE[creep.name] : undefined;
}

function setShibMove(creep, state) {
    if (!creep || !creep.name) return state;
    if (!state) delete SHIB_MOVE_STATE[creep.name];
    else SHIB_MOVE_STATE[creep.name] = state;
    if (creep.memory && creep.memory._shibMove !== undefined) delete creep.memory._shibMove;
    return state;
}

function ensureShibMove(creep) {
    let state = getShibMove(creep);
    if (!state) state = setShibMove(creep, {});
    else if (creep.memory && creep.memory._shibMove !== undefined) delete creep.memory._shibMove;
    return state;
}

function clearShibMove(creep) {
    setShibMove(creep, undefined);
}

let strippedLegacyShib = false;

function stripLegacyShibMemory() {
    if (strippedLegacyShib) return;
    strippedLegacyShib = true;
    for (const name in Memory.creeps) {
        if (Memory.creeps[name] && Memory.creeps[name]._shibMove !== undefined) {
            delete Memory.creeps[name]._shibMove;
        }
    }
    if (Memory.powerCreeps) {
        for (const name in Memory.powerCreeps) {
            if (Memory.powerCreeps[name] && Memory.powerCreeps[name]._shibMove !== undefined) {
                delete Memory.powerCreeps[name]._shibMove;
            }
        }
    }
}

function releaseTruckRef(truck) {
    if (!truck) return;
    truck.memory.towStart = undefined;
    truck.memory.lastRangeToTrailer = undefined;
    truck.memory.lastTowDist = undefined;
    truck.memory.lastTowProgress = undefined;
    truck.memory.pullFailStreak = undefined;
    truck.memory.towAtRing = undefined;
    truck.memory.trailer = undefined;
}

function resetTrailerTowState(trailer) {
    if (!trailer) return;
    clearShibMove(trailer);
    trailer.memory.towCreep = undefined;
    trailer.memory.towDestination = undefined;
    trailer.memory.towDestinationPos = undefined;
    trailer.memory.towOptions = undefined;

}

function endTow(truck, trailer) {
    releaseTruckRef(truck);
    resetTrailerTowState(trailer);
}

function clearTrailerTowState(trailer) {
    if (!trailer) return;
    const truckId = trailer.memory.towCreep;
    resetTrailerTowState(trailer);
    if (!truckId) return;
    const truck = Game.getObjectById(truckId);
    if (truck && truck.memory.trailer === trailer.id) releaseTruckRef(truck);
}

function getCreepMoveWeight(creep) {
    return creep.body.filter(p => p.type !== MOVE && p.type !== CARRY).length + (_.ceil(_.sum(creep.store) / 50) || 0);
}

function needsTow(creep) {
    return !!(creep && !creep.className && !creep.hasActiveBodyparts(MOVE) && !creep.hasActiveBodyparts(HEAL));
}

function isPullSwapBlocker(creep) {
    if (!creep || creep.className) return false;
    if (!creep.hasActiveBodyparts(MOVE)) return true;
    return !!(creep.memory.towDestination && (needsTow(creep) || creep.memory.towCreep));
}

function canTowCreep(puller, trailer) {
    if (!puller || !trailer || puller.className) return false;
    const pullerMove = puller.getActiveBodyparts(MOVE);
    if (!pullerMove) return false;
    return pullerMove >= getCreepMoveWeight(puller) + getCreepMoveWeight(trailer);
}

function canPullCreep(puller, pullee) {
    if (!puller || !pullee || puller.className || !puller.pos.isNearTo(pullee)) return false;
    if (pullee.memory?.trailer) return false;
    return canTowCreep(puller, pullee);
}

function isCombatTowExempt(creep) {
    return creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(RANGED_ATTACK) ||
        creep.hasActiveBodyparts(HEAL) || creep.hasActiveBodyparts(CLAIM);
}

function canActAsTowTruck(creep, trailer) {
    if (!creep || !creep.my || creep.className) return false;
    if (trailer && creep.id === trailer.id) return false;
    if (creep.memory.trailer) return false;
    if (needsTow(creep) && creep.memory.towDestination) return false;
    if (!creep.hasActiveBodyparts(MOVE)) return false;
    if (isCombatTowExempt(creep)) return false;
    return true;
}

function isImmobileBlocker(creep) {
    return creep && !creep.className && !creep.hasActiveBodyparts(MOVE);
}

function tryPullSwapThrough(mover, blocker, nextDirection) {
    if (!nextDirection || !mover || !blocker || !isPullSwapBlocker(blocker)) return false;
    if (blocker.memory?.other?.stationary || blocker.memory?.grouped) return false;
    if (!mover.pos.isNearTo(blocker)) return false;
    if (!canPullCreep(mover, blocker)) return false;

    const backDir = blocker.pos.getDirectionTo(mover);
    if (!backDir) return false;

    const pullResult = mover.pull(blocker);
    if (pullResult !== OK) return false;

    // Step onto the blocker's tile while dragging it back to ours (swap via pull).
    blocker.move(backDir);
    mover.move(nextDirection);
    const blockerMove = getShibMove(blocker);
    if (blockerMove) blockerMove.pathPosTime = 0;
    const moverMove = getShibMove(mover);
    if (moverMove) moverMove.pathPosTime = 0;
    return true;
}

function normalizePos(destination) {
    if (!(destination instanceof RoomPosition)) {
        return destination?.pos ?? undefined;
    }
    return destination;
}

const reverseDirection = dir => (9 - parseInt(dir, 10)) % 8 + 1;

const getPathKey = (from, to, weight) => `${from.x},${from.y},${from.roomName}_${to.x},${to.y},${to.roomName}_${weight}`;

const hashStructures = structs => {
    if (!structs || !structs.length) return '';
    return structs
        .map(s => {
            const x = s.pos ? s.pos.x : s.x;
            const y = s.pos ? s.pos.y : s.y;
            return `${x},${y},${s.structureType}`;
        })
        .sort()
        .join('|');
};

let lookObstacleCache = {};

function useNativeLookObstacles() {
    return !!global.USE_NATIVE_LOOK_OBSTACLES;
}

function lookObstacleCacheTTL(roomName) {
    return INTEL[roomName]?.threatLevel ? 150 : 500;
}

function structureObstacleFingerprint(room) {
    const obstacles = [];
    for (const s of room.structures) {
        if (OBSTACLE_OBJECT_TYPES.includes(s.structureType)) obstacles.push(s);
    }
    for (const site of room.constructionSites) {
        if (OBSTACLE_OBJECT_TYPES.includes(site.structureType)) obstacles.push(site);
    }
    return hashStructures(obstacles);
}

function collectObstacleTilesFromStructures(room) {
    const parts = [];
    const tiles = [];
    const tileSeen = new Set();
    const add = (s) => {
        const x = s.pos.x;
        const y = s.pos.y;
        parts.push(`${x},${y},${s.structureType}`);
        const tileKey = `${x},${y}`;
        if (!tileSeen.has(tileKey)) {
            tileSeen.add(tileKey);
            tiles.push({x, y});
        }
    };

    for (const s of room.structures) {
        if (OBSTACLE_OBJECT_TYPES.includes(s.structureType)) add(s);
    }
    for (const site of room.constructionSites) {
        if (OBSTACLE_OBJECT_TYPES.includes(site.structureType)) add(site);
    }

    parts.sort();
    return {hash: parts.join('|'), tiles};
}

function scanNativeLookObstacles(room) {
    const native = RoomPosition.prototype.__nativeLookFor;
    if (!native) return collectObstacleTilesFromStructures(room);

    const parts = [];
    const tiles = [];
    const tileSeen = new Set();

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            try {
                const structs = native.call(new RoomPosition(x, y, room.name), LOOK_STRUCTURES);
                for (const s of structs) {
                    if (!OBSTACLE_OBJECT_TYPES.includes(s.structureType)) continue;
                    parts.push(`${x},${y},${s.structureType}`);
                    const tileKey = `${x},${y}`;
                    if (!tileSeen.has(tileKey)) {
                        tileSeen.add(tileKey);
                        tiles.push({x, y});
                    }
                }
            } catch (e) { /* corrupt tile */
            }
        }
    }

    parts.sort();
    return {hash: parts.join('|'), tiles};
}

function getLookObstacleData(room) {
    if (!room) return {hash: '', tiles: []};

    const fingerprint = structureObstacleFingerprint(room);
    const cached = lookObstacleCache[room.name];
    const ttl = lookObstacleCacheTTL(room.name);

    if (cached && cached.fingerprint === fingerprint) {
        if (cached.tick === Game.time || Game.time - cached.tick < ttl) {
            return cached.data;
        }
    }

    const data = useNativeLookObstacles()
        ? scanNativeLookObstacles(room)
        : collectObstacleTilesFromStructures(room);

    lookObstacleCache[room.name] = {tick: Game.time, fingerprint, data};
    return data;
}

function lookObstacleHash(room) {
    return getLookObstacleData(room).hash;
}

/**
 * Extra obstacle pass from native lookFor — only when USE_NATIVE_LOOK_OBSTACLES is set
 * (private servers where room.structures disagrees with vision). On official servers
 * getBaseMatrix already marks OBSTACLE_OBJECT_TYPES from room.structures.
 */
function applyLookObstaclesToMatrix(matrix, room, impassibleCost = 256) {
    if (!matrix || !room || !useNativeLookObstacles()) return;
    for (const {x, y} of getLookObstacleData(room).tiles) {
        matrix.set(x, y, impassibleCost);
    }
}

function clearLookObstacleCache(roomName) {
    if (roomName) delete lookObstacleCache[roomName];
    else lookObstacleCache = {};
}

let structureHashTick = -1;
const structureHashCache = Object.create(null);

function hashRoomStructures(room) {
    if (!room) return lookObstacleHash(room);
    if (structureHashTick !== Game.time) {
        structureHashTick = Game.time;
        for (const key in structureHashCache) delete structureHashCache[key];
    }
    if (structureHashCache[room.name] !== undefined) return structureHashCache[room.name];
    const gameHash = room.structures ? hashStructures(room.structures) : '';
    const lookHash = lookObstacleHash(room);
    const stamp = lookHash ? `${gameHash}|L:${lookHash}` : gameHash;
    let h = 5381;
    for (let i = 0; i < stamp.length; i++) h = ((h << 5) + h) ^ stamp.charCodeAt(i);
    const short = (h >>> 0).toString(36);
    structureHashCache[room.name] = short;
    return short;
}

function getMoveWeight(creep, options = {}) {
    if (creep.className) {
        options.offRoad = true;
        return options;
    }

    const move = creep.getActiveBodyparts(MOVE);
    let weight = creep.body.filter(p => p.type !== MOVE && p.type !== CARRY).length;
    weight += _.ceil(_.sum(creep.store) / 50) || 0;

    if (creep.memory.trailer) {
        const trailer = Game.getObjectById(creep.memory.trailer);
        if (trailer) {
            weight += getCreepMoveWeight(trailer);
        } else {
            creep.memory.trailer = undefined;
        }
    }

    if (move >= weight * 5) options.offRoad = true;
    else if (move >= weight || (move === weight && COMBAT_ROLES.includes(creep.memory.role))) options.ignoreRoads = true;
    else {
        options.offRoad = undefined;
        options.ignoreRoads = undefined;
    }
    return options;
}

function findMultiHeadingPos(heading, range) {
    const positions = [];
    let goodPos;

    for (const target of heading) {
        const area = target.room.lookForAtArea(LOOK_TERRAIN,
            target.pos.y - range, target.pos.x - range,
            target.pos.y + range, target.pos.x + range, true);

        for (const tile of area) {
            const pos = new RoomPosition(tile.x, tile.y, heading[0].room.name);
            if (pos.checkForImpassible()) continue;

            const existing = positions.find(p => p.x === pos.x && p.y === pos.y && p.t !== target.id);
            if (existing) {
                goodPos = existing;
                break;
            }
            positions.push({x: pos.x, y: pos.y, t: target.id});
        }
        if (goodPos) break;
    }

    return goodPos ? new RoomPosition(goodPos.x, goodPos.y, heading[0].room.name) : undefined;
}

function getPosKey(pos) {
    return `${pos.x}x${pos.y}${pos.roomName}`;
}

function parsePosKey(key) {
    const match = key.match(/^(\d+)x(\d+)([EW]\d+[NS]\d+)$/);
    if (!match) throw new Error(`Invalid position key: ${key}`);
    const [, x, y, roomName] = match;
    return {x: parseInt(x, 10), y: parseInt(y, 10), roomName};
}

function gatherThreats(creep, fleeRange) {
    const threats = creep.room.hostileCreeps.filter(c =>
        (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) &&
        creep.pos.getRangeTo(c) <= fleeRange + 2
    );
    const lairs = creep.room.structures.filter(s =>
        s.structureType === STRUCTURE_KEEPER_LAIR &&
        s.ticksToSpawn && s.ticksToSpawn <= fleeRange + 2 &&
        creep.pos.getRangeTo(s) <= fleeRange + 2
    );
    return threats.concat(lairs);
}

function endpointInRange(endpointKey, target, range) {
    if (range === undefined) return false;
    let parsed;
    try {
        parsed = parsePosKey(endpointKey);
    } catch {
        return false;
    }
    if (parsed.roomName !== target.roomName) return false;
    return Math.max(Math.abs(parsed.x - target.x), Math.abs(parsed.y - target.y)) <= range;
}

function roomNeedsMazeOps(roomName) {
    const intel = typeof INTEL !== 'undefined' && INTEL[roomName];
    if (!intel) return false;
    if (intel.obstacles) return true;
    if (intel.owner && typeof FRIENDLIES !== 'undefined' && !FRIENDLIES.includes(intel.owner)) return true;
    return false;
}

module.exports = {
    getShibMove,
    setShibMove,
    ensureShibMove,
    clearShibMove,
    stripLegacyShibMemory,
    clearTrailerTowState,
    endTow,
    releaseTruckRef,
    resetTrailerTowState,
    getCreepMoveWeight,
    needsTow,
    isPullSwapBlocker,
    isImmobileBlocker,
    canTowCreep,
    canActAsTowTruck,
    canPullCreep,
    tryPullSwapThrough,
    normalizePos,
    reverseDirection,
    getPathKey,
    hashStructures,
    hashRoomStructures,
    lookObstacleHash,
    applyLookObstaclesToMatrix,
    clearLookObstacleCache,
    getMoveWeight,
    findMultiHeadingPos,
    getPosKey,
    parsePosKey,
    endpointInRange,
    roomNeedsMazeOps,
    gatherThreats,
};