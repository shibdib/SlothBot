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
    remoteSourcePadBuilt,
    remoteHaulerMinCarry,
    roomNeedsSpawnReboot,
    roomHasStableWorkingSet
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
    return remoteMining.remoteSourceStaffCap(room);
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
    if (Game.cpu.bucket < BUCKET_MAX * 0.35) return 1;
    if (keeperYield) {
        // Center is colony → SK → center (2 hops) at 4000-energy sources.
        const max = remoteMining.isSectorCenterRoomName(dest) ? 6 : 4;
        return remoteMining.applyCpuOverageCap(room, max);
    }
    // RCL7+: one fat road hauler. Second only while the route is unpaved.
    if ((room.level || 0) >= 7 && routeHasBuiltRoads(room.name, dest)) return 1;
    if (remoteMining.cpuOverageThrottle(room)) return 1;
    return 2;
}

function hasSkAttackerCoverage(remoteName) {
    // Spawn workers only after the attacker is in dest. Live-but-spawning used
    // to park harvesters/haulers in the hallway until it arrived.
    return remoteMining.hasSkAttackerOnSite(remoteName)
        && !remoteMining.skCombatBlocksMining(remoteName);
}

function skTowersOrCombatBlock(remoteName) {
    return remoteMining.skCombatBlocksMining(remoteName);
}

/** 1-MOVE scouts die to SK strongholds / invader cores. Do not queue them in. */
function scoutBlockedByThreat(remoteName) {
    if (!remoteName) return false;
    if (remoteMining.skCombatBlocksMining(remoteName)) return true;
    const intel = INTEL[remoteName];
    if (!intel) return false;
    if (intel.invaderCore && intel.invaderCore > Game.time) return true;
    if (intel.sk && intel.towers) {
        const seen = Math.max(intel.lastObservation || 0, intel.cached || 0, intel.microUpdate || 0);
        if (seen && seen + CREEP_LIFE_TIME > Game.time) return true;
    }
    return false;
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
        if (entry.role === 'SKAttacker') {
            if (skTowersOrCombatBlock(guard)) delete queue[key];
            continue;
        }
        if (entry.role === 'scout') {
            if (skTowersOrCombatBlock(guard) || scoutBlockedByThreat(dest)) delete queue[key];
            continue;
        }
        if (!remoteMining.SK_GUARD_DEPENDENT_ROLES.has(entry.role)) continue;
        if (hasSkAttackerCoverage(guard)) continue;
        delete queue[key];
    }
}

function ingestColonyRemoteSources(colonyRoom, rName, options = {}) {
    ensureSkIntel(rName);
    if (isSkRoom(rName) && !remoteMining.isAllowedSkRoom(colonyRoom.name, rName)) return false;
    const adjacent = options.adjacent || remoteMining.isExitNeighbor(colonyRoom.name, rName);
    if (adjacent) remoteMining.ensureAdjacentMiningRoute(colonyRoom.name, rName);

    const remoteIntel = INTEL[rName];
    if (!remoteIntel) return false;

    const rec = remoteMining.getMiningRouteRecord(rName, colonyRoom.name);
    if (!rec) return false;

    if (!adjacent && remoteMining.isRemoteClaimedByOther(colonyRoom.name, rName)) return false;

    if (!ROOM_REMOTE_TARGETS[colonyRoom.name]) ROOM_REMOTE_TARGETS[colonyRoom.name] = [];
    const targets = ROOM_REMOTE_TARGETS[colonyRoom.name];

    let data = remoteIntel.remoteSourceData;
    if (adjacent && (!data || !data.length) && Game.rooms[rName]) {
        const vis = Game.rooms[rName];
        const sources = vis.sources || [];
        if (sources.length) {
            data = [];
            for (let i = 0; i < sources.length; i++) {
                data.push({
                    source: sources[i].id,
                    score: rec.estimateScore || 32,
                    colony: colonyRoom.name,
                });
            }
            remoteIntel.remoteSourceData = data;
        }
    }
    if (!data || !data.length) return false;

    let added = false;
    let claimed = false;
    for (const sd of data) {
        if (targets.find(s => s.source === sd.source)) {
            claimed = true;
            continue;
        }

        let score = sd.colony === colonyRoom.name ? sd.score : rec.estimateScore;
        if (!adjacent) {
            if (!remoteMining.isRemoteSourceScoreAcceptable(colonyRoom.name, rName, score, {allowMissingEstimate: true})) {
                if (score === rec.estimateScore) continue;
                score = rec.estimateScore;
                if (!remoteMining.isRemoteSourceScoreAcceptable(colonyRoom.name, rName, score, {allowMissingEstimate: true})) {
                    continue;
                }
            }
            if (!remoteMining.isRemoteSourceWorthMining(colonyRoom, {room: rName, source: sd.source, score})) continue;
        } else if (!score) {
            score = rec.estimateScore || 32;
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
    if (remoteMining.isExitNeighbor(colonyRoom.name, sourceEntry.room)) return true;
    // SK / sector-center: already paying for the attacker. The one-bootstrap-per-room
    // gate left the far sources unstaffed until roads existed.
    if (remoteMining.isKeeperYieldRoom(sourceEntry.room)) return true;
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
    if (!roomHasStableWorkingSet(room)) return false;
    if (Game.rooms[rName]) return false;
    if (scoutBlockedByThreat(rName)) return false;
    const rec = remoteMining.getMiningRouteRecord(rName, room.name);
    if (!rec || rec.estimateScore > REMOTE_DISTANCE_MAX) return false;
    if (getCreepCount(undefined, 'scout', rName) || countQueuedRole(room.name, 'scout', rName)) return true;
    if (getCreepCount(undefined, 'explorer', rName)) return true;
    queueCreepIfNeeded({
        room,
        role: 'scout',
        priority: PRIORITIES.high,
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
        if (scoutBlockedByThreat(rName)) continue;
        if (getCreepCount(undefined, 'scout', rName) || countQueuedRole(room.name, 'scout', rName)) return true;
        if (getCreepCount(undefined, 'explorer', rName)) return true;
        queueCreepIfNeeded({
            room,
            role: 'scout',
            priority: PRIORITIES.high,
            numberNeeded: 1,
            destination: rName,
        });
        return true;
    }
    return false;
}

/** Local harvest still wins on spawn priority. Energy state must not hide remotes. */
function roomReadyForRemotes(room) {
    if (!room.controller) return false;
    if (room.level < 2) return false;
    if (roomNeedsSpawnReboot(room)) return false;
    return true;
}

function maybeScoutAdjacent(room, rName) {
    if (Game.rooms[rName]) return false;
    if (scoutBlockedByThreat(rName)) return false;
    if (getCreepCount(undefined, 'scout', rName) || countQueuedRole(room.name, 'scout', rName)) return true;
    if (getCreepCount(undefined, 'explorer', rName)) return true;
    queueCreepIfNeeded({
        room,
        role: 'scout',
        priority: PRIORITIES.high,
        numberNeeded: 1,
        destination: rName,
    });
    return true;
}

/** Exit neighbors are always assigned. Own-room split, ally skip, else compete. */
function assignNeighborRemotes(room) {
    const exits = Game.map.describeExits(room.name);
    if (!exits) return;
    for (const rName of Object.values(exits)) {
        if (!rName || (MY_ROOMS && MY_ROOMS.includes(rName))) continue;
        if (typeof roomStatus === 'function' && roomStatus(rName) === 'closed') continue;
        if (typeof roomStatus === 'function' && roomStatus(room.name) && roomStatus(rName) !== roomStatus(room.name)) {
            continue;
        }

        ensureSkIntel(rName);
        if (isSkRoom(rName) && !skMiningAllowed(room)) continue;
        if (isSkRoom(rName) && !remoteMining.isAllowedSkRoom(room.name, rName)) continue;

        if (remoteMining.allyHoldsRemote(rName)) {
            remoteMining.dropRemoteFromColony(room.name, rName);
            continue;
        }

        const intel = INTEL[rName];
        if (intel && intel.owner && intel.owner !== MY_USERNAME) {
            remoteMining.dropRemoteFromColony(room.name, rName);
            continue;
        }

        const owner = remoteMining.pickColonyForAdjacentRemote(rName);
        if (owner && owner !== room.name) {
            remoteMining.dropRemoteFromColony(room.name, rName);
            continue;
        }
        if (!owner) continue;

        if (intel && intel.sources === 0) continue;
        if (!intel || !intel.sources) {
            maybeScoutAdjacent(room, rName);
            continue;
        }

        remoteMining.ensureAdjacentMiningRoute(room.name, rName);
        remoteMining.trackRemoteRoom(rName, room);
        remoteMining.maybeRefreshRemoteIntel(rName);
        if (ingestColonyRemoteSources(room, rName, {adjacent: true})) continue;
        // Already assigned, or already have source IDs: ingest returning false
        // used to mean "need vision" and spawned a scout every remote tick.
        // Combat-blocked SK has no workers, so that was a death loop.
        const assigned = (ROOM_REMOTE_TARGETS[room.name] || []).some(s => s.room === rName);
        if (assigned || remoteMining.hasRemoteSourceDataForColony(room.name, rName)) continue;
        maybeScoutAdjacent(room, rName);
    }
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
    if (!remoteName || !INTEL[remoteName]) return;
    if (remoteMining.isKeeperYieldRoom(remoteName) || INTEL[remoteName].sk) return;
    room.memory.borderPatrol = remoteName;
}

function assignedRemoteNeedsPatrol(remoteName) {
    if (!remoteName) return false;
    const intel = INTEL[remoteName];
    if (!intel) return false;
    // SK and sector-center: abandon the wave. Longbows pathing through
    // keepers is worse than waiting out invaderTTL.
    if (intel.sk || remoteMining.isKeeperYieldRoom(remoteName)) return false;
    if (intel.threatLevel > 1 && (intel.tickDetected || 0) + CREEP_LIFE_TIME >= Game.time) return true;
    const vis = Game.rooms[remoteName];
    if (!vis) return false;
    const hostiles = vis.hostileCreeps;
    for (let i = 0; i < hostiles.length; i++) {
        const c = hostiles[i];
        if (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) return true;
    }
    return false;
}

function findAssignedRemoteThreat(room, extraRooms) {
    const seen = new Set();
    const consider = (rName) => {
        if (!rName || seen.has(rName)) return false;
        seen.add(rName);
        return assignedRemoteNeedsPatrol(rName);
    };
    const targets = ROOM_REMOTE_TARGETS[room.name];
    if (targets) {
        for (let i = 0; i < targets.length; i++) {
            if (consider(targets[i] && targets[i].room)) return targets[i].room;
        }
    }
    if (extraRooms) {
        for (const rName of extraRooms) {
            if (consider(rName)) return rName;
        }
    }
    return undefined;
}

function handleReservation(room, remoteName) {
    if (room.level < 4 || isSkRoom(remoteName) || remoteMining.isSectorCenterRoomName(remoteName)) return;
    const assigned = (ROOM_REMOTE_TARGETS[room.name] || []).some(s => s.room === remoteName);
    if (!assigned
        && !getCreepCount(undefined, 'remoteHarvester', remoteName)
        && !countQueuedRole(room.name, 'remoteHarvester', remoteName)) return;

    // Reservation doubles source regen (1500 → 3000). Missing/low reserve beats
    // drones; a full room stays at normal reserver priority.
    const ticks = remoteMining.reservationTicksLeft(remoteName);
    const reserved = INTEL[remoteName] && INTEL[remoteName].reservation === MY_USERNAME;
    const reserverPriority = (!reserved || ticks < 2000)
        ? PRIORITIES.reserver - 1
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
    if (room.memory.remotePenalty || Game.cpu.bucket < BUCKET_MAX * 0.35) return;
    if (remoteMining.cpuOverageThrottle(room)) return;
    const colony = room.name;
    const remoteTargets = ROOM_REMOTE_TARGETS[colony];
    if (!remoteTargets || !remoteTargets.length) return;
    if (!getCreepCount(undefined, 'remoteHarvester', undefined, undefined, colony)) return;
    if (!colonyNeedsRoadWork(colony)) return;
    let needed = remoteBuildersNeeded(colony);
    if ((room.memory.cpuOverage || 0) > 0 || Game.cpu.bucket < BUCKET_MAX * 0.5) {
        needed = Math.min(needed, 1);
    }
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
    const adjacentNeed = [];
    for (let i = 0; i < remoteSource.length; i++) {
        const s = remoteSource[i];
        const adjacent = remoteMining.isExitNeighbor(room.name, s.room);
        if (shouldSkipRemote(room, s.room)) continue;
        if (!adjacent && remoteMining.isRemoteClaimedByOther(room.name, s.room, s.source)) continue;
        if (!adjacent && !remoteMining.isRemoteSourceWorthMining(room, s)) continue;
        const guard = remoteMining.skGuardRoom(room.name, s.room);
        if (guard && !hasSkAttackerCoverage(guard)) continue;
        if (!adjacent && !passesNoRoadSpawnGate(room, s)) continue;
        if (!sourceNeedsHarvester(room.name, s.source, s.room)) continue;
        eligible.push(s);
        if (adjacent) adjacentNeed.push(s);
        if (getCreepCount(undefined, 'remoteHarvester', s.room, undefined, undefined, s.source) === 1) {
            replacements.push(s);
        }
    }

    const unstaffedAdjacent = adjacentNeed.filter(s =>
        !getCreepCount(undefined, 'remoteHarvester', s.room, undefined, undefined, s.source));
    const skUnstaffed = eligible.filter(s =>
        remoteMining.isKeeperYieldRoom(s.room)
        && !getCreepCount(undefined, 'remoteHarvester', s.room, undefined, undefined, s.source));
    // Empty next-door first, then empty SK/center. Replacements used to win
    // every time a regular remote was in its TTL window, so a dead SK source
    // never got a body.
    const pool = unstaffedAdjacent.length ? unstaffedAdjacent
        : (skUnstaffed.length ? skUnstaffed
            : (replacements.length ? replacements : (atCap ? [] : eligible)));
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
        const priority = remoteMining.isExitNeighbor(room.name, pick.room)
            ? PRIORITIES.adjacentRemoteHarvester
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
        if (!c.my || !c.memory.colony || c.memory.recycling) continue;
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
            if (c.memory.other && c.memory.other.source) bucket.harvesters.push(c);
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
        let targetCapacity = harvester.memory.other.haulingRequired;
        if (!targetCapacity) {
            const srcInfo = _.find(ROOM_REMOTE_TARGETS[room.name], s => s.source === sourceId);
            const power = harvester.getActiveBodyparts
                ? harvester.getActiveBodyparts(WORK) * HARVEST_POWER : 0;
            targetCapacity = remoteMining.estimateHaulingRequired(
                room.name, dest, (srcInfo && srcInfo.score) || (harvester.memory.other.score) || 0, power);
        }
        const onRoads = routeHasBuiltRoads(room.name, dest);
        const maxCarryPerHauler = room.level < 7
            ? room.level * 2
            : maxRemoteHaulerCarryParts(room.level, onRoads);
        const destIntel = INTEL[dest];
        const keeperYield = remoteMining.isKeeperYieldRoom(dest) || !!(destIntel && destIntel.sk);
        const maxHaulers = maxHaulersForSource(room, dest, keeperYield);
        const padBuilt = remoteSourcePadBuilt(sourceId);
        const minCarryPerHauler = remoteHaulerMinCarry(room.level, onRoads, padBuilt);
        const count = Math.min(maxHaulers, Math.max(1,
            Math.ceil(targetCapacity / (maxCarryPerHauler * CARRY_CAPACITY))));
        const queuedHaulers = countQueuedHaulersForSource(room.name, sourceId);
        const assignedForCount = padBuilt
            ? assignedHaulers.filter(c => haulerCarryCapacity(c) >= minCarryPerHauler * CARRY_CAPACITY * 0.75)
            : assignedHaulers;
        if (assignedForCount.length + queuedHaulers >= count) continue;
        const haulingCapacity = assignedHaulers.reduce((sum, creep) => sum + haulerCarryCapacity(creep), 0);
        const queuedCapacity = queuedHaulers * minCarryPerHauler * CARRY_CAPACITY;
        if (!targetCapacity || haulingCapacity + queuedCapacity >= targetCapacity) continue;
        const srcObj = Game.getObjectById(sourceId);
        const pickupPos = srcObj && srcObj.pos;
        const priority = PRIORITIES.remoteHauler;
        queueCreep(room, priority + assignedHaulers.length + queuedHaulers, {
            role: 'remoteHauler',
            destination: room.name,
            other: {
                source: sourceId,
                remoteRoom: dest,
                harvestAmount: targetCapacity,
                harvestRate: harvester.memory.other.harvestRate,
                skRoom: guard || undefined,
                pickupX: pickupPos && pickupPos.x,
                pickupY: pickupPos && pickupPos.y,
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
    if (remoteMining.allyHoldsRemote(remoteName)) return true;
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
    if (INTEL[remoteName].owner && INTEL[remoteName].owner !== MY_USERNAME) return true;
    if (!INTEL[remoteName].sources) return true;
    if (INTEL[remoteName].obstacles) return true;
    return remoteMining.remoteCombatBlocksMining(remoteName);
}

function handleInvaderCore(room, remoteName) {
    if (!INTEL[remoteName] || INTEL[remoteName].obstacles) return;
    // SK cores sit on keeper pads. A generic attacker dies to keepers; abandon
    // like an invader wave (skCombatBlocksMining) until the core is gone.
    if (isSkRoom(remoteName)) return;
    queueCreepIfNeeded({
        room, role: 'attacker', priority: PRIORITIES.drone - 0.5,
        numberNeeded: 1, destination: remoteName
    });
}

function remoteCreepQueue(room) {
    if (typeof REMOTE_MINING !== 'undefined' && !REMOTE_MINING) return;
    if (!spawnState.throttleReady(spawnState.remoteTick, room.name, spawnState.REMOTE_INTERVAL)) return;
    maybeScoutUnknownExits(room);
    assignNeighborRemotes(room);
    // Local 5W harvesters still beat remotes on priority. Energy state never
    // blocks queueing a next-door harvester.
    if (!roomReadyForRemotes(room)) return;
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
        assignNeighborRemotes(room);
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

    // Combat-blocked remotes are dropped from activeRemotes, so patrol must be
    // picked from the assignment list (and live workers) instead.
    const threat = findAssignedRemoteThreat(room, scan && scan.liveRemoteRooms);
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
            if (!remoteMining.isAllowedSkRoom(room.name, name)) return;
            guarded.add(name);
            if (skTowersOrCombatBlock(name)) return;
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

    remoteMining.pruneRoomRemoteTargets(room.name, room);
    assignNeighborRemotes(room);
    purgeUnguardedSkQueue(room);
    handleRemoteHarvesters(room);
    handleRemoteHaulers(room);
    handleRemoteBuilder(room);

    if (spawnState.contestedRemotes[room.name]) handleContestedRoom(room);
}

module.exports = {remoteCreepQueue};
