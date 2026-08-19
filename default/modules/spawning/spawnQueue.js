/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Queue storage, enqueue helpers, merge/sort, and build-queue HUD.
 */

const generator = require('module.bodyGenerator');
const {getCreepCount, creepExpiringSoon} = require('spawnCounts');
const {collectGlobalOperations, unassignRoom} = require('spawnOperations');
const {spawnEnergyState} = require('spawnFlow');
const {roomInSpawnRecovery} = require('bodyHelpers');

let queueCache = {};

function miscCacheSegment(misc) {
    if (!misc || !Object.keys(misc).length) return '';
    const parts = [];
    if (misc.boosts && misc.boosts.length) parts.push('b:' + misc.boosts.slice().sort().join(''));
    if (misc.waitFor) parts.push('w:' + misc.waitFor);
    return parts.length ? parts.join('|') : '';
}

function queueCacheKey(role, destination, other, misc, operation, assignment) {
    const reboot = other && other.reboot ? 'reboot' : '';
    const source = (other && other.source) || assignment || '';
    return `c_${role}_${destination || ''}_${source}_${reboot}_${miscCacheSegment(misc)}_${operation || ''}`;
}

function queueCreepIfNeeded(spawnInfo) {
    _.defaults(spawnInfo, {
        priority: PRIORITIES.secondary,
        numberNeeded: 1,
        misc: {},
        other: {}
    });
    if (spawnInfo.numberNeeded <= 0) return false;

    if (spawnInfo.other.target) spawnInfo.destination = spawnInfo.other.target;

    const assignment = spawnInfo.assignment || spawnInfo.other.assignment;
    const count = getCreepCount(spawnInfo.room, spawnInfo.role, spawnInfo.destination, spawnInfo.operation, spawnInfo.colony, assignment);
    const global = (!spawnInfo.room && spawnInfo.destination) || spawnInfo.global;

    if (count < spawnInfo.numberNeeded || (count <= spawnInfo.numberNeeded && creepExpiringSoon(spawnInfo.room, spawnInfo.role, spawnInfo.destination, spawnInfo.operation, spawnInfo.colony, assignment))) {
        spawnInfo.other.reboot = spawnInfo.rebootCondition;
        return queueCreep(spawnInfo.room || spawnInfo.colony, spawnInfo.priority + count, {
            role: spawnInfo.role,
            destination: spawnInfo.destination,
            other: spawnInfo.other,
            misc: spawnInfo.misc,
            operation: spawnInfo.operation,
            military: !!spawnInfo.operation,
            assignment: spawnInfo.assignment,
            numberNeeded: spawnInfo.numberNeeded
        }, global, spawnInfo.closestRoom);
    }
}

function queueCreep(room = undefined, priority, options = {}, global = undefined, closestRoom = undefined) {
    if (global && !CREEP_QUEUES['global']) CREEP_QUEUES['global'] = {};
    if (room && !CREEP_QUEUES[room.name]) CREEP_QUEUES[room.name] = {};

    let cache = global ? CREEP_QUEUES['global'] : CREEP_QUEUES[room.name];
    if (typeof cache !== 'object') cache = {};

    const cacheKey = queueCacheKey(options.role, options.destination, options.other, options.misc, options.operation, options.assignment);

    if (cache[cacheKey] && cache[cacheKey].priority <= priority) {
        if (options.numberNeeded) cache[cacheKey].numberNeeded = options.numberNeeded;
        return;
    }
    if (cache[cacheKey]) delete cache[cacheKey];

    if (!global) options.room = room ? room.name : undefined;
    _.defaults(options, {other: {}});

    cache[cacheKey] = {
        cached: Game.time,
        priority,
        role: options.role,
        assignedSource: options.assignedSource,
        destination: options.destination,
        other: options.other,
        military: COMBAT_ROLES.includes(options.role) || !!options.operation,
        operation: options.operation,
        misc: options.misc,
        global,
        closestRoom,
        assignment: options.assignment,
        numberNeeded: options.numberNeeded || 1,
        cacheKey
    };

    if (global) CREEP_QUEUES['global'] = cache;
    else CREEP_QUEUES[room.name] = cache;

    return true;
}

function generateCreepName(role, level, operation) {
    let name = role.slice(0, 3) + '' + level + '' + getRandomInt(100, 999);
    if (operation) name = operation.slice(0, 3) + '' + level + '' + getRandomInt(100, 999);
    return name;
}

function isWaitForLongbowWave(item) {
    if (!item || !item.misc || !(item.misc.waitFor > 1)) return false;
    const role = item.role || '';
    return role === 'longbowSquad' || role === 'longbow';
}

function waveSpawnDemand(waitFor) {
    if (waitFor >= 4) return 2;
    if (waitFor >= 2) return 1;
    return 0;
}

function maxMilitaryReserve(spawnCount) {
    if (spawnCount <= 1) return 0;
    if (spawnCount === 2) return 1;
    return 2;
}

function copyQueueEntry(entry, cacheKey) {
    const copy = Object.assign({}, entry);
    copy.other = Object.assign({}, entry.other || {});
    copy.misc = Object.assign({}, entry.misc || {});
    if (copy.misc.boosts) copy.misc.boosts = copy.misc.boosts.slice();
    copy.body = undefined;
    copy.cacheKey = entry.cacheKey || cacheKey;
    return copy;
}

function clearQueueEntry(cacheKey) {
    if (!cacheKey) return;
    if (CREEP_QUEUES.global) delete CREEP_QUEUES.global[cacheKey];
    for (const roomName in CREEP_QUEUES) {
        if (roomName === 'global' || !CREEP_QUEUES[roomName]) continue;
        delete CREEP_QUEUES[roomName][cacheKey];
    }
}

function computeSortPriority(item, room) {
    let sortPriority = item.priority;
    if (roomInSpawnRecovery(room) && !item.operation && item.role === 'shuttle'
        && sortPriority < PRIORITIES.hauler) {
        sortPriority = PRIORITIES.hauler;
    }
    if (item.destination && (Memory.targetRooms[item.destination] || Memory.auxiliaryTargets[item.destination])) {
        const milInfo = room.memory.energyInfo;
        const milTrend = (milInfo && milInfo.trend) || 0;
        const milSpare = (milInfo && milInfo.spareIncome) || 0;
        const flowReady = spawnEnergyState(room) >= 2 && milTrend >= 0 && milSpare >= 8;
        if (flowReady && room.storage) sortPriority *= 0.5;
        else if (item.military) sortPriority *= 6;
    }
    if (isWaitForLongbowWave(item)) {
        sortPriority = Math.min(sortPriority, PRIORITIES.hauler + 0.5);
    }
    return Math.max(1, Math.round(sortPriority * 10) / 10);
}

function prepareQueueItems(merged, room) {
    const items = [];
    for (const key in merged) {
        const creep = merged[key];
        const target = creep.destination && (creep.other && creep.other.assignment
            ? creep.other.assignment
            : creep.destination);
        const opMemory = target
            ? Memory.targetRooms[target] || Memory.auxiliaryTargets[target]
            : null;

        const generatedInfo = new generator(room.level, creep.role, room, creep).generateBody();
        const liveForOp = (creep.destination && creep.role)
            ? getCreepCount(undefined, creep.role, creep.destination, creep.operation)
            : 0;
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) {
            if (opMemory && opMemory.assignedRoom === room.name && !liveForOp) {
                unassignRoom(target, 'Unable to generate needed body.');
            }
            continue;
        }

        const body = generatedInfo.body;
        if (!body.length) continue;

        const requiredBoosts = [];
        if (opMemory && opMemory.boosts) {
            for (let i = 0; i < opMemory.boosts.length; i++) requiredBoosts.push(opMemory.boosts[i]);
        }
        if (creep.misc && creep.misc.boosts) {
            for (let i = 0; i < creep.misc.boosts.length; i++) {
                if (!requiredBoosts.includes(creep.misc.boosts[i])) requiredBoosts.push(creep.misc.boosts[i]);
            }
        }
        const nb = generatedInfo.info && generatedInfo.info.neededBoosts;
        let missingBoosts = requiredBoosts.length &&
            !room.boostCheck(body, undefined, opMemory && opMemory.boostTier, 1, requiredBoosts);
        if (!missingBoosts && nb && nb.toughBoost && body.includes(TOUGH)) {
            const toughCount = body.filter(p => p === TOUGH).length;
            missingBoosts = room.store(nb.toughBoost) < 30 * toughCount;
        }
        if (!missingBoosts && nb && nb.moveBoost && body.includes(MOVE)) {
            const moveCount = body.filter(p => p === MOVE).length;
            missingBoosts = room.store(nb.moveBoost) < 30 * moveCount;
        }
        if (missingBoosts) {
            if (opMemory && opMemory.assignedRoom === room.name && !liveForOp) {
                unassignRoom(target, 'Missing required boosts.');
            }
            continue;
        }

        creep.body = body;
        if (generatedInfo.info && generatedInfo.info.neededBoosts) {
            creep.neededBoosts = generatedInfo.info.neededBoosts;
        }
        creep.sortPriority = computeSortPriority(creep, room);

        if (isWaitForLongbowWave(creep)) {
            const waitFor = creep.misc.waitFor;
            const needed = creep.numberNeeded || waitFor;
            const live = getCreepCount(undefined, creep.role, creep.destination, creep.operation);
            creep.remaining = Math.max(0, needed - live);
            creep.wave = true;
            if (creep.remaining <= 0) {
                clearQueueEntry(creep.cacheKey || key);
                continue;
            }
        } else {
            creep.remaining = 1;
            creep.wave = false;
        }

        items.push(creep);
    }
    items.sort((a, b) => a.sortPriority - b.sortPriority);
    return items;
}

function pickActiveWave(items) {
    if (!items || !items.length) return null;
    const waves = [];
    for (let i = 0; i < items.length; i++) {
        if (items[i].wave && items[i].remaining > 0) waves.push(items[i]);
    }
    if (!waves.length) return null;
    let forming = null;
    for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        const needed = w.numberNeeded || (w.misc && w.misc.waitFor) || 0;
        if (needed && w.remaining < needed) {
            if (!forming || w.sortPriority < forming.sortPriority) forming = w;
        }
    }
    if (forming) return forming;
    let best = waves[0];
    for (let i = 1; i < waves.length; i++) {
        if (waves[i].sortPriority < best.sortPriority) best = waves[i];
    }
    return best;
}

function displayQueue(room, queue) {
    const activeSpawns = room.spawns.filter((s) => s.spawning);
    if (!_.size(queue) && !activeSpawns.length) return;

    let yOffset = 1;
    const x = 35;
    const width = 14;
    const limit = Math.min(5, queue.length);
    let rows = 1 + limit + activeSpawns.length;

    room.visual.rect(x - 0.25, yOffset - 0.75, width + 0.5, (rows * 1.1) + 0.2, {
        fill: '#111111',
        opacity: 0.75,
        stroke: '#333333',
        strokeWidth: 0.05
    });

    room.visual.text('🛠️ Build Queue', x + 0.2, yOffset, {
        color: '#ffffff',
        align: 'left',
        font: 'bold 0.6 Tahoma'
    });
    yOffset += 1.2;

    for (let spawn of activeSpawns) {
        const spawningName = spawn.spawning.name || "";
        const roleName = _.capitalize(spawningName.split("_")[0]);
        const progress = ((spawn.spawning.needTime - spawn.spawning.remainingTime) / spawn.spawning.needTime) * 100;

        room.visual.rect(x, yOffset - 0.4, width, 0.8, {fill: '#222222', opacity: 0.8});
        const fillWidth = Math.max(0, Math.min(width, width * (progress / 100)));
        if (fillWidth > 0) {
            room.visual.rect(x, yOffset - 0.4, fillWidth, 0.8, {fill: '#4CAF50', opacity: 0.6});
        }

        room.visual.text(`Spawning: ${roleName}`, x + 0.2, yOffset + 0.15, {
            color: '#ffffff',
            align: 'left',
            font: 'bold 0.45 Tahoma'
        });
        room.visual.text(`${spawn.spawning.remainingTime}t`, x + width - 0.2, yOffset + 0.15, {
            color: '#dddddd',
            align: 'right',
            font: '0.45 Tahoma'
        });
        yOffset += 1.1;
    }
    for (let i = 0; i < limit; i++) {
        let item = queue[i];
        let cost = global.UNIT_COST(item.body);
        if (!cost) continue;

        const show = item.operation || item.role;
        const countTag = item.remaining > 1 ? ` x${item.remaining}` : '';
        const color = room.energyAvailable >= cost ? '#00B7EB' : '#FF4500';

        room.visual.text(`${i + 1}. ${_.capitalize(show)}${countTag}`, x + 0.2, yOffset, {
            color: color,
            align: 'left',
            font: '0.5 Tahoma'
        });
        const p = item.sortPriority != null ? item.sortPriority : item.priority;
        room.visual.text(`${cost}⚡ P:${p}`, x + width - 0.2, yOffset, {
            color: '#dddddd',
            align: 'right',
            font: '0.5 Tahoma'
        });
        yOffset += 1.1;
    }
}

function getQueue(room) {
    const cached = queueCache[room.name];
    if (cached && cached.tick === Game.time) return cached.queue;

    const operationQueue = collectGlobalOperations(room);
    const roomQueue = CREEP_QUEUES[room.name] || {};
    const merged = {};
    for (const key in operationQueue) merged[key] = copyQueueEntry(operationQueue[key], key);
    for (const key in roomQueue) merged[key] = copyQueueEntry(roomQueue[key], key);
    const sorted = prepareQueueItems(merged, room);

    queueCache[room.name] = {queue: sorted, tick: Game.time};
    displayQueue(room, sorted);
    return sorted;
}

function pruneQueueCache() {
    if (Game.time % 1000 === 0) {
        for (const name of Object.keys(queueCache)) {
            if (!Game.rooms[name]) delete queueCache[name];
        }
    }
}

module.exports = {
    queueCacheKey,
    queueCreepIfNeeded,
    queueCreep,
    getQueue,
    generateCreepName,
    pruneQueueCache,
    isWaitForLongbowWave,
    pickActiveWave,
    waveSpawnDemand,
    maxMilitaryReserve,
    clearQueueEntry,
};