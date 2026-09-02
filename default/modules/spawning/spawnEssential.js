/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Colony economy creeps: defenders, drones, wallers, harvesters, haulers, upgraders.
 */

const spawnState = require('spawnState');
const {getFlowContext, spawnEnergyState} = require('spawnFlow');
const {getCreepCount} = require('spawnCounts');
const {queueCreepIfNeeded} = require('spawnQueue');
const {empireOpsPaused} = require('hcReadiness');
const {planShuttleForSource} = require('bodyEconomic');
const {roomHasCriticalBuildSites, roomNeedsSpawnReboot, getOwnedExtensionDeficit, roomHasLiveTowTruck} = require('bodyHelpers');
const {isHubManagerSlotReady, recycleHubSlotIntruder} = require('spawnHub');
const {relocateHubObserver} = require('planCore');

function resolveDroneCount(room, ctx) {
    const {
        earlyRush, importantBuilds, hasCriticalBuilds, hasRoadMaintenance,
        flowHealthy, spareIncome,
    } = ctx;
    const energyState = spawnEnergyState(room);

    const siteCount = room.constructionSites.length;
    const heavyRoadRepair = hasRoadMaintenance.length > 3;
    const hasBuildWork = importantBuilds || hasCriticalBuilds || siteCount > 0;
    const hasWork = hasBuildWork || heavyRoadRepair;

    if (!hasWork && !energyState) return 0;

    let count;
    if (room.level >= 7) {
        if (heavyRoadRepair && energyState >= 1 && flowHealthy) return 2;
        if (!hasWork && (energyState < 2 || spareIncome < 0)) return 0;
        return 1;
    } else if (earlyRush) {
        count = hasWork ? (hasCriticalBuilds ? 3 : 2) : 2;
    } else if (room.storage) {
        if (!hasWork) count = energyState ? 1 : 0;
        else if (heavyRoadRepair && energyState >= 1) count = 2;
        else count = hasCriticalBuilds ? 2 : 1;
    } else if (!hasWork) {
        count = energyState ? 1 : 0;
    } else {
        count = hasCriticalBuilds ? 2 : (energyState >= 2 ? 2 : 1);
    }

    if (count <= 1) return count;
    // Pre-storage drones are the economy (harvest, haul, build, upgrade).
    // spareIncome is often negative while they build — do not cap them.
    if (earlyRush) return count;

    const droneBudget = room.level >= 7 ? 12 : 8;
    if (!flowHealthy || spareIncome < droneBudget) {
        return (hasCriticalBuilds || heavyRoadRepair) ? Math.min(count, 2) : 1;
    }
    const incomeCap = room.level >= 7 ? 2 : Math.min(2, Math.floor(spareIncome / droneBudget));
    return Math.max(1, Math.min(count, incomeCap));
}

function essentialCreepQueue(room) {
    if (!spawnState.throttleReady(spawnState.essentialTick, room.name, 10)) return;
    const energyState = spawnEnergyState(room);

    if ((room.memory.defenseCooldown || 0) > Game.time || room.memory.earlyWarning) {
        let targetAmount = room.hostileCreeps.length ? room.hostileCreeps.length : 2;
        if (targetAmount > 6) targetAmount = 6;
        queueCreepIfNeeded({
            room, role: 'defender', priority: PRIORITIES.defender,
            numberNeeded: targetAmount, misc: {boosts: [ATTACK, RANGED_ATTACK]}
        });
    }

    if (room.memory.testDefense) {
        let targetAmount = room.hostileCreeps.length ? room.hostileCreeps.length : 2;
        if (targetAmount > 6) targetAmount = 6;
        queueCreepIfNeeded({
            room, role: 'test', priority: PRIORITIES.defender,
            numberNeeded: targetAmount
        });
    }

    const {energyInfo, trend, trendOk, flowHealthy, spareIncome} = getFlowContext(room);
    const importantBuilds = _.some(room.constructionSites, s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    const hasRoadMaintenance = _.filter(room.structures, s => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax * 0.5);
    const harvesterCount = getCreepCount(room, 'stationaryHarvester');
    const earlyRush = !room.storage && room.level < 5;

    // Critical structures (esp. ones newly unlocked on controller level-up) should
    // bootstrap builders even if energyState is temporarily low (common right after
    // an upgrade that depleted reserves; these structures are exactly what improve
    // energy capacity/income). Matches the "always build" priority in constructionWork.
    const extensionDeficit = getOwnedExtensionDeficit(room);
    const hasCriticalBuilds = roomHasCriticalBuildSites(room) || extensionDeficit > 0;

    const spawnReboot = roomNeedsSpawnReboot(room);

    let droneCount = resolveDroneCount(room, {
        earlyRush, importantBuilds, hasCriticalBuilds, hasRoadMaintenance,
        flowHealthy, spareIncome,
    });
    // Income creeps first while the room can only spend spawn regen — except
    // early rush, where drones *are* the income/build/upgrade crew.
    const dronePriority = earlyRush ? 1 : PRIORITIES.drone;

    queueCreepIfNeeded({
        room, role: 'drone', priority: dronePriority + getCreepCount(room, 'drone'),
        numberNeeded: droneCount,
        rebootCondition: spawnReboot
    });

    if (room.level >= BUNKER_LEVEL) {
        let wallerCount = 1;
        // Spawn wallers for barrier maintenance unless the room is completely energy barren (energyState==0).
        // At energyState==1 we allow minimal (body will be heavily scaled down by flowScale anyway).
        // This prevents completely abandoning wall/rampart building in low-but-not-zero energy rooms.
        // Previously gated strictly at >=2; drones still only do "energy rich" walling at >=3.
        if (energyState >= 1 && flowHealthy && spareIncome >= 4) {
            wallerCount = room.level >= 7 ? 1 : (energyState >= 3 && room.level >= 8 ? 2 : 1);
            if (room.level < 7) {
                wallerCount = Math.max(1, Math.min(wallerCount, Math.floor(spareIncome / 10)));
            }
        }
        if (wallerCount) {
            queueCreepIfNeeded({
                room, role: 'waller', priority: PRIORITIES.drone + 1,
                numberNeeded: wallerCount, misc: {boosts: [WORK]}
            });
        }
    }

    // Wait until 5 extensions (room.level 2 / 550 cap) so the harvester is 5W
    // and a drone is free to tow. Until then drones harvest themselves.
    if (room.level >= 2 && roomHasLiveTowTruck(room)) {
        queueCreepIfNeeded({
            room, role: 'stationaryHarvester',
            priority: PRIORITIES.stationaryHarvester,
            numberNeeded: room.sources.length,
            rebootCondition: spawnReboot || !getCreepCount(room, 'stationaryHarvester')
        });
    }

    const protoStorage = room.memory.protoStorage ? Game.getObjectById(room.memory.protoStorage) : undefined;
    if (room.storage || protoStorage) {
        recycleHubSlotIntruder(room);
        if (room.controller && room.controller.level >= 8) relocateHubObserver(room);
        if (isHubManagerSlotReady(room) && !spawnReboot) {
            queueCreepIfNeeded({
                room, role: 'hubManager', priority: PRIORITIES.hubManager,
                numberNeeded: 1,
                rebootCondition: !getCreepCount(room, 'hubManager')
            });
        }
        const haulerAmount = 1;
        const priority = !getCreepCount(room, 'hauler') ? 1 : PRIORITIES.hauler;
        queueCreepIfNeeded({
            room, role: 'hauler', priority,
            numberNeeded: haulerAmount,
            rebootCondition: spawnReboot || !getCreepCount(room, 'hauler') || !energyState
        });
    }

    // Shuttles empty stationary harvesters. Until those exist, drones haul.
    if (harvesterCount) {
        for (const source of room.sources) {
            let sourceLink = source.memory.link && Game.getObjectById(source.memory.link);
            if (!sourceLink && source.memory.link) source.memory.link = undefined;
            // Hub is a receiver, not a harvest dump. A near-hub source that bound the
            // hub link still needs a shuttle (planner skipped a dedicated source link).
            if (sourceLink && room.memory.hubLink && sourceLink.id === room.memory.hubLink) {
                source.memory.link = undefined;
                sourceLink = undefined;
            }
            // Source link + any receiver (hub or controller) is cheaper than a shuttle.
            if (sourceLink && (room.memory.hubLink || room.memory.controllerLink)) continue;
            const plan = planShuttleForSource(room, source, {trend, spareIncome});
            const hasShuttle = getCreepCount(room, 'shuttle', undefined, undefined, undefined, source.id);
            const shuttlePriority = spawnReboot
                ? PRIORITIES.hauler + (hasShuttle ? 1 : 0)
                : (!hasShuttle ? 1 : (plan.other.haulUrgent ? PRIORITIES.hauler * 0.75 : PRIORITIES.hauler));
            queueCreepIfNeeded({
                room, role: 'shuttle', priority: shuttlePriority,
                numberNeeded: plan.count,
                rebootCondition: spawnReboot || room.myCreeps.length < 4 || plan.reboot,
                other: plan.other,
                assignment: source.id
            });
        }
    }

    let upgraderAmount = 1;
    // Drones already dump leftover energy into the controller below RCL 4.
    // A dedicated upgrader during an extension deficit starves the builders.
    if (earlyRush && (room.controller.level < 3 || extensionDeficit > 0)) {
        upgraderAmount = 0;
    } else if (room.controller.level !== 8 && energyState) {
        const container = global.resolveControllerContainer(room);
        if (container && room.controller.level < 8) {
            const trend = (energyInfo && energyInfo.trend) || 0;
            const effectiveIncome = Math.min(spareIncome, spareIncome + trend * 50);
            upgraderAmount = Math.max(1, Math.min(
                Math.floor(effectiveIncome / 12),
                container.pos.countOpenTerrainAround()
            ));
        }
        if (room.level >= 7) upgraderAmount = 1;
        else if (earlyRush && harvesterCount && energyState >= 2 && (energyInfo && (energyInfo.trend || 0) >= 0)) {
            upgraderAmount = Math.max(upgraderAmount, 2);
        }
    }
    if (upgraderAmount > 0) {
        const fastTrack = (energyState > 1 && room.storage && trendOk) ||
            (earlyRush && harvesterCount && energyState >= 2);
        const priority = fastTrack ? PRIORITIES.upgrader * 0.5 : PRIORITIES.upgrader;
        queueCreepIfNeeded({
            room, role: 'upgrader', priority,
            numberNeeded: upgraderAmount, misc: {boosts: [WORK]},
            rebootCondition: spawnReboot || !getCreepCount(room, 'upgrader') || !energyState
        });
    }
}

module.exports = {essentialCreepQueue};