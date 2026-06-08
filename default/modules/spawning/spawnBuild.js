/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Spawn execution: pull from queue, spawn creeps, renew, boost pre-reservation.
 */

const generator = require('module.bodyGenerator');
const spawnState = require('spawnState');
const {getQueue, generateCreepName, queueCacheKey} = require('spawnQueue');

const RENEW_ROLES = new Set(['hauler', 'shuttle', 'stationaryHarvester', 'upgrader']);

function determineEnergyOrder(room) {
    spawnState.storedLevel[room.name] = getLevel(room);
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
    if (!room.energyState || room.energyState < 2 || renewTrend < -3) return;

    const nearbyCreeps = _.filter(room.myCreeps, c =>
        RENEW_ROLES.has(c.memory.role) &&
        !_.find(c.body, b => b.boost) &&
        c.pos.isNearTo(availableSpawn) &&
        c.ticksToLive < CREEP_LIFE_TIME
    );

    if (nearbyCreeps.length) {
        const creepToRenew = _.min(nearbyCreeps, c => c.ticksToLive);
        availableSpawn.renewCreep(creepToRenew);
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
    let availableSpawns = totalSpawns.filter(s => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);

    if (renewalCreep && totalSpawns.length > 1) {
        availableSpawns = totalSpawns.filter(s => s.id !== totalSpawns[0].id && s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);
    }

    for (let availableSpawn of availableSpawns) {
        let queuedBuild;
        let body = [];

        for (let topPriority of queue) {
            const {role, other} = topPriority;
            if (!role) continue;

            const generatedInfo = new generator(room.level, role, room, topPriority).generateBody();
            body = generatedInfo.body;
            topPriority = generatedInfo.info;
            if (!body || !body.length) continue;

            const cost = global.UNIT_COST(body);
            if (cost > room.energyCapacityAvailable) continue;
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) return;

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
            const attackParts = _.filter(body, b => b === ATTACK).length;
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
                    canTow: moveParts >= 2 && !attackParts && !healParts && !claimParts && role !== 'labTech',
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
                spawnState.lastGlobalSpawn = Game.time;
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
    preReserveBoostLab,
};