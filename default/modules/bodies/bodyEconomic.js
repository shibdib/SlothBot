/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const {
    colonyRoadsBuilt,
    maxBodyNonMoveParts,
    clampWorkCarryPair,
    roomHasCriticalBuildSites,
} = require('bodyHelpers');

function buildRoadDroneWaller(gen) {
    const leanColony = gen.room.level >= 7 && !gen.creepInfo.destination;
    const halfMove = !gen.creepInfo.destination
        && !['roadBuilder', 'waller'].includes(gen.role)
        && colonyRoadsBuilt(gen.room.name);

    const maxNonMove = maxBodyNonMoveParts(halfMove);
    const workShare = halfMove ? (leanColony ? 0.45 : 0.40) : (leanColony ? 0.32 : 0.28);
    const carryShare = halfMove ? (leanColony ? 0.35 : 0.32) : (leanColony ? 0.25 : 0.22);
    let workCap = leanColony ? Math.max(1, Math.floor(maxNonMove * 0.6)) : (halfMove ? 25 : 20);
    let carryCap = leanColony ? (maxNonMove - workCap) : (halfMove ? 20 : 16);
    if (workCap + carryCap > maxNonMove) carryCap = Math.max(1, maxNonMove - workCap);

    let work = Math.min(Math.floor(gen.energyAmount * workShare / BODYPART_COST[WORK]) || 1, workCap);
    let carry = Math.min(Math.floor(gen.energyAmount * carryShare / BODYPART_COST[CARRY]) || 1, carryCap);

    if (!gen.room.energyState) {
        work *= leanColony ? 0.25 : 0.15;
        carry *= leanColony ? 0.1 : 0.05;
    } else if (gen.role === 'roadBuilder' && gen.room.energyState < 3) {
        work *= 0.4;
        carry *= 0.3;
    } else if (!leanColony && (gen.room.energyState < 3 ||
        (gen.room.energyState === 3 && ['drone', 'waller'].includes(gen.role)))) {
        const criticalBootstrap = gen.role === 'drone' && roomHasCriticalBuildSites(gen.room);
        const scale = criticalBootstrap ? gen.flowScale(0.75, 10) : gen.flowScale(0.3, 15);
        work *= scale;
        carry *= scale;
    } else if (leanColony && (gen.room.energyState < 2 || gen.trend < 0)) {
        const scale = gen.flowScale(0.5, 15);
        work *= scale;
        carry *= scale;
    }
    ({work, carry} = clampWorkCarryPair(work, carry, maxNonMove));
    return {work, carry, halfMove};
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
        const affordableWork = Math.floor((gen.energyAmount - (BODYPART_COST[CARRY] * carry)) / BODYPART_COST[WORK]) || 1;
        work = affordableWork;

        if (hasLink && gen.level >= 5) {
            const controllerLink = Game.getObjectById(gen.room.memory.controllerLink);
            const sourceLinks = controllerLink ? gen.room.links
                    .filter(s => s.id !== gen.room.memory.controllerLink &&
                        (gen.room.energyState >= 2 || s.id !== gen.room.memory.hubLink))
                    .sort((a, b) => a.pos.getRangeTo(controllerLink) - b.pos.getRangeTo(controllerLink))
                : [];

            if (sourceLinks.length > 0) {
                const sourceRate = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME;
                work = Math.floor(sourceRate * sourceLinks.length * (1 - LINK_LOSS_RATIO)) + 1;
            }
            if (!gen.room.energyState) {
                work *= 0.15;
            } else if (gen.room.energyState < 3) {
                work *= gen.flowScale(0.75, 12);
            } else {
                work *= gen.flowScale(0.5, 10);
            }
            if (gen.room.energyState < 3 && gen.upgraderDuty < 0.7) {
                const dutyScale = Math.max(0.5, gen.upgraderDuty + 0.15);
                work *= dutyScale;
            }
            if (gen.room.level === 8 && gen.room.energyState >= 2) {
                const stockpileCap = gen.room.energyState >= 3 ? 5 : 10;
                const spareCap = Math.max(3, Math.floor(gen.spareIncome / 3));
                work = Math.min(work, stockpileCap, spareCap);
            }
            work = gen.room.level === 8 ? Math.min(work, 15) : Math.min(affordableWork, work);
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
    const powerCreep = _.find(Game.powerCreeps, c =>
        c.my && c.memory.destinationRoom === room.name && c.powers[PWR_REGEN_SOURCE]);
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
    if (room.level < 5 && !room.storage) count = 2;
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
        reboot: !backlog.haulUrgent && !room.energyState,
    };
}

function buildHauler(gen) {
    const roadsBuilt = colonyRoadsBuilt(gen.room.name) && !gen.room.memory.dynamicLayout;
    let carry = Math.floor(gen.energyAmount / (BODYPART_COST[CARRY] + (roadsBuilt ? BODYPART_COST[MOVE] * 0.5 : BODYPART_COST[MOVE]))) || 1;
    const maxHaulerCarry = gen.room.level >= 7
        ? maxBodyNonMoveParts(roadsBuilt)
        : (gen.room.level >= 6 ? gen.room.level * 2 : gen.room.level * 4);
    carry = Math.min(carry, maxHaulerCarry);
    if (!gen.room.energyState) {
        carry = Math.max(1, Math.floor(carry * 0.25));
    } else if (gen.room.energyState < 3 || gen.trend < 0) {
        carry = Math.max(1, Math.floor(carry * gen.flowScale(0.5, 10)));
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
    const minCarry = haulUrgent ? throughputFloor : 1;

    const criticalBootstrap = haulUrgent || roomHasCriticalBuildSites(gen.room);

    if (!haulUrgent) {
        if (!gen.room.energyState) {
            carry = Math.max(minCarry, Math.floor(carry * (criticalBootstrap ? 0.65 : 0.25)));
        } else if (gen.room.energyState < 3 || gen.trend < 0) {
            const scale = criticalBootstrap ? gen.flowScale(0.75, 10) : gen.flowScale(0.5, 10);
            carry = Math.max(minCarry, Math.floor(carry * scale));
        }
    } else if (!gen.room.energyState) {
        carry = Math.max(minCarry, Math.floor(carry * 0.65));
    } else if (gen.room.energyState < 3 && gen.trend < -3) {
        carry = Math.max(minCarry, Math.floor(carry * gen.flowScale(0.75, 12)));
    }

    carry = Math.max(minCarry, carry);
    return {carry, halfMove: roadsBuilt || undefined};
}

function buildStationaryHarvester(gen) {
    let work, move = 0;
    if (gen.room.level >= 2) {
        work = Math.floor((gen.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK]) || 1;
        const isHealthy = (gen.room.energyState >= 2 || gen.spareIncome > 3 || gen.trend >= 0);
        const additionalWork = gen.room.controller.level >= 7 ? (isHealthy ? 9 : 2) : 0;
        const baseSaturation = Math.ceil(SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
        let powerCreep = _.find(Game.powerCreeps, c => c.my && c.memory.destinationRoom === gen.room.name && c.powers[PWR_REGEN_SOURCE]);
        if (powerCreep) {
            const boostedSat = Math.floor((SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME));
            work = boostedSat + additionalWork;
            work = Math.max(boostedSat, work);
        } else {
            work = Math.ceil(Math.min(work, baseSaturation)) + additionalWork;
        }
        work = Math.min(Math.max(baseSaturation, work), Math.max(1, Math.floor((gen.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK])));
    } else {
        work = Math.floor((gen.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK]) || 1;
    }
    return {work, carry: 1, move};
}

const builders = {
    explorer: () => ({move: 1}),
    scout: () => ({move: 1}),
    test: () => ({move: 1}),
    roadBuilder: buildRoadDroneWaller,
    drone: buildRoadDroneWaller,
    waller: buildRoadDroneWaller,
    upgrader: buildUpgrader,
    labTech(gen) {
        let carry = Math.floor(gen.energyAmount / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
        carry = Math.min(carry, 20);
        const halfMove = colonyRoadsBuilt(gen.room.name) || undefined;
        return {carry, halfMove};
    },
    hauler: buildHauler,
    shuttle: buildShuttle,
    stationaryHarvester: buildStationaryHarvester,
    mineralHarvester(gen) {
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
};