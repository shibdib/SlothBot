/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Remote mining spawn queue and helpers.
 */

const spawnState = require('spawnState');
const {getFlowContext, spawnEnergyState} = require('spawnFlow');
const {getCreepCount, haulerCarryCapacity} = require('spawnCounts');
const {queueCreepIfNeeded, queueCreep} = require('spawnQueue');
const {routeHasBuiltRoads, countQueuedHaulersForSource} = require('bodyHelpers');
const {remoteBuildersNeeded, colonyNeedsRoadWork} = require('planRoads');
const remoteMining = require('remoteMining');

function maxRemoteHaulerCarryParts(roomLevel, onRoads) {
    const halfMove = onRoads;
    const maxNonMove = Math.floor(50 / (1 + (halfMove ? 0.5 : 1.0)));
    const work = roomLevel >= 7 ? 1 : 0;
    return maxNonMove - work;
}

function maxRemoteHarvesters(room) {
    const multiplier = room.memory.remotePenalty ? 0.5 : 99;
    if (room.level < 7) return 10 * multiplier;
    const {spareIncome} = getFlowContext(room);
    return Math.max(1, Math.min(5, Math.floor(spareIncome / 15)));
}

function shouldDeprioritizeRemotes(room) {
    const {spareIncome, flowHealthy} = getFlowContext(room);
    const energyState = spawnEnergyState(room) || 0;
    return energyState >= 3 && room.storage && flowHealthy && spareIncome >= 8;
}

function isSkRoom(roomName) {
    return !!(INTEL[roomName] && INTEL[roomName].sk)
        || (global.isSourceKeeperRoomName && global.isSourceKeeperRoomName(roomName));
}

function skMiningAllowed(room) {
    return SK_MINING && room.level >= SK_MINING_LEVEL;
}

function ensureSkIntel(roomName) {
    if (!global.isSourceKeeperRoomName || !global.isSourceKeeperRoomName(roomName)) return;
    const old = INTEL[roomName];
    if (!INTEL[roomName]) INTEL[roomName] = {name: roomName, shardName: Game.shard.name};
    if (INTEL[roomName].sk) return;
    INTEL[roomName].sk = true;
    if (global.updateIntelIndex) global.updateIntelIndex(roomName, old, INTEL[roomName]);
}

function countQueuedRole(colonyName, role, destination) {
    const queue = CREEP_QUEUES[colonyName];
    if (!queue) return 0;
    let n = 0;
    for (const key in queue) {
        const entry = queue[key];
        if (entry.role === role && entry.destination === destination) n++;
    }
    return n;
}

function hasSkAttackerCoverage(colonyName, remoteName) {
    return getCreepCount(undefined, 'SKAttacker', remoteName) > 0
        || countQueuedRole(colonyName, 'SKAttacker', remoteName) > 0;
}

function ingestColonyRemoteSources(colonyRoom, rName) {
    ensureSkIntel(rName);
    const remoteIntel = INTEL[rName];
    if (!remoteIntel || !remoteIntel.remoteSourceData) return false;
    let added = false;
    for (const sd of remoteIntel.remoteSourceData) {
        if (sd.colony !== colonyRoom.name) continue;
        if (ROOM_REMOTE_TARGETS[colonyRoom.name].find(s => s.source === sd.source)) continue;
        if (!remoteMining.getMiningRouteRecord(rName, colonyRoom.name)) continue;
        if (!remoteMining.isRemoteSourceScoreAcceptable(colonyRoom.name, rName, sd.score)) continue;
        ROOM_REMOTE_TARGETS[colonyRoom.name].push({room: rName, source: sd.source, score: sd.score});
        added = true;
    }
    return added;
}

function passesNoRoadSpawnGate(colonyRoom, sourceEntry) {
    const ratio = typeof REMOTE_NO_ROAD_SCORE_RATIO !== 'undefined' ? REMOTE_NO_ROAD_SCORE_RATIO : 0.8;
    if (sourceEntry.score <= REMOTE_DISTANCE_MAX * ratio) return true;
    if (colonyRoom.level < 7) return true;
    if (routeHasBuiltRoads(colonyRoom.name, sourceEntry.room)) return true;
    if (colonyRoom.links && colonyRoom.links.length >= 2) return true;
    return false;
}

function refreshRemoteRoomTargets(room) {
    spawnState.lastRemoteRefresh[room.name] = Game.time;
    if (!ROOM_REMOTE_TARGETS[room.name]) ROOM_REMOTE_TARGETS[room.name] = [];

    remoteMining.pruneRoomRemoteTargets(room.name, room);

    const activeRemotes = new Set();
    const probeNew = remoteMining.shouldProbeNewRemotes(room);
    const candidates = remoteMining.getCandidateRemotesForProbe(room);

    for (let i = 0; i < candidates.length; i++) {
        const rName = candidates[i];
        ensureSkIntel(rName);
        if (!remoteMining.remoteIntelEligible(room, rName)) continue;

        const hasAssignment = (ROOM_REMOTE_TARGETS[room.name] || []).some(s => s.room === rName);
        const hasLiveWork = getCreepCount(undefined, 'remoteHarvester', rName)
            || getCreepCount(undefined, 'reserver', rName)
            || countQueuedRole(room.name, 'remoteHarvester', rName);
        const hasSourceData = remoteMining.hasRemoteSourceDataForColony(room.name, rName);

        if (!hasAssignment && !hasLiveWork) {
            if (hasSourceData) {
                if (probeNew) remoteMining.probeMiningRoute(room.name, rName);
            } else {
                if (!probeNew) continue;
                const rec = remoteMining.probeMiningRoute(room.name, rName);
                if (!rec || rec.estimateScore > REMOTE_DISTANCE_MAX) continue;
            }
        } else {
            remoteMining.probeMiningRoute(room.name, rName);
        }

        remoteMining.trackRemoteRoom(rName, room);
        activeRemotes.add(rName);
        remoteMining.maybeRefreshRemoteIntel(rName);
        ingestColonyRemoteSources(room, rName);
    }

    remoteMining.pruneRoomRemoteTargets(room.name, room);
    spawnState.remoteRoomTargets[room.name] = [...activeRemotes];

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
    if (INTEL[remoteName].tickDetected + CREEP_LIFE_TIME >= Game.time && !INTEL[remoteName].sk) {
        room.memory.borderPatrol = remoteName;
    }
}

function reserverCountForRemote(room, remoteName) {
    if (room.level >= 7 || spawnEnergyState(room) < 2) return 1;
    const cap = INTEL[remoteName] && INTEL[remoteName].reserverCap;
    if (!cap || cap < 3) return cap || 1;
    return cap > 3 ? 3 : 1;
}

function handleReservation(room, remoteName) {
    if (room.level >= 4 && getCreepCount(undefined, 'remoteHarvester', remoteName) && (!INTEL[remoteName].reservationExpires || (INTEL[remoteName].reservationExpires - CREEP_LIFE_TIME) < Game.time) && !isSkRoom(remoteName)) {
        const count = reserverCountForRemote(room, remoteName);
        const reserverPriority = spawnEnergyState(room) < 2 || room.level < 7 ? PRIORITIES.reserver + 3 : PRIORITIES.reserver;
        queueCreepIfNeeded({
            room, role: 'reserver', priority: reserverPriority + getCreepCount(undefined, 'reserver', remoteName),
            numberNeeded: count, destination: remoteName
        });
    }
}

function countQueuedRemoteBuilders(colonyName) {
    const queue = CREEP_QUEUES[colonyName];
    if (!queue) return 0;
    let n = 0;
    for (const key in queue) {
        const role = queue[key].role;
        if (role === 'remoteBuilder' || role === 'roadBuilder') n++;
    }
    return n;
}

function colonyRemoteBuilderTotal(colonyName) {
    return getCreepCount(undefined, 'remoteBuilder', undefined, undefined, colonyName)
        + getCreepCount(undefined, 'roadBuilder', undefined, undefined, colonyName)
        + countQueuedRemoteBuilders(colonyName);
}

function handleRemoteBuilder(room) {
    const colony = room.name;
    const remoteTargets = ROOM_REMOTE_TARGETS[colony];
    if (!remoteTargets || !remoteTargets.length) return;
    if (!getCreepCount(undefined, 'remoteHarvester', undefined, undefined, colony)) return;
    if (!colonyNeedsRoadWork(colony)) return;
    const needed = remoteBuildersNeeded(colony);
    if (!needed || colonyRemoteBuilderTotal(colony) >= needed) return;

    const priority = shouldDeprioritizeRemotes(room)
        ? PRIORITIES.remoteBuilder * 2
        : PRIORITIES.remoteBuilder;
    queueCreep(room, priority, {
        role: 'remoteBuilder',
        destination: colony
    });
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
    scanColonyRemoteCreeps();
    const scan = colonyRemoteCreepScan[room.name] || {occupiedSources: new Set()};

    let totalHarvesters = getCreepCount(undefined, 'remoteHarvester', undefined, undefined, room.name);
    if (ROOM_REMOTE_TARGETS[room.name] && totalHarvesters < maxRemoteHarvesters(room)) {
        const remoteSource = ROOM_REMOTE_TARGETS[room.name];

        const eligible = _.filter(remoteSource, (s) => {
            if (shouldSkipRemote(room, s.room)) return false;
            if (!remoteMining.isRemoteSourceScoreAcceptable(room.name, s.room, s.score)) return false;
            if (isSkRoom(s.room) && !hasSkAttackerCoverage(room.name, s.room)) return false;
            if (!passesNoRoadSpawnGate(room, s)) return false;
            return !scan.occupiedSources.has(s.source);
        });

        let pick = null;
        let bestPickScore = Infinity;
        for (let i = 0; i < eligible.length; i++) {
            const ps = remoteMining.sourcePickScore(eligible[i]);
            if (ps < bestPickScore) {
                bestPickScore = ps;
                pick = eligible[i];
            }
        }

        if (pick && pick.room) {
            const priority = shouldDeprioritizeRemotes(room)
                ? PRIORITIES.remoteHarvester * 2
                : PRIORITIES.remoteHarvester;
            queueCreepIfNeeded({
                room, role: 'remoteHarvester', priority,
                numberNeeded: 1, destination: pick.room,
                assignment: pick.source,
                other: {source: pick.source, score: pick.score}
            });
        }
    }
}

let colonyRemoteCreepScanTick = -1;
const colonyRemoteCreepScan = {};

function scanColonyRemoteCreeps() {
    if (colonyRemoteCreepScanTick === Game.time) return;
    colonyRemoteCreepScanTick = Game.time;
    for (const key in colonyRemoteCreepScan) delete colonyRemoteCreepScan[key];
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (!c.my || !c.memory.colony) continue;
        const colony = c.memory.colony;
        if (!colonyRemoteCreepScan[colony]) {
            colonyRemoteCreepScan[colony] = {
                harvesters: [], haulersBySource: {}, occupiedSources: new Set(), liveRemoteRooms: new Set(),
            };
        }
        const bucket = colonyRemoteCreepScan[colony];
        if (c.memory.role === 'remoteHarvester') {
            if (c.memory.other && c.memory.other.source) bucket.occupiedSources.add(c.memory.other.source);
            if (c.memory.destination) bucket.liveRemoteRooms.add(c.memory.destination);
            if (c.memory.other && c.memory.other.haulingRequired) bucket.harvesters.push(c);
        } else if (c.memory.role === 'reserver' && c.memory.destination) {
            bucket.liveRemoteRooms.add(c.memory.destination);
        } else if (c.memory.role === 'remoteHauler' && c.memory.other && c.memory.other.source) {
            const sid = c.memory.other.source;
            if (!bucket.haulersBySource[sid]) bucket.haulersBySource[sid] = [];
            bucket.haulersBySource[sid].push(c);
        }
    }
    for (const colony in CREEP_QUEUES) {
        if (!colonyRemoteCreepScan[colony]) {
            colonyRemoteCreepScan[colony] = {
                harvesters: [], haulersBySource: {}, occupiedSources: new Set(), liveRemoteRooms: new Set(),
            };
        }
        addQueuedHarvesterSources(colony);
    }
}

function addQueuedHarvesterSources(colony) {
    const bucket = colonyRemoteCreepScan[colony];
    if (!bucket) return;
    const queue = CREEP_QUEUES[colony];
    if (!queue) return;
    for (const key in queue) {
        const entry = queue[key];
        if (entry.role !== 'remoteHarvester') continue;
        if (entry.assignment) bucket.occupiedSources.add(entry.assignment);
        else if (entry.other && entry.other.source) bucket.occupiedSources.add(entry.other.source);
        if (entry.destination) bucket.liveRemoteRooms.add(entry.destination);
    }
}

function handleRemoteHaulers(room) {
    scanColonyRemoteCreeps();
    const scan = colonyRemoteCreepScan[room.name];
    if (!scan) return;

    for (const harvester of scan.harvesters) {
        if (shouldSkipRemote(room, harvester.memory.destination)) continue;
        const sourceId = harvester.memory.other.source;
        const assignedHaulers = scan.haulersBySource[sourceId] || [];
        const targetCapacity = harvester.memory.other.haulingRequired;
        const onRoads = routeHasBuiltRoads(room.name, harvester.memory.destination);
        const maxCarryPerHauler = room.level < 7
            ? room.level * 2
            : maxRemoteHaulerCarryParts(room.level, onRoads);
        const destIntel = INTEL[harvester.memory.destination];
        let maxHaulers = room.memory.remotePenalty ? 1
            : destIntel && destIntel.sk ? 3 : 2;
        if (room.level >= 7 && !(destIntel && destIntel.sk)) maxHaulers = 1;
        if (shouldDeprioritizeRemotes(room)) maxHaulers = Math.min(maxHaulers, 2);
        const minCarryPerHauler = room.level >= 7 ? (onRoads ? 12 : 8) : Math.max(2, room.level * 2);
        const count = Math.min(maxHaulers, Math.max(1,
            Math.ceil(targetCapacity / (maxCarryPerHauler * CARRY_CAPACITY))));
        const queuedHaulers = countQueuedHaulersForSource(room.name, sourceId);
        if (assignedHaulers.length + queuedHaulers >= count) continue;
        const haulingCapacity = assignedHaulers.reduce((sum, creep) => sum + haulerCarryCapacity(creep), 0);
        const queuedCapacity = queuedHaulers * minCarryPerHauler * CARRY_CAPACITY;
        if (!targetCapacity || haulingCapacity + queuedCapacity >= targetCapacity) continue;
        const priority = shouldDeprioritizeRemotes(room)
            ? PRIORITIES.remoteHauler * 2
            : PRIORITIES.remoteHauler;
        queueCreep(room, priority + getCreepCount(undefined, 'remoteHauler', room.name), {
            role: 'remoteHauler',
            destination: room.name,
            other: {
                source: sourceId,
                remoteRoom: harvester.memory.destination,
                harvestAmount: targetCapacity,
                harvestRate: harvester.memory.other.harvestRate
            }
        });
    }
}

function processRemoteSpecificTasks(room, remoteName) {
    if (!remoteMining.shouldProcessRemote(room, remoteName, {
        shouldSkipRemote,
        getCreepCount,
        countQueuedRole,
    })) return;

    remoteMining.trackRemoteRoom(remoteName, room);
    if (!isSkRoom(remoteName)) handleReservation(room, remoteName);
    if (INTEL[remoteName].invaderCore) handleInvaderCore(room, remoteName);
    if (skMiningAllowed(room) && isSkRoom(remoteName) && !INTEL[remoteName].towers) {
        handleSkCreeps(room, remoteName);
    }
}

function shouldSkipRemote(room, remoteName) {
    if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) return true;
    if (!INTEL[remoteName]) return true;
    if (INTEL[remoteName].threatLevel > 1) return true;
    if (isSkRoom(remoteName) && !skMiningAllowed(room)) return true;
    if (INTEL[remoteName].level || !INTEL[remoteName].sources) return true;
    if (INTEL[remoteName].reservation && ![MY_USERNAME, "Invader"].includes(INTEL[remoteName].reservation)) return true;
    if (INTEL[remoteName].roomHeat > 250) return true;
    if (INTEL[remoteName].obstacles) return true;
    return false;
}

function handleInvaderCore(room, remoteName) {
    if (isSkRoom(remoteName) || INTEL[remoteName].obstacles) return;
    queueCreepIfNeeded({
        room, role: 'attacker', priority: PRIORITIES.remoteHarvester - 1,
        numberNeeded: 1, destination: remoteName
    });
}

function remoteCreepQueue(room) {
    if (!spawnState.throttleReady(spawnState.remoteTick, room.name, 5)) return;
    const energyState = spawnEnergyState(room);
    room.memory.borderPatrol = undefined;

    const homeIntel = INTEL[room.name];
    if (room.memory.dangerousAttack || (homeIntel && homeIntel.threatLevel > 2)) {
        spawnState.remoteRoomTargets[room.name] = undefined;
        spawnState.lastRemoteRefresh[room.name] = 0;
        return;
    }

    const since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    const forceRefresh = !!(homeIntel && homeIntel.refreshRemotes);
    const refreshDue = !spawnState.lastRemoteRefresh[room.name]
        || spawnState.lastRemoteRefresh[room.name] + CREEP_LIFE_TIME < Game.time;
    if (since > 1 && (forceRefresh || (refreshDue && remoteMining.refreshStaggerDue(room.name, forceRefresh)))) {
        refreshRemoteRoomTargets(room);
        if (homeIntel) homeIntel.refreshRemotes = undefined;
    }

    scanColonyRemoteCreeps();
    const scan = colonyRemoteCreepScan[room.name];
    const activeRemotes = remoteMining.getActiveRemoteRooms(room, shouldSkipRemote, {
        cachedRemotes: spawnState.remoteRoomTargets[room.name],
        liveRemoteRooms: scan && scan.liveRemoteRooms,
    });
    spawnState.remoteRoomTargets[room.name] = activeRemotes;

    const threat = activeRemotes.find(r => INTEL[r] && INTEL[r].threatLevel > 1);
    if (threat) handleThreatLevel(room, threat);

    for (let i = 0; i < activeRemotes.length; i++) {
        processRemoteSpecificTasks(room, activeRemotes[i]);
    }

    if (room.memory.noRemote) return;

    handleRemoteHarvesters(room);
    handleRemoteHaulers(room);
    handleRemoteBuilder(room);

    if (spawnState.contestedRemotes[room.name] && energyState) handleContestedRoom(room);
    if (spawnState.blockedRemotes[room.name] && energyState) handleBlockedRoom(room);
}

module.exports = {remoteCreepQueue};