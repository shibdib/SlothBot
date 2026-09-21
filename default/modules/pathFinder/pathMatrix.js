/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Cost matrix construction for PathFinder.

 */


const profiler = require('tools.profiler');
const {MATRIX_CACHE, ROOM_BASE_MATRIX_CACHE} = require('pathState');

const {hashStructures, applyLookObstaclesToMatrix, lookObstacleHash} = require('pathUtils');
const {isHomeRoomYieldingSquad} = require('pathTraffic');

// Terrain never changes. Structure-hash misses used to re-walk 2500 tiles.
const TERRAIN_MATRIX = Object.create(null);

function terrainMatrixKey(roomName, plainCost, swampCost, flee) {
    return `${roomName}_${plainCost}_${swampCost}_${flee ? 1 : 0}`;
}

function cloneTerrainMatrix(roomName, plainCost, swampCost, flee) {
    const key = terrainMatrixKey(roomName, plainCost, swampCost, flee);
    const cached = TERRAIN_MATRIX[key];
    if (cached) return cached.clone();
    const matrix = new PathFinder.CostMatrix();
    const terrain = Game.map.getRoomTerrain(roomName);
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const tile = terrain.get(x, y);
            if (tile === TERRAIN_MASK_WALL) {
                matrix.set(x, y, 256);
            } else if (x === 0 || x === 49 || y === 0 || y === 49) {
                matrix.set(x, y, flee ? 1 : 10);
            } else if (tile === TERRAIN_MASK_SWAMP) {
                matrix.set(x, y, swampCost);
            } else {
                matrix.set(x, y, plainCost);
            }
        }
    }
    TERRAIN_MATRIX[key] = matrix;
    return matrix.clone();
}

function getBaseMatrix(roomName, creep, options) {
    const room = Game.rooms[roomName];
    const noWallWrecker = creep instanceof Creep
        ? ((INTEL[roomName]?.owner && FRIENDLIES.includes(INTEL[roomName].owner)) || (!creep.hasActiveBodyparts(ATTACK) && !creep.hasActiveBodyparts(WORK)))
        : true;
    // Terrain type follows move weight. Wall wrecking only changes wall/rampart
    // costs so fatigued combat still prefers roads.
    const type = options.offRoad || options.tunnel ? 3 : options.ignoreRoads ? 2 : options.squad ? 4 : 1;
    const ignoreKeeper = !!options.ignoreKeeper;

    let plainCost, swampCost, roadCost;
    switch (type) {
        case 2:
            plainCost = 1;
            swampCost = 25;
            roadCost = 1;
            break;
        case 3:
            plainCost = 1;
            swampCost = 1;
            roadCost = 1;
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
    const skSelf = !!(creep instanceof Creep && creep.memory && creep.memory.role === 'SKAttacker');
    const skHarvestCover = !!(creep instanceof Creep && creep.memory && creep.memory.role === 'remoteHarvester');
    const intelSk = INTEL[roomName];
    const skPts = (intelSk && intelSk.skDangerPoints && intelSk.skDangerPoints.length) || 0;
    const nameSk = !!(intelSk && intelSk.sk) || !!(global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(roomName));
    const cacheStamp = `${type}_${noWallWrecker}_${ignoreKeeper}_${plainCost}_${swampCost}_${roadCost}_${!!options.tunnel}_${skSelf}_${skHarvestCover}_${!!options.ignoreSk}_${nameSk ? 1 : 0}_${skPts}`;
    const baseKey = `${roomName}_base_${cacheStamp}_${structuresHash}`;

    // Per-tick reuse (biggest CPU win). Stamp includes type/wrecker so a
    // civilian matrix is not reused for a combat search in the same tick.
    if (ROOM_BASE_MATRIX_CACHE[roomName] &&
        ROOM_BASE_MATRIX_CACHE[roomName].tick === Game.time &&
        ROOM_BASE_MATRIX_CACHE[roomName].hash === structuresHash &&
        ROOM_BASE_MATRIX_CACHE[roomName].stamp === cacheStamp) {
        return ROOM_BASE_MATRIX_CACHE[roomName].matrix.clone();
    }

    // MATRIX_CACHE fallback with smarter TTL
    const ttl = INTEL[roomName]?.threatLevel ? 150 : 500;   // 500 ticks in safe rooms
    if (MATRIX_CACHE[baseKey] && Game.time - MATRIX_CACHE[baseKey].tick < ttl) {
        ROOM_BASE_MATRIX_CACHE[roomName] = {
            matrix: MATRIX_CACHE[baseKey].matrix,
            tick: Game.time,
            hash: structuresHash,
            stamp: cacheStamp
        };
        return MATRIX_CACHE[baseKey].matrix.clone();
    }

    // Build once — terrain clone + structure overlay.
    const matrix = cloneTerrainMatrix(roomName, plainCost, swampCost, !!options.flee);

    if (room) {
        const structs = room.structures || [];
        const blocked = Object.create(null);
        const walkRampart = Object.create(null);
        const roads = [];
        const containers = [];
        const hostiles = !!(room.hostileCreeps && room.hostileCreeps.length);

        for (let i = 0; i < structs.length; i++) {
            const structure = structs[i];
            const pos = structure.pos;
            const type = structure.structureType;
            const key = pos.x + ',' + pos.y;

            if (OBSTACLE_OBJECT_TYPES.includes(type)) {
                if (type === STRUCTURE_WALL && !noWallWrecker) matrix.set(pos.x, pos.y, 254);
                else matrix.set(pos.x, pos.y, 256);
                blocked[key] = 1;
                continue;
            }
            if (type === STRUCTURE_RAMPART) {
                let myRampart = false;
                let friendlyRampart = false;
                try {
                    myRampart = structure.my || structure.isPublic;
                    friendlyRampart = structure.owner && FRIENDLIES.includes(structure.owner.username);
                } catch (e) { /* treat as blocked */
                }
                if (myRampart) walkRampart[key] = hostiles ? roadCost : 1;
                else if (friendlyRampart) walkRampart[key] = 150;
                else {
                    matrix.set(pos.x, pos.y, noWallWrecker ? 256 : 254);
                    blocked[key] = 1;
                }
                continue;
            }
            if (type === STRUCTURE_ROAD) {
                roads.push(pos);
                continue;
            }
            if (type === STRUCTURE_PORTAL) {
                matrix.set(pos.x, pos.y, 200);
                continue;
            }
            if (type === STRUCTURE_CONTAINER) {
                containers.push(pos);
                continue;
            }
            matrix.set(pos.x, pos.y, 255);
            blocked[key] = 1;
        }

        for (let i = 0; i < roads.length; i++) {
            const pos = roads[i];
            const key = pos.x + ',' + pos.y;
            if (blocked[key]) continue;
            let cost = roadCost;
            if (hostiles && walkRampart[key] != null) cost = Math.max(1, Math.round(roadCost * 0.5));
            matrix.set(pos.x, pos.y, cost);
        }
        for (const key in walkRampart) {
            if (blocked[key]) continue;
            const parts = key.split(',');
            const x = parts[0] | 0;
            const y = parts[1] | 0;
            const current = matrix.get(x, y);
            if (current >= 254) continue;
            if (current === roadCost) continue;
            matrix.set(x, y, walkRampart[key]);
        }
        for (let i = 0; i < containers.length; i++) {
            const pos = containers[i];
            if (blocked[pos.x + ',' + pos.y]) continue;
            if (matrix.get(pos.x, pos.y) === roadCost) continue;
            matrix.set(pos.x, pos.y, 75);
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
        if (room.thorium && (!room.mineral || room.thorium.id !== room.mineral.id)) {
            matrix.set(room.thorium.pos.x, room.thorium.pos.y, 256);
        }

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

    const finalMatrix = addSksToMatrix(roomName, matrix, options, creep);
    MATRIX_CACHE[baseKey] = {matrix: finalMatrix, tick: Game.time};
    ROOM_BASE_MATRIX_CACHE[roomName] = {matrix: finalMatrix, tick: Game.time, hash: structuresHash, stamp: cacheStamp};

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
    const skSelf = !!(creep instanceof Creep && creep.memory && creep.memory.role === 'SKAttacker');
    const occupiedCost = skSelf ? 8 : 100;
    if (options.ignoreCreeps) {
        if (creep instanceof Creep && creep.room.name === room.name) {
            const nearby = creep.pos.findInRange(room.creeps.concat(room.powerCreeps), 5);
            for (const c of nearby) {
                if (c.id === creep.id) continue;
                matrix.set(c.pos.x, c.pos.y, occupiedCost);
            }
        }
    } else {
        for (const c of room.creeps.concat(room.powerCreeps)) {
            if (creep && c.id === creep.id) continue;
            matrix.set(c.pos.x, c.pos.y, occupiedCost);
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

function addSksToMatrix(roomName, matrix, options, creep) {
    if (options && options.ignoreSk) return matrix;
    const intel = INTEL[roomName];
    const nameIsSk = !!(intel && intel.sk)
        || !!(global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(roomName));

    const room = Game.rooms[roomName];
    const isSkAttacker = !!(creep && creep.memory && creep.memory.role === 'SKAttacker');
    const skOnSite = isSkAttacker && creep.memory.destination === roomName;

    // Miners path to the source once a covering attacker is on site. Haulers
    // and builders keep keeper costs so they route around a spawn instead of
    // walking up and parking at kite range.
    if (room && !skOnSite) {
        const covering = room.myCreeps.find(c =>
            c.memory.role === 'SKAttacker'
            && !c.spawning
            && !c.memory.recycling
            && c.memory.destination === roomName
            && c.memory.arrived
        );
        const role = creep && creep.memory && creep.memory.role;
        if (covering && role === 'remoteHarvester') return matrix;
    }

    const terrain = Game.map.getRoomTerrain(roomName);

    // Live SK creep positions take priority when we have vision — they're the actual
    // current threat and may have wandered off their lair/source.
    // hostileCreeps excludes Source Keepers, so use the same creeps scan as skSafety.
    // Do this even when intel.sk is missing: structure caches can omit lairs, and
    // name-based SK used to match only the (4,4) corner of the ring.
    let sks = [];
    if (room) {
        if (room._skCreepsTick !== Game.time) {
            room._skCreeps = room.creeps.filter(c => c.owner && c.owner.username === 'Source Keeper');
            room._skCreepsTick = Game.time;
        }
        sks = room._skCreeps;
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

    if (!nameIsSk) return matrix;

    // SK attacker walks to lairs. Source/mineral blankets at range 5 forced
    // swamp corridors around the only plains/road into the pocket.
    if (isSkAttacker) {
        const anchors = (!room && intel && intel.skDangerPoints) ? intel.skDangerPoints : [];
        for (let i = 0; i < anchors.length; i++) {
            const pt = anchors[i];
            const top = Math.max(0, pt.y - 2);
            const left = Math.max(0, pt.x - 2);
            const bottom = Math.min(49, pt.y + 2);
            const right = Math.min(49, pt.x + 2);
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

    // No live keepers visible (or no vision at all) — fall back to the static danger
    // anchors. With vision: imminent-respawn lairs + sources + mineral. Without vision:
    // cached anchor positions from INTEL.skDangerPoints.
    let dangerPoints;
    if (room) {
        const lairs = room.keeperLairs.filter(s => s.ticksToSpawn && s.ticksToSpawn < 25);
        dangerPoints = _.union(lairs, room.sources, room.mineral ? [room.mineral] : [])
            .map(o => ({x: o.pos.x, y: o.pos.y}));
    } else {
        dangerPoints = intel && intel.skDangerPoints;
    }
    if (dangerPoints && dangerPoints.length) {
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

    // Unscouted SK, no vision: prefer the rim so a midline hop into the
    // sector center does not walk through keeper pockets at the sources.
    if (!room) {
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                const edge = Math.min(x, y, 49 - x, 49 - y);
                if (edge >= 4 && matrix.get(x, y) < 40) matrix.set(x, y, 40);
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