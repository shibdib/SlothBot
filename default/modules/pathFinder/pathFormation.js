/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Squad formation geometry and squad cost matrices.

 */


const {MATRIX_CACHE} = require('pathState');

const {hashStructures, applyLookObstaclesToMatrix, lookObstacleHash} = require('pathUtils');

function neighborPortalHash(roomName) {
    const exits = Game.map.describeExits(roomName);
    if (!exits) return '';
    const dirs = [TOP, RIGHT, BOTTOM, LEFT];
    const parts = [];
    for (let i = 0; i < dirs.length; i++) {
        const n = exits[dirs[i]];
        if (!n) continue;
        const room = Game.rooms[n];
        if (!room) {
            parts.push(n);
            continue;
        }
        const lookHash = lookObstacleHash(room);
        const structHash = hashStructures(room.impassibleStructures || []);
        parts.push(lookHash ? `${n}:${structHash}|L:${lookHash}` : `${n}:${structHash}`);
    }
    return parts.join(',');
}

function getSquadMatrix(roomName, orientation = 0, squadSize = 4) {
    const room = Game.rooms[roomName];
    const impassibleHash = room ? hashStructures(room.impassibleStructures || []) : '';
    const lookHash = room ? lookObstacleHash(room) : '';
    const roadHash = room ? hashStructures((room.structures || []).filter(s => s.structureType === STRUCTURE_ROAD)) : '';
    const structuresHash = room
        ? (lookHash ? `${impassibleHash}|L:${lookHash}|R:${roadHash}` : `${impassibleHash}|R:${roadHash}`) || 'static'
        : 'static';
    // Duos path solo. A 3-creep remnant uses the L (two cardinals), not the
    // full 2×2, so a missing corner does not block the step.
    const footprint = squadSize >= 4 ? `q${orientation}` : squadSize === 3 ? `l${orientation}` : 'd';
    const neighborHash = squadSize >= 3 ? neighborPortalHash(roomName) : '';
    const cacheType = `squad_${footprint}_${structuresHash}_${neighborHash}`;
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

    const room = Game.rooms[roomName];
    // Paint roads before swamp inflate so a swamp-road landing is fatigue 1
    // (raise() only increases, so inflating first would leave cost 35).
    if (room) {
        for (const structure of room.structures) {
            if (!(structure instanceof StructureRoad)) continue;
            if (structure.pos.checkForObstacleStructure()) continue;
            matrix.set(structure.pos.x, structure.pos.y, PLAIN);
        }
    }

    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) inflate(x, y, FOOTPRINT_BLOCK);
            else if (tile === TERRAIN_MASK_SWAMP) {
                inflate(x, y, matrix.get(x, y) <= PLAIN ? PLAIN : SWAMP);
            }
        }
    }

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

    if (squadSize >= 3) {
        inflateNeighborEdges(roomName, inflate, FOOTPRINT_BLOCK, SWAMP, PLAIN);
        blockNonThroughExits(matrix, roomName, FOOTPRINT_BLOCK);
    } else {
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (x <= 1 || x >= 48 || y <= 1 || y >= 48) raise(x, y, EDGE);
            }
        }
    }

    return matrix;
}

// Neighbor landings sit on this room's edge. Inflate that edge so a 2×2
// whose next footprint wraps will not path onto a 1-wide hole or swamp/wall
// landing. Writes 0..49 (the virtual x=50 tile is outside the cost matrix).
function inflateNeighborEdges(roomName, inflate, blockCost, swampCost, roadCost) {
    const exits = Game.map.describeExits(roomName);
    if (!exits) return;
    const edges = [
        {room: exits[RIGHT], x: 49, y: null, lx: 0, ly: null},
        {room: exits[LEFT], x: 0, y: null, lx: 49, ly: null},
        {room: exits[BOTTOM], x: null, y: 49, lx: null, ly: 0},
        {room: exits[TOP], x: null, y: 0, lx: null, ly: 49}
    ];
    for (let e = 0; e < edges.length; e++) {
        const edge = edges[e];
        if (!edge.room) continue;
        const terrain = Game.map.getRoomTerrain(edge.room);
        const vis = Game.rooms[edge.room];
        for (let i = 0; i < 50; i++) {
            const lx = edge.lx == null ? i : edge.lx;
            const ly = edge.ly == null ? i : edge.ly;
            const x = edge.x == null ? i : edge.x;
            const y = edge.y == null ? i : edge.y;
            const tile = terrain.get(lx, ly);
            const landing = vis ? new RoomPosition(lx, ly, edge.room) : null;
            if (tile === TERRAIN_MASK_WALL) inflate(x, y, blockCost);
            else if (tile === TERRAIN_MASK_SWAMP) {
                const road = landing && landing.checkForRoad() && !landing.checkForObstacleStructure();
                inflate(x, y, road ? roadCost : swampCost);
            }
            if (landing && landing.checkForImpassible(false, true)) {
                inflate(x, y, blockCost);
            }
        }
    }
}

const THROUGH_WIDTH = 2;
const THROUGH_INLAND = 2;

function tileTerrainOpen(roomName, x, y) {
    if (x < 0 || x > 49 || y < 0 || y > 49) return false;
    if (Game.map.getRoomTerrain(roomName).get(x, y) === TERRAIN_MASK_WALL) return false;
    const room = Game.rooms[roomName];
    if (room && new RoomPosition(x, y, roomName).checkForObstacleStructure()) return false;
    return true;
}

function alongExitPos(dir, along) {
    if (dir === RIGHT) return {x: 49, y: along};
    if (dir === LEFT) return {x: 0, y: along};
    if (dir === TOP) return {x: along, y: 0};
    return {x: along, y: 49};
}

function alongLanding(dir, along) {
    if (dir === RIGHT) return {x: 0, y: along};
    if (dir === LEFT) return {x: 49, y: along};
    if (dir === TOP) return {x: along, y: 49};
    return {x: along, y: 0};
}

function alongInland(dir, along, depth) {
    if (dir === RIGHT) return {x: depth, y: along};
    if (dir === LEFT) return {x: 49 - depth, y: along};
    if (dir === TOP) return {x: along, y: 49 - depth};
    return {x: along, y: depth};
}

// 2 consecutive exit tiles whose landings and the next 2 inland tiles are open.
// Plains-then-wall is not a portal — the 2×2 can step on the landing and then
// has nowhere to go except along the exit.
function isSquadThroughPair(fromRoom, nextRoom, dir, along) {
    if (!fromRoom || !nextRoom || !dir) return false;
    for (let w = 0; w < THROUGH_WIDTH; w++) {
        const a = along + w;
        if (a < 1 || a > 48) return false;
        const exit = alongExitPos(dir, a);
        if (!tileTerrainOpen(fromRoom, exit.x, exit.y)) return false;
        const land = alongLanding(dir, a);
        if (!tileTerrainOpen(nextRoom, land.x, land.y)) return false;
        for (let d = 1; d <= THROUGH_INLAND; d++) {
            const t = alongInland(dir, a, d);
            if (!tileTerrainOpen(nextRoom, t.x, t.y)) return false;
        }
    }
    return true;
}

function exitOnThroughPortal(fromRoom, nextRoom, dir, along) {
    return isSquadThroughPair(fromRoom, nextRoom, dir, along)
        || isSquadThroughPair(fromRoom, nextRoom, dir, along - 1);
}

function blockNonThroughExits(matrix, roomName, blockCost) {
    const exits = Game.map.describeExits(roomName);
    if (!exits) return;
    const dirs = [TOP, RIGHT, BOTTOM, LEFT];
    for (let i = 0; i < dirs.length; i++) {
        const dir = dirs[i];
        const nextRoom = exits[dir];
        if (!nextRoom) continue;
        for (let along = 0; along < 50; along++) {
            if (exitOnThroughPortal(roomName, nextRoom, dir, along)) continue;
            const p = alongExitPos(dir, along);
            if (matrix.get(p.x, p.y) < blockCost) matrix.set(p.x, p.y, blockCost);
        }
    }
}

function collectThroughPairs(fromRoom, nextRoom, dir) {
    const pairs = [];
    if (!fromRoom || !nextRoom || !dir) return pairs;
    for (let along = 1; along <= 47; along++) {
        if (isSquadThroughPair(fromRoom, nextRoom, dir, along)) pairs.push(along);
    }
    return pairs;
}

function inlandRoomPos(nextRoom, dir, along, depth) {
    const t = alongInland(dir, along, depth);
    return new RoomPosition(t.x, t.y, nextRoom);
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

function footprintPositions(leaderPos, orientation, squadSize = 4) {
    if (!leaderPos) return null;
    const tiles = [leaderPos];
    const offsets = followerOffsets(orientation, squadSize);
    for (let i = 0; i < offsets.length; i++) {
        const tile = offsetPos(leaderPos, offsets[i].dx, offsets[i].dy);
        if (!tile) return null;
        tiles.push(tile);
    }
    return tiles;
}

function tileBlocked(pos, ignoreCreeps = true) {
    if (!pos) return true;
    const terrain = Game.map.getRoomTerrain(pos.roomName);
    if (terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL) return true;
    if (Game.rooms[pos.roomName] && pos.checkForImpassible(false, ignoreCreeps)) return true;
    return false;
}

function isFootprintWalkable(leaderPos, orientation, squadSize = 4) {
    const tiles = footprintPositions(leaderPos, orientation, squadSize);
    if (!tiles) return false;
    for (let i = 0; i < tiles.length; i++) {
        if (tileBlocked(tiles[i], true)) return false;
    }
    return true;
}

function onExitTile(pos) {
    return !!(pos && (pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49));
}

// Off every exit axis at once so a corner landing does not slide along an edge
// and bounce into the wrong neighbor.
function inlandOffExit(pos) {
    if (!pos) return 0;
    const dx = pos.x === 0 ? 1 : pos.x === 49 ? -1 : 0;
    const dy = pos.y === 0 ? 1 : pos.y === 49 ? -1 : 0;
    if (!dx && !dy) return 0;
    for (let d = TOP; d <= TOP_LEFT; d++) {
        if (MOVE_DX[d] === dx && MOVE_DY[d] === dy) return d;
    }
    return 0;
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
    const exitDir = exitDirectionTo(from.roomName, to.roomName);
    if (exitDir) return exitDir;
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
    if (!next) return false;
    if (next.roomName === destRoom) return true;
    // Stepping onto this room's dest-facing exit teleports at tick end.
    const dir = exitDirectionTo(pos.roomName, destRoom);
    if (!dir || next.roomName !== pos.roomName) return false;
    if (dir === RIGHT) return next.x === 49;
    if (dir === LEFT) return next.x === 0;
    if (dir === TOP) return next.y === 0;
    if (dir === BOTTOM) return next.y === 49;
    return false;
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

    footprintPositions,

    tileBlocked,

    isFootprintWalkable,

    isSquadThroughPair,

    collectThroughPairs,

    inlandRoomPos,

    directionBetween,

    onExitTile,

    inlandOffExit,

    formationRange,

    isQuadCreep,

    isSquadCreep,

    wouldEnterDest,

};