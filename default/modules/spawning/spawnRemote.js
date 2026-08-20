/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Remote mining spawn queue and helpers.
 */

const spawnState = require('spawnState');
const {getFlowContext, spawnEnergyState} = require('spawnFlow');
const {getCreepCount, creepExpiringSoon, haulerCarryCapacity} = require('spawnCounts');
const {queueCreepIfNeeded, queueCreep} = require('spawnQueue');
const {routeHasBuiltRoads, countQueuedHaulersForSource} = require('bodyHelpers');
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
    const {spareIncome} = getFlowContext(room);
    const assigned = (ROOM_REMOTE_TARGETS[room.name] || []).length;
    const fromSpare = Math.floor(spareIncome / 15);
    const hasCenter = (ROOM_REMOTE_TARGETS[room.name] || []).some(s => remoteMining.isSectorCenterRoomName(s.room));
    // Cover assigned sources up to 4 before spare income alone would allow it.
    // SK + sector-center is 6 keeper-yield sources; raise the floor/cap so they get staffed.
    const assignedFloor = hasCenter ? Math.min(assigned, 7) : Math.min(assigned, 4);
    const cap = hasCenter ? 8 : 5;
    return Math.max(1, Math.min(cap, Math.max(fromSpare, assignedFloor)));
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
    const distance = (origin && remoteRoom) ? Game.map.getRoomLinearDistance(origin, remoteRoom) * 50 : 0;
    const spawnTime = 3 * ((creep.body && creep.body.length) || 0);
    return ttl <= spawnTime + distance;
}

function hasSkAttackerCoverage(remoteName) {
    return remoteMining.hasLiveSkAttacker(remoteName);
}

function queuedSkRoom(entry) {
    if (!entry) return undefined;
    if (entry.other && entry.other.skRoom) return entry.other.skRoom;
    if (entry.other && entry.other.remoteRoom) return entry.other.remoteRoom;
    return entry.destination;
}

function purgeUnguardedSkQueue(room) {
    const queue = CREEP_QUEUES[room.name];
    if (!queue) return;
    const assignedSk = remoteMining.getColonySkRooms(room.name);
    for (const key in queue) {
        const entry = queue[key];
        if (!entry) continue;
        const dest = queuedSkRoom(entry);
        if (!dest || !isSkRoom(dest)) continue;
        if (assignedSk.length && assignedSk.indexOf(dest) === -1) {
            delete queue[key];
            continue;
        }
        if (entry.role === 'SKAttacker') continue;
        if (!remoteMining.SK_GUARD_DEPENDENT_ROLES.has(entry.role)) continue;
        if (hasSkAttackerCoverage(dest)) continue;
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

    let added = false;
    let claimed = false;
    for (const sd of remoteIntel.remoteSourceData) {
        if (ROOM_REMOTE_TARGETS[colonyRoom.name].find(s => s.source === sd.source)) {
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

        ROOM_REMOTE_TARGETS[colonyRoom.name].push({room: rName, source: sd.source, score});
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
        priority: PRIORITIES.secondary,
        numberNeeded: 1,
        destination: rName,
    });
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
        if (queueCreepIfNeeded({
            room, role: 'longbowSquad', priority: PRIORITIES.remoteHarvester + 1,
            numberNeeded: 4, destination: remoteName, misc: {waitFor: 4}
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

    // One reserver per remote. queueCreepIfNeeded replaces when the incumbent is
    // within claim-lifetime lead time. Do not wait for reservation to decay —
    // CLAIM creeps live CREEP_CLAIM_LIFE_TIME (600), not CREEP_LIFE_TIME (1500).
    const reserverPriority = spawnEnergyState(room) < 2 || room.level < 7
        ? PRIORITIES.reserver + 3
        : PRIORITIES.reserver;
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
    queueCreepIfNeeded({
        room,
        role: 'SKAttacker',
        priority: Math.max(1, PRIORITIES.remoteHarvester - 2),
        numberNeeded: 1,
        destination: remoteName
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

    const pool = replacements.length ? replacements : (atCap ? [] : eligible);
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
        let maxHaulers = room.memory.remotePenalty ? 1
            : keeperYield ? 3 : 2;
        if (room.level >= 7 && !keeperYield) maxHaulers = 1;
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
    if (skMiningAllowed(room) && isSkRoom(remoteName) && !INTEL[remoteName].towers) {
        handleSkCreeps(room, remoteName);
    }
}

function shouldSkipRemote(room, remoteName) {
    if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) return true;
    if (!INTEL[remoteName]) return true;
    if (INTEL[remoteName].threatLevel > 1) return true;
    if (isSkRoom(remoteName) && !skMiningAllowed(room)) return true;
    if (isSkRoom(remoteName) && !remoteMining.isAllowedSkRoom(room.name, remoteName)) return true;
    if (remoteMining.isSectorCenterRoomName(remoteName)) {
        if (!skMiningAllowed(room) || !remoteMining.isSectorCenterAddOn(room.name, remoteName)) return true;
        if (INTEL[remoteName].owner || INTEL[remoteName].obstacles) return true;
        if (INTEL[remoteName].roomHeat > 250) return true;
        if (!INTEL[remoteName].sources) return true;
        return false;
    }
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
    if (typeof REMOTE_MINING !== 'undefined' && !REMOTE_MINING) return;
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

    handleBlockedRoom(room);

    if (room.memory.noRemote) return;

    purgeUnguardedSkQueue(room);
    handleRemoteHarvesters(room);
    handleRemoteHaulers(room);
    handleRemoteBuilder(room);

    if (spawnState.contestedRemotes[room.name] && energyState) handleContestedRoom(room);
}

module.exports = {remoteCreepQueue};
