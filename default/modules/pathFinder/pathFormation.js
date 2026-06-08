/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Squad formation geometry and squad cost matrices.

 */


const {MATRIX_CACHE} = require('pathState');

const {hashStructures} = require('pathUtils');

function getSquadMatrix(roomName, orientation = 0, squadSize = 4) {
    const room = Game.rooms[roomName];
    const structuresHash = room ? hashStructures(room.impassibleStructures || []) : 'static';
    // Duos (size â‰¤ 2) get a slimmer footprint than quads â€” see buildSquadMatrix.
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
    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);
    // Quads need the full 2Ã—2 formation footprint inflated around obstacles. Duos
    // only need leader clearance â€” the follower trails via solo movement and can
    // single-file through 1-tile corridors (e.g. border row sandwiched between
    // a wall and the exit).
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
            if (tile === TERRAIN_MASK_WALL) inflate(x, y, INFLATE);
            else if (tile === TERRAIN_MASK_SWAMP) inflate(x, y, SWAMP);
        }
    }

    const room = Game.rooms[roomName];
    if (room) {
        for (const structure of room.structures) {
            if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                matrix.set(structure.pos.x, structure.pos.y, IMPASSIBLE);
                inflate(structure.pos.x, structure.pos.y, INFLATE);
            } else if (structure instanceof StructureRampart && FRIENDLIES.includes(structure.owner.username)) {
                raise(structure.pos.x, structure.pos.y, SOFT);
                inflate(structure.pos.x, structure.pos.y, INFLATE);
            } else if (structure instanceof StructurePortal) {
                matrix.set(structure.pos.x, structure.pos.y, IMPASSIBLE);
                inflate(structure.pos.x, structure.pos.y, INFLATE);
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
            if (FRIENDLIES.includes(site.owner.username) || OBSTACLE_OBJECT_TYPES.includes(site.structureType)) {
                raise(site.pos.x, site.pos.y, INFLATE);
                inflate(site.pos.x, site.pos.y, INFLATE);
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


const QUAD_FOLLOWER_OFFSETS = {
    0: [{dx: 0, dy: 1}, {dx: 1, dy: 0}, {dx: 1, dy: 1}],
    1: [{dx: 0, dy: -1}, {dx: -1, dy: 0}, {dx: -1, dy: -1}]
};

// Internal form used by buildSquadMatrix / isFootprintWalkable. Derived by
// negating follower offsets (the matrix encodes "obstacle â†’ blocked-leader"
// vectors) and prepending the leader's own cell.
const formationVectorsByOrientation = {
    0: [{x: 0, y: 0}, ...QUAD_FOLLOWER_OFFSETS[0].map(v => ({x: -v.dx, y: -v.dy}))],
    1: [{x: 0, y: 0}, ...QUAD_FOLLOWER_OFFSETS[1].map(v => ({x: -v.dx, y: -v.dy}))]
};

function getFormationVectors(orientation) {
    return formationVectorsByOrientation[orientation] || formationVectorsByOrientation[0];
}

module.exports = {

    QUAD_FOLLOWER_OFFSETS,

    getFormationVectors,

    getSquadMatrix,

    getCachedMatrix,

    buildSquadMatrix,

};