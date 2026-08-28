/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Squad formation geometry and squad cost matrices.

 */


const {MATRIX_CACHE} = require('pathState');

const {hashStructures, applyLookObstaclesToMatrix, lookObstacleHash} = require('pathUtils');

function getSquadMatrix(roomName, orientation = 0, squadSize = 4) {
    const room = Game.rooms[roomName];
    const impassibleHash = room ? hashStructures(room.impassibleStructures || []) : '';
    const lookHash = room ? lookObstacleHash(room) : '';
    const structuresHash = room ? (lookHash ? `${impassibleHash}|L:${lookHash}` : impassibleHash) || 'static' : 'static';
    // Duos path solo. A 3-creep remnant uses the L (two cardinals), not the
    // full 2×2, so a missing corner does not block the step.
    const footprint = squadSize >= 4 ? `q${orientation}` : squadSize === 3 ? `l${orientation}` : 'd';
    const cacheType = `squad_${footprint}_${structuresHash}`;
    return getCachedMatrix(roomName, cacheType, 200, () => buildSquadMatrix(roomName, orientation, squadSize));
}

function getCachedMatrix(roomName, type, tickTTL, computeFn) {
    const key = `${roomName}_${type}`;
    if (MATRIX_CACHE[key] && Game.time - MATRIX_CACHE[key].tick < tickTTL) {
        return MATRIX_CACHE[key].matrix.clone();
    }
    const matrix = computeFn();
    MATRIX_CACHE[key] = {matrix, tick: Game.time};
    return matrix;
}

function buildSquadMatrix(roomName, orientation, squadSize = 4) {
    const PLAIN = 1, SWAMP = squadSize < 3 ? 1 : 35, EDGE = 10, HOSTILE = 20, SOFT = 200, INFLATE = 250,
        IMPASSIBLE = 256;
    // PathFinder treats >= 255 as unwalkable. Inflating obstacles to 250 let a
    // quad path through a 1-tile wall hole; squadMove then rejected the step.
    const FOOTPRINT_BLOCK = 255;
    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);
    const vectors = getFormationVectors(orientation, squadSize);

    const raise = (x, y, cost) => {
        if (x < 0 || x > 49 || y < 0 || y > 49) return;
        if (matrix.get(x, y) < cost) matrix.set(x, y, cost);
    };
    const inflate = (cx, cy, cost) => {
        for (const v of vectors) raise(cx + v.x, cy + v.y, cost);
    };

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            matrix.set(x, y, tile === TERRAIN_MASK_WALL ? IMPASSIBLE : tile === TERRAIN_MASK_SWAMP ? SWAMP : PLAIN);
        }
    }

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) inflate(x, y, FOOTPRINT_BLOCK);
            else if (tile === TERRAIN_MASK_SWAMP) inflate(x, y, SWAMP);
        }
    }

    const room = Game.rooms[roomName];
    if (room) {
        for (const structure of room.structures) {
            if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                // Duos path 1-wide. A constructed wall at 254 is last-resort
                // smash; an open tunnel stays PLAIN and wins. Quads still
                // treat walls as footprint-blocked so they don't pack a 1-hole.
                if (structure.structureType === STRUCTURE_WALL && squadSize < 3) {
                    matrix.set(structure.pos.x, structure.pos.y, 254);
                } else {
                    matrix.set(structure.pos.x, structure.pos.y, IMPASSIBLE);
                    inflate(structure.pos.x, structure.pos.y, FOOTPRINT_BLOCK);
                }
            } else if (structure instanceof StructureRampart) {
                let friendlyRampart = false;
                try {
                    friendlyRampart = structure.owner && FRIENDLIES.includes(structure.owner.username);
                } catch (e) {
                    friendlyRampart = false;
                }
                if (friendlyRampart) {
                    raise(structure.pos.x, structure.pos.y, SOFT);
                    inflate(structure.pos.x, structure.pos.y, INFLATE);
                } else if (!structure.isPublic) {
                    if (squadSize < 3) {
                        matrix.set(structure.pos.x, structure.pos.y, 254);
                    } else {
                        matrix.set(structure.pos.x, structure.pos.y, IMPASSIBLE);
                        inflate(structure.pos.x, structure.pos.y, FOOTPRINT_BLOCK);
                    }
                }
            } else if (structure instanceof StructurePortal) {
                matrix.set(structure.pos.x, structure.pos.y, IMPASSIBLE);
                inflate(structure.pos.x, structure.pos.y, FOOTPRINT_BLOCK);
            }
        }
        for (const c of room.creeps) {
            if ((c.my && c.memory?.other?.stationary) || !c.hasActiveBodyparts(MOVE)) {
                raise(c.pos.x, c.pos.y, SOFT);
                inflate(c.pos.x, c.pos.y, SOFT);
            } else if (!c.my) {
                raise(c.pos.x, c.pos.y, HOSTILE);
                inflate(c.pos.x, c.pos.y, HOSTILE);
            }
        }
        for (const site of room.constructionSites) {
            let friendlySite = false;
            try {
                friendlySite = site.owner && FRIENDLIES.includes(site.owner.username);
            } catch (e) {
            }
            if (friendlySite || OBSTACLE_OBJECT_TYPES.includes(site.structureType)) {
                raise(site.pos.x, site.pos.y, INFLATE);
                inflate(site.pos.x, site.pos.y, INFLATE);
            }
        }

        applyLookObstaclesToMatrix(matrix, room, IMPASSIBLE);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (matrix.get(x, y) === IMPASSIBLE) inflate(x, y, FOOTPRINT_BLOCK);
            }
        }
    }

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            if (x <= 1 || x >= 48 || y <= 1 || y >= 48) raise(x, y, EDGE);
        }
    }

    return matrix;
}


// Leader at one corner, followers filling the 2×2 toward the opposite corner.
// 0 NW leader / SE followers (legacy 0)
// 1 SE leader / NW followers (legacy 1)
// 2 NE leader / SW followers
// 3 SW leader / NE followers
const QUAD_FOLLOWER_OFFSETS = {
    0: [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}],
    1: [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}],
    2: [{dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: -1, dy: 1}],
    3: [{dx: 0, dy: -1}, {dx: 1, dy: 0}, {dx: 1, dy: -1}]
};

function followerOffsets(orientation, squadSize = 4) {
    const all = QUAD_FOLLOWER_OFFSETS[orientation] || QUAD_FOLLOWER_OFFSETS[0];
    if (!(squadSize >= 3)) return [];
    if (squadSize >= 4) return all;
    const out = [];
    for (let i = 0; i < all.length; i++) {
        if (!all[i].dx || !all[i].dy) out.push(all[i]);
    }
    return out;
}

function getFormationVectors(orientation, squadSize = 4) {
    if (!(squadSize >= 3)) return [{x: 0, y: 0}];
    const offsets = followerOffsets(orientation, squadSize);
    const vectors = [{x: 0, y: 0}];
    for (let i = 0; i < offsets.length; i++) {
        vectors.push({x: -offsets[i].dx, y: -offsets[i].dy});
    }
    return vectors;
}

const MOVE_DX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
const MOVE_DY = [0, -1, -1, 0, 1, 1, 1, 0, -1];

// Cardinal step into an adjacent room, or 0 if they do not share an edge.
function exitDirectionTo(fromRoom, toRoom) {
    if (!fromRoom || !toRoom || fromRoom === toRoom) return 0;
    const exits = Game.map.describeExits(fromRoom);
    if (!exits) return 0;
    if (exits[TOP] === toRoom) return TOP;
    if (exits[RIGHT] === toRoom) return RIGHT;
    if (exits[BOTTOM] === toRoom) return BOTTOM;
    if (exits[LEFT] === toRoom) return LEFT;
    return 0;
}

// One-axis OOB uses that exit. Both OOB (corner diagonal) prefers east/west,
// then north/south — the driver classifies a corner by x when the step has an
// x component. Clamping the other axis instead of wrapping it a second time
// avoids sending the blob to the wrong neighbor.
function wrapRoomPos(roomName, x, y) {
    if (x >= 0 && x <= 49 && y >= 0 && y <= 49) return {x, y, roomName};
    const exits = Game.map.describeExits(roomName);
    if (!exits) return undefined;
    const xOob = x < 0 || x > 49;
    const yOob = y < 0 || y > 49;
    if (xOob) {
        const nextRoom = x < 0 ? exits[LEFT] : exits[RIGHT];
        if (nextRoom) {
            let ny = y;
            if (ny < 0) ny = 0;
            else if (ny > 49) ny = 49;
            return {x: x < 0 ? 49 : 0, y: ny, roomName: nextRoom};
        }
        if (!yOob) return undefined;
    }
    if (yOob) {
        const nextRoom = y < 0 ? exits[TOP] : exits[BOTTOM];
        if (!nextRoom) return undefined;
        let nx = x;
        if (nx < 0) nx = 0;
        else if (nx > 49) nx = 49;
        return {x: nx, y: y < 0 ? 49 : 0, roomName: nextRoom};
    }
    return undefined;
}

function offsetPos(leaderPos, dx, dy) {
    if (!leaderPos) return undefined;
    const wrapped = wrapRoomPos(leaderPos.roomName, leaderPos.x + dx, leaderPos.y + dy);
    if (!wrapped) return undefined;
    return new RoomPosition(wrapped.x, wrapped.y, wrapped.roomName);
}

// Next tile after a move, including the matching exit tile in the next room.
function posAfterMove(pos, direction) {
    if (!pos || !(direction >= TOP && direction <= TOP_LEFT)) return undefined;
    return offsetPos(pos, MOVE_DX[direction], MOVE_DY[direction]);
}

// PathFinder emits diagonal exit steps ((49,25) → (0,24) next room). Encoding
// only the edge cardinal walked the 2×2 one tile off the rest of the path.
function directionBetween(from, to) {
    if (!from || !to) return 0;
    if (from.roomName === to.roomName) return from.getDirectionTo(to) || 0;
    for (let d = TOP; d <= TOP_LEFT; d++) {
        const n = posAfterMove(from, d);
        if (n && n.x === to.x && n.y === to.y && n.roomName === to.roomName) return d;
    }
    if (from.x === 49 && to.x === 0) return RIGHT;
    if (from.x === 0 && to.x === 49) return LEFT;
    if (from.y === 0 && to.y === 49) return TOP;
    if (from.y === 49 && to.y === 0) return BOTTOM;
    return 0;
}

// Chebyshev range that treats matching exit tiles in neighboring rooms as adjacent.
// A packed 2×2 straddling dest (0,y) / staging (49,y) is range 1, not Infinity.
function formationRange(a, b) {
    if (!a || !b) return Infinity;
    if (a.roomName === b.roomName) {
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
    const exits = Game.map.describeExits(a.roomName);
    if (!exits) return Infinity;
    if (exits[RIGHT] === b.roomName && a.x >= 48 && b.x <= 1) {
        return Math.max(Math.abs((b.x + 50) - a.x), Math.abs(a.y - b.y));
    }
    if (exits[LEFT] === b.roomName && a.x <= 1 && b.x >= 48) {
        return Math.max(Math.abs(a.x - (b.x - 50)), Math.abs(a.y - b.y));
    }
    if (exits[BOTTOM] === b.roomName && a.y >= 48 && b.y <= 1) {
        return Math.max(Math.abs(a.x - b.x), Math.abs((b.y + 50) - a.y));
    }
    if (exits[TOP] === b.roomName && a.y <= 1 && b.y >= 48) {
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - (b.y - 50)));
    }
    return Infinity;
}

function isQuadCreep(creep) {
    if (!creep || !creep.memory) return false;
    if ((creep.memory.squadMembers || []).length >= 2) return true;
    if (!creep.memory.groupLeader) return false;
    const leader = Game.getObjectById(creep.memory.groupLeader);
    return !!(leader && (leader.memory.squadMembers || []).length >= 2);
}

// Duo or quad. Solo longbows still hop dest via shibMove.
function isSquadCreep(creep) {
    if (!creep || !creep.memory) return false;
    if ((creep.memory.squadMembers || []).length >= 1) return true;
    // Paired siege duos hop dest via role move(), not shibMove — same 1-at-a-time leak.
    if (creep.memory.role === 'siegeDuo' && creep.memory.partner) return true;
    // waitFor waves (including a remnant whose partners died) never shibMove dest.
    if (creep.memory.misc && creep.memory.misc.waitFor > 1) return true;
    if (!creep.memory.groupLeader) return false;
    const leader = Game.getObjectById(creep.memory.groupLeader);
    return !!(leader && (leader.memory.squadMembers || []).length >= 1);
}

function wouldEnterDest(pos, direction, destRoom) {
    if (!pos || !destRoom || pos.roomName === destRoom) return false;
    const next = posAfterMove(pos, direction);
    return !!(next && next.roomName === destRoom);
}

module.exports = {

    QUAD_FOLLOWER_OFFSETS,

    followerOffsets,

    getFormationVectors,

    getSquadMatrix,

    getCachedMatrix,

    buildSquadMatrix,

    exitDirectionTo,

    posAfterMove,

    wrapRoomPos,

    offsetPos,

    directionBetween,

    formationRange,

    isQuadCreep,

    isSquadCreep,

    wouldEnterDest,

};