/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Cost matrix construction for PathFinder.

 */


const profiler = require('tools.profiler');
const {MATRIX_CACHE, ROOM_BASE_MATRIX_CACHE} = require('pathState');

const {hashStructures, applyLookObstaclesToMatrix, lookObstacleHash} = require('pathUtils');
const {isHomeRoomYieldingSquad} = require('pathTraffic');

function getBaseMatrix(roomName, creep, options) {
    const type = options.offRoad || options.tunnel ? 3 : options.ignoreRoads ? 2 : options.squad ? 4 : 1;
    const room = Game.rooms[roomName];
    const noWallWrecker = creep instanceof Creep
        ? ((INTEL[roomName]?.owner && FRIENDLIES.includes(INTEL[roomName].owner)) || (!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(WORK)))
        : true;
    const ignoreKeeper = !!options.ignoreKeeper;

    let plainCost, swampCost, roadCost;
    switch (type) {
        case 2:
            plainCost = 1;
            swampCost = 25;
            roadCost = 10;
            break;
        case 3:
            plainCost = 1;
            swampCost = 1;
            roadCost = 10;
            break;
        default:
            plainCost = Math.ceil(2 + (creep instanceof Creep ? (creep.store.getCapacity() / 50) * 0.1 : 0));
            swampCost = plainCost * 5;
            roadCost = 1;
    }

    const impassibleHash = room
        ? hashStructures(room.impassibleStructures.concat(room.constructionSites.filter((s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType))) || [])
        : '';
    const lookHash = room ? lookObstacleHash(room) : '';
    const structuresHash = room
        ? (lookHash ? `${impassibleHash}|L:${lookHash}` : impassibleHash) || 'no-obstacles'
        : 'no-room';
    const baseKey = `${roomName}_base_${type}_${noWallWrecker}_${ignoreKeeper}_${plainCost}_${swampCost}_${roadCost}_${structuresHash}`;

    // Per-tick reuse (biggest CPU win)
    if (ROOM_BASE_MATRIX_CACHE[roomName] &&
        ROOM_BASE_MATRIX_CACHE[roomName].tick === Game.time &&
        ROOM_BASE_MATRIX_CACHE[roomName].hash === structuresHash) {
        return ROOM_BASE_MATRIX_CACHE[roomName].matrix.clone();
    }

    // MATRIX_CACHE fallback with smarter TTL
    const ttl = INTEL[roomName]?.threatLevel ? 150 : 500;   // 500 ticks in safe rooms
    if (MATRIX_CACHE[baseKey] && Game.time - MATRIX_CACHE[baseKey].tick < ttl) {
        ROOM_BASE_MATRIX_CACHE[roomName] = {
            matrix: MATRIX_CACHE[baseKey].matrix,
            tick: Game.time,
            hash: structuresHash
        };
        return MATRIX_CACHE[baseKey].matrix.clone();
    }

    // Build once
    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);

    // Base terrain costs
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) {
                matrix.set(x, y, 256);
            } else if (x === 0 || x === 49 || y === 0 || y === 49) {
                matrix.set(x, y, options.flee ? 1 : 10);
            } else if (tile === TERRAIN_MASK_SWAMP) {
                matrix.set(x, y, swampCost);
            } else {
                matrix.set(x, y, plainCost);
            }
        }
    }

    if (room) {
        for (const structure of room.structures) {
            const pos = structure.pos;

            if (OBSTACLE_OBJECT_TYPES.includes(structure.structureType)) {
                matrix.set(pos.x, pos.y, 256);
                continue;
            }

            if (structure instanceof StructureRoad) {
                if (!pos.checkForObstacleStructure() && !pos.checkForContainer()) {
                    const cost = (room.hostileCreeps.length && pos.checkForRampart()) ? roadCost * 0.5 : roadCost;
                    matrix.set(pos.x, pos.y, cost);
                }
                continue;
            }

            if (structure instanceof StructurePortal) {
                matrix.set(pos.x, pos.y, 200);
                continue;
            }

            if (structure instanceof StructureRampart) {
                let myRampart = false;
                let friendlyRampart = false;
                try {
                    myRampart = structure.my || structure.isPublic;
                    friendlyRampart = structure.owner && FRIENDLIES.includes(structure.owner.username);
                } catch (e) {
                }
                if (myRampart && !pos.checkForObstacleStructure()) {
                    matrix.set(pos.x, pos.y, room.hostileCreeps.length ? roadCost : 1);
                } else if (friendlyRampart && !pos.checkForObstacleStructure()) {
                    matrix.set(pos.x, pos.y, 150);
                } else if (noWallWrecker) {
                    matrix.set(pos.x, pos.y, 256);
                } else {
                    matrix.set(pos.x, pos.y, 150);
                }
                continue;
            }

            if (structure instanceof StructureContainer) {
                matrix.set(pos.x, pos.y, 75);
                continue;
            }

            matrix.set(pos.x, pos.y, 255);
        }

        for (const site of room.constructionSites) {
            let friendlySite = false;
            try {
                friendlySite = site.my || (site.owner && FRIENDLIES.includes(site.owner.username));
            } catch (e) {
            }
            if (OBSTACLE_OBJECT_TYPES.includes(site.structureType) && friendlySite) {
                matrix.set(site.pos.x, site.pos.y, 256);
            }
        }

        for (const source of room.sources) matrix.set(source.pos.x, source.pos.y, 256);
        if (room.mineral) matrix.set(room.mineral.pos.x, room.mineral.pos.y, 256);

        for (const sCreep of room.myCreeps) {
            const immobile = sCreep.memory?.other?.stationary
                || (sCreep.memory?.grouped && !isHomeRoomYieldingSquad(sCreep))
                || (typeof sCreep.hasActiveBodyparts === 'function' ? !sCreep.hasActiveBodyparts(MOVE) : false);
            if (immobile) {
                matrix.set(sCreep.pos.x, sCreep.pos.y, 200);
            }
        }

        // Engine lookFor is authoritative for constructed walls/containers/etc.
        applyLookObstaclesToMatrix(matrix, room);
    }

    const finalMatrix = addSksToMatrix(roomName, matrix, options);
    MATRIX_CACHE[baseKey] = {matrix: finalMatrix, tick: Game.time};
    ROOM_BASE_MATRIX_CACHE[roomName] = {matrix: finalMatrix, tick: Game.time, hash: structuresHash};

    return finalMatrix;
}

function getMatrix(roomName, creep, options) {
    const room = Game.rooms[roomName];
    let matrix = getBaseMatrix(roomName, creep, options).clone();

    if (room) {
        matrix = addCreepsToMatrix(room, matrix, creep, options);

        const armedEnemies = room.hostileCreeps.filter(c => !c.className && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
        if (creep instanceof Creep && armedEnemies.length) {
            if ((!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(RANGED_ATTACK)) || options.flee) {
                matrix = addHostilesToMatrix(room, matrix);
            }
        }
    }
    return matrix;
}

function addCreepsToMatrix(room, matrix, creep, options) {
    if (options.ignoreCreeps) {
        if (creep instanceof Creep && creep.room.name === room.name) {
            const nearby = creep.pos.findInRange(room.creeps.concat(room.powerCreeps), 5);
            for (const c of nearby) matrix.set(c.pos.x, c.pos.y, 100);
        }
    } else {
        for (const c of room.creeps.concat(room.powerCreeps)) {
            matrix.set(c.pos.x, c.pos.y, 100);
        }
    }
    return matrix;
}

function addHostilesToMatrix(room, matrix) {
    if (!room || (room.controller?.owner?.username === MY_USERNAME && room.controller.safeMode)) return matrix;

    const enemyCreeps = room.hostileCreeps.filter(c => !c.className && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
    if (!enemyCreeps.length) return matrix;

    const terrain = Game.map.getRoomTerrain(room.name);

    for (const enemy of enemyCreeps) {
        matrix.set(enemy.pos.x, enemy.pos.y, 250);
        const top = Math.max(0, enemy.pos.y - 6);
        const left = Math.max(0, enemy.pos.x - 6);
        const bottom = Math.min(49, enemy.pos.y + 6);
        const right = Math.min(49, enemy.pos.x + 6);

        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    const dx = Math.abs(x - enemy.pos.x);
                    const dy = Math.abs(y - enemy.pos.y);
                    const range = Math.max(dx, dy);
                    if (range > 0) {
                        const value = 200 / range;
                        if (matrix.get(x, y) < value) matrix.set(x, y, value);
                    }
                }
            }
        }
    }
    return matrix;
}

function addSksToMatrix(roomName, matrix, options) {
    const intel = INTEL[roomName];
    if (!intel?.sk) return matrix;

    const room = Game.rooms[roomName];

    // If our SKAttacker is on-site, it'll mop up keepers and the rest of the room is safe.
    if (room) {
        const activeMining = room.myCreeps.find(c => c.memory.role === 'SKAttacker' && c.memory.destination === roomName);
        if (activeMining) return matrix;
    }

    const terrain = Game.map.getRoomTerrain(roomName);

    // Live SK creep positions take priority when we have vision â€” they're the actual
    // current threat and may have wandered off their lair/source.
    let sks = [];
    if (room) {
        sks = room.hostileCreeps.filter(c => c.owner && c.owner.username === 'Source Keeper');
        if (options.ignoreKeeper) sks = sks.filter(c => c.id !== options.ignoreKeeper);
    }

    if (sks.length) {
        for (const sk of sks) {
            matrix.set(sk.pos.x, sk.pos.y, Infinity);
            const top = Math.max(0, sk.pos.y - 3);
            const left = Math.max(0, sk.pos.x - 3);
            const bottom = Math.min(49, sk.pos.y + 3);
            const right = Math.min(49, sk.pos.x + 3);

            for (let y = top; y <= bottom; y++) {
                for (let x = left; x <= right; x++) {
                    if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                        const range = Math.max(Math.abs(x - sk.pos.x), Math.abs(y - sk.pos.y));
                        if (range > 0 && matrix.get(x, y) < 350 / range) {
                            matrix.set(x, y, 350 / range);
                        }
                    }
                }
            }
        }
        return matrix;
    }

    // No live keepers visible (or no vision at all) â€” fall back to the static danger
    // anchors. With vision: imminent-respawn lairs + sources + mineral. Without vision:
    // cached anchor positions from INTEL.skDangerPoints.
    let dangerPoints;
    if (room) {
        const lairs = room.keeperLairs.filter(s => s.ticksToSpawn && s.ticksToSpawn < 25);
        dangerPoints = _.union(lairs, room.sources, room.mineral ? [room.mineral] : [])
            .map(o => ({x: o.pos.x, y: o.pos.y}));
    } else {
        dangerPoints = intel.skDangerPoints;
    }
    if (!dangerPoints || !dangerPoints.length) return matrix;

    for (const pt of dangerPoints) {
        const top = Math.max(0, pt.y - 5);
        const left = Math.max(0, pt.x - 5);
        const bottom = Math.min(49, pt.y + 5);
        const right = Math.min(49, pt.x + 5);
        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL && matrix.get(x, y) < 250) {
                    matrix.set(x, y, 250);
                }
            }
        }
    }
    return matrix;
}


function getOutsideHubMatrix(roomName, matrix, options) {
    const room = Game.rooms[roomName];
    if (!room || !MY_ROOMS.includes(room.name)) return matrix;
    for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
            const pos = new RoomPosition(x, y, room.name);
            if (!pos.isInBunker()) {
                matrix.set(x, y, 250);
            }
        }
    }
    return matrix;
}

getMatrix = profiler.registerFN(getMatrix, 'shibMove.getMatrix');
getBaseMatrix = profiler.registerFN(getBaseMatrix, 'shibMove.getBaseMatrix');

module.exports = {
    getBaseMatrix,
    getMatrix,
    addCreepsToMatrix,
    addHostilesToMatrix,
    addSksToMatrix,
    getOutsideHubMatrix,
};