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

function creepMoveFlags(creep) {
    if (!(creep instanceof Creep)) {
        return {hasAttack: false, hasWork: false, hasRanged: false};
    }
    if (creep._moveFlagsTick === Game.time && creep._moveFlags) return creep._moveFlags;
    const flags = {
        hasAttack: creep.hasActiveBodyparts(ATTACK),
        hasWork: creep.hasActiveBodyparts(WORK),
        hasRanged: creep.hasActiveBodyparts(RANGED_ATTACK),
    };
    creep._moveFlagsTick = Game.time;
    creep._moveFlags = flags;
    return flags;
}

function getBaseMatrix(roomName, creep, options) {
    const room = Game.rooms[roomName];
    const flags = creepMoveFlags(creep);
    const noWallWrecker = !(creep instanceof Creep)
        || !!(INTEL[roomName]?.owner && FRIENDLIES.includes(INTEL[roomName].owner))
        || (!flags.hasAttack && !flags.hasWork);
    // Terrain type follows move weight. Wall wrecking only changes wall/rampart
    // costs so fatigued combat still prefers roads.
    const type = options.offRoad || options.tunnel ? 3 : options.ignoreRoads ? 2 : options.squad ? 4 : 1;

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

    // Keeper disks are painted per search (they move). Keep them out of this stamp
    // so the structure matrix stays shared.
    const cacheStamp = `${type}_${noWallWrecker}_${plainCost}_${swampCost}_${roadCost}_${!!options.tunnel}`;

    // Same-tick reuse before hashing structures. Structures do not change mid-tick
    // enough to justify concat+sort on every PathFinder roomCallback.
    if (ROOM_BASE_MATRIX_CACHE[roomName] &&
        ROOM_BASE_MATRIX_CACHE[roomName].tick === Game.time &&
        ROOM_BASE_MATRIX_CACHE[roomName].stamp === cacheStamp) {
        return ROOM_BASE_MATRIX_CACHE[roomName].matrix;
    }

    const remain = ((Game.cpu && Game.cpu.tickLimit) || 500) - Game.cpu.getUsed();
    if (remain < 40) {
        return cloneTerrainMatrix(roomName, plainCost, swampCost, !!options.flee);
    }

    const impassibleHash = room
        ? hashStructures(room.impassibleStructures.concat(room.constructionSites.filter((s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType))) || [])
        : '';
    const lookHash = room ? lookObstacleHash(room) : '';
    const structuresHash = room
        ? (lookHash ? `${impassibleHash}|L:${lookHash}` : impassibleHash) || 'no-obstacles'
        : 'no-room';
    const baseKey = `${roomName}_base_${cacheStamp}_${structuresHash}`;

    // MATRIX_CACHE fallback with smarter TTL
    const ttl = INTEL[roomName]?.threatLevel ? 150 : 500;   // 500 ticks in safe rooms
    if (MATRIX_CACHE[baseKey] && Game.time - MATRIX_CACHE[baseKey].tick < ttl) {
        ROOM_BASE_MATRIX_CACHE[roomName] = {
            matrix: MATRIX_CACHE[baseKey].matrix,
            tick: Game.time,
            hash: structuresHash,
            stamp: cacheStamp
        };
        return MATRIX_CACHE[baseKey].matrix;
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

    MATRIX_CACHE[baseKey] = {matrix, tick: Game.time};
    ROOM_BASE_MATRIX_CACHE[roomName] = {matrix, tick: Game.time, hash: structuresHash, stamp: cacheStamp};

    return matrix;
}

function getMatrix(roomName, creep, options) {
    const room = Game.rooms[roomName];
    let matrix = getBaseMatrix(roomName, creep, options).clone();

    if (room) {
        matrix = addCreepsToMatrix(room, matrix, creep, options);

        const flags = creepMoveFlags(creep);
        const armedEnemies = room.hostileCreeps.filter(c => !c.className && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
        if (creep instanceof Creep && armedEnemies.length) {
            if ((!flags.hasAttack && !flags.hasRanged) || options.flee) {
                matrix = addHostilesToMatrix(room, matrix);
            }
        }
    }
    return addSksToMatrix(roomName, matrix, options, creep);
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

// Keepers shoot ranged at 3 and sit within 1 of their source. They do not chase.
// Block 4 around a latched tile: the 1-tile fidget stays inside the same wall,
// so a path along the rim does not flip when the keeper wiggles.
const SK_SHOT_RANGE = 3;
const SK_BLOCK_RANGE = 4;
const SK_BLOCK_COST = 255;
const SK_EXIT_COST = 30;
const SK_LAIR_LINK = 5;
const SK_ROUTE_LEAD = 40;
const SK_DIRS = [
    [TOP, 0, -1], [TOP_RIGHT, 1, -1], [RIGHT, 1, 0], [BOTTOM_RIGHT, 1, 1],
    [BOTTOM, 0, 1], [BOTTOM_LEFT, -1, 1], [LEFT, -1, 0], [TOP_LEFT, -1, -1],
];

function cheb(x1, y1, x2, y2) {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

function roomIsSkName(roomName, intel) {
    return !!(intel && intel.sk)
        || !!(global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(roomName));
}

function sourceKeepers(room) {
    if (room._skCreepsTick !== Game.time) {
        const found = [];
        const creeps = room.creeps || [];
        for (let i = 0; i < creeps.length; i++) {
            const c = creeps[i];
            if (c.owner && c.owner.username === 'Source Keeper') found.push(c);
        }
        room._skCreeps = found;
        room._skCreepsTick = Game.time;
    }
    return room._skCreeps;
}

function latchedXY(room, sk) {
    let latch = room._skLatch;
    if (!latch) latch = room._skLatch = Object.create(null);
    const prev = latch[sk.id];
    const x = sk.pos.x;
    const y = sk.pos.y;
    if (!prev || cheb(prev.x, prev.y, x, y) > 1) {
        latch[sk.id] = {x, y};
        return latch[sk.id];
    }
    return prev;
}

function plainTicks(creep) {
    if (!(creep instanceof Creep) || !creep.body) return 1;
    if (creep._skTptTick === Game.time) return creep._skTpt;
    let move = 0;
    let parts = 0;
    const body = creep.body;
    for (let i = 0; i < body.length; i++) {
        const part = body[i];
        if (!part.hits) continue;
        parts++;
        if (part.type === MOVE) move++;
    }
    let tpt = 1;
    if (!move) tpt = 8;
    else if (move * 2 < parts) tpt = Math.ceil(parts / (move * 2));
    creep._skTptTick = Game.time;
    creep._skTpt = tpt;
    return tpt;
}

// Ticks this creep still needs inside the room. Lairs that spawn later stay open.
function leadTicks(creep, roomName) {
    if (!(creep instanceof Creep) || creep.pos.roomName !== roomName) return SK_ROUTE_LEAD;
    const tpt = plainTicks(creep);
    const dest = creep.memory && creep.memory.destination;
    const x = creep.pos.x;
    const y = creep.pos.y;
    let tiles;
    const exits = Game.map.describeExits(roomName);
    if (dest && dest !== roomName && exits) {
        if (exits[TOP] === dest) tiles = y;
        else if (exits[BOTTOM] === dest) tiles = 49 - y;
        else if (exits[LEFT] === dest) tiles = x;
        else if (exits[RIGHT] === dest) tiles = 49 - x;
        else tiles = Math.min(x, y, 49 - x, 49 - y);
    } else {
        tiles = Math.max(x, y, 49 - x, 49 - y);
    }
    if (tiles < 6) tiles = 6;
    return tiles * tpt + 8;
}

function exitDirToward(roomName, dest) {
    if (!dest || dest === roomName) return 0;
    const exits = Game.map.describeExits(roomName);
    if (!exits) return 0;
    if (exits[TOP] === dest) return TOP;
    if (exits[RIGHT] === dest) return RIGHT;
    if (exits[BOTTOM] === dest) return BOTTOM;
    if (exits[LEFT] === dest) return LEFT;
    return 0;
}

function onExitEdge(dir, x, y) {
    if (dir === TOP) return y === 0;
    if (dir === BOTTOM) return y === 49;
    if (dir === LEFT) return x === 0;
    if (dir === RIGHT) return x === 49;
    return false;
}

function harvestHole(creep, room) {
    if (!(creep instanceof Creep) || !creep.memory || !room) return null;
    if (creep.memory.role !== 'remoteHarvester' || creep.memory.destination !== room.name) return null;
    const id = creep.memory.other && creep.memory.other.source;
    if (!id) return null;
    const src = Game.getObjectById(id);
    if (!src || !src.pos || src.pos.roomName !== room.name) return null;
    return {x: src.pos.x, y: src.pos.y};
}

function nearestGuarded(room, x, y) {
    let best = null;
    let bestR = SK_LAIR_LINK + 1;
    const sources = room.sources || [];
    for (let i = 0; i < sources.length; i++) {
        const p = sources[i].pos;
        const r = cheb(x, y, p.x, p.y);
        if (r < bestR) {
            bestR = r;
            best = p;
        }
    }
    if (room.mineral) {
        const p = room.mineral.pos;
        const r = cheb(x, y, p.x, p.y);
        if (r < bestR) {
            bestR = r;
            best = p;
        }
    }
    if (!best || bestR > SK_LAIR_LINK) return null;
    return {x: best.x, y: best.y};
}

function pushCenter(out, seen, x, y, id, lairId, liveX, liveY) {
    const key = x + ',' + y;
    if (seen[key]) return;
    seen[key] = 1;
    const center = {x: x, y: y, id: id || '', lairId: lairId || ''};
    if (liveX != null) {
        center.lx = liveX;
        center.ly = liveY;
    }
    out.push(center);
}

// Latch for the wall, live tile for the shot. A 1-tile fidget must still count.
function centerRange(x, y, center) {
    let range = cheb(x, y, center.x, center.y);
    if (center.lx != null) {
        const live = cheb(x, y, center.lx, center.ly);
        if (live < range) range = live;
    }
    return range;
}

function computeSkAvoid(roomName, creep, options) {
    const intel = typeof INTEL !== 'undefined' ? INTEL[roomName] : undefined;
    const room = Game.rooms[roomName];
    const nameIsSk = roomIsSkName(roomName, intel);
    const mem = creep && creep.memory;
    let sks = [];
    if (room) sks = sourceKeepers(room);
    const hasLairs = !!(room && room.keeperLairs && room.keeperLairs.length);
    if (!nameIsSk && !hasLairs && !sks.length) return null;

    const onSiteAttacker = !!(mem && mem.role === 'SKAttacker' && mem.destination === roomName);
    const ignoreKeeper = (options && options.ignoreKeeper)
        || (mem && mem.role === 'SKAttacker' && mem.keeper)
        || '';
    const ignoreLair = (mem && mem.role === 'SKAttacker' && mem.lair) || '';
    const exitDir = exitDirToward(roomName, mem && mem.destination);
    const hole = room ? harvestHole(creep, room) : null;

    if (!room) {
        const points = intel && intel.skDangerPoints;
        if (points && points.length) return {centers: points, exitDir: exitDir, hole: null, rim: false};
        return {centers: [], exitDir: exitDir, hole: null, rim: true};
    }

    const centers = [];
    const seen = Object.create(null);
    for (let i = 0; i < sks.length; i++) {
        const sk = sks[i];
        if (ignoreKeeper && sk.id === ignoreKeeper) continue;
        const at = latchedXY(room, sk);
        pushCenter(centers, seen, at.x, at.y, sk.id, '', sk.pos.x, sk.pos.y);
    }
    // On-site SKAttacker walks into spawns. Everyone else treats a lair as a
    // keeper once it will pop before they are out of the room, and blocks the
    // source that keeper will stand on.
    // Route checks stay on live keepers. A lair 40 ticks out must not seal the
    // cached route for its whole TTL; the in-room matrix handles the spawn.
    if (!onSiteAttacker && !(options && options.skKeepersOnly)) {
        const lead = leadTicks(creep, roomName);
        const lairs = room.keeperLairs || [];
        for (let i = 0; i < lairs.length; i++) {
            const lair = lairs[i];
            if (lair.ticksToSpawn == null || lair.ticksToSpawn > lead) continue;
            if (ignoreLair && lair.id === ignoreLair) continue;
            const lx = lair.pos.x;
            const ly = lair.pos.y;
            pushCenter(centers, seen, lx, ly, '', lair.id);
            const guarded = nearestGuarded(room, lx, ly);
            if (guarded) pushCenter(centers, seen, guarded.x, guarded.y, '', lair.id);
        }
    }
    return {centers: centers, exitDir: exitDir, hole: hole, rim: false};
}

function skAvoidCenters(roomName, creep, options) {
    const ignore = ((options && options.ignoreKeeper) || '') + '|'
        + ((creep && creep.memory && creep.memory.role === 'SKAttacker' && creep.memory.keeper) || '');
    if (creep && creep._skAvoidTick === Game.time && creep._skAvoidRoom === roomName && creep._skAvoidIgn === ignore) {
        return creep._skAvoid;
    }
    const result = computeSkAvoid(roomName, creep, options);
    if (creep) {
        creep._skAvoidTick = Game.time;
        creep._skAvoidRoom = roomName;
        creep._skAvoidIgn = ignore;
        creep._skAvoid = result;
    }
    return result;
}

function skRoutePoints(roomName) {
    const avoid = computeSkAvoid(roomName, null, {skKeepersOnly: true});
    if (!avoid || avoid.rim) return avoid ? [] : null;
    return avoid.centers;
}

function paintDisk(matrix, terrain, cx, cy, exitDir, origin) {
    const top = Math.max(0, cy - SK_BLOCK_RANGE);
    const left = Math.max(0, cx - SK_BLOCK_RANGE);
    const bottom = Math.min(49, cy + SK_BLOCK_RANGE);
    const right = Math.min(49, cx + SK_BLOCK_RANGE);
    for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
            if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
            if (origin && x === origin.x && y === origin.y) continue;
            if (exitDir && onExitEdge(exitDir, x, y)) {
                if (matrix.get(x, y) < SK_EXIT_COST) matrix.set(x, y, SK_EXIT_COST);
                continue;
            }
            if (matrix.get(x, y) < SK_BLOCK_COST) matrix.set(x, y, SK_BLOCK_COST);
        }
    }
}

function addSksToMatrix(roomName, matrix, options, creep) {
    if (options && options.ignoreSk) return matrix;
    const avoid = skAvoidCenters(roomName, creep, options);
    if (!avoid) return matrix;
    const terrain = Game.map.getRoomTerrain(roomName);
    if (avoid.rim) {
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 50; x++) {
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                const edge = Math.min(x, y, 49 - x, 49 - y);
                if (edge >= 4 && matrix.get(x, y) < 40) matrix.set(x, y, 40);
            }
        }
        return matrix;
    }
    const origin = (creep instanceof Creep && creep.pos.roomName === roomName) ? creep.pos : null;
    const hole = avoid.hole;
    const centers = avoid.centers;
    for (let i = 0; i < centers.length; i++) {
        const c = centers[i];
        if (hole && cheb(c.x, c.y, hole.x, hole.y) <= SK_LAIR_LINK) continue;
        paintDisk(matrix, terrain, c.x, c.y, avoid.exitDir, origin);
    }
    return matrix;
}

function skInShot(creep, maxRange) {
    if (!creep || !creep.pos || !creep.room) return false;
    if (creep.memory && creep.memory.role === 'SKAttacker') return false;
    const avoid = skAvoidCenters(creep.room.name, creep, null);
    if (!avoid || !avoid.centers || !avoid.centers.length) return false;
    if (avoid.exitDir && onExitEdge(avoid.exitDir, creep.pos.x, creep.pos.y)) return false;
    const limit = maxRange == null ? SK_SHOT_RANGE : Math.min(SK_SHOT_RANGE, maxRange);
    if (!(limit > 0)) return false;
    const x = creep.pos.x;
    const y = creep.pos.y;
    for (let i = 0; i < avoid.centers.length; i++) {
        if (centerRange(x, y, avoid.centers[i]) <= limit) return true;
    }
    return false;
}

// null | 'out' (already inside the shot) | 'repath' (stale path enters a blocked
// disk) | 'hold' (miner waits outside their own pocket).
function skAdviseStep(creep, nextPos, options) {
    if (!creep || !creep.pos || !creep.room) return null;
    if (options && (options.flee || options.ignoreSk)) return null;
    const avoid = skAvoidCenters(creep.room.name, creep, options);
    if (!avoid || avoid.rim || !avoid.centers.length) return null;
    const x = creep.pos.x;
    const y = creep.pos.y;
    const leaving = !nextPos || nextPos.roomName !== creep.pos.roomName
        || (avoid.exitDir && nextPos && onExitEdge(avoid.exitDir, nextPos.x, nextPos.y));
    // The dest edge stays walkable so a hop can finish. Any step back inland
    // is a normal keeper tile — allowing it here is the two-tile bounce.
    if (leaving) return null;

    if (!(options && options.skStepOnly)) {
        for (let i = 0; i < avoid.centers.length; i++) {
            if (centerRange(x, y, avoid.centers[i]) <= SK_SHOT_RANGE) return 'out';
        }
    }

    let entersHole = false;
    let entersOther = false;
    const hole = avoid.hole;
    for (let i = 0; i < avoid.centers.length; i++) {
        const c = avoid.centers[i];
        const nextR = cheb(nextPos.x, nextPos.y, c.x, c.y);
        const curR = cheb(x, y, c.x, c.y);
        const deeper = nextR <= SK_BLOCK_RANGE && nextR < curR;
        const staysInShot = nextR <= SK_SHOT_RANGE && nextR <= curR;
        if (!deeper && !staysInShot) continue;
        if (hole && cheb(c.x, c.y, hole.x, hole.y) <= SK_LAIR_LINK) entersHole = true;
        else entersOther = true;
    }
    if (entersOther) return 'repath';
    if (entersHole) return 'hold';
    return null;
}

function skEscapeDirection(creep) {
    if (!creep || !creep.room || !creep.pos) return 0;
    if (creep.hasActiveBodyparts && !creep.hasActiveBodyparts(MOVE)) return 0;
    const avoid = skAvoidCenters(creep.room.name, creep, null);
    if (!avoid || !avoid.centers.length) return 0;
    const terrain = Game.map.getRoomTerrain(creep.room.name);
    const centers = avoid.centers;
    const cx = creep.pos.x;
    const cy = creep.pos.y;
    let curMin = 99;
    for (let i = 0; i < centers.length; i++) {
        const r = centerRange(cx, cy, centers[i]);
        if (r < curMin) curMin = r;
    }
    let bestDir = 0;
    let bestScore = curMin * 10 - 1;
    for (let d = 0; d < SK_DIRS.length; d++) {
        const nx = cx + SK_DIRS[d][1];
        const ny = cy + SK_DIRS[d][2];
        if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
        const tile = terrain.get(nx, ny);
        if (tile === TERRAIN_MASK_WALL) continue;
        if (new RoomPosition(nx, ny, creep.room.name).checkForObstacleStructure()) continue;
        let minR = 99;
        for (let i = 0; i < centers.length; i++) {
            const r = centerRange(nx, ny, centers[i]);
            if (r < minR) minR = r;
        }
        if (minR <= curMin) continue;
        const score = minR * 10 + (tile === TERRAIN_MASK_SWAMP ? 0 : 1);
        if (score > bestScore) {
            bestScore = score;
            bestDir = SK_DIRS[d][0];
        }
    }
    return bestDir;
}

function skStepOut(creep) {
    if (!creep || creep.fatigue > 0) return false;
    const dir = skEscapeDirection(creep);
    if (!dir) return false;
    creep.move(dir);
    return true;
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
    skAvoidCenters,
    skRoutePoints,
    skAdviseStep,
    skInShot,
    skStepOut,
    skEscapeDirection,
    SK_BLOCK_RANGE,
    SK_SHOT_RANGE,
    SK_BLOCK_COST,
    SK_EXIT_COST,
};