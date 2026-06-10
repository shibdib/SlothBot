/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Remote mining spawn queue and helpers.
 */

const spawnState = require('spawnState');
const {getCreepCount} = require('spawnCounts');
const {queueCreepIfNeeded, queueCreep} = require('spawnQueue');

function ingestColonyRemoteSources(colonyRoom, rName) {
    const remoteIntel = INTEL[rName];
    if (!remoteIntel || !remoteIntel.remoteSourceData) return false;
    let added = false;
    for (const sd of remoteIntel.remoteSourceData) {
        if (sd.colony === colonyRoom.name && !ROOM_REMOTE_TARGETS[colonyRoom.name].find(s => s.source === sd.source)) {
            ROOM_REMOTE_TARGETS[colonyRoom.name].push({room: rName, source: sd.source, score: sd.score});
            added = true;
        }
    }
    return added;
}

function refreshRemoteRoomTargets(room) {
    spawnState.lastRemoteRefresh[room.name] = Game.time;
    spawnState.remoteRoomTargets[room.name] = undefined;

    const surroundingRooms = getSurroundingRooms(room.name);
    let remoteTargets = surroundingRooms.filter(r =>
        r !== room.name &&
        roomStatus(r) === roomStatus(room.name) &&
        INTEL[r] && INTEL[r].sources && !INTEL[r].owner && !INTEL[r].obstacles &&
        (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || INTEL[r].reservation === 'Invader') &&
        spawnState.routeLength(room.name, r) <= 2
    );

    for (const rooms of surroundingRooms) {
        if (roomStatus(rooms) === roomStatus(room.name)) {
            const surroundingRoomsTwo = getSurroundingRooms(rooms);
            const remoteRooms = surroundingRoomsTwo.filter(r =>
                r !== room.name &&
                roomStatus(r) === roomStatus(room.name) &&
                INTEL[r] && INTEL[r].sources && !INTEL[r].owner && !INTEL[r].obstacles &&
                (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || INTEL[r].reservation === 'Invader') &&
                spawnState.routeLength(room.name, r) <= 2
            );
            remoteTargets = remoteTargets.concat(remoteRooms);
        }
    }

    spawnState.remoteRoomTargets[room.name] = _.uniq(remoteTargets);

    if (!ROOM_REMOTE_TARGETS[room.name]) ROOM_REMOTE_TARGETS[room.name] = [];

    // Drop entries whose room is no longer a valid remote target
    const validRemotes = new Set(spawnState.remoteRoomTargets[room.name]);
    ROOM_REMOTE_TARGETS[room.name] = ROOM_REMOTE_TARGETS[room.name].filter(s => validRemotes.has(s.room));

    const registeredRooms = new Set(ROOM_REMOTE_TARGETS[room.name].map(s => s.room));
    for (const r of spawnState.remoteRoomTargets[room.name]) {
        const rName = r.name || r;

        trackRemoteRoom(rName, room);

        if (registeredRooms.has(rName)) {
            if (Game.rooms[rName]) Game.rooms[rName].cacheRoomIntel();
            continue;
        }

        if (ingestColonyRemoteSources(room, rName)) continue;

        if (Game.rooms[rName]) {
            Game.rooms[rName].cacheRoomIntel();
            if (ingestColonyRemoteSources(room, rName)) continue;
        }

        const harvesterEnRoute = _.find(Game.creeps, c => c.my && c.memory.role === 'remoteHarvester' && c.memory.destination === rName);
        if (!harvesterEnRoute && getCreepCount(undefined, 'explorer', undefined, undefined, room) < 2) {
            queueCreepIfNeeded({
                room, role: 'explorer', priority: PRIORITIES.secondary,
                numberNeeded: 1, destination: rName
            });
        }
    }

    const exits = Game.map.describeExits(room.name);
    const contestedRemote = _.find(exits, r =>
        roomStatus(r) === roomStatus(room.name) && INTEL[r] && !INTEL[r].sk && !INTEL[r].safemode && !INTEL[r].towers &&
        INTEL[r].sources && !INTEL[r].obstacles && INTEL[r].user && INTEL[r].user !== 'Invader' && !_.includes(FRIENDLIES, INTEL[r].user) &&
        (INTEL[r].lastContest || 0) + (CREEP_LIFE_TIME * 4) < Game.time
    );
    if (contestedRemote) {
        if (spawnState.contestedRemotes[room.name] && spawnState.contestedRemotes[room.name] !== contestedRemote) {
            INTEL[contestedRemote].contestingCount = 0;
            INTEL[spawnState.contestedRemotes[room.name]].lastContest = Game.time;
        }
        spawnState.contestedRemotes[room.name] = contestedRemote;
    }

    const blockedRemote = _.find(exits, r =>
        roomStatus(r) === roomStatus(room.name) && INTEL[r] && !INTEL[r].sk && INTEL[r].sources && !INTEL[r].level && INTEL[r].obstacles && !INTEL[r].owner
    );
    if (blockedRemote) spawnState.blockedRemotes[room.name] = blockedRemote;
}

function handleContestedRoom(room) {
    const remoteName = spawnState.contestedRemotes[room.name];
    const intel = INTEL[remoteName];
    if (!intel) return;
    if ((intel.contestingCount || 0) > room.level * 2) {
        log.a(`${roomLink(room.name)} is no longer contesting ${roomLink(spawnState.contestedRemotes[room.name])} due to casualties.`, "LOCAL COMMAND:");
        INTEL[spawnState.contestedRemotes[room.name]].lastContest = Game.time;
        INTEL[spawnState.contestedRemotes[room.name]].contestingCount = 0;
        return spawnState.contestedRemotes[room.name] = undefined;
    }
    if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) {
        if (queueCreepIfNeeded({
            room, role: 'longbowSquad', priority: PRIORITIES.remoteHarvester + 1,
            numberNeeded: 4, destination: spawnState.contestedRemotes[room.name], misc: {waitFor: 4}
        })) {
            if (!intel.contestingCount) INTEL[spawnState.contestedRemotes[room.name]].contestingCount = 1;
            else INTEL[spawnState.contestedRemotes[room.name]].contestingCount++;
        }
    } else {
        if (queueCreepIfNeeded({
            room, role: 'longbow', priority: PRIORITIES.remoteHarvester + 1,
            numberNeeded: 1, destination: spawnState.contestedRemotes[room.name]
        })) {
            if (!intel.contestingCount) INTEL[spawnState.contestedRemotes[room.name]].contestingCount = 1;
            else INTEL[spawnState.contestedRemotes[room.name]].contestingCount++;
        }
    }
    if (!intel.armedHostile || intel.armedHostile + CREEP_LIFE_TIME < Game.time) {
        handleReservation(room, spawnState.contestedRemotes[room.name]);
    }
}

function handleBlockedRoom(room) {
    const intel = INTEL[spawnState.blockedRemotes[room.name]];
    if (intel && (!intel.armedHostile || intel.armedHostile + CREEP_LIFE_TIME < Game.time)) {
        if (intel.claimClear && Game.gcl.level > MY_ROOMS.length) {
            queueCreepIfNeeded({
                room, role: 'claimer', priority: PRIORITIES.secondary,
                numberNeeded: 1, destination: spawnState.blockedRemotes[room.name], operation: 'claimClear'
            });
        } else {
            queueCreepIfNeeded({
                room, role: 'cleaner', priority: PRIORITIES.secondary,
                numberNeeded: 2, destination: spawnState.blockedRemotes[room.name]
            });
        }
    }
}

function handleThreatLevel(room, remoteName) {
    if (INTEL[remoteName].tickDetected + CREEP_LIFE_TIME < Game.time) {
        queueCreepIfNeeded({
            room, role: 'explorer', priority: PRIORITIES.secondary,
            numberNeeded: 1, destination: remoteName
        });
    } else if (!INTEL[remoteName].sk) {
        room.memory.borderPatrol = remoteName;
    }
}

function handleReservation(room, remoteName) {
    if (room.level >= 4 && getCreepCount(undefined, 'remoteHarvester', remoteName) && (!INTEL[remoteName].reservationExpires || (INTEL[remoteName].reservationExpires - CREEP_LIFE_TIME) < Game.time) && !INTEL[remoteName].sk) {
        const count = room.energyState < 2 || room.level >= 7 ? 1 : INTEL[remoteName].reserverCap && INTEL[remoteName].reserverCap < 3 ? INTEL[remoteName].reserverCap : INTEL[remoteName].reserverCap && INTEL[remoteName].reserverCap > 3 ? 3 : 1;
        const reserverPriority = room.energyState < 2 || room.level < 7 ? PRIORITIES.reserver + 3 : PRIORITIES.reserver;
        queueCreepIfNeeded({
            room, role: 'reserver', priority: reserverPriority + getCreepCount(undefined, 'reserver', remoteName),
            numberNeeded: count, destination: remoteName
        });
    }
}

function handleRoadBuilder(room) {
    if (getCreepCount(room, 'remoteHarvester')) {
        queueCreepIfNeeded({
            room, role: 'roadBuilder', priority: PRIORITIES.roadBuilder,
            numberNeeded: getCreepCount(room, 'remoteHarvester') * 0.2
        });
    }
}

function handleSkCreeps(room, remoteName) {
    queueCreepIfNeeded({
        room,
        role: 'SKAttacker',
        priority: PRIORITIES.remoteHarvester + getCreepCount(undefined, 'remoteHarvester', undefined, undefined, room),
        numberNeeded: 1,
        destination: remoteName
    });
    queueCreepIfNeeded({
        room, role: 'commodityMiner', priority: PRIORITIES.roadBuilder,
        numberNeeded: 1, destination: remoteName
    });
}

function handleRemoteHarvesters(room) {
    let totalHarvesters = getCreepCount(undefined, 'remoteHarvester', undefined, undefined, room.name);
    const multiplier = room.memory.remotePenalty ? 0.5 : 99;
    if (ROOM_REMOTE_TARGETS[room.name] && totalHarvesters < 10 * multiplier) {
        let remoteSource = ROOM_REMOTE_TARGETS[room.name];
        const acceptedScore = REMOTE_DISTANCE_MAX;

        const occupiedSources = new Set();
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (c.my && c.memory.role === 'remoteHarvester' && c.memory.other && c.memory.other.source) {
                occupiedSources.add(c.memory.other.source);
            }
        }

        const validRemoteRooms = spawnState.remoteRoomTargets[room.name] ? new Set(spawnState.remoteRoomTargets[room.name]) : null;
        remoteSource = _.min(_.filter(remoteSource, (s) => {
            if (validRemoteRooms && !validRemoteRooms.has(s.room)) return false;
            if (shouldSkipRemote(room, s.room) || s.score > acceptedScore) return false;
            if (INTEL[s.room].sk && !getCreepCount(undefined, 'SKAttacker', s.room)) return false;
            return !occupiedSources.has(s.source);
        }), 'score');

        if (remoteSource && remoteSource.room) {
            // Deprioritize remote spawn only when both stock and flow are healthy. A stockpiled
            // room with negative trend needs the income â€” keep remote priority high.
            const rhEnergyInfo = room.memory.energyInfo;
            const rhTrendOk = !rhEnergyInfo || (rhEnergyInfo.trend || 0) >= -3;
            const priority = room.energyState > 1 && room.storage && rhTrendOk ? PRIORITIES.remoteHarvester * 2 : PRIORITIES.remoteHarvester;
            queueCreepIfNeeded({
                room, role: 'remoteHarvester', priority,
                numberNeeded: 1, destination: remoteSource.room,
                assignment: remoteSource.source,
                other: {source: remoteSource.source, score: remoteSource.score}
            });
        }
    }
}

function handleRemoteHaulers(room) {
    const roomHarvesters = [];
    const haulersBySource = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my) continue;
        if (c.memory.role === 'remoteHarvester' && c.memory.colony === room.name && c.memory.other && c.memory.other.haulingRequired) {
            roomHarvesters.push(c);
        } else if (c.memory.role === 'remoteHauler' && c.memory.colony === room.name && c.memory.other && c.memory.other.source) {
            const sid = c.memory.other.source;
            if (!haulersBySource[sid]) haulersBySource[sid] = [];
            haulersBySource[sid].push(c);
        }
    }
    for (const harvester of roomHarvesters) {
        if (shouldSkipRemote(room, harvester.memory.destination)) continue;
        const sourceId = harvester.memory.other.source;
        const assignedHaulers = haulersBySource[sourceId] || [];
        const targetCapacity = harvester.memory.other.haulingRequired;
        const maxCarryPerHauler = room.level < 7 ? room.level * 2 : 32;
        const maxHaulers = room.memory.remotePenalty ? 1
            : INTEL[harvester.memory.destination] && INTEL[harvester.memory.destination].sk ? 4 : 3;
        const count = Math.min(maxHaulers, Math.max(1, Math.ceil(targetCapacity / (maxCarryPerHauler * CARRY_CAPACITY))));
        if (assignedHaulers.length >= count) continue;
        const haulingCapacity = assignedHaulers.reduce((sum, creep) => sum + creep.getActiveBodyparts(CARRY) * 50, 0);
        if (targetCapacity && haulingCapacity < targetCapacity) {
            // Same flow check as remoteHarvester â€” don't deprioritize haulers if trend is bad.
            const rhlEnergyInfo = room.memory.energyInfo;
            const rhlTrendOk = !rhlEnergyInfo || (rhlEnergyInfo.trend || 0) >= -3;
            const priority = room.energyState > 1 && room.storage && rhlTrendOk ? PRIORITIES.remoteHauler * 2 : PRIORITIES.remoteHauler;
            queueCreep(room, priority + getCreepCount(undefined, 'remoteHauler', room.name), {
                role: 'remoteHauler',
                destination: room.name,
                other: {
                    source: sourceId,
                    remoteRoom: harvester.memory.destination,
                    harvestAmount: targetCapacity
                }
            });
        }
    }
}

function processRemoteSpecificTasks(room, remoteName) {
    if (shouldSkipRemote(room, remoteName)) return;
    trackRemoteRoom(remoteName, room);
    if (!INTEL[remoteName].sk) handleReservation(room, remoteName);
    if (INTEL[remoteName].invaderCore) handleInvaderCore(room, remoteName);
    handleRoadBuilder(room);
    if (SK_MINING && INTEL[remoteName].sk && !INTEL[remoteName].towers && room.level >= SK_MINING_LEVEL) {
        spawnState.activeSkMining[room.name] = Game.time;
        handleSkCreeps(room, remoteName);
    }
}

function trackRemoteRoom(remoteName, room) {
    if (!INTEL[remoteName].remoteRoom || INTEL[remoteName].remoteRoom.indexOf(room.name) === -1) {
        if (!INTEL[remoteName].remoteRoom) INTEL[remoteName].remoteRoom = [];
        INTEL[remoteName].remoteRoom.push(room.name);
    }
}

function shouldSkipRemote(room, remoteName) {
    if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) return true;
    if (!INTEL[remoteName]) return true;
    if (INTEL[remoteName].threatLevel > 1) return true;
    if (INTEL[remoteName].sk && (room.level < SK_MINING_LEVEL || !SK_MINING)) return true;
    if (INTEL[remoteName].level || !INTEL[remoteName].sources) return true;
    if (INTEL[remoteName].reservation && ![MY_USERNAME, "Invader"].includes(INTEL[remoteName].reservation)) return true;
    if (INTEL[remoteName].roomHeat > 250) return true;
    if (INTEL[remoteName].obstacles) return true;
    return false;
}

function handleInvaderCore(room, remoteName) {
    if (INTEL[remoteName].sk || INTEL[remoteName].obstacles) return;
    queueCreepIfNeeded({
        room, role: 'attacker', priority: PRIORITIES.remoteHarvester - 1,
        numberNeeded: 1, destination: remoteName
    });
}

function remoteCreepQueue(room) {
    if (!spawnState.throttleReady(spawnState.remoteTick, room.name, 5)) return;
    room.memory.borderPatrol = undefined;

    const homeIntel = INTEL[room.name];
    if (room.memory.dangerousAttack || (homeIntel && homeIntel.threatLevel > 2)) {
        spawnState.remoteRoomTargets[room.name] = undefined;
        spawnState.lastRemoteRefresh[room.name] = 0;
        return;
    }

    const since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    if (since > 1 && (!spawnState.remoteRoomTargets[room.name] || spawnState.lastRemoteRefresh[room.name] + CREEP_LIFE_TIME < Game.time ||
        (homeIntel && homeIntel.refreshRemotes))) {
        refreshRemoteRoomTargets(room);
        if (homeIntel) homeIntel.refreshRemotes = undefined;
    }

    const threat = spawnState.remoteRoomTargets[room.name]?.find(r => INTEL[r] && INTEL[r].threatLevel > 1);
    if (threat) handleThreatLevel(room, threat);

    if (spawnState.remoteRoomTargets[room.name]) {
        spawnState.remoteRoomTargets[room.name].forEach(remoteName => processRemoteSpecificTasks(room, remoteName));
    }

    if (room.memory.noRemote) return;

    const rEnergyInfo = room.memory.energyInfo;
    const rTrendOk = !rEnergyInfo || (rEnergyInfo.trend || 0) >= -3;
    if (room.energyState < 3 || room.level < 8 || !rTrendOk) {
        handleRemoteHarvesters(room);
        handleRemoteHaulers(room);
    }

    if (spawnState.contestedRemotes[room.name] && room.energyState) handleContestedRoom(room);
    if (spawnState.blockedRemotes[room.name] && room.energyState) handleBlockedRoom(room);
}

module.exports = {remoteCreepQueue};
