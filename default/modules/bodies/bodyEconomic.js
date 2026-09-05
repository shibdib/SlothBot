/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const {
    colonyRoadsBuilt,
    maxBodyNonMoveParts,
    clampWorkCarryPair,
    roomHasCriticalBuildSites,
    roomInSpawnRecovery,
    roomSpawnEnergyStuck,
    isColonyEarlyRush,
} = require('bodyHelpers');
const {getRegenSourceOperatorForRoom} = require('module.powerManager');

function buildRoadDroneWaller(gen) {
    const leanColony = gen.room.level >= 7 && !gen.creepInfo.destination;
    const earlyBootstrap = gen.role === 'drone' && isColonyEarlyRush(gen.room);
    const halfMove = !gen.creepInfo.destination
        && !['remoteBuilder', 'roadBuilder', 'waller'].includes(gen.role)
        && colonyRoadsBuilt(gen.room.name);

    const maxNonMove = maxBodyNonMoveParts(halfMove);
    // Pre-storage drones were using the late-game road-repair mix (28% WORK),
    // so a 550-energy RCL2 drone was 1W. Bootstrap needs WORK on the site.
    const workShare = earlyBootstrap ? 0.40
        : (halfMove ? (leanColony ? 0.45 : 0.40) : (leanColony ? 0.32 : 0.28));
    const carryShare = earlyBootstrap ? 0.20
        : (halfMove ? (leanColony ? 0.35 : 0.32) : (leanColony ? 0.25 : 0.22));
    let workCap = leanColony ? Math.max(1, Math.floor(maxNonMove * 0.6)) : (halfMove ? 25 : 20);
    let carryCap = leanColony ? (maxNonMove - workCap) : (halfMove ? 20 : 16);
    if (workCap + carryCap > maxNonMove) carryCap = Math.max(1, maxNonMove - workCap);

    let work = Math.min(Math.floor(gen.energyAmount * workShare / BODYPART_COST[WORK]) || 1, workCap);
    let carry = Math.min(Math.floor(gen.energyAmount * carryShare / BODYPART_COST[CARRY]) || 1, carryCap);

    // EVENT_BUILD is expense, so spareIncome is often <= 0 while extensions go
    // up. Skip flowScale for bootstrap drones or it shrinks the builders.
    if (!earlyBootstrap) {
        if (!gen.room.energyState) {
            work *= leanColony ? 0.25 : 0.15;
            carry *= leanColony ? 0.1 : 0.05;
        } else if ((gen.role === 'remoteBuilder' || gen.role === 'roadBuilder') && gen.room.energyState < 3) {
            work *= 0.4;
            carry *= 0.3;
        } else if (!leanColony && (gen.room.energyState < 3 ||
            (gen.room.energyState === 3 && ['drone', 'waller'].includes(gen.role)))) {
            const criticalBootstrap = gen.role === 'drone' && roomHasCriticalBuildSites(gen.room);
            const scale = criticalBootstrap ? gen.flowScale(0.75, 10) : gen.flowScale(0.3, 15);
            work *= scale;
            carry *= scale;
        } else if (leanColony && (gen.room.energyState < 2 || gen.trend < 0 || gen.spareIncome < 0)) {
            const scale = gen.flowScale(0.5, 15);
            work *= scale;
            carry *= scale;
        }
    }
    ({work, carry} = clampWorkCarryPair(work, carry, maxNonMove));
    return {work, carry, halfMove};
}

function maxStationaryUpgraderWork(room, energyAmount) {
    if (!room) return 1;
    const energy = energyAmount != null ? energyAmount : (room.energyCapacityAvailable || 0);
    const hasLink = !!(room.memory && room.memory.controllerLink);
    const carry = hasLink ? 4 : 1;
    const carryCost = BODYPART_COST[CARRY] * carry;
    return Math.max(1, Math.min(49, Math.floor((energy - carryCost) / BODYPART_COST[WORK]) || 1));
}

/**
 * How many upgraders a room should run. Prefer one body that fills the spawn
 * cap; only add a second when RCL energy cannot put the spare on one creep.
 */
function planUpgraderNeed(room, flow = {}) {
    const rcl = (room.controller && room.controller.level) || room.level || 0;
    const maxWork = maxStationaryUpgraderWork(room);
    if (rcl >= 7) return {count: 1, maxWork};

    const container = global.resolveControllerContainer && global.resolveControllerContainer(room);
    const hasLink = !!(room.memory && room.memory.controllerLink);
    if (!container && !hasLink) return {count: 1, maxWork};

    const spareIncome = flow.spareIncome || 0;
    const trend = flow.trend || 0;
    const effectiveSpare = Math.min(spareIncome, spareIncome + trend * 50);
    const existingWork = (room.energyDiag && room.energyDiag.upgradeExpense) || 0;

    let count = 1;
    if (effectiveSpare > 0) {
        count = Math.max(1, Math.ceil((existingWork + effectiveSpare) / Math.max(1, maxWork)));
    }

    const stand = container && container.pos && container.pos.countOpenTerrainAround
        ? Math.max(1, container.pos.countOpenTerrainAround())
        : 2;
    // RCL5 (~16W) may still need a pair for two sources; RCL6 (~22W) does not.
    count = Math.min(count, stand, maxWork >= 15 ? 2 : 3);
    if (maxWork >= 20) count = 1;
    return {count, maxWork};
}

function buildUpgrader(gen) {
    const hasLink = !!gen.room.memory.controllerLink;
    const hasContainer = !!global.resolveControllerContainer(gen.room);
    let work, carry, move, halfMove;

    if (gen.room.controller.level === 8 && gen.room.energyState < 2) {
        work = 1;
        carry = 1;
        move = 0;
    } else if (hasLink || hasContainer) {
        carry = hasLink ? 4 : 1;
        const affordableWork = maxStationaryUpgraderWork(gen.room, gen.energyAmount);
        work = affordableWork;

        if (hasLink && gen.level >= 5) {
            const controllerLink = Game.getObjectById(gen.room.memory.controllerLink);
            const sourceLinks = controllerLink ? gen.room.links
                    .filter(s => s.id !== gen.room.memory.controllerLink &&
                        (gen.room.energyState >= 2 || s.id !== gen.room.memory.hubLink))
                    .sort((a, b) => a.pos.getRangeTo(controllerLink) - b.pos.getRangeTo(controllerLink))
                : [];
            // Shared source+controller link dumps harvest into the controller
            // link directly, so it is not in sourceLinks.
            let sharedHarvest = 0;
            const sources = gen.room.sources || [];
            for (let i = 0; i < sources.length; i++) {
                if (sources[i].memory && sources[i].memory.link === gen.room.memory.controllerLink) {
                    sharedHarvest++;
                }
            }

            if (sourceLinks.length + sharedHarvest > 0) {
                const sourceRate = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
                const linked = sourceLinks.length * (1 - LINK_LOSS_RATIO) + sharedHarvest;
                let feedCap = Math.floor(sourceRate * linked) + 1;
                // Receiver has no cooldown. Hub can drip ~800/40 ticks from storage/remotes.
                const stored = (gen.room.rawEnergy || 0) > 1000;
                if (gen.room.memory.hubLink && (gen.room.controller.level < 8 || gen.room.energyState >= 2 || stored)) {
                    const linkCap = typeof LINK_CAPACITY === 'number' ? LINK_CAPACITY : 800;
                    feedCap += Math.floor(linkCap / 40);
                }
                work = Math.min(affordableWork, feedCap);
            }
            if (gen.room.controller.level >= 8) {
                if (!gen.room.energyState) {
                    work *= 0.15;
                } else if (gen.room.energyState < 3) {
                    work *= gen.flowScale(0.75, 12);
                } else {
                    work *= gen.flowScale(0.5, 10);
                }
                const upgraderCnt = (gen.room.energyDiag && gen.room.energyDiag.upgraderCnt) || 0;
                if (upgraderCnt <= 1 && gen.room.energyState < 3 && gen.upgraderDuty < 0.7) {
                    const dutyScale = Math.max(0.5, gen.upgraderDuty + 0.15);
                    work *= dutyScale;
                }
                if (gen.room.energyState >= 2) {
                    const stockpileCap = gen.room.energyState >= 3 ? 5 : 10;
                    const spareCap = gen.spareIncome > 0 ? Math.max(1, Math.floor(gen.spareIncome / 3)) : 1;
                    work = Math.min(work, stockpileCap, spareCap);
                }
                work = Math.min(work, 15);
            } else {
                // RCL push: stored energy is upgrade fuel. Only shrink on a
                // true pre-storage famine (empty spawn, no stock).
                const stored = (gen.room.rawEnergy || 0) > 1000;
                if (!gen.room.energyState && !stored) work *= 0.25;
                work = Math.min(affordableWork, work);
            }
        }

        work = Math.max(Math.min(work, 49), 1);
        move = 0;
    } else {
        work = Math.min(Math.floor(gen.energyAmount * 0.4 / BODYPART_COST[WORK]) || 1, 15);
        carry = Math.min(Math.floor(gen.energyAmount * 0.1 / BODYPART_COST[CARRY]) || 1, 10);
        if (colonyRoadsBuilt(gen.room.name)) halfMove = true;
    }

    if (work < 1) work = 1;
    if (carry < 1) carry = 1;
    return {work, carry, move, halfMove};
}

function shuttleHarvestRate(room, trend = 0, spareIncome = 0) {
    const baseSaturation = Math.ceil(SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
    let work = baseSaturation;
    const rcl = room.controller ? room.controller.level : room.level;
    if (rcl >= 7) {
        const isHealthy = (room.energyState >= 2 || spareIncome > 3 || trend >= 0);
        work += isHealthy ? 9 : 2;
    }
    const powerCreep = getRegenSourceOperatorForRoom(room.name);
    if (powerCreep) {
        const level = powerCreep.powers[PWR_REGEN_SOURCE].level;
        const boostedSat = Math.floor((SOURCE_ENERGY_CAPACITY +
                (POWER_INFO[PWR_REGEN_SOURCE].effect[level - 1] * (ENERGY_REGEN_TIME / 15))) /
            (HARVEST_POWER * ENERGY_REGEN_TIME));
        work = Math.max(boostedSat, work);
    }
    return work * HARVEST_POWER;
}

function shuttleCarryTarget(harvestRate, distToHub) {
    const roundTrip = 2 * (distToHub + 1);
    return Math.max(4, Math.ceil(harvestRate * roundTrip / CARRY_CAPACITY));
}

function assessSourceHaulBacklog(source, room) {
    let containerFill = 0;
    const container = source.memory.container ? Game.getObjectById(source.memory.container) : undefined;
    if (container) {
        containerFill = (container.store[RESOURCE_ENERGY] || 0) / CONTAINER_CAPACITY;
    }
    let droppedNearSource = 0;
    for (const r of room.droppedEnergy) {
        if (r.pos.getRangeTo(source.pos) <= 2) droppedNearSource += r.amount;
    }
    const haulUrgent = containerFill >= 0.5 || droppedNearSource >= CONTAINER_CAPACITY * 0.5;
    const haulCritical = containerFill >= 0.85 || droppedNearSource >= CONTAINER_CAPACITY * 0.9;
    return {containerFill, droppedNearSource, haulUrgent, haulCritical};
}

function planShuttleForSource(room, source, flow = {}) {
    const trend = flow.trend || 0;
    const spareIncome = flow.spareIncome || 0;
    const distToHub = source.memory.distanceToHub || 25;
    const harvestRate = shuttleHarvestRate(room, trend, spareIncome);
    const backlog = assessSourceHaulBacklog(source, room);

    let count = 1;
    // Two shuttles/source before containers exist just occupies the spawn.
    // Ramp to 2 once the room can actually store harvest (RCL3+ / containers).
    if (room.level < 5 && !room.storage) count = room.level >= 3 ? 2 : 1;
    if (backlog.haulUrgent) count = Math.max(count, 2);
    if (backlog.haulCritical) count = Math.min(count + 1, 3);
    const maxCount = room.level >= 7 ? 2 : 3;
    count = Math.min(count, maxCount);
    if (!backlog.haulUrgent && spareIncome < 0) count = Math.min(count, 1);

    return {
        count,
        other: {
            distanceToHub: distToHub,
            harvestRate,
            haulUrgent: backlog.haulUrgent,
            containerFill: Math.round(backlog.containerFill * 100) / 100,
        },
        reboot: roomSpawnEnergyStuck(room),
    };
}

function buildHauler(gen) {
    const roadsBuilt = colonyRoadsBuilt(gen.room.name) && !gen.room.memory.dynamicLayout;
    let carry = Math.floor(gen.energyAmount / (BODYPART_COST[CARRY] + (roadsBuilt ? BODYPART_COST[MOVE] * 0.5 : BODYPART_COST[MOVE]))) || 1;
    const maxHaulerCarry = gen.room.level >= 7
        ? maxBodyNonMoveParts(roadsBuilt)
        : (gen.room.level >= 6 ? gen.room.level * 2 : gen.room.level * 4);
    carry = Math.min(carry, maxHaulerCarry);
    // Income logistics: never shrink haulers for flow stress. Undersized haulers
    // leave energy in containers/drops and the room cannot recover.
    if (!roomInSpawnRecovery(gen.room, gen.creepInfo) && !gen.room.energyState) {
        carry = Math.max(1, Math.floor(carry * 0.25));
    }
    return {carry, halfMove: roadsBuilt || undefined};
}

function buildShuttle(gen) {
    const roadsBuilt = colonyRoadsBuilt(gen.room.name) && !gen.room.memory.dynamicLayout;
    const moveCostPerCarry = roadsBuilt ? BODYPART_COST[MOVE] * 0.5 : BODYPART_COST[MOVE];
    const other = (gen.creepInfo && gen.creepInfo.other) || {};
    const distToHub = other.distanceToHub;
    const harvestRate = other.harvestRate || shuttleHarvestRate(gen.room, gen.trend, gen.spareIncome);
    const haulUrgent = !!other.haulUrgent;
    const maxShuttleCarry = gen.room.level >= 7
        ? maxBodyNonMoveParts(roadsBuilt)
        : Math.max(10, gen.room.level * 4);
    const affordable = Math.floor(gen.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)) || 1;

    let carry;
    if (distToHub) {
        carry = shuttleCarryTarget(harvestRate, distToHub);
        carry = Math.min(carry, affordable, maxShuttleCarry);
    } else {
        carry = Math.min(affordable, maxShuttleCarry);
    }

    const throughputFloor = distToHub
        ? Math.max(4, Math.ceil(shuttleCarryTarget(harvestRate, distToHub) * 0.8))
        : 1;
    const recovery = roomInSpawnRecovery(gen.room, gen.creepInfo);
    const minCarry = (haulUrgent && !recovery) ? Math.min(throughputFloor, affordable) : 1;

    const criticalBootstrap = haulUrgent || roomHasCriticalBuildSites(gen.room);

    // Same as haulers: only shrink on a barren reboot so the body can spawn.
    // Haul backlog / harvest throughput stay at saturation otherwise.
    if (!recovery && !gen.room.energyState && !haulUrgent) {
        carry = Math.max(minCarry, Math.floor(carry * (criticalBootstrap ? 0.65 : 0.25)));
    } else if (!recovery && !gen.room.energyState) {
        carry = Math.max(minCarry, Math.floor(carry * 0.65));
    }

    carry = Math.min(affordable, Math.max(minCarry, carry));
    return {carry, halfMove: roadsBuilt || undefined};
}

function buildStationaryHarvester(gen) {
    const maxWork = Math.max(1, Math.floor((gen.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK]));
    // Early drones (2–4 MOVE) cannot pull a 5W harvester. 0-MOVE only after
    // storage, when real trucks exist. Walk until then.
    const move = isColonyEarlyRush(gen.room) ? 1 : 0;
    if (roomInSpawnRecovery(gen.room, gen.creepInfo) || gen.room.level < 2) {
        const work = move
            ? Math.max(1, Math.floor((gen.energyAmount - BODYPART_COST[CARRY] - BODYPART_COST[MOVE]) / BODYPART_COST[WORK]))
            : maxWork;
        return {work, carry: 1, move};
    }
    const isHealthy = (gen.room.energyState >= 2 || gen.spareIncome > 3 || gen.trend >= 0);
    const additionalWork = gen.room.controller.level >= 7 ? (isHealthy ? 9 : 2) : 0;
    const baseSaturation = Math.ceil(SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
    let work;
    let powerCreep = getRegenSourceOperatorForRoom(gen.room.name);
    if (powerCreep) {
        const boostedSat = Math.floor((SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME));
        work = Math.max(boostedSat, boostedSat + additionalWork);
    } else {
        work = Math.min(maxWork, baseSaturation) + additionalWork;
    }
    work = Math.min(Math.max(baseSaturation, work), maxWork);
    if (move) {
        const walkMax = Math.max(1, Math.floor((gen.energyAmount - BODYPART_COST[CARRY] - BODYPART_COST[MOVE]) / BODYPART_COST[WORK]));
        work = Math.min(work, walkMax);
    }
    return {work, carry: 1, move};
}

const builders = {
    explorer: () => ({move: 1}),
    scout: () => ({move: 1}),
    test: () => ({move: 1}),
    remoteBuilder: buildRoadDroneWaller,
    roadBuilder: buildRoadDroneWaller, // legacy alias
    drone: buildRoadDroneWaller,
    waller: buildRoadDroneWaller,
    upgrader: buildUpgrader,
    labTech(gen) {
        let carry = Math.floor(gen.energyAmount / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
        const cap = gen.room.level >= 8 ? 32 : 20;
        carry = Math.min(carry, cap);
        const halfMove = colonyRoadsBuilt(gen.room.name) || undefined;
        return {carry, halfMove};
    },
    hauler: buildHauler,
    hubManager() {
        return {carry: 16, move: 0};
    },
    shuttle: buildShuttle,
    stationaryHarvester: buildStationaryHarvester,
    mineralHarvester(gen) {
        const other = gen.creepInfo && gen.creepInfo.other;
        const thorium = other && other.thorium;
        if (thorium) {
            const pair = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
            let n = Math.floor(gen.energyAmount / pair) || 1;
            n = Math.min(n, 16);
            return {work: n, carry: Math.max(2, Math.ceil(n / 2))};
        }
        let work = Math.floor(gen.energyAmount / BODYPART_COST[WORK]) || 1;
        work = Math.min(work, 50);
        if (!gen.room.energyState) {
            work *= 0.15;
        } else if (gen.room.energyState === 1) {
            work *= 0.3;
        }
        return {work, move: 0};
    },
    cleaner(gen) {
        let work = Math.floor(gen.energyAmount / (BODYPART_COST[WORK] + BODYPART_COST[MOVE])) || 1;
        work = Math.min(work, 25);
        return {work};
    },
};

function build(role, gen) {
    const fn = builders[role];
    return fn ? fn(gen) : undefined;
}

module.exports = {
    build,
    builders,
    shuttleHarvestRate,
    shuttleCarryTarget,
    assessSourceHaulBacklog,
    planShuttleForSource,
    maxStationaryUpgraderWork,
    planUpgraderNeed,
};