/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Colony economy creeps: defenders, drones, wallers, harvesters, haulers, upgraders.
 */

const spawnState = require('spawnState');
const {getFlowContext, spawnEnergyState} = require('spawnFlow');
const {getCreepCount} = require('spawnCounts');
const {queueCreepIfNeeded, clearRoomRoleQueue} = require('spawnQueue');
const {empireOpsPaused} = require('hcReadiness');
const {planShuttleForSource, planUpgraderNeed} = require('bodyEconomic');
const {
    roomHasCriticalBuildSites,
    roomNeedsSpawnReboot,
    getOwnedExtensionDeficit,
    roomHasLiveTowTruck,
    isColonyEarlyRush
} = require('bodyHelpers');
const {isHubManagerSlotReady, recycleHubSlotIntruder} = require('spawnHub');
const {relocateHubObserver} = require('planCore');

const SECOND_WALLER_WORK = 30;

function roomNeedsRampartBootstrap(room) {
    const floor = typeof RAMPART_BOOTSTRAP_HITS === 'number' ? RAMPART_BOOTSTRAP_HITS : 3000;
    let work = 0;
    const ramparts = room.ramparts || [];
    for (let i = 0; i < ramparts.length; i++) {
        if (ramparts[i].hits < floor) {
            work++;
            if (work >= SECOND_WALLER_WORK) return true;
        }
    }
    const sites = room.constructionSites || [];
    for (let i = 0; i < sites.length; i++) {
        const t = sites[i].structureType;
        if (t === STRUCTURE_RAMPART || t === STRUCTURE_WALL) {
            work++;
            if (work >= SECOND_WALLER_WORK) return true;
        }
    }
    return false;
}

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
    const roadLevel = typeof ROAD_LEVEL !== 'undefined' ? ROAD_LEVEL : 4;
    const maintainOwnedRoads = !!(room.storage && room.spawns && room.spawns.length
        && (room.controller.level || room.level || 0) >= roadLevel);
    let keepRoads = null;
    if (maintainOwnedRoads) {
        try {
            keepRoads = require('planGeomRoads').getOwnedRoadKeepSet(room);
        } catch (e) { /* ignore */
        }
    }
    const hasRoadMaintenance = maintainOwnedRoads
        ? _.filter(room.structures, s => {
            if (s.structureType !== STRUCTURE_ROAD || s.hits >= s.hitsMax * 0.5) return false;
            return !keepRoads || keepRoads.has(s.pos.x + 'x' + s.pos.y);
        })
        : [];
    const harvesterCount = getCreepCount(room, 'stationaryHarvester');
    const earlyRush = isColonyEarlyRush(room);

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

    if (room.controller && room.controller.level >= BUNKER_LEVEL) {
        let barrierSites = 0;
        const sites = room.constructionSites || [];
        for (let i = 0; i < sites.length; i++) {
            const t = sites[i].structureType;
            if (t === STRUCTURE_RAMPART || t === STRUCTURE_WALL) barrierSites++;
        }
        let missingSeal = false;
        try {
            missingSeal = require('planGeomRamparts').perimeterHasMissingBuilt(room);
        } catch (e) { /* optional */
        }
        const bootstrap = roomNeedsRampartBootstrap(room) || missingSeal || barrierSites > 0;
        let wallerCount = 0;
        if (energyState >= 1 || bootstrap) wallerCount = 1;
        if (energyState >= 1 && bootstrap && (barrierSites >= 5 || missingSeal)) wallerCount = 2;
        if (energyState >= 2 && room.controller.level >= 8 && barrierSites >= 8) wallerCount = 3;
        if (room.controller.level < 7 && spareIncome < 10) {
            wallerCount = Math.min(wallerCount, spareIncome >= 4 ? 1 : (bootstrap ? 1 : 0));
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

    // Shuttles empty stationary harvesters. Until every source has one, drones haul.
    // A cheaper shuttle at priority 1 used to spawn instead of the missing harvester.
    const sources = (room.sources && room.sources.length) || 0;
    if (sources && harvesterCount >= sources) {
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
                : (plan.other.haulUrgent ? PRIORITIES.hauler * 0.75 : PRIORITIES.hauler);
            queueCreepIfNeeded({
                room, role: 'shuttle', priority: shuttlePriority,
                numberNeeded: plan.count,
                rebootCondition: spawnReboot || room.myCreeps.length < 4 || plan.reboot,
                other: plan.other,
                assignment: source.id
            });
        }
    } else {
        clearRoomRoleQueue(room.name, 'shuttle');
    }

    let upgraderAmount = 1;
    // Drones already dump leftover energy into the controller below RCL 4.
    // A dedicated upgrader during an extension deficit starves the builders.
    if (earlyRush && (room.controller.level < 3 || extensionDeficit > 0)) {
        upgraderAmount = 0;
    } else if (room.controller.level === 8) {
        upgraderAmount = 1;
    } else {
        const need = planUpgraderNeed(room, {spareIncome, trend: (energyInfo && energyInfo.trend) || 0});
        if (energyState) upgraderAmount = need.count;
        // Live body is a reboot leftover. Allow one overlap so a full-size
        // replacement can spawn; the small one retires once energy is ready.
        const stored = (room.rawEnergy || 0) > 1000;
        if (need.maxWork >= 8 && (energyState >= 1 || stored)) {
            const live = room.myCreeps || [];
            let bestWork = 0;
            let liveCount = 0;
            for (let i = 0; i < live.length; i++) {
                const c = live[i];
                if (!c || !c.memory || c.memory.role !== 'upgrader' || c.memory.recycling) continue;
                liveCount++;
                const w = c.getActiveBodyparts(WORK);
                if (w > bestWork) bestWork = w;
            }
            if (liveCount && bestWork < need.maxWork * 0.5) {
                upgraderAmount = Math.max(upgraderAmount, Math.min(liveCount + 1, 2));
            }
        }
    }
    if (upgraderAmount > 0) {
        const fastTrack = (room.controller.level < 8) ||
            (energyState > 1 && room.storage && trendOk) ||
            (earlyRush && harvesterCount && energyState >= 2);
        const priority = fastTrack ? PRIORITIES.upgrader * 0.5 : PRIORITIES.upgrader;
        queueCreepIfNeeded({
            room, role: 'upgrader', priority,
            numberNeeded: upgraderAmount, misc: {boosts: [WORK]},
            // Do not reboot-cap just because the slot is empty. That turned a
            // 100k RCL5 room into a 1W/4C egg (300 energy) every replacement.
            rebootCondition: spawnReboot
        });
    }
}

module.exports = {essentialCreepQueue};