/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Support creeps: labTech, explorers, mineral harvester, border patrol.
 */

const spawnState = require('spawnState');
const {getFlowContext, spawnEnergyState} = require('spawnFlow');
const {getCreepCount, getBodyAbilityPower} = require('spawnCounts');
const {queueCreepIfNeeded, clearRoomRoleQueue} = require('spawnQueue');
const {roomHasStableWorkingSet} = require('bodyHelpers');

function liveExtractorContainer(room, mineralPos) {
    if (!room || !mineralPos) return null;
    let container = Game.getObjectById(room.memory && room.memory.extractorContainer);
    if (container && container.structureType === STRUCTURE_CONTAINER
        && container.pos.getRangeTo(mineralPos) === 1) {
        return container;
    }
    const containers = room.containers || [];
    for (let i = 0; i < containers.length; i++) {
        const c = containers[i];
        if (c && c.pos && c.pos.getRangeTo(mineralPos) === 1) {
            room.memory.extractorContainer = c.id;
            return c;
        }
    }
    return null;
}

function colonyIntelFresh(room) {
    const exits = Game.map.describeExits(room.name);
    for (const dir in exits) {
        const r = exits[dir];
        const intel = INTEL[r];
        // tickDetected is only stamped on hostiles. Peaceful exits never
        // have it, so lastObservation is the actual "we looked" signal.
        if (!intel || !intel.lastObservation || intel.lastObservation + CREEP_LIFE_TIME < Game.time) return false;
        if (intel.sources == null && !(global.isHighwayRoomName && isHighwayRoomName(r))
            && !(global.isSectorCenterRoomName && isSectorCenterRoomName(r))) return false;
    }
    return true;
}

let observerCoverageTick = -1;
let observerCoverage = false;

function empireHasObserver() {
    if (observerCoverageTick === Game.time) return observerCoverage;
    observerCoverageTick = Game.time;
    observerCoverage = false;
    const rooms = MY_ROOMS || [];
    for (let i = 0; i < rooms.length; i++) {
        const r = Game.rooms[rooms[i]];
        if (r && r.observer) {
            observerCoverage = true;
            break;
        }
    }
    return observerCoverage;
}

function getExplorerNeededCount(room) {
    if (!roomHasStableWorkingSet(room)) return 0;
    // Any live observer covers this job (range 10). Scouts still peek unknown exits.
    if (room.observer || empireHasObserver()) return 0;

    const rcl = (room.controller && room.controller.level) || room.level || 0;
    if (!room.storage && rcl <= 4) return 3;
    if (!room.storage || rcl <= 5) return 2;
    if (colonyIntelFresh(room)) return 1;
    return 2;
}

function findNeedyBorderPatrol(roomName) {
    const pool = (global.world && global.world.militaryCreeps) || Game.creeps;
    const list = Array.isArray(pool) ? pool : Object.values(pool);
    for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c || !c.my || !c.memory) continue;
        if (c.memory.operation !== 'borderPatrol') continue;
        if (!c.memory.needsMoreSquadMembers || !c.memory.destination) continue;
        if (c.memory.colony !== roomName) continue;
        return c;
    }
    return undefined;
}

function miscCreepQueue(room) {
    if (!spawnState.throttleReady(spawnState.miscTick, room.name, spawnState.MISC_INTERVAL)) return;
    const energyState = spawnEnergyState(room);

    const miningThorium = typeof IS_SEASON !== 'undefined' && IS_SEASON
        && room.level >= 6 && room.thorium && room.thorium.mineralAmount > 0;
    if (room.storage && (room.terminal || room.factory || miningThorium)) {
        queueCreepIfNeeded({room, role: 'labTech', priority: PRIORITIES.hauler + 1, numberNeeded: 1});
    }

    if (room.level >= MAX_LEVEL - 1 && room.level >= 4) {
        const needsDefense = _.find(MY_ROOMS, r => {
            const other = Game.rooms[r];
            const intel = INTEL[r];
            return r !== room.name && other &&
                (intel?.requestingSupport ||
                    (other.memory.defenseCooldown || 0) > Game.time) &&
                room.routeSafe(r, 3, 999, 15);
        });
        if (needsDefense) {
            const {trendOk} = getFlowContext(room);
            queueCreepIfNeeded({
                room,
                role: 'longbowSquad',
                priority: energyState > 1 && room.storage && trendOk ? PRIORITIES.priority : PRIORITIES.secondary,
                numberNeeded: 2,
                destination: needsDefense,
                misc: {waitFor: 2, boosts: [RANGED_ATTACK, HEAL]},
                operation: 'guard'
            });
        }
    }

    if (room.memory.dangerousAttack) return;

    const explorerCount = getExplorerNeededCount(room);
    if (explorerCount > 0) {
        const rcl = (room.controller && room.controller.level) || room.level || 0;
        // Season used to queue explorers at 1 and starve the RCL4–5 dump.
        const explorerPriority = (typeof IS_SEASON !== 'undefined' && IS_SEASON && rcl >= 4)
            ? PRIORITIES.remoteHarvester : PRIORITIES.medium;
        queueCreepIfNeeded({
            colony: room,
            role: 'explorer',
            priority: explorerPriority + getCreepCount(undefined, 'explorer', undefined, undefined, room),
            numberNeeded: explorerCount
        });
    }

    const rcl = (room.controller && room.controller.level) || room.level || 0;
    // Thorium is non-renewable. Mine as soon as the pad container exists —
    // harvesting onto the ground decays the ore.
    let queuedMineralHarvester = false;
    if (typeof IS_SEASON !== 'undefined' && IS_SEASON && rcl >= 6) {
        const thorium = room.thorium;
        if (thorium && thorium.mineralAmount > 0 && liveExtractorContainer(room, thorium.pos)) {
            queueCreepIfNeeded({
                room, role: 'mineralHarvester',
                priority: PRIORITIES.priority,
                numberNeeded: 1,
                misc: {boosts: [WORK]},
                assignment: thorium.id,
                other: {assignedMineral: thorium.id, thorium: true, source: thorium.id}
            });
            queuedMineralHarvester = true;
        }
    }

    if (room.storage && room.level >= 6
        && room.storage.store.getFreeCapacity() >= STORAGE_CAPACITY * 0.1) {
        const {flowStressed} = getFlowContext(room);
        if (energyState >= 1 && !flowStressed) {
            const mineral = room.mineral;
            const thoriumLeft = typeof IS_SEASON !== 'undefined' && IS_SEASON
                && room.thorium && room.thorium.mineralAmount > 0;
            // Regular minerals wait for RCL8, the extractor to leave Thorium, and a live pad.
            if (rcl >= 8 && mineral && mineral.mineralAmount && !thoriumLeft
                && liveExtractorContainer(room, mineral.pos)) {
                queueCreepIfNeeded({
                    room, role: 'mineralHarvester', priority: PRIORITIES.mineralHarvester,
                    numberNeeded: 1, misc: {boosts: [WORK]},
                    assignment: mineral.id,
                    other: {assignedMineral: mineral.id, source: mineral.id}
                });
                queuedMineralHarvester = true;
            }
        }
    }
    if (!queuedMineralHarvester) clearRoomRoleQueue(room.name, 'mineralHarvester');

    const ap = getBodyAbilityPower(room, 'longbow');
    const longbowPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);
    const needyBorderPatrol = findNeedyBorderPatrol(room.name);
    let needsBorderResponse = MY_ROOMS.find(r => {
        const other = Game.rooms[r];
        return other && other.memory.requestingBorderResponse && Game.map.getRoomLinearDistance(room.name, r) <= 4;
    });
    if (needsBorderResponse) {
        const responseRoom = Game.rooms[needsBorderResponse];
        needsBorderResponse = responseRoom && responseRoom.memory.requestingBorderResponse;
    }

    // Beat remotes (haulers, harvesters, reservers, road builders). A foothold
    // in a remote is more expensive than delayed remote staffing.
    if (needyBorderPatrol) {
        const dest = needyBorderPatrol.memory.destination;
        const live = getCreepCount(undefined, 'longbow', dest, 'borderPatrol');
        queueCreepIfNeeded({
            room, role: 'longbow', priority: PRIORITIES.borderPatrol,
            numberNeeded: Math.min(4, live + 1),
            destination: dest, operation: 'borderPatrol'
        });
    } else if (room.memory.borderPatrol && INTEL[room.memory.borderPatrol] &&
        INTEL[room.memory.borderPatrol].hostilePower < (longbowPower * (energyState + 1))) {
        const borderIntel = INTEL[room.memory.borderPatrol];
        const power = borderIntel ? (borderIntel.hostilePower * 1.5) - (borderIntel.friendlyPower || 0) : 50;
        if (power > 0) {
            queueCreepIfNeeded({
                room, role: 'longbow', priority: PRIORITIES.borderPatrol,
                numberNeeded: borderIntel.hostilePower / longbowPower,
                destination: room.memory.borderPatrol, operation: 'borderPatrol', other: {power}
            });
        }
    } else if (energyState && needsBorderResponse && INTEL[needsBorderResponse] &&
        INTEL[needsBorderResponse].hostilePower < longbowPower) {
        const responseIntel = INTEL[needsBorderResponse];
        const power = responseIntel ? (responseIntel.hostilePower * 1.5) - (responseIntel.friendlyPower || 0) : 50;
        if (power > 0) {
            queueCreepIfNeeded({
                room, role: 'longbow', priority: PRIORITIES.borderPatrol,
                numberNeeded: responseIntel.hostilePower / longbowPower,
                destination: needsBorderResponse, operation: 'borderPatrol', other: {power}
            });
        }
    } else if (room.memory.borderPatrol) {
        room.memory.requestingBorderResponse = room.memory.borderPatrol;
    } else {
        room.memory.requestingBorderResponse = undefined;
    }
}

module.exports = {miscCreepQueue};