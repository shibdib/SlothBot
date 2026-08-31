/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Spawn execution: pull from queue, spawn creeps, renew, boost pre-reservation.
 */

const spawnState = require('spawnState');
const {spawnEnergyState} = require('spawnFlow');
const {getCreepCount} = require('spawnCounts');
const {ownedSpawnCount} = require('bodyHelpers');
const {
    getQueue, generateCreepName, queueCacheKey,
    isWaitForLongbowWave, pickActiveWave, waveSpawnDemand, maxMilitaryReserve,
    clearQueueEntry,
} = require('spawnQueue');


const {spawnDirectionsForRole, hubSlotSpawnDirection} = require('spawnHub');

const RENEW_ROLES = new Set(['hauler', 'shuttle', 'stationaryHarvester', 'upgrader', 'hubManager']);
const {assessSourceHaulBacklog} = require('bodyEconomic');

function shuttleNeedsRenew(creep) {
    if (creep.memory.role !== 'shuttle' || !creep.memory.assignment) return false;
    const source = Game.getObjectById(creep.memory.assignment);
    if (!source) return false;
    const backlog = assessSourceHaulBacklog(source, creep.room);
    return backlog.haulUrgent;
}

function determineEnergyOrder(room) {
    if (!room.hub.x) {
        const planner = require('module.roomPlanner');
        planner.findHub(room);
        return false;
    }
    if (spawnState.energyOrder[room.name] && spawnState.orderStored[room.name] + 750 >= Game.time) return true;

    const sourceExtIds = new Set();
    for (const source of room.sources) {
        for (const s of source.pos.findInRange(room.extensions, 2)) {
            sourceExtIds.add(s.id);
        }
    }

    const byHub = (a, b) => a.pos.getRangeTo(room.hub) - b.pos.getRangeTo(room.hub);
    const sourceExts = room.extensions.filter(s => sourceExtIds.has(s.id)).sort(byHub);
    const otherExts = room.extensions.filter(s => !sourceExtIds.has(s.id)).sort(byHub);
    const spawns = room.spawns.slice().sort(byHub);

    spawnState.energyOrder[room.name] = JSON.stringify(sourceExts.concat(otherExts, spawns));
    spawnState.orderStored[room.name] = Game.time;
    return true;
}

function updateRoomAndGlobalQueue(room, building) {
    if (!CREEP_QUEUES[room.name]) CREEP_QUEUES[room.name] = {};
    if (!CREEP_QUEUES["global"]) CREEP_QUEUES["global"] = {};

    const cacheKey = queueCacheKey(building.role, building.destination, building.other, building.misc, building.operation, building.assignment);

    if (CREEP_QUEUES["global"][cacheKey] && building.global) {
        delete CREEP_QUEUES["global"][cacheKey];
    }
    if (CREEP_QUEUES[room.name][cacheKey]) {
        delete CREEP_QUEUES[room.name][cacheKey];
    }
}

function renewNearbyCreepIfNeeded(room, availableSpawn) {
    const renewInfo = room.energyInfo;
    const renewTrend = (renewInfo && renewInfo.trend) || 0;
    // Harvesters are the base income engine for the room (link-fed sources). Renew them more
    // aggressively than other economy creeps even in marginal state 1, because extending a
    // productive harvester directly increases net energy gain and avoids expensive full respawns
    // (especially the large 1450 bodies). Cost is still tracked and will influence spareIncome.
    const energyState = spawnEnergyState(room);
    if (!energyState) return;
    const strict = energyState < 2 || renewTrend < -3;

    const nearbyCreeps = _.filter(room.myCreeps, c => {
        if (!RENEW_ROLES.has(c.memory.role) || _.find(c.body, b => b.boost) || !c.pos.isNearTo(availableSpawn) || c.ticksToLive >= CREEP_LIFE_TIME) return false;
        if (!strict) return true;
        // In strict/lean: renew income producers, the hub manager, and shuttles clearing source backlog
        return c.memory.role === 'stationaryHarvester' || c.memory.role === 'hubManager' || shuttleNeedsRenew(c);
    });

    if (nearbyCreeps.length) {
        const creepToRenew = _.min(nearbyCreeps, c => c.ticksToLive);
        const before = availableSpawn.store[RESOURCE_ENERGY] || 0;
        if (availableSpawn.renewCreep(creepToRenew) === OK) {
            const after = availableSpawn.store[RESOURCE_ENERGY] || 0;
            const cost = before - after;
            if (cost > 0) {
                if (global.bumpEnergyExpense) global.bumpEnergyExpense('renewal', room.name, cost);
            }
        }
    }
}

function preReserveBoostLab(room, creepName, neededBoosts, body, role, misc) {
    const reservations = [];
    const reservedParts = new Set();

    if (neededBoosts && neededBoosts.boost && neededBoosts.boostPart) {
        const partCount = body.filter(p => p === neededBoosts.boostPart).length;
        if (partCount) {
            reservations.push({boost: neededBoosts.boost, amount: partCount * LAB_BOOST_MINERAL});
            reservedParts.add(neededBoosts.boostPart);
        }
    }
    if (neededBoosts && neededBoosts.toughBoost) {
        const partCount = body.filter(p => p === TOUGH).length;
        if (partCount) {
            reservations.push({boost: neededBoosts.toughBoost, amount: partCount * LAB_BOOST_MINERAL});
            reservedParts.add(TOUGH);
        }
    }
    if (neededBoosts && neededBoosts.moveBoost) {
        const partCount = body.filter(p => p === MOVE).length;
        if (partCount) {
            reservations.push({boost: neededBoosts.moveBoost, amount: partCount * LAB_BOOST_MINERAL});
            reservedParts.add(MOVE);
        }
    }

    if (misc && misc.boosts) {
        const pendingByResource = {};
        for (const r of reservations) pendingByResource[r.boost] = (pendingByResource[r.boost] || 0) + r.amount;

        for (const bodyPart of misc.boosts) {
            if (reservedParts.has(bodyPart)) continue;
            const partCount = body.filter(p => p === bodyPart).length;
            if (!partCount) continue;
            const boostType = resolveBoostType(role, bodyPart);
            if (!boostType) continue;
            const tiers = BOOST_USE[boostType];
            if (!tiers) continue;
            const amount = partCount * LAB_BOOST_MINERAL;
            let chosen = null;
            for (const tier of tiers) {
                if (room.store(tier) >= amount + (pendingByResource[tier] || 0)) {
                    chosen = tier;
                    break;
                }
            }
            if (chosen) {
                reservations.push({boost: chosen, amount});
                reservedParts.add(bodyPart);
                pendingByResource[chosen] = (pendingByResource[chosen] || 0) + amount;
            }
        }
    }

    if (!reservations.length) return;

    const wave = (misc && misc.waitFor > 1) ? misc.waitFor : 1;
    const usedLabs = new Set();
    for (const reservation of reservations) {
        const lab = (typeof pickBoostLab === 'function')
            ? pickBoostLab(room, reservation.boost, usedLabs)
            : _.find(room.labs, s =>
                !usedLabs.has(s.id) &&
                s.isActive() &&
                !s.memory.itemNeeded &&
                (!s.memory.neededBoost || s.memory.neededBoost === reservation.boost)
            );
        if (!lab) continue;
        usedLabs.add(lab.id);

        lab.memory.paused = true;
        lab.memory.neededBoost = reservation.boost;
        const cap = (lab.store.getCapacity && lab.store.getCapacity(reservation.boost)) || 3000;
        if (wave > 1) {
            // Full waitFor pool from the first spawn so labTech can load each
            // boost into its own lab before the last body pops. max() so later
            // eggs in the same wave don't stack another copy on top.
            lab.memory.amount = Math.min(cap, Math.max(lab.memory.amount || 0, reservation.amount * wave));
        } else {
            lab.memory.amount = Math.min(cap, (lab.memory.amount || 0) + reservation.amount);
        }
        const names = lab.memory.preReservedFor || [];
        if (!names.includes(creepName)) names.push(creepName);
        lab.memory.preReservedFor = names;
        lab.memory.requested = Game.time;
    }
}

function isMySpawn(s) {
    if (!s || s.structureType !== STRUCTURE_SPAWN) return false;
    if (s.safeIsMy) return s.safeIsMy();
    try {
        return !!s.my;
    } catch (e) {
        return false;
    }
}

function isWaveCreepMemory(memory, wave) {
    if (!memory || !wave) return false;
    if (!isWaitForLongbowWave({role: memory.role, misc: memory.misc})) return false;
    if (wave.destination && memory.destination !== wave.destination) return false;
    if ((wave.operation || '') !== (memory.operation || '')) return false;
    return true;
}

function reservationAllowed(room, waveStarted) {
    // A waitFor wave already on the pad keeps a spawn even in state 0 so the
    // remaining bodies can pop as energy trickles in. Fresh waves still wait.
    if (spawnEnergyState(room) < 1 && !waveStarted) return false;
    if (!getCreepCount(room, 'stationaryHarvester')) return false;
    if (room.storage && !getCreepCount(room, 'hauler')) return false;
    return true;
}

const WAVE_FALLBACK_ROLES = new Set(['hauler', 'stationaryHarvester', 'shuttle']);
const ENERGY_HOLD_ROLES = new Set(['SKAttacker']);
const ENERGY_HOLD_FALLBACK = new Set(['stationaryHarvester', 'hauler', 'shuttle', 'defender']);

function idleReserveCount(room, availableCount, owned, demand, busyWave, waitFor, waveStarted) {
    const cap = maxMilitaryReserve(owned, waitFor);
    let idleCap = Math.min(cap, demand) - busyWave;
    if (idleCap < 0) idleCap = 0;
    const energyState = spawnEnergyState(room);
    // A waitFor-4 already on the pad keeps both spawns even in state 1.
    // One lock serializes 4 × 150 ticks and the first body hits the boost floor.
    const dualQuad = waitFor >= 4 && (energyState >= 2 || waveStarted);
    if (energyState < 2 && !dualQuad) idleCap = Math.min(idleCap, 1);
    const leaveOneFree = owned >= 2 && !dualQuad;
    if (leaveOneFree) {
        idleCap = Math.min(idleCap, Math.max(0, availableCount - 1));
    } else {
        idleCap = Math.min(idleCap, availableCount);
    }
    return idleCap;
}

function spawnHeldByRenewer(spawn, room) {
    const creeps = room.myCreeps || [];
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (!c || !c.memory || !c.memory.needsRenewal || !c.pos.isNearTo(spawn)) continue;
        const misc = c.memory.misc;
        // Incomplete waitFor waves used to camp both spawns for a top-off and
        // block the remaining bodies. Finishing the wave is the TTL win.
        if (misc && misc.waitFor > 1 && !misc.sealed && !c.memory.initialFormUp) continue;
        return true;
    }
    return false;
}

function pickQueueItem(queue, energyLeft, energyCapacity, opts) {
    const {only, excludeKey, spawned, fallbackRoles} = opts;
    let waitingOnEnergy = false;
    let holdForEnergy = false;
    for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (!item || !item.role || !item.body || !item.body.length) continue;
        if (fallbackRoles && !WAVE_FALLBACK_ROLES.has(item.role)) continue;
        if (only && item.cacheKey !== only.cacheKey) continue;
        if (excludeKey && item.wave && item.cacheKey === excludeKey) continue;
        if (item.role === 'hubManager' && opts.spawn && opts.room
            && !hubSlotSpawnDirection(opts.spawn, opts.room)) continue;
        const left = (item.remaining || 1) - (spawned[item.cacheKey] || 0);
        if (left <= 0) continue;

        const cost = global.UNIT_COST(item.body);
        if (cost > energyCapacity) continue;
        if (cost > energyLeft) {
            if (only && !fallbackRoles) {
                waitingOnEnergy = true;
                break;
            }
            // SKAttacker is 4100. Skipping it for cheap remotes/drones is how an
            // SK-only colony starves: workers spawn, kite keepers, produce nothing.
            if (ENERGY_HOLD_ROLES.has(item.role)) {
                holdForEnergy = true;
                waitingOnEnergy = true;
                continue;
            }
            continue;
        }
        if (holdForEnergy && !ENERGY_HOLD_FALLBACK.has(item.role)) continue;
        return {item, cost, waitingOnEnergy: false};
    }
    return {item: null, cost: 0, waitingOnEnergy};
}

function displayWaveHud(room, text) {
    if (!text) return;
    room.visual.text(text, 35.2, 0.15, {
        color: '#ffcc66',
        align: 'left',
        font: '0.45 Tahoma'
    });
}

function spawnQueuedCreep(room, availableSpawn, queuedBuild, body) {
    const {
        role, operation, assignedSource, destination, other,
        military, misc, neededBoosts, assignment
    } = queuedBuild;

    const name = generateCreepName(role, room.level, operation);

    let energyStructures;
    if (spawnState.energyOrder[availableSpawn.room.name]) {
        try {
            const parsed = JSON.parse(spawnState.energyOrder[availableSpawn.room.name]);
            energyStructures = parsed.map(s => Game.getObjectById(s.id)).filter(s => s);
            if (!energyStructures.length) energyStructures = undefined;
        } catch (e) {
            energyStructures = undefined;
        }
    }

    const moveParts = _.filter(body, b => b === MOVE).length;
    const attackParts = _.filter(body, b => b === ATTACK || b === RANGED_ATTACK).length;
    const healParts = _.filter(body, b => b === HEAL).length;
    const claimParts = _.filter(body, b => b === CLAIM).length;

    let miscMem = misc;
    if (misc && misc.waitFor > 1) {
        miscMem = Object.assign({}, misc, {formColony: availableSpawn.room.name});
    }

    const spawnOpts = {
        memory: {
            role,
            colony: availableSpawn.room.name,
            assignedSource,
            destination,
            other,
            military,
            operation,
            misc: miscMem,
            neededBoosts,
            canTow: moveParts >= 2 && !attackParts && !healParts && !claimParts,
            assignment
        }
    };
    if (energyStructures) spawnOpts.energyStructures = energyStructures;
    const dirs = spawnDirectionsForRole(availableSpawn, availableSpawn.room, role);
    if (dirs && dirs.length) spawnOpts.directions = dirs;

    let spawnResult = availableSpawn.spawnCreep(body, name, spawnOpts);

    if (spawnResult === ERR_NOT_ENOUGH_ENERGY && energyStructures) {
        spawnState.energyOrder[availableSpawn.room.name] = undefined;
        delete spawnOpts.energyStructures;
        spawnResult = availableSpawn.spawnCreep(body, name, spawnOpts);
    }

    if (spawnResult === OK) {
        if (neededBoosts || (misc && misc.boosts)) {
            preReserveBoostLab(availableSpawn.room, name, neededBoosts, body, role, misc);
        }
        spawnState.lastBuilt[availableSpawn.room.name] = Game.time;
        if (!queuedBuild.operation) log.d(`${availableSpawn.room.name} Spawning a ${role}`);
        return OK;
    }
    if (spawnResult === ERR_NOT_ENOUGH_ENERGY) {
        spawnState.energyOrder[availableSpawn.room.name] = undefined;
    } else {
        log.d(`Spawn error in ${availableSpawn.room.name} code ${spawnResult}. Name - ${name}`);
    }
    return spawnResult;
}

function processBuildQueue(room) {
    const queue = getQueue(room);
    if (!room.level) return;

    const wave = pickActiveWave(queue);
    const formingWave = !!(wave && wave.remaining > 0);
    if (!formingWave && !_.size(queue)) return;

    const currentTick = Game.time;
    if (!formingWave && !spawnState.throttleReady(spawnState.buildTick, room.name, 5)) return;
    spawnState.buildTick[room.name] = currentTick;

    const lastSpawn = spawnState.lastBuilt[room.name];
    if (lastSpawn && lastSpawn + 500 < currentTick && room.energyAvailable >= 300) {
        // A closestRoom quad lives on the global queue. Wiping the room
        // cache because that wave is forming deleted haulers/drones.
        if (!formingWave) {
            CREEP_QUEUES[room.name] = {};
            spawnState.lastBuilt[room.name] = currentTick;
            return;
        }
    }

    const totalSpawns = room.spawns || [];
    const owned = ownedSpawnCount(room);

    // Creeps run before spawning, so an adjacent renewer already issued
    // renewCreep this tick. Skip that spawn so spawnCreep does not overwrite it.
    // Do not reserve a spawn for a renewer still walking — finishing the wave
    // is the TTL win; they top off after the last body pops.
    let availableSpawns = totalSpawns.filter(s => isMySpawn(s) && !s.spawning && !spawnHeldByRenewer(s, room));

    const waitFor = (wave && wave.misc && wave.misc.waitFor) || 0;
    const needed = (wave && (wave.numberNeeded || waitFor)) || 0;
    let busyWave = 0;
    if (wave) {
        for (let i = 0; i < totalSpawns.length; i++) {
            const spawning = totalSpawns[i].spawning;
            if (!spawning) continue;
            const creep = Game.creeps[spawning.name];
            if (creep && isWaveCreepMemory(creep.memory, wave)) busyWave++;
        }
    }
    const waveStarted = !!(wave && ((needed && wave.remaining < needed) || busyWave));
    const canReserve = formingWave && reservationAllowed(room, waveStarted);
    const demand = canReserve ? waveSpawnDemand(waitFor) : 0;
    const reserveCount = canReserve
        ? idleReserveCount(room, availableSpawns.length, owned, demand, busyWave, waitFor, waveStarted)
        : 0;

    const reservedSpawns = availableSpawns.slice(0, reserveCount);
    const freeSpawns = availableSpawns.slice(reserveCount);

    let energyLeft = room.energyAvailable;
    const energyCapacity = room.energyCapacityAvailable;
    const spawned = {};
    let waveEnergyWait = false;

    const consume = (spawn, item, cost) => {
        determineEnergyOrder(room);
        const result = spawnQueuedCreep(room, spawn, item, item.body);
        if (result !== OK) {
            if (result === ERR_NOT_ENOUGH_ENERGY) energyLeft = Math.min(energyLeft, room.energyAvailable);
            return false;
        }
        energyLeft = Math.max(0, energyLeft - cost);
        spawned[item.cacheKey] = (spawned[item.cacheKey] || 0) + 1;
        const left = (item.remaining || 1) - spawned[item.cacheKey];
        if (left <= 0) {
            if (item.cacheKey) clearQueueEntry(item.cacheKey);
            else updateRoomAndGlobalQueue(room, item);
        }
        return true;
    };

    const spawnWaveFallback = (spawn) => {
        const fallback = pickQueueItem(queue, energyLeft, energyCapacity, {
            excludeKey: wave.cacheKey, spawned, fallbackRoles: true, spawn, room
        });
        if (!fallback.item) {
            renewNearbyCreepIfNeeded(room, spawn);
            return;
        }
        if (!consume(spawn, fallback.item, fallback.cost)) {
            renewNearbyCreepIfNeeded(room, spawn);
        }
    };

    for (let i = 0; i < reservedSpawns.length; i++) {
        const pick = pickQueueItem(queue, energyLeft, energyCapacity, {
            only: wave,
            spawned,
            spawn: reservedSpawns[i],
            room
        });
        if (pick.item) {
            if (!consume(reservedSpawns[i], pick.item, pick.cost)) {
                waveEnergyWait = true;
                spawnWaveFallback(reservedSpawns[i]);
            }
            continue;
        }
        if (pick.waitingOnEnergy) {
            waveEnergyWait = true;
            spawnWaveFallback(reservedSpawns[i]);
            continue;
        }
        break;
    }

    for (let i = 0; i < freeSpawns.length; i++) {
        const excludeKey = reserveCount > 0 && wave ? wave.cacheKey : undefined;
        const pick = pickQueueItem(queue, energyLeft, energyCapacity, {
            excludeKey,
            spawned,
            spawn: freeSpawns[i],
            room
        });
        if (!pick.item) {
            renewNearbyCreepIfNeeded(room, freeSpawns[i]);
            continue;
        }
        if (!consume(freeSpawns[i], pick.item, pick.cost)) {
            renewNearbyCreepIfNeeded(room, freeSpawns[i]);
        }
    }

    if (formingWave) {
        const left = Math.max(0, (wave.remaining || 0) - (spawned[wave.cacheKey] || 0));
        const lock = reserveCount + busyWave;
        const bits = [`Wave ${wave.role} ${left}/${wave.numberNeeded || wave.misc.waitFor}`];
        bits.push(`lock ${lock}/${maxMilitaryReserve(owned, waitFor)}`);
        if (waveEnergyWait) bits.push('⚡wait');
        if (!canReserve) bits.push('no-lock');
        const hud = bits.join('  |  ');
        spawnState.waveHud[room.name] = hud;
        displayWaveHud(room, hud);
    } else if (spawnState.waveHud[room.name]) {
        spawnState.waveHud[room.name] = undefined;
    }
}

module.exports = {
    processBuildQueue,
};