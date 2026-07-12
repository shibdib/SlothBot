/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Colony economy creeps: defenders, drones, wallers, harvesters, haulers, upgraders.
 */

const spawnState = require('spawnState');
const {getFlowContext, roomHasOperateExtensionOperator, spawnEnergyState} = require('spawnFlow');
const {getCreepCount} = require('spawnCounts');
const {queueCreepIfNeeded} = require('spawnQueue');
const {empireOpsPaused} = require('hcReadiness');
const {planShuttleForSource} = require('bodyEconomic');
const {roomHasCriticalBuildSites} = require('bodyHelpers');

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

    if (!hasWork && !energyState && !hasCriticalBuilds) return 0;

    let count;
    if (room.level >= 7) {
        if (!hasWork && !energyState && !hasCriticalBuilds) return 0;
        if (heavyRoadRepair && energyState >= 1 && flowHealthy) return 2;
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

    const droneBudget = earlyRush ? 6 : (room.level >= 7 ? 12 : 8);
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
    const hasCriticalBuilds = roomHasCriticalBuildSites(room);

    const dronePriority = earlyRush ? 1 : PRIORITIES.drone;
    const droneCount = resolveDroneCount(room, {
        earlyRush, importantBuilds, hasCriticalBuilds, hasRoadMaintenance,
        flowHealthy, spareIncome,
    });

    queueCreepIfNeeded({
        room, role: 'drone', priority: dronePriority + getCreepCount(room, 'drone'),
        numberNeeded: droneCount, rebootCondition: room.friendlyCreeps.length < 5
    });

    if (room.level >= BUNKER_LEVEL && !empireOpsPaused()) {
        let wallerCount = 0;
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

    queueCreepIfNeeded({
        room, role: 'stationaryHarvester', priority: PRIORITIES.stationaryHarvester,
        numberNeeded: room.sources.length, rebootCondition: !getCreepCount(room, 'stationaryHarvester')
    });

    if (harvesterCount) {
        const protoStorage = room.memory.protoStorage ? Game.getObjectById(room.memory.protoStorage) : undefined;
        if (room.storage || protoStorage) {
            let haulerAmount = 1;
            if (roomHasOperateExtensionOperator(room.name)) haulerAmount = 1;
            if (spareIncome < 0 || !trendOk) haulerAmount = 1;
            else if (room.level < 7) {
                haulerAmount = Math.min(haulerAmount, Math.max(1, Math.floor(spareIncome / 6)));
            }
            const priority = !getCreepCount(room, 'hauler') ? 1 : PRIORITIES.hauler;
            queueCreepIfNeeded({
                room, role: 'hauler', priority,
                numberNeeded: haulerAmount,
                rebootCondition: !getCreepCount(room, 'hauler') || !energyState
            });
        }

        for (const source of room.sources) {
            if (source.memory.link && room.memory.hubLink) continue;
            const plan = planShuttleForSource(room, source, {trend, spareIncome});
            const hasShuttle = getCreepCount(room, 'shuttle', undefined, undefined, undefined, source.id);
            const shuttlePriority = !hasShuttle ? 1 : (plan.other.haulUrgent ? PRIORITIES.hauler * 0.75 : PRIORITIES.hauler);
            queueCreepIfNeeded({
                room, role: 'shuttle', priority: shuttlePriority,
                numberNeeded: plan.count,
                rebootCondition: room.myCreeps.length < 4 || (!hasShuttle && plan.reboot),
                other: plan.other,
                assignment: source.id
            });
        }
    }

    let upgraderAmount = 1;
    if (room.controller.level === 8) {
        upgraderAmount = 1;
    } else if (energyState) {
        const container = global.resolveControllerContainer(room);
        if (container && energyState && room.controller.level < 8) {
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
    const fastTrack = (energyState > 1 && room.storage && trendOk) ||
        (earlyRush && harvesterCount && energyState >= 2);
    const priority = fastTrack ? PRIORITIES.upgrader * 0.5 : PRIORITIES.upgrader;
    queueCreepIfNeeded({
        room, role: 'upgrader', priority,
        numberNeeded: upgraderAmount, misc: {boosts: [WORK]},
        rebootCondition: !getCreepCount(room, 'upgrader') || !energyState
    });
}

module.exports = {essentialCreepQueue};