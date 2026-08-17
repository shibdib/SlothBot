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
            assignment: spawnInfo.assignment
        }, global, spawnInfo.closestRoom);
    }
}

function queueCreep(room = undefined, priority, options = {}, global = undefined, closestRoom = undefined) {
    if (global && !CREEP_QUEUES['global']) CREEP_QUEUES['global'] = {};
    if (room && !CREEP_QUEUES[room.name]) CREEP_QUEUES[room.name] = {};

    let cache = global ? CREEP_QUEUES['global'] : CREEP_QUEUES[room.name];
    if (typeof cache !== 'object') cache = {};

    const cacheKey = queueCacheKey(options.role, options.destination, options.other, options.misc, options.operation, options.assignment);

    if (cache[cacheKey] && cache[cacheKey].priority <= priority) return;
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
        assignment: options.assignment
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

function adjustQueuePriority(queue, room) {
    for (const key in queue) {
        const creep = queue[key];
        creep.body = undefined;

        const target = creep.destination && (creep.other && creep.other.assignment
            ? creep.other.assignment
            : creep.destination);
        const opMemory = target
            ? Memory.targetRooms[target] || Memory.auxiliaryTargets[target]
            : null;

        const generatedInfo = new generator(room.level, creep.role, room, creep).generateBody();
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) {
            if (opMemory && opMemory.assignedRoom === room.name) {
                unassignRoom(target, 'Unable to generate needed body.');
            }
            delete queue[key];
            continue;
        }

        const body = generatedInfo.body;
        creep.body = body;
        if (!body.length) continue;

        if (roomInSpawnRecovery(room) && !creep.operation && creep.role === 'shuttle'
            && creep.priority < PRIORITIES.hauler) {
            creep.priority = PRIORITIES.hauler;
        }

        if (opMemory && opMemory.boosts && opMemory.boosts.includes(HEAL) &&
            !room.boostCheck(body, undefined, opMemory.boostTier)) {
            if (opMemory.assignedRoom === room.name) {
                unassignRoom(target, 'Missing required boosts.');
            }
            delete queue[key];
            continue;
        }

        if (creep.destination && ((Memory.targetRooms && Memory.targetRooms[creep.destination]) || (Memory.auxiliaryTargets && Memory.auxiliaryTargets[creep.destination]))) {
            const milInfo = room.memory.energyInfo;
            const milTrend = (milInfo && milInfo.trend) || 0;
            const milSpare = (milInfo && milInfo.spareIncome) || 0;
            const flowReady = spawnEnergyState(room) >= 2 && milTrend >= 0 && milSpare >= 8;
            if (flowReady && room.storage) creep.priority *= 0.5;
            else if (creep.military) creep.priority *= 6;
        }
        creep.priority = Math.max(1, Math.round(creep.priority));
    }
    return queue;
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
        const color = room.energyAvailable >= cost ? '#00B7EB' : '#FF4500';

        room.visual.text(`${i + 1}. ${_.capitalize(show)}`, x + 0.2, yOffset, {
            color: color,
            align: 'left',
            font: '0.5 Tahoma'
        });
        room.visual.text(`${cost}⚡ P:${item.priority}`, x + width - 0.2, yOffset, {
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
    const merged = Object.assign({}, operationQueue, roomQueue);
    const sorted = _.sortBy(adjustQueuePriority(merged, room), 'priority');

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
};