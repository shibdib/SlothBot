/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Spawn execution: pull from queue, spawn creeps, renew, boost pre-reservation.
 */

const generator = require('module.bodyGenerator');
const spawnState = require('spawnState');
const {spawnEnergyState} = require('spawnFlow');
const {getQueue, generateCreepName, queueCacheKey} = require('spawnQueue');


const RENEW_ROLES = new Set(['hauler', 'shuttle', 'stationaryHarvester', 'upgrader']);
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
    const renewInfo = room.memory.energyInfo;
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
        // In strict/lean: renew income producers and shuttles clearing source backlog
        return c.memory.role === 'stationaryHarvester' || shuttleNeedsRenew(c);
    });

    if (nearbyCreeps.length) {
        const creepToRenew = _.min(nearbyCreeps, c => c.ticksToLive);
        const before = availableSpawn.store[RESOURCE_ENERGY] || 0;
        if (availableSpawn.renewCreep(creepToRenew) === OK) {
            const after = availableSpawn.store[RESOURCE_ENERGY] || 0;
            const cost = before - after;
            if (cost > 0) {
                Memory.renewalEnergyExpense = Memory.renewalEnergyExpense || {};
                const rn = room.name;
                Memory.renewalEnergyExpense[rn] = (Memory.renewalEnergyExpense[rn] || 0) + cost;
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

    const usedLabs = new Set();
    for (const reservation of reservations) {
        const lab = _.find(room.labs, s =>
            !usedLabs.has(s.id) &&
            s.isActive() && s.store[RESOURCE_ENERGY] > 0 &&
            !s.memory.itemNeeded &&
            (!s.memory.neededBoost || s.memory.neededBoost === reservation.boost)
        );
        if (!lab) continue;
        usedLabs.add(lab.id);

        lab.memory.paused = true;
        lab.memory.neededBoost = reservation.boost;
        lab.memory.amount = (lab.memory.amount || 0) + reservation.amount;
        (lab.memory.preReservedFor = lab.memory.preReservedFor || []).push(creepName);
        lab.memory.requested = Game.time;
    }
}

function processBuildQueue(room) {
    const queue = getQueue(room);
    if (!room.level || !_.size(queue)) return;

    const currentTick = Game.time;
    if (!spawnState.throttleReady(spawnState.buildTick, room.name, 5)) return;

    const lastSpawn = spawnState.lastBuilt[room.name];
    if (lastSpawn && lastSpawn + 500 < currentTick && room.energyAvailable >= 300) {
        CREEP_QUEUES[room.name] = {};
        spawnState.lastBuilt[room.name] = currentTick;
        return;
    }

    const totalSpawns = room.spawns;
    const renewalCreep = room.myCreeps.find(c => c.memory.needsRenewal);
    let availableSpawns = totalSpawns.filter(s => (s.safeIsMy ? s.safeIsMy() : (function () {
        try {
            return s.my;
        } catch (e) {
            return false;
        }
    })()) && s.structureType === STRUCTURE_SPAWN && !s.spawning);

    if (renewalCreep && totalSpawns.length > 1) {
        availableSpawns = totalSpawns.filter(s => s.id !== totalSpawns[0].id && (s.safeIsMy ? s.safeIsMy() : (function () {
            try {
                return s.my;
            } catch (e) {
                return false;
            }
        })()) && s.structureType === STRUCTURE_SPAWN && !s.spawning);
    }

    for (let availableSpawn of availableSpawns) {
        let queuedBuild;
        let body = [];

        for (let topPriority of queue) {
            const {role, other} = topPriority;
            if (!role) continue;

            const generatedInfo = new generator(room.level, role, room, topPriority).generateBody();
            if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) continue;
            body = generatedInfo.body;
            topPriority = generatedInfo.info;

            const cost = global.UNIT_COST(body);
            if (cost > room.energyCapacityAvailable) continue;
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) {
                // Wait only for spawn auto-regen (300). Anything that needs
                // extension fill is skipped so an affordable creep can spawn.
                const waitCap = Math.max(room.energyAvailable, SPAWN_ENERGY_CAPACITY);
                if (cost > waitCap) continue;
                return;
            }

            queuedBuild = topPriority;
            break;
        }

        if (queuedBuild) {
            if (!determineEnergyOrder(room)) return;

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

            const spawnOpts = {
                memory: {
                    role,
                    colony: availableSpawn.room.name,
                    assignedSource,
                    destination,
                    other,
                    military,
                    operation,
                    misc,
                    neededBoosts,
                    canTow: moveParts >= 2 && !attackParts && !healParts && !claimParts,
                    assignment
                }
            };
            if (energyStructures) spawnOpts.energyStructures = energyStructures;

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
                updateRoomAndGlobalQueue(room, queuedBuild);
                return;
            } else if (spawnResult === ERR_NOT_ENOUGH_ENERGY) {
                spawnState.energyOrder[availableSpawn.room.name] = undefined;
                return;
            } else {
                log.d(`Spawn error in ${availableSpawn.room.name} code ${spawnResult}. Name - ${name}`);
                return;
            }
        } else {
            renewNearbyCreepIfNeeded(room, availableSpawn);
        }
    }
}

module.exports = {
    processBuildQueue,
};