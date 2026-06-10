/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Support creeps: labTech, explorers, mineral harvester, border patrol.
 */

const spawnState = require('spawnState');
const {getFlowContext} = require('spawnFlow');
const {getCreepCount, getBodyAbilityPower} = require('spawnCounts');
const {queueCreepIfNeeded} = require('spawnQueue');

function miscCreepQueue(room) {
    if (!spawnState.throttleReady(spawnState.miscTick, room.name, 12)) return;

    if (room.storage && (room.terminal || room.factory)) {
        queueCreepIfNeeded({room, role: 'labTech', priority: PRIORITIES.miscHauler, numberNeeded: 1});
    }

    if (room.level >= MAX_LEVEL - 1 && room.level >= 4) {
        const needsDefense = _.find(MY_ROOMS, r => {
            const other = Game.rooms[r];
            const intel = INTEL[r];
            return r !== room.name && other &&
                (other.memory.dangerousAttack || intel?.requestingSupport ||
                    (other.memory.defenseCooldown || 0) > Game.time) &&
                room.routeSafe(r, 3, 999, 15);
        });
        if (needsDefense) {
            const {trendOk} = getFlowContext(room);
            queueCreepIfNeeded({
                room,
                role: 'longbowSquad',
                priority: room.energyState > 1 && room.storage && trendOk ? PRIORITIES.priority : PRIORITIES.secondary,
                numberNeeded: 2,
                destination: needsDefense,
                misc: {waitFor: 2, boosts: [RANGED_ATTACK, HEAL]},
                operation: 'guard'
            });
        }
    }

    if (room.memory.dangerousAttack) return;

    const explorerNeededCount = Game.shard.name === 'shardSeason' ? 20 : MAX_LEVEL === 8 ? 1 : 10 - room.level;
    queueCreepIfNeeded({
        colony: room,
        role: 'explorer',
        priority: PRIORITIES.medium + getCreepCount(room, 'explorer'),
        numberNeeded: explorerNeededCount
    });

    if (room.storage && room.level >= 6 && room.memory.extractorContainer && room.mineral.mineralAmount) {
        queueCreepIfNeeded({
            room, role: 'mineralHarvester', priority: PRIORITIES.mineralHarvester,
            numberNeeded: 1, misc: {boosts: [WORK]},
            other: {assignedMineral: room.mineral.id}
        });
    }

    const ap = getBodyAbilityPower(room, 'longbow');
    const longbowPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);
    const needyBorderPatrol = room.myCreeps.find(c => c.memory.operation === 'borderPatrol' && c.memory.needsMoreSquadMembers && c.memory.destination && c.memory.squadMembers);
    let needsBorderResponse = MY_ROOMS.find(r => {
        const other = Game.rooms[r];
        return other && other.memory.requestingBorderResponse && Game.map.getRoomLinearDistance(room.name, r) <= 4;
    });
    if (needsBorderResponse) {
        const responseRoom = Game.rooms[needsBorderResponse];
        needsBorderResponse = responseRoom && responseRoom.memory.requestingBorderResponse;
    }

    if (needyBorderPatrol) {
        queueCreepIfNeeded({
            room, role: 'longbow', priority: PRIORITIES.high,
            numberNeeded: needyBorderPatrol.memory.squadMembers.length + 1,
            destination: needyBorderPatrol.memory.destination, operation: 'borderPatrol'
        });
    } else if (room.memory.borderPatrol && INTEL[room.memory.borderPatrol] &&
        INTEL[room.memory.borderPatrol].hostilePower < (longbowPower * (room.energyState + 1))) {
        const borderIntel = INTEL[room.memory.borderPatrol];
        const power = borderIntel ? (borderIntel.hostilePower * 1.5) - (borderIntel.friendlyPower || 0) : 50;
        if (power > 0) {
            queueCreepIfNeeded({
                room, role: 'longbow', priority: PRIORITIES.medium,
                numberNeeded: borderIntel.hostilePower / longbowPower,
                destination: room.memory.borderPatrol, operation: 'borderPatrol', other: {power}
            });
        }
    } else if (room.energyState && needsBorderResponse && INTEL[needsBorderResponse] &&
        INTEL[needsBorderResponse].hostilePower < longbowPower) {
        const responseIntel = INTEL[needsBorderResponse];
        const power = responseIntel ? (responseIntel.hostilePower * 1.5) - (responseIntel.friendlyPower || 0) : 50;
        if (power > 0) {
            queueCreepIfNeeded({
                room, role: 'longbow', priority: PRIORITIES.secondary,
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