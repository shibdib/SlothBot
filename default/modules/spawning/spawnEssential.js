/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Colony economy creeps: defenders, drones, wallers, harvesters, haulers, upgraders.
 */

const spawnState = require('spawnState');
const {getFlowContext, roomHasOperateExtensionOperator} = require('spawnFlow');
const {getCreepCount} = require('spawnCounts');
const {queueCreepIfNeeded} = require('spawnQueue');

function essentialCreepQueue(room) {
    if (!spawnState.throttleReady(spawnState.essentialTick, room.name, 10)) return;

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

    const {energyInfo, trendOk, flowHealthy, spareIncome} = getFlowContext(room);
    const importantBuilds = _.some(room.constructionSites, s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    const harvesterCount = getCreepCount(room, 'stationaryHarvester');
    const earlyRush = !room.storage && room.level < 5;

    let droneCount;
    let dronePriority = PRIORITIES.drone;
    if (earlyRush) {
        if (!harvesterCount) droneCount = 1;
        else droneCount = importantBuilds ? Math.min(9 - room.level, 3) : 1;
        dronePriority = 1;
    } else if (importantBuilds && trendOk && room.energyState) {
        droneCount = (9 - room.level) + room.energyState;
    } else if (room.constructionSites.length && room.energyState) {
        droneCount = 2;
    } else if (!room.storage) {
        droneCount = importantBuilds ? (9 - room.level) + room.energyState : 1;
    } else {
        droneCount = 1;
    }

    if (droneCount > 1) {
        const droneBudget = earlyRush ? 6 : 8;
        if (!flowHealthy || spareIncome < droneBudget) droneCount = 1;
        else droneCount = Math.max(1, Math.min(droneCount, Math.floor(spareIncome / droneBudget)));
    }

    queueCreepIfNeeded({
        room, role: 'drone', priority: dronePriority + getCreepCount(room, 'drone'),
        numberNeeded: droneCount, rebootCondition: room.friendlyCreeps.length < 5
    });

    if (room.level >= BUNKER_LEVEL) {
        let wallerCount = 0;
        if (room.energyState >= 2 && flowHealthy && spareIncome >= 8) {
            wallerCount = room.energyState >= 3 && room.level >= 8 ? 2 : 1;
            wallerCount = Math.max(1, Math.min(wallerCount, Math.floor(spareIncome / 10)));
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
        numberNeeded: room.sources.length, rebootCondition: !harvesterCount
    });

    if (harvesterCount) {
        const protoStorage = room.memory.protoStorage ? Game.getObjectById(room.memory.protoStorage) : undefined;
        if (room.storage || protoStorage) {
            let haulerAmount = room.level >= 4 ? 2 : 1;
            if (roomHasOperateExtensionOperator(room.name)) haulerAmount = 1;
            if (spareIncome < 0 || !trendOk) haulerAmount = 1;
            else haulerAmount = Math.min(haulerAmount, Math.max(1, Math.floor(spareIncome / 6)));
            const priority = !getCreepCount(room, 'hauler') ? 1 : PRIORITIES.hauler;
            queueCreepIfNeeded({
                room, role: 'hauler', priority,
                numberNeeded: haulerAmount,
                rebootCondition: !getCreepCount(room, 'hauler') || !room.energyState
            });
        }

        for (const source of room.sources) {
            if (source.memory.link && room.memory.hubLink) continue;
            const priority = !getCreepCount(room, 'shuttle') ? 1 : PRIORITIES.hauler;
            let number = room.level >= 5 ? 1 : 2;
            if (spareIncome < 0 || !trendOk) number = 1;
            else number = Math.min(number, Math.max(1, Math.floor(spareIncome / 8)));
            queueCreepIfNeeded({
                room, role: 'shuttle', priority: priority,
                numberNeeded: number,
                rebootCondition: room.myCreeps.length < 4 || !getCreepCount(room, 'shuttle') || !room.energyState,
                other: {distanceToHub: source.memory.distanceToHub || 25},
                assignment: source.id
            });
        }
    }

    let upgraderAmount = 1;
    if (room.controller.level < 8 && room.energyState) {
        let container = Game.getObjectById(room.memory.controllerContainer);
        if (container && room.energyState && room.controller.level < 8) {
            const trend = (energyInfo && energyInfo.trend) || 0;
            const effectiveIncome = Math.min(spareIncome, spareIncome + trend * 50);
            upgraderAmount = Math.max(1, Math.min(
                Math.floor(effectiveIncome / 12),
                container.pos.countOpenTerrainAround()
            ));
        }
        if (room.level >= 7) upgraderAmount = Math.min(upgraderAmount, 2);
        if (earlyRush && harvesterCount && room.energyState >= 2 && (energyInfo && (energyInfo.trend || 0) >= 0)) {
            upgraderAmount = Math.max(upgraderAmount, 2);
        }
    }
    const fastTrack = (room.energyState > 1 && room.storage && trendOk) ||
        (earlyRush && harvesterCount && room.energyState >= 2);
    const priority = fastTrack ? PRIORITIES.upgrader * 0.5 : PRIORITIES.upgrader;
    queueCreepIfNeeded({
        room, role: 'upgrader', priority,
        numberNeeded: upgraderAmount, misc: {boosts: [WORK]},
        rebootCondition: !getCreepCount(room, 'upgrader') || !room.energyState
    });
}

module.exports = {essentialCreepQueue};