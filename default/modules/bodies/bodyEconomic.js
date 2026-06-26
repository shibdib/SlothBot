/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const {
    colonyRoadsBuilt,
    maxBodyNonMoveParts,
    clampWorkCarryPair,
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
        const scale = gen.flowScale(0.3, 15);
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
    const distToHub = gen.creepInfo && gen.creepInfo.other && gen.creepInfo.other.distanceToHub;
    const maxShuttleCarry = gen.room.level >= 7
        ? maxBodyNonMoveParts(roadsBuilt)
        : Math.max(10, gen.room.level * 4);
    let carry;
    if (distToHub) {
        carry = Math.max(4, Math.ceil(10 * 2 * (distToHub + 1) / BODYPART_COST[CARRY]));
        carry = Math.min(carry, Math.floor(gen.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)), maxShuttleCarry);
    } else {
        carry = Math.floor(gen.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)) || 1;
        carry = Math.min(carry, maxShuttleCarry);
    }
    if (!gen.room.energyState) {
        carry = Math.max(1, Math.floor(carry * 0.25));
    } else if (gen.room.energyState < 3 || gen.trend < 0) {
        carry = Math.max(1, Math.floor(carry * gen.flowScale(0.5, 10)));
    }
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

module.exports = {build, builders};