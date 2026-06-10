/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Shared pathfinding helpers and position utilities.

 */


function clearTrailerTowState(creep) {
    creep.memory.towDestination = undefined;
    creep.memory.towDestinationPos = undefined;
    creep.memory.towCreep = undefined;
    creep.memory.towOptions = undefined;
}


function getCreepMoveWeight(creep) {
    return creep.body.filter(p => p.type !== MOVE && p.type !== CARRY).length + (_.ceil(_.sum(creep.store) / 50) || 0);
}

// Pick a tow truck that can pull the trailer on roads (move >= combined weight),
// preferring spare capacity over raw proximity. Falls back to best spare-MOVE truck,
// then closest, only when no fully-capable tower is available.
function pickTowTruck(trailer, candidates) {
    if (!candidates.length) return null;

    const trailerWeight = getCreepMoveWeight(trailer);
    let best = null;
    let bestScore = -Infinity;

    for (const truck of candidates) {
        const move = truck.getActiveBodyparts(MOVE);
        const weight = getCreepMoveWeight(truck);
        if (move < weight) continue;

        const dist = trailer.pos.getRangeTo(truck);
        if (move >= weight + trailerWeight) {
            const score = (move - weight - trailerWeight) * 100 - dist;
            if (score > bestScore) {
                bestScore = score;
                best = truck;
            }
        }
    }

    if (best) return best;

    let fallback = null;
    let fallbackScore = -Infinity;
    for (const truck of candidates) {
        const move = truck.getActiveBodyparts(MOVE);
        const weight = getCreepMoveWeight(truck);
        if (move < weight) continue;
        const score = (move - weight) * 10 - trailer.pos.getRangeTo(truck);
        if (score > fallbackScore) {
            fallbackScore = score;
            fallback = truck;
        }
    }

    return fallback || trailer.pos.findClosestByRange(candidates);
}


function normalizePos(destination) {
    if (!(destination instanceof RoomPosition)) {
        return destination?.pos ?? undefined;
    }
    return destination;
}


const reverseDirection = dir => (9 - parseInt(dir, 10)) % 8 + 1;

const getPathKey = (from, to, weight) => `${from.x},${from.y},${from.roomName}_${to.x},${to.y},${to.roomName}_${weight}`;

const hashStructures = structs => (structs && structs.length ? structs.map(s => `${s.x},${s.y},${s.structureType}`).join('|') : '');


function hashRoomStructures(room) {
    if (!room || !room.structures) return '';
    return hashStructures(room.structures);
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
        if (trailer && creep.pos.isNearTo(trailer)) {
            weight += trailer.body.filter(p => p.type !== MOVE && p.type !== CARRY).length;
        } else if (!trailer) {
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

module.exports = {

    clearTrailerTowState,

    getCreepMoveWeight,

    pickTowTruck,

    normalizePos,

    reverseDirection,

    getPathKey,

    hashStructures,

    hashRoomStructures,

    getMoveWeight,

    findMultiHeadingPos,

    getPosKey,

    parsePosKey,

    endpointInRange,

    gatherThreats,

};