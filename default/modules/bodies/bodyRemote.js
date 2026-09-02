/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const {routeWithinClaimTTL} = require('pathRoute');
const {
    isSkRoom,
    routeHasBuiltRoads,
    maxBodyNonMoveParts,
    getHaulersBySource,
    countQueuedHaulersForSource,
} = require('bodyHelpers');

const builders = {
    claimAttacker(gen) {
        if (gen.creepInfo?.destination &&
            !routeWithinClaimTTL(gen.room.name, gen.creepInfo.destination, CREEP_CLAIM_LIFE_TIME - 10)) {
            return false;
        }
        // One attackController per life (600 TTL vs 1000 upgradeBlocked).
        // Max CLAIM pairs; auto-move adds 1 MOVE each for plains 1/tick.
        const pairCost = BODYPART_COST[CLAIM] + BODYPART_COST[MOVE];
        let claim = Math.floor(gen.energyAmount / pairCost);
        if (claim < 1) return false;
        claim = Math.min(claim, 25);
        return {claim};
    },

    claimer(gen) {
        if (gen.creepInfo?.destination &&
            !routeWithinClaimTTL(gen.room.name, gen.creepInfo.destination, CREEP_CLAIM_LIFE_TIME - 10)) {
            return false;
        }
        return {claim: 1, move: 2};
    },

    reactorClaimer(gen) {
        if (gen.creepInfo?.destination &&
            !routeWithinClaimTTL(gen.room.name, gen.creepInfo.destination, CREEP_CLAIM_LIFE_TIME - 10)) {
            return false;
        }
        return {claim: 1, move: 2};
    },

    reserver(gen) {
        if (gen.creepInfo?.destination &&
            !routeWithinClaimTTL(gen.room.name, gen.creepInfo.destination, CREEP_CLAIM_LIFE_TIME - 10)) {
            return false;
        }
        const leanColony = gen.room.level >= 7;
        // Avoid live route pathfind during body gen — roads flag alone is enough for half-move.
        const fullRouteHasRoads = routeHasBuiltRoads(gen.room.name, gen.creepInfo.destination);
        const halfMove = fullRouteHasRoads || undefined;

        const moveCost = halfMove ? BODYPART_COST[MOVE] * 0.5 : BODYPART_COST[MOVE];
        // Cap claim parts: a single CLAIM part reserves at 1/tick; big stacks cost spawn CPU
        // and move slowly. One reserver with modest claim is enough per remote.
        // 2 CLAIM nets +1/tick while present (maintains and slowly fills to 5000).
        // 3 CLAIM is enough to recover a low reservation in a couple of lives.
        // 12 CLAIM was leftover from spawning only after reservation had decayed to 1500.
        const maxClaim = leanColony
            ? Math.min(3, maxBodyNonMoveParts(!!halfMove))
            : (fullRouteHasRoads ? Math.min(6, 5 * (gen.room.energyState || 1)) : Math.min(4, 2 * (gen.room.energyState || 1)));

        let claim = Math.floor(gen.energyAmount / (BODYPART_COST[CLAIM] + moveCost)) || 1;
        claim = Math.min(claim, maxClaim);

        if (claim > CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][gen.room.level] * 3) {
            claim = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][gen.room.level] * 3;
        }
        if (gen.room.memory.remotePenalty) claim = Math.min(claim, 1);

        if (leanColony) {
            if (gen.room.energyState < 2 || gen.trend < 0) {
                claim = Math.max(1, Math.floor(claim * gen.flowScale(0.5, 10)));
            }
        } else if (gen.room.energyState < 3 || gen.trend < 0) {
            claim = Math.max(2, Math.floor(claim * gen.flowScale(0.5, 10)));
        }
        claim = Math.max(claim, 2);
        return {claim, halfMove};
    },

    remoteHarvester(gen) {
        const destName = gen.creepInfo.destination;
        const destIntel = INTEL[destName];
        let baseSaturation;
        const keeperYield = isSkRoom(destName)
            || (global.isSectorCenterRoomName && global.isSectorCenterRoomName(destName));
        if (keeperYield) {
            baseSaturation = Math.ceil(SOURCE_ENERGY_KEEPER_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
        } else if ((destIntel && destIntel.reservation === MY_USERNAME) || gen.room.level >= 4) {
            // RCL4+ remotes get a reserver; size for 3000 so the first harvester is not
            // stuck at 1500-capacity until it dies after reservation lands.
            baseSaturation = Math.ceil(SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
        } else {
            baseSaturation = Math.ceil(SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
        }
        const isHealthy = (gen.room.energyState >= 2 || gen.spareIncome > 3 || gen.trend >= 0);
        const additionalWork = gen.room.level >= 7 ? (isHealthy ? 2 : 0) : 0;
        let work = baseSaturation + additionalWork;
        const carry = 1;

        const fullRouteHasRoads = routeHasBuiltRoads(gen.room.name, gen.creepInfo.destination);
        const halfMove = fullRouteHasRoads || undefined;

        const moveRatio = halfMove ? 0.5 : 1;
        const maxWork = Math.max(1, Math.floor((gen.energyAmount - BODYPART_COST[CARRY]) / (BODYPART_COST[WORK] + BODYPART_COST[MOVE] * moveRatio)));
        work = Math.min(Math.max(baseSaturation, work), maxWork);
        return {work, carry, halfMove};
    },

    remoteHauler(gen) {
        const remoteRoomName = gen.creepInfo.other.remoteRoom;
        if (!remoteRoomName) return false;
        const sourceId = gen.creepInfo.other.source;
        const otherAssignedHaulers = getHaulersBySource()[sourceId] || [];
        const {haulerCarryCapacity} = require('spawnCounts');
        const currentHaulingCapacity = _.sum(otherAssignedHaulers, haulerCarryCapacity);

        const work = gen.room.level >= 7 ? 1 : 0;
        const fullRouteHasRoads = routeHasBuiltRoads(gen.room.name, remoteRoomName);

        const minCarryParts = gen.room.level >= 7
            ? (fullRouteHasRoads ? 12 : 8)
            : Math.max(2, gen.room.level * 2);
        const queuedHaulers = countQueuedHaulersForSource(gen.room.name, sourceId);
        const queuedCapacity = queuedHaulers * minCarryParts * CARRY_CAPACITY;
        const harvestAmount = gen.creepInfo.other.harvestAmount || 0;
        const carryDeficit = Math.max(0, harvestAmount - currentHaulingCapacity - queuedCapacity);
        const desiredCarry = carryDeficit > 0
            ? Math.max(minCarryParts, Math.ceil(carryDeficit / CARRY_CAPACITY))
            : minCarryParts;

        let carry, halfMove;
        if (fullRouteHasRoads) {
            carry = Math.floor((gen.energyAmount - (work * BODYPART_COST[WORK])) / (BODYPART_COST[CARRY] + (BODYPART_COST[MOVE] * 0.5))) || 1;
            halfMove = true;
        } else {
            carry = Math.floor((gen.energyAmount - (work * BODYPART_COST[WORK])) / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
        }

        carry = Math.min(carry, desiredCarry);

        const maxNonMove = maxBodyNonMoveParts(!!halfMove);
        const maxCarry = gen.room.level >= 7
            ? Math.max(1, maxNonMove - (work || 0))
            : gen.room.level * 2;
        carry = Math.min(carry, maxCarry);
        carry = Math.max(minCarryParts, carry);
        return {work, carry, halfMove};
    },

    SKMineral(gen) {
        let work = Math.floor((gen.energyAmount * 0.35) / BODYPART_COST[WORK]) || 1;
        work = Math.min(work, 15);
        let carry = Math.floor((gen.energyAmount * 0.15) / BODYPART_COST[CARRY]) || 1;
        carry = Math.min(carry, 10);
        return {work, carry};
    },

    commodityMiner(gen) {
        let work = Math.floor((gen.energyAmount * 0.35) / BODYPART_COST[WORK]) || 1;
        work = Math.min(work, 15);
        let carry = Math.floor((gen.energyAmount * 0.15) / BODYPART_COST[CARRY]) || 1;
        carry = Math.min(carry, 10);
        return {work, carry};
    },
};

function build(role, gen) {
    const fn = builders[role];
    return fn ? fn(gen) : undefined;
}

module.exports = {build, builders};