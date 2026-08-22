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
    // Duos (size ≤ 2) get a slimmer footprint than quads — see buildSquadMatrix.
    const footprint = squadSize >= 3 ? `q${orientation}` : 'd';
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
    const PLAIN = 1, SWAMP = 35, EDGE = 10, HOSTILE = 20, SOFT = 200, INFLATE = 250, IMPASSIBLE = 256;
    // PathFinder treats >= 255 as unwalkable. Inflating obstacles to 250 let a
    // quad path through a 1-tile wall hole; squadMove then rejected the step.
    const FOOTPRINT_BLOCK = 255;
    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);
    const vectors = squadSize >= 3 ? getFormationVectors(orientation) : [{x: 0, y: 0}];

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
                matrix.set(structure.pos.x, structure.pos.y, IMPASSIBLE);
                inflate(structure.pos.x, structure.pos.y, FOOTPRINT_BLOCK);
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
                    matrix.set(structure.pos.x, structure.pos.y, IMPASSIBLE);
                    inflate(structure.pos.x, structure.pos.y, FOOTPRINT_BLOCK);
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

const formationVectorsByOrientation = {
    0: [{x: 0, y: 0}, ...QUAD_FOLLOWER_OFFSETS[0].map(v => ({x: -v.dx, y: -v.dy}))],
    1: [{x: 0, y: 0}, ...QUAD_FOLLOWER_OFFSETS[1].map(v => ({x: -v.dx, y: -v.dy}))],
    2: [{x: 0, y: 0}, ...QUAD_FOLLOWER_OFFSETS[2].map(v => ({x: -v.dx, y: -v.dy}))],
    3: [{x: 0, y: 0}, ...QUAD_FOLLOWER_OFFSETS[3].map(v => ({x: -v.dx, y: -v.dy}))]
};

function getFormationVectors(orientation) {
    return formationVectorsByOrientation[orientation] || formationVectorsByOrientation[0];
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

// Next tile after a move, including the matching exit tile in the next room.
function posAfterMove(pos, direction) {
    if (!pos || !(direction >= TOP && direction <= TOP_LEFT)) return undefined;
    const next = pos.positionAtDirection(direction);
    if (next) return next;
    const exits = Game.map.describeExits(pos.roomName);
    if (!exits) return undefined;
    let nx = pos.x + MOVE_DX[direction];
    let ny = pos.y + MOVE_DY[direction];
    let roomName;
    if (ny < 0) {
        roomName = exits[TOP];
        ny = 49;
    } else if (ny > 49) {
        roomName = exits[BOTTOM];
        ny = 0;
    } else if (nx < 0) {
        roomName = exits[LEFT];
        nx = 49;
    } else if (nx > 49) {
        roomName = exits[RIGHT];
        nx = 0;
    }
    if (!roomName) return undefined;
    if (nx < 0) nx = 0;
    else if (nx > 49) nx = 49;
    if (ny < 0) ny = 0;
    else if (ny > 49) ny = 49;
    return new RoomPosition(nx, ny, roomName);
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

module.exports = {

    QUAD_FOLLOWER_OFFSETS,

    getFormationVectors,

    getSquadMatrix,

    getCachedMatrix,

    buildSquadMatrix,

    exitDirectionTo,

    posAfterMove,

    formationRange,

};