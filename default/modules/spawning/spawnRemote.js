/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Remote mining spawn queue and helpers.
 */

const spawnState = require('spawnState');
const {getFlowContext, spawnEnergyState} = require('spawnFlow');
const {getCreepCount, creepExpiringSoon, haulerCarryCapacity} = require('spawnCounts');
const {queueCreepIfNeeded, queueCreep} = require('spawnQueue');
const {
    routeHasBuiltRoads,
    countQueuedHaulersForSource,
    roomNeedsSpawnReboot,
    getOwnedExtensionDeficit
} = require('bodyHelpers');
const {remoteBuildersNeeded, colonyNeedsRoadWork} = require('planGeomRoads');
const remoteMining = require('remoteMining');

function maxRemoteHaulerCarryParts(roomLevel, onRoads) {
    const halfMove = onRoads;
    const maxNonMove = Math.floor(50 / (1 + (halfMove ? 0.5 : 1.0)));
    const work = roomLevel >= 7 ? 1 : 0;
    return maxNonMove - work;
}

function maxRemoteHarvesters(room) {
    if (room.memory.remotePenalty) {
        return room.level < 7 ? 5 : 1;
    }
    if (room.level < 7) return 10;
    const {spareIncome, flowStressed} = getFlowContext(room);
    const assigned = (ROOM_REMOTE_TARGETS[room.name] || []).length;
    const fromSpare = Math.max(0, Math.floor(spareIncome / 15));
    const hasCenter = (ROOM_REMOTE_TARGETS[room.name] || []).some(s => remoteMining.isSectorCenterRoomName(s.room));
    // RCL7+ can hold 4 rooms × 2 sources (or SK + center). Cap 5 left assigned
    // sources idle while the room was still net-negative.
    const assignedFloor = hasCenter ? Math.min(assigned, 7) : Math.min(assigned, 4);
    const cap = 8;
    const energyState = spawnEnergyState(room) || 0;
    // Below surplus (or already bleeding) staff every assigned source so harvest can recover.
    const needIncome = energyState < 3 || flowStressed || spareIncome < 0;
    const incomeFloor = needIncome ? Math.min(assigned, cap) : assignedFloor;
    return Math.max(1, Math.min(cap, Math.max(fromSpare, incomeFloor)));
}

function shouldDeprioritizeRemotes(room) {
    const {spareIncome, flowHealthy} = getFlowContext(room);
    const energyState = spawnEnergyState(room) || 0;
    return energyState >= 3 && room.storage && flowHealthy && spareIncome >= 8;
}

function isSkRoom(roomName) {
    return remoteMining.isSkRoomName(roomName);
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

function countQueuedHarvesters(colonyName) {
    const queue = CREEP_QUEUES[colonyName];
    if (!queue) return 0;
    let n = 0;
    for (const key in queue) {
        if (queue[key] && queue[key].role === 'remoteHarvester') n++;
    }
    return n;
}

function queuedHarvesterForSource(colonyName, sourceId) {
    if (!sourceId) return false;
    const queue = CREEP_QUEUES[colonyName];
    if (!queue) return false;
    for (const key in queue) {
        const entry = queue[key];
        if (!entry || entry.role !== 'remoteHarvester') continue;
        if (entry.assignment === sourceId) return true;
        if (entry.other && entry.other.source === sourceId) return true;
    }
    return false;
}

function sourceNeedsHarvester(colonyName, sourceId, destRoom) {
    if (queuedHarvesterForSource(colonyName, sourceId)) return false;
    const live = getCreepCount(undefined, 'remoteHarvester', destRoom, undefined, undefined, sourceId);
    if (live > 1) return false;
    if (live === 1) return creepExpiringSoon(undefined, 'remoteHarvester', destRoom, undefined, colonyName, sourceId);
    return true;
}

function haulerExpiringSoon(creep, remoteRoom) {
    if (!creep || creep.spawning) return false;
    const ttl = creep.ticksToLive;
    if (!ttl || ttl === Infinity) return false;
    const origin = creep.memory.colony;
    let hops = (origin && remoteRoom) ? Game.map.getRoomLinearDistance(origin, remoteRoom) : 0;
    if (origin && remoteRoom) {
        const route = remoteMining.getMiningRouteRooms(origin, remoteRoom);
        if (route && route.length) hops = Math.max(hops, route.length);
    }
    const spawnTime = 3 * ((creep.body && creep.body.length) || 0);
    return ttl <= spawnTime + (hops + 1) * 50;
}

function maxHaulersForSource(room, dest, keeperYield) {
    if (room.memory.remotePenalty) return 1;
    if (keeperYield) {
        // Center is colony → SK → center (2 hops) at 4000-energy sources.
        return remoteMining.isSectorCenterRoomName(dest) ? 6 : 4;
    }
    return 2;
}

function hasSkAttackerCoverage(remoteName) {
    return remoteMining.hasLiveSkAttacker(remoteName);
}

function skTowersOrCombatBlock(remoteName) {
    return remoteMining.skCombatBlocksMining(remoteName);
}

function queuedSkRoom(entry) {
    if (!entry) return undefined;
    if (entry.other && entry.other.skRoom) return entry.other.skRoom;
    if (entry.other && entry.other.remoteRoom) return entry.other.remoteRoom;
    return entry.destination;
}

/** Pick up an SK room that shares an exit, even if a diagonal SK is already assigned. */
function ingestAdjacentSkRooms(room) {
    if (!skMiningAllowed(room)) return;
    const exits = Game.map.describeExits(room.name);
    if (!exits) return;
    for (const neighbor of Object.values(exits)) {
        if (!isSkRoom(neighbor)) continue;
        if (!remoteMining.isAllowedSkRoom(room.name, neighbor)) continue;
        if (remoteMining.isRemoteClaimedByOther(room.name, neighbor)) continue;
        if (skTowersOrCombatBlock(neighbor)) continue;
        ensureSkIntel(neighbor);
        remoteMining.probeMiningRoute(room.name, neighbor, {allowLive: true});
        ingestColonyRemoteSources(room, neighbor);
    }
}

function purgeUnguardedSkQueue(room) {
    const queue = CREEP_QUEUES[room.name];
    if (!queue) return;
    const assignedSk = remoteMining.getColonySkRooms(room.name);
    for (const key in queue) {
        const entry = queue[key];
        if (!entry) continue;
        const dest = queuedSkRoom(entry);
        if (!dest) continue;
        const guard = remoteMining.skGuardRoom(room.name, dest) || (isSkRoom(dest) ? dest : null);
        if (!guard || !isSkRoom(guard)) continue;
        if (assignedSk.length && assignedSk.indexOf(guard) === -1) {
            delete queue[key];
            continue;
        }
        if (entry.role === 'SKAttacker') continue;
        if (!remoteMining.SK_GUARD_DEPENDENT_ROLES.has(entry.role)) continue;
        if (hasSkAttackerCoverage(guard)) continue;
        delete queue[key];
    }
}

function ingestColonyRemoteSources(colonyRoom, rName) {
    ensureSkIntel(rName);
    if (isSkRoom(rName) && !remoteMining.isAllowedSkRoom(colonyRoom.name, rName)) return false;
    const remoteIntel = INTEL[rName];
    if (!remoteIntel || !remoteIntel.remoteSourceData) return false;

    const rec = remoteMining.getMiningRouteRecord(rName, colonyRoom.name);
    if (!rec) return false;

    // Do not steal a remote another colony is actively mining.
    if (remoteMining.isRemoteClaimedByOther(colonyRoom.name, rName)) return false;

    if (!ROOM_REMOTE_TARGETS[colonyRoom.name]) ROOM_REMOTE_TARGETS[colonyRoom.name] = [];
    const targets = ROOM_REMOTE_TARGETS[colonyRoom.name];

    let added = false;
    let claimed = false;
    for (const sd of remoteIntel.remoteSourceData) {
        if (targets.find(s => s.source === sd.source)) {
            // Already have it — still ensure exclusive ownership if we hold targets.
            claimed = true;
            continue;
        }

        // Prefer stored score when this colony owns the assignment; otherwise use route estimate
        // so a nearby colony can reclaim sticky remoteSourceData from an idle assignee.
        let score = sd.colony === colonyRoom.name ? sd.score : rec.estimateScore;
        if (!remoteMining.isRemoteSourceScoreAcceptable(colonyRoom.name, rName, score, {allowMissingEstimate: true})) {
            if (score === rec.estimateScore) continue;
            score = rec.estimateScore;
            if (!remoteMining.isRemoteSourceScoreAcceptable(colonyRoom.name, rName, score, {allowMissingEstimate: true})) {
                continue;
            }
        }

        if (sd.colony !== colonyRoom.name) {
            sd.colony = colonyRoom.name;
            sd.score = score;
        }

        targets.push({room: rName, source: sd.source, score});
        added = true;
        claimed = true;
    }

    if (claimed) {
        remoteMining.claimRemoteForColony(colonyRoom.name, rName);
    }
    return added;
}

/**
 * High-score remotes without roads are blocked at RCL7+, but allow a single bootstrap
 * harvester so roads/builders can start (otherwise chicken-and-egg with remoteBuilder).
 */
function passesNoRoadSpawnGate(colonyRoom, sourceEntry) {
    const ratio = typeof REMOTE_NO_ROAD_SCORE_RATIO !== 'undefined' ? REMOTE_NO_ROAD_SCORE_RATIO : 0.8;
    if (sourceEntry.score <= REMOTE_DISTANCE_MAX * ratio) return true;
    if (colonyRoom.level < 7) return true;
    if (routeHasBuiltRoads(colonyRoom.name, sourceEntry.room)) return true;
    if (colonyRoom.links && colonyRoom.links.length >= 2) return true;
    // Replacement of the existing bootstrap harvester must still pass.
    if (getCreepCount(undefined, 'remoteHarvester', sourceEntry.room, undefined, undefined, sourceEntry.source) === 1) {
        return true;
    }
    const liveOrQueued = getCreepCount(undefined, 'remoteHarvester', sourceEntry.room)
        || countQueuedRole(colonyRoom.name, 'remoteHarvester', sourceEntry.room);
    return !liveOrQueued;
}

/**
 * Queue one scout toward a hop-viable remote that still lacks source IDs (needs vision).
 * Returns true if a scout was requested so callers can stop after one per refresh.
 */
function maybeScoutRemoteCandidate(room, rName) {
    if (Game.rooms[rName]) return false;
    const rec = remoteMining.getMiningRouteRecord(rName, room.name);
    if (!rec || rec.estimateScore > REMOTE_DISTANCE_MAX) return false;
    if (getCreepCount(undefined, 'scout', rName) || countQueuedRole(room.name, 'scout', rName)) return true;
    if (getCreepCount(undefined, 'explorer', rName)) return true;
    queueCreepIfNeeded({
        room,
        role: 'scout',
        priority: PRIORITIES.remoteHarvester,
        numberNeeded: 1,
        destination: rName,
    });
    return true;
}

/**
 * First-visit scout for an adjacent room that has no INTEL.sources yet.
 * remoteIntelEligible / maybeScoutRemoteCandidate never see those rooms.
 */
function maybeScoutUnknownExits(room) {
    const exits = Game.map.describeExits(room.name);
    if (!exits) return false;
    for (const dir in exits) {
        const rName = exits[dir];
        if (!rName || Game.rooms[rName]) continue;
        if (typeof roomStatus === 'function' && roomStatus(rName) === 'closed') continue;
        if (MY_ROOMS && MY_ROOMS.includes(rName)) continue;
        const intel = INTEL[rName];
        if (intel && (intel.owner || intel.sources)) continue;
        if (remoteMining.isSkRoomName(rName) && !skMiningAllowed(room)) continue;
        if (getCreepCount(undefined, 'scout', rName) || countQueuedRole(room.name, 'scout', rName)) return true;
        if (getCreepCount(undefined, 'explorer', rName)) return true;
        queueCreepIfNeeded({
            room,
            role: 'scout',
            priority: PRIORITIES.remoteHarvester,
            numberNeeded: 1,
            destination: rName,
        });
        return true;
    }
    return false;
}

/** Local harvest is staffed enough that one adjacent remote will not starve the spawn. */
function roomReadyForRemotes(room) {
    if (room.storage) return true;
    if (!room.controller) return false;
    if (room.level < 2) return false;
    const sources = (room.sources && room.sources.length) || 0;
    if (!sources) return false;
    if (room.controller.level <= 2 && getOwnedExtensionDeficit(room) > 0) return false;
    if (getCreepCount(room, 'stationaryHarvester') < sources) return false;
    if (!getCreepCount(room, 'shuttle') && !getCreepCount(room, 'hauler')) return false;
    if (roomNeedsSpawnReboot(room)) return false;
    return true;
}

function refreshRemoteRoomTargets(room) {
    spawnState.lastRemoteRefresh[room.name] = Game.time;
    if (!ROOM_REMOTE_TARGETS[room.name]) ROOM_REMOTE_TARGETS[room.name] = [];

    remoteMining.pruneRoomRemoteTargets(room.name, room);

    const activeRemotes = new Set();
    const probeNew = remoteMining.shouldProbeNewRemotes(room);
    const candidates = remoteMining.getCandidateRemotesForProbe(room);
    let scoutedOne = false;

    for (let i = 0; i < candidates.length; i++) {
        const rName = candidates[i];
        ensureSkIntel(rName);
        if (isSkRoom(rName) && !remoteMining.isAllowedSkRoom(room.name, rName)) continue;
        if (!remoteMining.remoteIntelEligible(room, rName)) continue;
        if (remoteMining.isRemoteClaimedByOther(room.name, rName)) continue;

        const hasAssignment = (ROOM_REMOTE_TARGETS[room.name] || []).some(s => s.room === rName);
        const hasLiveWork = getCreepCount(undefined, 'remoteHarvester', rName)
            || getCreepCount(undefined, 'reserver', rName)
            || countQueuedRole(room.name, 'remoteHarvester', rName);
        const hasSourceData = remoteMining.hasRemoteSourceDataForColony(room.name, rName);

        if (!hasAssignment && !hasLiveWork) {
            if (hasSourceData) {
                // Prefer free stale/cache; live findRoute only if budget remains.
                remoteMining.probeMiningRoute(room.name, rName, {allowLive: true});
            } else {
                if (!probeNew) continue;
                const rec = remoteMining.probeMiningRoute(room.name, rName, {allowLive: true});
                if (!rec || !rec.safe || rec.estimateScore > REMOTE_DISTANCE_MAX) continue;
                if (!scoutedOne) scoutedOne = maybeScoutRemoteCandidate(room, rName);
            }
        } else {
            // Assigned remotes: soft-extend only (no live findRoute).
            remoteMining.probeMiningRoute(room.name, rName, {allowLive: false});
        }

        remoteMining.trackRemoteRoom(rName, room);
        activeRemotes.add(rName);
        remoteMining.maybeRefreshRemoteIntel(rName);
        ingestColonyRemoteSources(room, rName);
    }

    const skRooms = remoteMining.getColonySkRooms(room.name);
    for (let i = 0; i < skRooms.length; i++) attachSectorCenter(room, skRooms[i]);

    remoteMining.pruneRoomRemoteTargets(room.name, room);
    spawnState.remoteRoomTargets[room.name] = [...activeRemotes];

    updateContestedAndBlocked(room);
}

function updateContestedAndBlocked(room) {
    const exits = Game.map.describeExits(room.name) || {};
    const exitRooms = Object.values(exits);

    const contestedRemote = exitRooms.find(r => remoteMining.isContestedRemoteCandidate(room, r));
    if (contestedRemote) {
        if (spawnState.contestedRemotes[room.name] && spawnState.contestedRemotes[room.name] !== contestedRemote) {
            const prev = spawnState.contestedRemotes[room.name];
            if (INTEL[contestedRemote]) INTEL[contestedRemote].contestingCount = 0;
            if (INTEL[prev]) INTEL[prev].lastContest = Game.time;
        }
        spawnState.contestedRemotes[room.name] = contestedRemote;
    } else {
        spawnState.contestedRemotes[room.name] = undefined;
    }

    const blockedRemote = exitRooms.find(r => remoteMining.isBlockedRemoteCandidate(room, r));
    spawnState.blockedRemotes[room.name] = blockedRemote || undefined;
}

function handleContestedRoom(room) {
    const remoteName = spawnState.contestedRemotes[room.name];
    if (!remoteName || !remoteMining.isContestedRemoteCandidate(room, remoteName)) {
        spawnState.contestedRemotes[room.name] = undefined;
        return;
    }
    const intel = INTEL[remoteName];
    if (!intel) {
        spawnState.contestedRemotes[room.name] = undefined;
        return;
    }
    if ((intel.contestingCount || 0) > room.level * 2) {
        log.a(`${roomLink(room.name)} is no longer contesting ${roomLink(remoteName)} due to casualties.`, "LOCAL COMMAND:");
        intel.lastContest = Game.time;
        intel.contestingCount = 0;
        return spawnState.contestedRemotes[room.name] = undefined;
    }
    if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) {
        const flow = getFlowContext(room);
        const canQuad = spawnEnergyState(room) >= 2 && flow.flowHealthy && flow.spareIncome >= 8;
        const waitFor = canQuad ? 4 : 2;
        if (queueCreepIfNeeded({
            room, role: 'longbowSquad', priority: PRIORITIES.remoteHarvester + 1,
            numberNeeded: waitFor, destination: remoteName, misc: {waitFor: waitFor}
        })) {
            if (!intel.contestingCount) intel.contestingCount = 1;
            else intel.contestingCount++;
        }
    } else {
        if (queueCreepIfNeeded({
            room, role: 'longbow', priority: PRIORITIES.remoteHarvester + 1,
            numberNeeded: 1, destination: remoteName
        })) {
            if (!intel.contestingCount) intel.contestingCount = 1;
            else intel.contestingCount++;
        }
    }
    if (!intel.armedHostile || intel.armedHostile + CREEP_LIFE_TIME < Game.time) {
        handleReservation(room, remoteName);
    }
}

function handleBlockedRoom(room) {
    const exits = Game.map.describeExits(room.name);
    if (!exits) {
        spawnState.blockedRemotes[room.name] = undefined;
        return;
    }

    let firstBlocked;
    for (const remoteName of Object.values(exits)) {
        if (!remoteMining.isBlockedRemoteCandidate(room, remoteName)) continue;
        if (!firstBlocked) firstBlocked = remoteName;
        const intel = INTEL[remoteName];
        if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) continue;
        queueCreepIfNeeded({
            room, role: 'cleaner', priority: PRIORITIES.secondary,
            numberNeeded: 1, destination: remoteName
        });
    }
    spawnState.blockedRemotes[room.name] = firstBlocked;
}

function handleThreatLevel(room, remoteName) {
    if (INTEL[remoteName].tickDetected + CREEP_LIFE_TIME >= Game.time && !INTEL[remoteName].sk) {
        room.memory.borderPatrol = remoteName;
    }
}

function handleReservation(room, remoteName) {
    if (room.level < 4 || isSkRoom(remoteName) || remoteMining.isSectorCenterRoomName(remoteName)) return;
    // Need an active harvester pipeline before spending CLAIM bodies.
    if (!getCreepCount(undefined, 'remoteHarvester', remoteName)
        && !countQueuedRole(room.name, 'remoteHarvester', remoteName)) return;

    // Reservation doubles source regen (1500 → 3000). Deprioritizing CLAIM when
    // lean delayed that doubling and kept poor rooms poor.
    const reserved = INTEL[remoteName] && INTEL[remoteName].reservation === MY_USERNAME;
    const reserverPriority = reserved ? PRIORITIES.reserver : PRIORITIES.remoteHarvester;
    queueCreepIfNeeded({
        room,
        role: 'reserver',
        priority: reserverPriority,
        numberNeeded: 1,
        destination: remoteName,
    });
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
    const live = getCreepCount(undefined, 'SKAttacker', remoteName);
    // Missing attacker is the bottleneck for SK/center income: beat drones so
    // spawn energy can accumulate on the 4100 body instead of cheap remotes.
    // Replacement still beats drones so the lead window actually starts.
    const priority = live ? PRIORITIES.hauler : PRIORITIES.hauler - 0.5;
    queueCreepIfNeeded({
        room,
        role: 'SKAttacker',
        priority,
        numberNeeded: 1,
        destination: remoteName,
        colony: room.name,
    });
    if (!hasSkAttackerCoverage(remoteName)) return;
    queueCreepIfNeeded({
        room, role: 'commodityMiner', priority: PRIORITIES.roadBuilder,
        numberNeeded: 1, destination: remoteName,
        other: {localMineral: true, skRoom: remoteName}
    });
    handleSectorCenterMineral(room, remoteName);
    attachSectorCenter(room, remoteName);
}

function attachSectorCenter(room, skRoomName) {
    const center = remoteMining.getAdjacentSectorCenter(skRoomName);
    if (!center) return;
    if (remoteMining.isRemoteClaimedByOther(room.name, center)) return;
    const intel = INTEL[center];
    if (intel) {
        if (intel.owner || intel.obstacles) return;
        if (intel.threatLevel > 1 || intel.roomHeat > 250) return;
    }
    remoteMining.trackRemoteRoom(center, room);
    const rec = remoteMining.probeMiningRoute(room.name, center, {allowLive: true});
    if (!hasSkAttackerCoverage(skRoomName)) return;
    remoteMining.maybeRefreshRemoteIntel(center);
    if (!Game.rooms[center] && (!intel || !intel.remoteSourceData || !intel.remoteSourceData.length)) {
        maybeScoutRemoteCandidate(room, center);
    }
    if (rec && rec.safe) ingestColonyRemoteSources(room, center);
}

function handleSectorCenterMineral(room, skRoomName) {
    const center = remoteMining.getAdjacentSectorCenter(skRoomName);
    if (!center) return;
    const intel = INTEL[center];
    if (intel) {
        if (intel.owner) return;
        if (intel.threatLevel > 1) return;
        if (intel.cached && !intel.mineral) return;
        if (intel.mineralAmount === 0) {
            const regen = typeof MINERAL_REGEN_TIME !== 'undefined' ? MINERAL_REGEN_TIME : 50000;
            if (intel.cached && intel.cached + regen > Game.time) return;
        }
    }
    queueCreepIfNeeded({
        room,
        role: 'commodityMiner',
        priority: PRIORITIES.roadBuilder,
        numberNeeded: 1,
        destination: center,
        other: {localMineral: true, skRoom: skRoomName}
    });
}

function handleRemoteHarvesters(room) {
    scanColonyRemoteCreeps();
    const remoteSource = ROOM_REMOTE_TARGETS[room.name];
    if (!remoteSource || !remoteSource.length) return;

    const maxH = maxRemoteHarvesters(room);
    const live = getCreepCount(undefined, 'remoteHarvester', undefined, undefined, room.name);
    const queued = countQueuedHarvesters(room.name);
    const atCap = live + queued >= maxH;

    const eligible = [];
    const replacements = [];
    for (let i = 0; i < remoteSource.length; i++) {
        const s = remoteSource[i];
        if (shouldSkipRemote(room, s.room)) continue;
        if (remoteMining.isRemoteClaimedByOther(room.name, s.room, s.source)) continue;
        if (!remoteMining.isRemoteSourceScoreAcceptable(room.name, s.room, s.score, {allowMissingEstimate: true})) {
            continue;
        }
        const guard = remoteMining.skGuardRoom(room.name, s.room);
        if (guard && !hasSkAttackerCoverage(guard)) continue;
        if (!passesNoRoadSpawnGate(room, s)) continue;
        if (!sourceNeedsHarvester(room.name, s.source, s.room)) continue;
        eligible.push(s);
        if (getCreepCount(undefined, 'remoteHarvester', s.room, undefined, undefined, s.source) === 1) {
            replacements.push(s);
        }
    }

    const skUnstaffed = eligible.filter(s =>
        remoteMining.isKeeperYieldRoom(s.room)
        && !getCreepCount(undefined, 'remoteHarvester', s.room, undefined, undefined, s.source));
    const pool = replacements.length ? replacements
        : (skUnstaffed.length ? skUnstaffed : (atCap ? [] : eligible));
    let pick = null;
    let bestPickScore = Infinity;
    for (let i = 0; i < pool.length; i++) {
        const ps = remoteMining.sourcePickScore(pool[i]);
        if (ps < bestPickScore) {
            bestPickScore = ps;
            pick = pool[i];
        }
    }

    if (pick && pick.room) {
        const priority = shouldDeprioritizeRemotes(room)
            ? PRIORITIES.remoteHarvester * 2
            : PRIORITIES.remoteHarvester;
        const skRoom = remoteMining.skGuardRoom(room.name, pick.room);
        queueCreepIfNeeded({
            room, role: 'remoteHarvester', priority,
            numberNeeded: 1, destination: pick.room,
            assignment: pick.source,
            other: {source: pick.source, score: pick.score, skRoom: skRoom || undefined}
        });
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
            if (c.memory.other.remoteRoom) bucket.liveRemoteRooms.add(c.memory.other.remoteRoom);
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
        if (entry.role === 'remoteHarvester') {
            if (entry.assignment) bucket.occupiedSources.add(entry.assignment);
            else if (entry.other && entry.other.source) bucket.occupiedSources.add(entry.other.source);
            if (entry.destination) bucket.liveRemoteRooms.add(entry.destination);
        } else if (entry.role === 'remoteHauler' && entry.other && entry.other.remoteRoom) {
            bucket.liveRemoteRooms.add(entry.other.remoteRoom);
        }
    }
}

function handleRemoteHaulers(room) {
    scanColonyRemoteCreeps();
    const scan = colonyRemoteCreepScan[room.name];
    if (!scan) return;

    for (const harvester of scan.harvesters) {
        if (shouldSkipRemote(room, harvester.memory.destination)) continue;
        const dest = harvester.memory.destination;
        const guard = remoteMining.skGuardRoom(room.name, dest)
            || (harvester.memory.other && harvester.memory.other.skRoom);
        if (guard && !hasSkAttackerCoverage(guard)) continue;
        const sourceId = harvester.memory.other.source;
        const assignedHaulers = (scan.haulersBySource[sourceId] || [])
            .filter(c => !haulerExpiringSoon(c, dest));
        const targetCapacity = harvester.memory.other.haulingRequired;
        const onRoads = routeHasBuiltRoads(room.name, dest);
        const maxCarryPerHauler = room.level < 7
            ? room.level * 2
            : maxRemoteHaulerCarryParts(room.level, onRoads);
        const destIntel = INTEL[dest];
        const keeperYield = remoteMining.isKeeperYieldRoom(dest) || !!(destIntel && destIntel.sk);
        const maxHaulers = maxHaulersForSource(room, dest, keeperYield);
        const minCarryPerHauler = room.level >= 7 ? (onRoads ? 12 : 8) : Math.max(2, room.level * 2);
        const count = Math.min(maxHaulers, Math.max(1,
            Math.ceil(targetCapacity / (maxCarryPerHauler * CARRY_CAPACITY))));
        const queuedHaulers = countQueuedHaulersForSource(room.name, sourceId);
        if (assignedHaulers.length + queuedHaulers >= count) continue;
        const haulingCapacity = assignedHaulers.reduce((sum, creep) => sum + haulerCarryCapacity(creep), 0);
        const queuedCapacity = queuedHaulers * minCarryPerHauler * CARRY_CAPACITY;
        if (!targetCapacity || haulingCapacity + queuedCapacity >= targetCapacity) continue;
        const deprioritize = shouldDeprioritizeRemotes(room) && !keeperYield;
        const priority = deprioritize
            ? PRIORITIES.remoteHauler * 2
            : PRIORITIES.remoteHauler;
        queueCreep(room, priority + assignedHaulers.length + queuedHaulers, {
            role: 'remoteHauler',
            destination: room.name,
            other: {
                source: sourceId,
                remoteRoom: dest,
                harvestAmount: targetCapacity,
                harvestRate: harvester.memory.other.harvestRate,
                skRoom: guard || undefined
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
}

function shouldSkipRemote(room, remoteName) {
    if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) return true;
    if (!INTEL[remoteName]) return true;
    if (isSkRoom(remoteName) && !skMiningAllowed(room)) return true;
    if (isSkRoom(remoteName) && !remoteMining.isAllowedSkRoom(room.name, remoteName)) return true;
    if (isSkRoom(remoteName)) return skTowersOrCombatBlock(remoteName);
    if (remoteMining.isSectorCenterRoomName(remoteName)) {
        if (!skMiningAllowed(room) || !remoteMining.isSectorCenterAddOn(room.name, remoteName)) return true;
        if (INTEL[remoteName].owner || INTEL[remoteName].obstacles) return true;
        if (!INTEL[remoteName].sources) return true;
        if (remoteMining.remoteCombatBlocksMining(remoteName)) return true;
        return skTowersOrCombatBlock(remoteMining.getSectorCenterSkParent(room.name, remoteName) || remoteName);
    }
    if (INTEL[remoteName].level || !INTEL[remoteName].sources) return true;
    if (INTEL[remoteName].reservation && ![MY_USERNAME, "Invader"].includes(INTEL[remoteName].reservation)) return true;
    if (INTEL[remoteName].obstacles) return true;
    return remoteMining.remoteCombatBlocksMining(remoteName);
}

function handleInvaderCore(room, remoteName) {
    if (isSkRoom(remoteName) || INTEL[remoteName].obstacles) return;
    queueCreepIfNeeded({
        room, role: 'attacker', priority: PRIORITIES.remoteHarvester - 1,
        numberNeeded: 1, destination: remoteName
    });
}

function remoteCreepQueue(room) {
    if (typeof REMOTE_MINING !== 'undefined' && !REMOTE_MINING) return;
    if (!spawnState.throttleReady(spawnState.remoteTick, room.name, 5)) return;
    // Vision for exits does not need a staffed harvest line — 1 MOVE, one at a time.
    maybeScoutUnknownExits(room);
    // Local 5W harvesters + a filler first. One adjacent remote after that;
    // storage is not required (RCL 5 used to hide remotes for the whole 405k upgrade).
    if (!roomReadyForRemotes(room)) return;
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

    ingestAdjacentSkRooms(room);
    remoteMining.pruneExcessSkRooms(room.name);
    remoteMining.pruneOrphanSectorCenters(room.name);

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

    // SK guard is independent of harvest vision/threat gates. If the assignment
    // survived prune, always queue the attacker so the room can restaff.
    if (skMiningAllowed(room)) {
        const guarded = new Set();
        const queueGuard = (name) => {
            if (!name || guarded.has(name) || !isSkRoom(name)) return;
            if (skTowersOrCombatBlock(name)) return;
            if (!remoteMining.isAllowedSkRoom(room.name, name)) return;
            guarded.add(name);
            handleSkCreeps(room, name);
            remoteMining.probeMiningRoute(room.name, name, {allowLive: false});
            ingestColonyRemoteSources(room, name);
        };
        const assignedSk = remoteMining.getColonySkGuardRooms(room.name);
        for (let i = 0; i < assignedSk.length; i++) queueGuard(assignedSk[i]);
        for (let i = 0; i < activeRemotes.length; i++) queueGuard(activeRemotes[i]);
    }

    handleBlockedRoom(room);

    if (room.memory.noRemote) return;

    purgeUnguardedSkQueue(room);
    handleRemoteHarvesters(room);
    handleRemoteHaulers(room);
    handleRemoteBuilder(room);

    if (spawnState.contestedRemotes[room.name] && energyState) handleContestedRoom(room);
}

module.exports = {remoteCreepQueue};
