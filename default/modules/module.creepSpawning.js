/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Cleanup Improvements
 */

const generator = require('module.bodyGenerator');

let energyOrder = {};
let orderStored = {};
let storedLevel = {};
let remoteRoomTargets = {};
let lastBuilt = {};
let creepTTL = {};
let activeSkMining = {};
const CREEP_COUNT_CACHE = {counts: {}, tick: 0, lastUpdate: 0};
let lastGlobalSpawn = Game.time;
let buildTick = {};
let essentialTick = {};
let miscTick = {};
let remoteTick = {};
let lastRemoteRefresh = {};
let contestedRemotes = {};
let blockedRemotes = {};

// ============================================================
// BUILD QUEUE PROCESSING
// ============================================================

module.exports.processBuildQueue = function (room) {
    const queue = getQueue(room);
    if (!room.level || !_.size(queue)) return;

    const currentTick = Game.time;
    if (buildTick[room.name] + 5 > currentTick) return;
    buildTick[room.name] = currentTick;

    // Clear stuck queue
    const lastSpawn = lastBuilt[room.name];
    if (lastSpawn && lastSpawn + 500 < currentTick && room.energyAvailable >= 300) {
        CREEP_QUEUES[room.name] = {};
        lastBuilt[room.name] = currentTick;
        return;
    }

    const totalSpawns = room.spawns;
    const renewalCreep = room.myCreeps.find(c => c.memory.needsRenewal);
    let availableSpawns = totalSpawns.filter(s => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);

    if (renewalCreep && totalSpawns.length > 1) {
        availableSpawns = totalSpawns.filter(s => s.id !== totalSpawns[0].id && s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning);
    }

    for (let availableSpawn of availableSpawns) {
        let queuedBuild;
        let body = [];

        for (let topPriority of queue) {
            const {role, other} = topPriority;
            if (!role) continue;

            const generatedInfo = new generator(room.level, role, room, topPriority).generateBody();
            body = generatedInfo.body;
            topPriority = generatedInfo.info;
            if (!body || !body.length) continue;

            const cost = global.UNIT_COST(body);
            if (cost > room.energyCapacityAvailable) continue;
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) return;

            queuedBuild = topPriority;
            break;
        }

        if (queuedBuild) {
            if (!determineEnergyOrder(room)) return;

            const {
                role, operation, assignedSource, destination, other,
                military, misc, neededBoosts, assignment
            } = queuedBuild;

            const name = generateCreepName(role, room.level, operation);

            let energyStructures;
            if (energyOrder[availableSpawn.room.name]) {
                try {
                    const parsed = JSON.parse(energyOrder[availableSpawn.room.name]);
                    energyStructures = parsed.map(s => Game.getObjectById(s.id)).filter(s => s);
                    if (!energyStructures.length) energyStructures = undefined;
                } catch (e) {
                    energyStructures = undefined;
                }
            }

            const moveParts = _.filter(body, b => b === MOVE).length;
            const attackParts = _.filter(body, b => b === ATTACK).length;
            const healParts = _.filter(body, b => b === HEAL).length;
            const claimParts = _.filter(body, b => b === CLAIM).length;

            const spawnOpts = {
                memory: {
                    role,
                    colony: availableSpawn.room.name,
                    assignedSource,
                    destination,
                    other,
                    military,
                    operation,
                    misc,
                    neededBoosts,
                    canTow: moveParts >= 2 && !attackParts && !healParts && !claimParts && role !== 'labTech',
                    assignment
                }
            };
            if (energyStructures) spawnOpts.energyStructures = energyStructures;

            let spawnResult = availableSpawn.spawnCreep(body, name, spawnOpts);

            if (spawnResult === ERR_NOT_ENOUGH_ENERGY && energyStructures) {
                energyOrder[availableSpawn.room.name] = undefined;
                delete spawnOpts.energyStructures;
                spawnResult = availableSpawn.spawnCreep(body, name, spawnOpts);
            }

            if (spawnResult === OK) {
                // Pre-reserve the boost lab while the creep is still spawning so the
                // labtech can start filling immediately. By the time the creep is
                // alive (3 ticks × body length) the lab is likely already topped up.
                if (neededBoosts || (misc && misc.boosts)) {
                    preReserveBoostLab(availableSpawn.room, name, neededBoosts, body, role, misc);
                }
                handleSuccessfulSpawn(room, role, queuedBuild, availableSpawn);
                return;
            } else if (spawnResult === ERR_NOT_ENOUGH_ENERGY) {
                energyOrder[availableSpawn.room.name] = undefined;
                return;
            } else {
                log.d(`Spawn error in ${availableSpawn.room.name} code ${spawnResult}. Name - ${name}`);
                return;
            }
        } else {
            renewNearbyCreepIfNeeded(room, availableSpawn);
        }
    }

    function handleSuccessfulSpawn(room, role, queuedBuild, availableSpawn) {
        lastGlobalSpawn = Game.time;
        lastBuilt[availableSpawn.room.name] = Game.time;

        if (!queuedBuild.operation) log.d(`${availableSpawn.room.name} Spawning a ${role}`);

        updateRoomAndGlobalQueue(room, role, queuedBuild);
    }

    function updateRoomAndGlobalQueue(room, role, building) {
        if (!CREEP_QUEUES[room.name]) CREEP_QUEUES[room.name] = {};
        if (!CREEP_QUEUES["global"]) CREEP_QUEUES["global"] = {};

        const cacheKey = `c_${building.role}_${building.destination}_${building.other.reboot ? 'reboot' : ''}_${building.misc ? 'misc' : ''}_${building.operation || ''}`;

        if (CREEP_QUEUES["global"][cacheKey] && building.global) {
            delete CREEP_QUEUES["global"][cacheKey];
        }
        if (CREEP_QUEUES[room.name][cacheKey]) {
            delete CREEP_QUEUES[room.name][cacheKey];
        }
    }

    function renewNearbyCreepIfNeeded(room, availableSpawn) {
        const nearbyCreeps = _.filter(room.myCreeps, c =>
            !_.find(c.body, b => b.boost) &&
            c.pos.isNearTo(availableSpawn) &&
            c.ticksToLive < CREEP_LIFE_TIME
        );

        if (nearbyCreeps.length) {
            const creepToRenew = _.min(nearbyCreeps, c => c.ticksToLive);
            availableSpawn.renewCreep(creepToRenew);
        }
    }

    // Pre-claim boost labs while the creep is still spawning. labTech polls
    // lab.memory.neededBoost / amount without caring about a specific requestor,
    // so setting these now lets the fill cycle (storage → walk → deposit) run
    // during the spawn duration instead of after. preReservedFor is a list of
    // creep names so multiple creeps can pre-reserve the same lab — each entry
    // tells the post-spawn claim "your amount is already in lab.memory.amount,
    // don't double-count."
    //
    // We walk both neededBoosts (the size-driven primary boost, e.g. HEAL tier
    // for medics) and misc.boosts (additional body parts like ATTACK/TOUGH for
    // combat squads). Each gets its own lab, so a creep with 3 boost types
    // emerges from spawn with 3 labs filling in parallel instead of one.
    function preReserveBoostLab(room, creepName, neededBoosts, body, role, misc) {
        const reservations = [];
        const reservedParts = new Set();

        if (neededBoosts && neededBoosts.boost && neededBoosts.boostPart) {
            const partCount = body.filter(p => p === neededBoosts.boostPart).length;
            if (partCount) {
                reservations.push({boost: neededBoosts.boost, amount: partCount * LAB_BOOST_MINERAL});
                reservedParts.add(neededBoosts.boostPart);
            }
        }

        if (misc && misc.boosts) {
            // Track our pending reservations per-tier so we don't pick the same
            // resource for two body parts if the room only has enough for one.
            const pendingByResource = {};
            for (const r of reservations) pendingByResource[r.boost] = (pendingByResource[r.boost] || 0) + r.amount;

            for (const bodyPart of misc.boosts) {
                if (reservedParts.has(bodyPart)) continue;
                const partCount = body.filter(p => p === bodyPart).length;
                if (!partCount) continue;
                const boostType = resolveBoostType(role, bodyPart);
                if (!boostType) continue;
                const tiers = BOOST_USE[boostType];
                if (!tiers) continue;
                const amount = partCount * LAB_BOOST_MINERAL;
                let chosen = null;
                for (const tier of tiers) {
                    if (room.store(tier) >= amount + (pendingByResource[tier] || 0)) {
                        chosen = tier;
                        break;
                    }
                }
                if (chosen) {
                    reservations.push({boost: chosen, amount});
                    reservedParts.add(bodyPart);
                    pendingByResource[chosen] = (pendingByResource[chosen] || 0) + amount;
                }
            }
        }

        if (!reservations.length) return;

        // Don't put two of our reservations on the same lab — distinct boosts
        // need distinct labs. Other creeps' labs with matching boost may still
        // be co-occupied (claimBoostLab pools amount there).
        const usedLabs = new Set();
        for (const reservation of reservations) {
            const lab = _.find(room.labs, s =>
                !usedLabs.has(s.id) &&
                s.isActive() && s.store[RESOURCE_ENERGY] > 0 &&
                !s.memory.itemNeeded &&
                (!s.memory.neededBoost || s.memory.neededBoost === reservation.boost)
            );
            if (!lab) continue;
            usedLabs.add(lab.id);

            lab.memory.paused = true;
            lab.memory.neededBoost = reservation.boost;
            lab.memory.amount = (lab.memory.amount || 0) + reservation.amount;
            (lab.memory.preReservedFor = lab.memory.preReservedFor || []).push(creepName);
            lab.memory.requested = Game.time;
        }
    }
};

// ============================================================
// ESSENTIAL CREEP QUEUE
// ============================================================

module.exports.essentialCreepQueue = function (room) {
    if (essentialTick[room.name] + 10 > Game.time) return;
    essentialTick[room.name] = Game.time;

    // Defenders
    if (room.memory.defenseCooldown > Game.time || room.memory.earlyWarning) {
        let targetAmount = room.hostileCreeps.length ? room.hostileCreeps.length : 2;
        if (targetAmount > 6) targetAmount = 6;
        queueCreepIfNeeded({
            room, role: 'defender', priority: PRIORITIES.defender,
            numberNeeded: targetAmount, misc: {boosts: [ATTACK, RANGED_ATTACK]}
        });
    }

    // Test defenders
    if (room.memory.testDefense) {
        let targetAmount = room.hostileCreeps.length ? room.hostileCreeps.length : 2;
        if (targetAmount > 6) targetAmount = 6;
        queueCreepIfNeeded({
            room, role: 'test', priority: PRIORITIES.defender,
            numberNeeded: targetAmount
        });
    }

    // Drones — full count requires both stock (state) AND positive-ish flow (trend).
    // `state > 1` alone was firing the 5-drone balloon on rooms trending toward state 0.
    // -3/tick tolerance leaves room for minor wobble without flicker.
    const energyInfo = room.memory.energyInfo;
    const trendOk = !energyInfo || (energyInfo.trend || 0) >= -3;
    const importantBuilds = _.some(room.constructionSites, s => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    let droneCount = importantBuilds && trendOk && room.energyState ? 11 - room.level :
        room.constructionSites.length && room.energyState > 2 ? 2 :
            !room.storage ? Math.max(8 - room.level, 1) : 1;

    queueCreepIfNeeded({
        room, role: 'drone', priority: PRIORITIES.drone,
        numberNeeded: droneCount, rebootCondition: room.friendlyCreeps.length < 5
    });

    // Waller
    if (room.level >= BUNKER_LEVEL) {
        const wallerCount = room.energyState >= 3 && room.level >= 8 ? 2 : 1;
        queueCreepIfNeeded({
            room, role: 'waller', priority: PRIORITIES.drone + 1,
            numberNeeded: wallerCount, misc: {boosts: [WORK]}
        });
    }

    // Harvesters
    let harvesterCount = getCreepCount(room, 'stationaryHarvester');
    queueCreepIfNeeded({
        room, role: 'stationaryHarvester', priority: PRIORITIES.stationaryHarvester,
        numberNeeded: room.sources.length, rebootCondition: !harvesterCount
    });

    // Haulers
    if (harvesterCount) {
        const protoStorage = room.memory.protoStorage ? Game.getObjectById(room.memory.protoStorage) : undefined;
        if (room.storage || protoStorage) {
            let haulerAmount = room.level >= 6 ? 2 : 1;
            const priority = !getCreepCount(room, 'hauler') ? 1 : PRIORITIES.hauler;
            queueCreepIfNeeded({
                room, role: 'hauler', priority,
                numberNeeded: haulerAmount, rebootCondition: !getCreepCount(room, 'hauler') || !room.energyState
            });
        }

        if (room.level < 7) {
            for (const source of room.sources) {
                if (source.memory.link && room.memory.hubLink) continue;
                const priority = !getCreepCount(room, 'shuttle') ? 1 : PRIORITIES.hauler;
                queueCreepIfNeeded({
                    room, role: 'shuttle', priority: priority,
                    numberNeeded: 1,
                    rebootCondition: room.myCreeps.length < 4 || !getCreepCount(room, 'shuttle') || !room.energyState,
                    other: {distanceToHub: source.memory.distanceToHub || 25},
                    assignment: source.id
                });
            }
        }
    }

    // Upgrader
    if (room.level === room.controller.level) {
        let upgraderAmount = 1;
        let container = Game.getObjectById(room.memory.controllerContainer);
        if (container) upgraderAmount = Math.min(Math.floor(container.store.getUsedCapacity(RESOURCE_ENERGY) / 650), container.pos.countOpenTerrainAround()) || 1;
        if (room.level >= 7) upgraderAmount = 1;
        // Only fast-track the upgrader (the biggest consumer) when both stock and flow agree.
        const priority = room.energyState > 1 && room.storage && trendOk ? PRIORITIES.upgrader * 0.5 : PRIORITIES.upgrader;
        queueCreepIfNeeded({
            room, role: 'upgrader', priority,
            numberNeeded: upgraderAmount, misc: {boosts: [WORK]}
        });
    }
};

// ============================================================
// MISC CREEP QUEUE
// ============================================================

module.exports.miscCreepQueue = function (room) {
    if (miscTick[room.name] + 12 > Game.time) return;
    miscTick[room.name] = Game.time;

    if (room.terminal && room.storage) {
        queueCreepIfNeeded({room, role: 'labTech', priority: PRIORITIES.hauler + 1, numberNeeded: 1});
    }

    if (room.memory.dangerousAttack) return;

    if (MAX_LEVEL < 8) {
        queueCreepIfNeeded({colony: room, role: 'explorer', priority: PRIORITIES.high, numberNeeded: 1});
    }

    if (room.storage && room.level >= 6 && room.memory.extractorContainer && room.mineral.mineralAmount) {
        queueCreepIfNeeded({
            room, role: 'mineralHarvester', priority: PRIORITIES.mineralHarvester,
            numberNeeded: 1, misc: {boosts: [WORK]},
            other: {assignedMineral: room.mineral.id}
        });
    }

    if (room.level >= MAX_LEVEL - 1 && room.level >= 4) {
        let needsDefense = _.find(MY_ROOMS, r =>
            r !== room.name &&
            (Game.rooms[r].memory.dangerousAttack || Game.rooms[r].memory.defenseCooldown > Game.time) &&
            room.routeSafe(r, 3, 999, 15)
        );
        if (needsDefense) {
            // Trend-aware priority: only fast-track the squad when we're stockpiled AND not draining.
            const sqEnergyInfo = room.memory.energyInfo;
            const sqTrendOk = !sqEnergyInfo || (sqEnergyInfo.trend || 0) >= -3;
            queueCreepIfNeeded({
                room,
                role: 'longbowSquad',
                priority: room.energyState > 1 && room.storage && sqTrendOk ? PRIORITIES.priority : PRIORITIES.secondary,
                numberNeeded: 2,
                destination: needsDefense,
                misc: {waitFor: 2, boosts: [RANGED_ATTACK, HEAL]},
                operation: 'guard'
            });
        }
    }

    // Border Patrol
    const ap = getBodyAbilityPower(room, 'longbow');
    const longbowPower = ap.attack + ap.effectiveHeal + (ap.defense / 100);
    const needyBorderPatrol = room.myCreeps.find(c => c.memory.operation === 'borderPatrol' && c.memory.needsMoreSquadMembers && c.memory.destination && c.memory.squadMembers);
    let needsBorderResponse = MY_ROOMS.find(r => Game.rooms[r].memory.requestingBorderResponse && Game.map.getRoomLinearDistance(room.name, r) <= 4);
    if (needsBorderResponse) needsBorderResponse = Game.rooms[needsBorderResponse].memory.requestingBorderResponse;

    if (needyBorderPatrol) {
        queueCreepIfNeeded({
            room, role: 'longbow', priority: PRIORITIES.high,
            numberNeeded: needyBorderPatrol.memory.squadMembers.length + 1,
            destination: needyBorderPatrol.memory.destination, operation: 'borderPatrol'
        });
    } else if (room.memory.borderPatrol && INTEL[room.memory.borderPatrol].hostilePower < (longbowPower * (room.energyState + 1))) {
        const power = INTEL[room.memory.borderPatrol] ? (INTEL[room.memory.borderPatrol].hostilePower * 1.5) - (INTEL[room.memory.borderPatrol].friendlyPower || 0) : 50;
        if (power > 0) {
            queueCreepIfNeeded({
                room, role: 'longbow', priority: PRIORITIES.medium,
                numberNeeded: INTEL[room.memory.borderPatrol].hostilePower / longbowPower,
                destination: room.memory.borderPatrol, operation: 'borderPatrol', other: {power}
            });
        }
    } else if (room.energyState && needsBorderResponse && INTEL[needsBorderResponse].hostilePower < longbowPower) {
        const power = INTEL[needsBorderResponse] ? (INTEL[needsBorderResponse].hostilePower * 1.5) - (INTEL[needsBorderResponse].friendlyPower || 0) : 50;
        if (power > 0) {
            queueCreepIfNeeded({
                room, role: 'longbow', priority: PRIORITIES.secondary,
                numberNeeded: INTEL[needsBorderResponse].hostilePower / longbowPower,
                destination: needsBorderResponse, operation: 'borderPatrol', other: {power}
            });
        }
    } else if (room.memory.borderPatrol) {
        room.memory.requestingBorderResponse = room.memory.borderPatrol;
    } else {
        room.memory.requestingBorderResponse = undefined;
    }
};

// ============================================================
// REMOTE CREEP QUEUE
// ============================================================

module.exports.remoteCreepQueue = function (room) {
    if (remoteTick[room.name] + 10 > Game.time) return;
    remoteTick[room.name] = Game.time;
    room.memory.borderPatrol = undefined;

    if (room.memory.dangerousAttack || INTEL[room.name].threatLevel > 2) {
        remoteRoomTargets[room.name] = undefined;
        lastRemoteRefresh[room.name] = 0;
        return;
    }

    if (!remoteRoomTargets[room.name] || lastRemoteRefresh[room.name] + CREEP_LIFE_TIME < Game.time || INTEL[room.name].refreshRemotes) {
        refreshRemoteRoomTargets(room);
        INTEL[room.name].refreshRemotes = undefined;
    }

    const threat = remoteRoomTargets[room.name]?.find(r => INTEL[r] && INTEL[r].threatLevel > 1);
    if (threat) handleThreatLevel(room, threat);

    if (remoteRoomTargets[room.name]) {
        remoteRoomTargets[room.name].forEach(remoteName => processRemoteSpecificTasks(room, remoteName));
    }

    if (room.memory.noRemote) return;

    // RCL8 + state 3 normally skips remote spawning ("we don't need the income"),
    // but only if flow is also healthy. A stockpiled RCL8 trending negative *will*
    // need the remotes by the time storage drops — better to keep them up.
    const rEnergyInfo = room.memory.energyInfo;
    const rTrendOk = !rEnergyInfo || (rEnergyInfo.trend || 0) >= -3;
    if (room.energyState < 3 || room.level < 8 || !rTrendOk) {
        handleRemoteHarvesters(room);
        handleRemoteHaulers(room);
    }

    if (contestedRemotes[room.name] && room.energyState) handleContestedRoom(room);
    if (blockedRemotes[room.name] && room.energyState) handleBlockedRoom(room);

    function refreshRemoteRoomTargets(room) {
        lastRemoteRefresh[room.name] = Game.time;
        remoteRoomTargets[room.name] = undefined;

        const surroundingRooms = getSurroundingRooms(room.name);
        let remoteTargets = surroundingRooms.filter(r =>
            r !== room.name &&
            roomStatus(r) === roomStatus(room.name) &&
            INTEL[r] && INTEL[r].sources && !INTEL[r].owner && !INTEL[r].obstacles &&
            (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || INTEL[r].reservation === 'Invader') &&
            Game.map.findRoute(room.name, r).length <= 2
        );

        for (const rooms of surroundingRooms) {
            if (roomStatus(rooms) === roomStatus(room.name)) {
                const surroundingRoomsTwo = getSurroundingRooms(rooms);
                const remoteRooms = surroundingRoomsTwo.filter(r =>
                    r !== room.name &&
                    roomStatus(r) === roomStatus(room.name) &&
                    INTEL[r] && INTEL[r].sources && !INTEL[r].owner && !INTEL[r].obstacles &&
                    (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME || INTEL[r].reservation === 'Invader') &&
                    Game.map.findRoute(room.name, r).length <= 2
                );
                remoteTargets = remoteTargets.concat(remoteRooms);
            }
        }

        remoteRoomTargets[room.name] = _.uniq(remoteTargets);

        if (!ROOM_REMOTE_TARGETS[room.name]) ROOM_REMOTE_TARGETS[room.name] = [];

        // Drop entries whose room is no longer a valid remote target
        const validRemotes = new Set(remoteRoomTargets[room.name]);
        ROOM_REMOTE_TARGETS[room.name] = ROOM_REMOTE_TARGETS[room.name].filter(s => validRemotes.has(s.room));

        const registeredRooms = new Set(ROOM_REMOTE_TARGETS[room.name].map(s => s.room));
        for (const r of remoteRoomTargets[room.name]) {
            const rName = r.name || r;
            if (registeredRooms.has(rName)) continue;

            const remoteIntel = INTEL[rName];
            if (remoteIntel && remoteIntel.remoteSourceData) {
                for (const sd of remoteIntel.remoteSourceData) {
                    if (sd.colony === room.name && !ROOM_REMOTE_TARGETS[room.name].find(s => s.source === sd.source)) {
                        ROOM_REMOTE_TARGETS[room.name].push({room: rName, source: sd.source, score: sd.score});
                    }
                }
                if (ROOM_REMOTE_TARGETS[room.name].some(s => s.room === rName)) continue;
            }

            if (Game.rooms[rName]) {
                Game.rooms[rName].cacheRoomIntel();
                continue;
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
            if (contestedRemotes[room.name] && contestedRemotes[room.name] !== contestedRemote) {
                INTEL[contestedRemote].contestingCount = 0;
                INTEL[contestedRemotes[room.name]].lastContest = Game.time;
            }
            contestedRemotes[room.name] = contestedRemote;
        }

        const blockedRemote = _.find(exits, r =>
            roomStatus(r) === roomStatus(room.name) && INTEL[r] && !INTEL[r].sk && INTEL[r].sources && !INTEL[r].level && INTEL[r].obstacles && !INTEL[r].owner
        );
        if (blockedRemote) blockedRemotes[room.name] = blockedRemote;
    }

    function handleContestedRoom(room) {
        const intel = INTEL[contestedRemotes[room.name]];
        if (intel.contestingCount > room.level * 2) {
            log.a(`${roomLink(room.name)} is no longer contesting ${roomLink(contestedRemotes[room.name])} due to casualties.`, "LOCAL COMMAND:");
            INTEL[contestedRemotes[room.name]].lastContest = Game.time;
            INTEL[contestedRemotes[room.name]].contestingCount = 0;
            return contestedRemotes[room.name] = undefined;
        }
        if (intel.armedHostile && intel.armedHostile + CREEP_LIFE_TIME > Game.time) {
            if (queueCreepIfNeeded({
                room, role: 'longbowSquad', priority: PRIORITIES.remoteHarvester + 1,
                numberNeeded: 4, destination: contestedRemotes[room.name], misc: {waitFor: 4}
            })) {
                if (!intel.contestingCount) INTEL[contestedRemotes[room.name]].contestingCount = 1;
                else INTEL[contestedRemotes[room.name]].contestingCount++;
            }
        } else {
            if (queueCreepIfNeeded({
                room, role: 'longbow', priority: PRIORITIES.remoteHarvester + 1,
                numberNeeded: 1, destination: contestedRemotes[room.name]
            })) {
                if (!intel.contestingCount) INTEL[contestedRemotes[room.name]].contestingCount = 1;
                else INTEL[contestedRemotes[room.name]].contestingCount++;
            }
        }
        if (!intel.armedHostile || intel.armedHostile + CREEP_LIFE_TIME < Game.time) {
            handleReservation(room, contestedRemotes[room.name]);
        }
    }

    function handleBlockedRoom(room) {
        const intel = INTEL[blockedRemotes[room.name]];
        if (intel && (!intel.armedHostile || intel.armedHostile + CREEP_LIFE_TIME < Game.time)) {
            if (intel.claimClear && Game.gcl.level > MY_ROOMS.length) {
                queueCreepIfNeeded({
                    room, role: 'claimer', priority: PRIORITIES.secondary,
                    numberNeeded: 1, destination: blockedRemotes[room.name], operation: 'claimClear'
                });
            } else {
                queueCreepIfNeeded({
                    room, role: 'cleaner', priority: PRIORITIES.secondary,
                    numberNeeded: 2, destination: blockedRemotes[room.name]
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

            remoteSource = _.min(_.filter(remoteSource, (s) => {
                if (!remoteRoomTargets[room.name].includes(s.room) || shouldSkipRemote(room, s.room) || s.score > acceptedScore) return false;
                if (INTEL[s.room].sk && !getCreepCount(undefined, 'SKAttacker', s.room)) return false;
                return !occupiedSources.has(s.source);
            }), 'score');

            if (remoteSource && remoteSource.room) {
                // Deprioritize remote spawn only when both stock and flow are healthy. A stockpiled
                // room with negative trend needs the income — keep remote priority high.
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
            const count = room.memory.remotePenalty ? 1 : INTEL[harvester.memory.destination] && INTEL[harvester.memory.destination].sk ? 4 : 3;
            if (assignedHaulers.length >= count) continue;
            const haulingCapacity = assignedHaulers.reduce((sum, creep) => sum + creep.getActiveBodyparts(CARRY) * 50, 0);
            const harvestAmount = harvester.memory.other.haulingRequired * 2.25;
            if (harvestAmount && haulingCapacity < harvestAmount) {
                // Same flow check as remoteHarvester — don't deprioritize haulers if trend is bad.
                const rhlEnergyInfo = room.memory.energyInfo;
                const rhlTrendOk = !rhlEnergyInfo || (rhlEnergyInfo.trend || 0) >= -3;
                const priority = room.energyState > 1 && room.storage && rhlTrendOk ? PRIORITIES.remoteHauler * 2 : PRIORITIES.remoteHauler;
                queueCreep(room, priority + getCreepCount(undefined, 'remoteHauler', room.name), {
                    role: 'remoteHauler',
                    destination: room.name,
                    other: {
                        source: sourceId,
                        remoteRoom: harvester.memory.destination,
                        harvestAmount: harvestAmount
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
            activeSkMining[room.name] = Game.time;
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
};

// ============================================================
// GLOBAL CREEP QUEUE
// ============================================================

module.exports.globalCreepQueue = function () {
    const operations = {...Memory.targetRooms, ...Memory.auxiliaryTargets};

    /**
    if (HARASSMENT_OPERATIONS && THREATS && THREATS.length && _.filter(INTEL, i => THREATS.includes(i.user)).length) {
        const amount = _.filter(MY_ROOMS, r => Game.rooms[r].level >= MAX_LEVEL - 1 && Game.rooms[r].energyState).length * 0.25 || 1;
        queueCreepIfNeeded({
            role: 'longbow', priority: PRIORITIES.secondary,
            numberNeeded: Math.min(amount, _.filter(INTEL, i => THREATS.includes(i.user)).length),
            operation: 'harass'
        });
    }**/

    if (_.isEmpty(operations)) return;

    for (let key in operations) {
        const operation = operations[key];
        if (!operation) {
            delete Memory.targetRooms[key];
            delete Memory.auxiliaryTargets[key];
            continue;
        }

        const opLevel = Memory.targetRooms[key] ? operation.level : operation.level || 1;
        let priority = INTEL[key] ? getPriority(key) : PRIORITIES.secondary;
        operation.priority = priority;

        if (operation.builders) {
            queueCreepIfNeeded({role: 'drone', priority: PRIORITIES.drone + 1, numberNeeded: 6, destination: key});
        }

        if (!INTEL[key] || !opLevel) {
            queueCreepIfNeeded({role: 'scout', priority: 1, numberNeeded: 1, destination: key, closestRoom: true});
            continue;
        }

        switch (operation.type) {
            case 'scout':
                queueCreepIfNeeded({role: 'scout', priority: 1, numberNeeded: 1, destination: key, closestRoom: true});
                break;
            case 'claim':
                queueCreepIfNeeded({role: 'claimer', priority, numberNeeded: 1, destination: key, closestRoom: true});
                break;
            case 'rebuild':
                if (!INTEL[key] || !INTEL[key].lastPlayerSighting || INTEL[key].lastPlayerSighting + 750 < Game.time || INTEL[key].safemode) {
                    const rebuildRoom = Game.rooms[key];
                    let rebuildPriority = 2;
                    if (rebuildRoom) {
                        const hasSpawn = rebuildRoom.spawns.length > 0;
                        if (!hasSpawn) rebuildPriority = 1;
                        else if (rebuildRoom.storage && rebuildRoom.terminal) rebuildPriority = PRIORITIES.drone;
                        else rebuildPriority = 3;
                    }
                    queueCreepIfNeeded({
                        role: 'drone', priority: rebuildPriority + getCreepCount(undefined, 'drone', key),
                        numberNeeded: 6, destination: key, misc: {boosts: [WORK]}, closestRoom: true
                    });
                }
                if (INTEL[key].threatLevel) {
                    if (INTEL[key].threatLevel > 1) {
                        const maxLevelOfAttacker = userStrength(_.max(INTEL[key].hostileOwners, (o) => userStrength(o)));
                        if ((maxLevelOfAttacker >= 7 && MAX_LEVEL < 7) || (maxLevelOfAttacker > MAX_LEVEL + 1)) continue;
                    }
                    const count = INTEL[key].threatLevel ? 4 : 2;
                    const boosts = INTEL[key].threatLevel > 2 ? [RANGED_ATTACK, HEAL] : undefined;
                    queueCreepIfNeeded({
                        role: 'longbowSquad', priority: priority + 1, numberNeeded: count, destination: key,
                        misc: {waitFor: count, boosts: boosts}, closestRoom: true
                    });
                }
                break;
            case 'commodity':
            case 'mineral':
                queueCreepIfNeeded({
                    role: 'commodityMiner', priority, numberNeeded: 3, destination: key,
                    misc: {boosts: [WORK]}, closestRoom: true
                });
                break;
            case 'power':
                if (!operation.complete) {
                    const powerSpace = operation.space || 1;
                    const powerAttacker = getCreepCount(undefined, 'powerAttacker', key);
                    queueCreepIfNeeded({
                        role: 'powerHealer', priority, numberNeeded: powerAttacker * 1.5, destination: key,
                        misc: {boosts: [HEAL]}, closestRoom: true
                    });
                    queueCreepIfNeeded({
                        role: 'powerAttacker', priority: priority - 1, numberNeeded: powerSpace, destination: key,
                        misc: {boosts: [ATTACK]}, closestRoom: true
                    });
                }
                if (operation.hauler) {
                    queueCreepIfNeeded({
                        role: 'powerHauler',
                        priority,
                        numberNeeded: operation.hauler,
                        destination: key,
                        closestRoom: true
                    });
                }
                break;
            case 'remoteDenial':
                const remotes = _.filter(_.map(Game.map.describeExits(key)), function (r) {
                    return (!INTEL[r] || !INTEL[r].owner) && Object.values(Game.map.describeExits(r)).length > 1;
                });
                queueCreepIfNeeded({
                    role: 'longbow', priority, numberNeeded: 1, destination: key,
                    misc: {remotes: remotes}, closestRoom: true, operation: 'remoteDenial'
                });
                break;
            case 'roomDenial':
                const rdIntel = INTEL[key];
                const rdTowers = rdIntel && rdIntel.towers || 0;
                const rdWaves = operation.waves || 0;
                if (rdTowers) {
                    Memory.targetRooms[key].boosts = [TOUGH, HEAL];
                    const p85Damage = rdIntel.towerData ? rdIntel.towerData.average : rdTowers * 300;
                    const useSolo = MAX_LEVEL >= 7 && p85Damage <= 960 && !rdIntel.activeDefenders && rdWaves < 2;
                    if (useSolo) {
                        queueCreepIfNeeded({
                            role: 'longbow',
                            priority,
                            numberNeeded: 1,
                            destination: key,
                            closestRoom: true,
                            operation: 'roomDenial',
                            misc: {boosts: [TOUGH, RANGED_ATTACK, HEAL]}
                        });
                    } else {
                        // If a room has activeDefenders spawn a longbowSquad otherwise a siege pair
                        if (rdIntel.activeDefenders) {
                            const waitFor = (rdWaves >= 2 || p85Damage > 960) ? 4 : 2;
                            queueCreepIfNeeded({
                                role: 'longbowSquad', priority, numberNeeded: waitFor, destination: key,
                                misc: {waitFor: waitFor, boosts: [TOUGH, RANGED_ATTACK, HEAL]},
                                closestRoom: true,
                                operation: 'roomDenial'
                            });
                        } else {
                            queueCreepIfNeeded({
                                role: 'siegeDuo',
                                priority,
                                numberNeeded: 2,
                                destination: key,
                                misc: {boosts: [TOUGH, HEAL, ATTACK]},
                                closestRoom: true,
                                operation: 'roomDenial'
                            });
                        }
                    }
                } else {
                    Memory.targetRooms[key].boosts = undefined;
                    queueCreepIfNeeded({
                        role: 'longbow',
                        priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
                    });
                }
                if (operation.claimAttacker) {
                    queueCreepIfNeeded({
                        role: 'claimAttacker',
                        priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
                    });
                }
                if (operation.cleaner) {
                    queueCreepIfNeeded({
                        role: 'cleaner',
                        priority,
                        numberNeeded: 2,
                        destination: key,
                        closestRoom: true,
                        operation: 'roomDenial'
                    });
                }
                break;
            case 'claimClear':
                queueCreepIfNeeded({
                    role: 'claimer',
                    priority,
                    numberNeeded: 1,
                    destination: key,
                    closestRoom: true,
                    operation: 'claimClear'
                });
                break;
            case 'guard':
                if (opLevel === 1) {
                    queueCreepIfNeeded({
                        role: 'longbow',
                        priority,
                        numberNeeded: 1,
                        destination: key,
                        closestRoom: true,
                        operation: 'guard'
                    });
                } else if (opLevel > 1) {
                    queueCreepIfNeeded({
                        role: 'longbowSquad', priority, numberNeeded: 2, destination: key,
                        misc: {waitFor: 2, boosts: [RANGED_ATTACK, HEAL]}, closestRoom: true, operation: 'guard'
                    });
                }
                break;
            case 'stronghold':
                Memory.targetRooms[key].boosts = [HEAL];
                queueCreepIfNeeded({
                    role: 'siegeDuo',
                    priority,
                    numberNeeded: opLevel * 2,
                    destination: key,
                    closestRoom: true,
                    operation: 'roomDenial'
                });
                if (operation.loot) queueCreepIfNeeded({
                    role: 'remoteHauler',
                    priority,
                    numberNeeded: 2,
                    destination: key,
                    closestRoom: true,
                    operation: 'roomDenial'
                });
                break;
        }
    }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function queueCreepIfNeeded(spawnInfo) {
    _.defaults(spawnInfo, {
        priority: PRIORITIES.secondary,
        numberNeeded: 1,
        misc: {},
        other: {}
    });
    if (spawnInfo.numberNeeded <= 0) return false;

    if (spawnInfo.other.target) spawnInfo.destination = spawnInfo.other.target;

    const count = getCreepCount(spawnInfo.room, spawnInfo.role, spawnInfo.destination, spawnInfo.operation, spawnInfo.colony, spawnInfo.other.assignment);
    const global = (!spawnInfo.room && spawnInfo.destination) || spawnInfo.global;

    if (count < spawnInfo.numberNeeded || (count <= spawnInfo.numberNeeded && creepExpiringSoon(spawnInfo.room, spawnInfo.role, spawnInfo.destination, spawnInfo.operation, spawnInfo.colony, spawnInfo.other.assignment))) {
        spawnInfo.other.reboot = spawnInfo.rebootCondition;
        return queueCreep(spawnInfo.room || spawnInfo.colony, spawnInfo.priority + count, {
            role: spawnInfo.role,
            destination: spawnInfo.destination,
            other: spawnInfo.other,
            misc: spawnInfo.misc,
            operation: spawnInfo.operation,
            military: !!spawnInfo.operation,
            assignment: spawnInfo.assignment
        }, global, spawnInfo.closestRoom);
    }
}

function queueCreep(room = undefined, priority, options = {}, global = undefined, closestRoom = undefined) {
    if (global && !CREEP_QUEUES['global']) CREEP_QUEUES['global'] = {};
    if (room && !CREEP_QUEUES[room.name]) CREEP_QUEUES[room.name] = {};

    let cache = global ? CREEP_QUEUES['global'] : CREEP_QUEUES[room.name];
    if (typeof cache !== 'object') cache = {};

    const cacheKey = `c_${options.role}_${options.destination}_${options.other.reboot ? 'reboot' : ''}_${options.misc ? 'misc' : ''}_${options.operation || ''}`;

    if (cache[cacheKey] && cache[cacheKey].priority <= priority) return;
    if (cache[cacheKey]) delete cache[cacheKey];

    if (!global) options.room = room ? room.name : undefined;
    _.defaults(options, {other: {}});

    cache[cacheKey] = {
        cached: Game.time,
        priority,
        role: options.role,
        assignedSource: options.assignedSource,
        destination: options.destination,
        other: options.other,
        military: COMBAT_ROLES.includes(options.role),
        operation: options.operation,
        misc: options.misc,
        global,
        closestRoom,
        assignment: options.assignment
    };

    if (global) CREEP_QUEUES['global'] = cache;
    else CREEP_QUEUES[room.name] = cache;

    return true;
}

let queueCache = {};

// Operations that must hold their room assignment even when the assigned room loses
// combatReady — better to wait for the room to recover than to churn a new assignee.
// Rebuilds especially: the assigned colony has typically been making the trip for many
// CREEP_LIFE_TIMEs and reassigning loses that travel investment.
const CRITICAL_OP_TYPES = new Set(['rebuild', 'claim']);

function getQueue(room) {
    const cached = queueCache[room.name];
    if (cached && cached.tick === Game.time) return cached.queue;

    const operationQueue = collectGlobalOperations(room);
    const roomQueue = CREEP_QUEUES[room.name] || {};
    const merged = Object.assign({}, operationQueue, roomQueue);
    const sorted = _.sortBy(adjustQueuePriority(merged, room), 'priority');

    queueCache[room.name] = {queue: sorted, tick: Game.time};
    displayQueue(room, sorted);
    return sorted;
}

function collectGlobalOperations(room) {
    const globalQueue = CREEP_QUEUES['global'];
    if (!globalQueue) return {};
    const out = {};
    for (const key in globalQueue) {
        const accepted = considerGlobalEntry(room, globalQueue[key]);
        if (accepted) out[key] = accepted;
    }
    return out;
}

function considerGlobalEntry(room, entry) {
    // Entries with no destination are unassigned global work — anyone can take.
    if (!entry.destination) return {...entry};

    // An op targeted at this very room is dispatched through a different path.
    if (entry.destination === room.name) return null;

    const target = entry.other && entry.other.assignment ? entry.other.assignment : entry.destination;
    const opMemory = Memory.targetRooms[target] || Memory.auxiliaryTargets[target];
    if (!opMemory) return null;

    const intel = INTEL[target];
    const levelTarget = computeOpLevelTarget(target, opMemory, intel);

    if (entry.closestRoom) {
        const assigned = resolveAssignment(room, target, opMemory, levelTarget, entry, intel);
        if (assigned !== room.name) return null;
    } else if (opMemory.assignedRoom && opMemory.assignedRoom !== room.name) {
        return null;
    }

    // Per-room gate: if this colony is hurt and the op isn't critical, hold off.
    // Note: assignment is preserved — when the room recovers it picks up where it left.
    //if (!room.memory.combatReady && !CRITICAL_OP_TYPES.has(opMemory.type)) return null;

    if (room.level < levelTarget) return null;

    return {...entry};
}

function computeOpLevelTarget(target, opMemory, intel) {
    if (Memory.auxiliaryTargets[target]) return MAX_LEVEL - 1;
    switch (opMemory.type) {
        case 'scout':
            return 1;
        case 'claim':
            return 5;
        case 'roomDenial': {
            const towers = (intel && intel.towers) || 0;
            //if (towers >= 3) return 8;
            if (towers >= 2) return 7;
            if (towers === 1) return 6;
            return 4;
        }
        case 'guard':
            return 5;
    }
    if (intel && intel.user) return Math.max(1, (intel.level || 4) - 1);
    if (intel) return 4;
    return MAX_LEVEL;
}

function resolveAssignment(room, target, opMemory, levelTarget, entry, intel) {
    const now = Game.time;
    if (opMemory.assignedRoom) {
        // Add a check for energy starved rooms needing to be re-assigned
        if (Memory.targetRooms[target] && !Game.rooms[opMemory.assignedRoom].memory.combatReady) {
            if (!opMemory.assignmentEnergyCounter) opMemory.assignmentEnergyCounter = 0;
            if (opMemory.assignmentEnergyCounter > 100) {
                unassignRoom(target, 'Room is not combat ready.');
            }
            opMemory.assignmentEnergyCounter++;
            return opMemory.assignedRoom;
        } else if (Memory.auxiliaryTargets[target] && !Game.rooms[opMemory.assignedRoom].memory.auxilaryReady) {
            if (!opMemory.assignmentEnergyCounter) opMemory.assignmentEnergyCounter = 0;
            if (opMemory.assignmentEnergyCounter > 100) {
                unassignRoom(target, 'Room is not auxiliary ready.');
            }
            opMemory.assignmentEnergyCounter++;
            return opMemory.assignedRoom;
        }

        const stale = opMemory.assignedAt && opMemory.assignedAt + (CREEP_LIFE_TIME * 2) < now;

        if (!stale) return opMemory.assignedRoom;

        if (stale) {
            // Hold off on refresh if the assigned colony has a creep mid-assembly
            const assignedRoom = Game.rooms[opMemory.assignedRoom];
            const inflight = assignedRoom && assignedRoom.myCreeps.some(c =>
                c.memory.waitingToAssemble &&
                (c.memory.destination === target ||
                    (c.memory.other && c.memory.other.assignment === target)));
            if (inflight) return opMemory.assignedRoom;
            unassignRoom(target, 'Refreshing assignment.');
        }
    }

    if (!intel) return null;

    const resolved = getAssignedRoom(target, levelTarget, entry);
    if (!resolved) return null;

    opMemory.assignedRoom = resolved;
    opMemory.assignedAt = now;
    log.a(`Assigning the operation in ${roomLink(target)} to ${roomLink(resolved)}`, 'OPERATIONS:');
    return resolved;
}

function displayQueue(room, queue) {
    const activeSpawns = room.spawns.filter((s) => s.spawning);
    if (!_.size(queue) && !activeSpawns.length) return;

    let yOffset = 1;
    const x = 35;
    const width = 14;
    const limit = Math.min(5, queue.length);
    let rows = 1 + limit + activeSpawns.length; // Header + Queue + Spawning

    // Draw semi-transparent background box
    room.visual.rect(x - 0.25, yOffset - 0.75, width + 0.5, (rows * 1.1) + 0.2, {
        fill: '#111111',
        opacity: 0.75,
        stroke: '#333333',
        strokeWidth: 0.05
    });

    // Header
    room.visual.text('🛠️ Build Queue', x + 0.2, yOffset, {
        color: '#ffffff',
        align: 'left',
        font: 'bold 0.6 Tahoma'
    });
    yOffset += 1.2;

    // Active Spawns (Progress Bars)
    for (let spawn of activeSpawns) {
        const spawningName = spawn.spawning.name || "";
        const roleName = _.capitalize(spawningName.split("_")[0]);
        const progress = ((spawn.spawning.needTime - spawn.spawning.remainingTime) / spawn.spawning.needTime) * 100;

        // Background track
        room.visual.rect(x, yOffset - 0.4, width, 0.8, {fill: '#222222', opacity: 0.8});
        // Progress fill
        const fillWidth = Math.max(0, Math.min(width, width * (progress / 100)));
        if (fillWidth > 0) {
            room.visual.rect(x, yOffset - 0.4, fillWidth, 0.8, {fill: '#4CAF50', opacity: 0.6}); // Greenish for active building
        }

        room.visual.text(`Spawning: ${roleName}`, x + 0.2, yOffset + 0.15, {
            color: '#ffffff',
            align: 'left',
            font: 'bold 0.45 Tahoma'
        });
        room.visual.text(`${spawn.spawning.remainingTime}t`, x + width - 0.2, yOffset + 0.15, {
            color: '#dddddd',
            align: 'right',
            font: '0.45 Tahoma'
        });
        yOffset += 1.1;
    }
    // Queued Items
    for (let i = 0; i < limit; i++) {
        let item = queue[i];
        let cost = global.UNIT_COST(item.body);
        if (!cost) continue;

        const show = item.operation || item.role;
        const color = room.energyAvailable >= cost ? '#00B7EB' : '#FF4500'; // Blue if we have energy, Red/Orange if waiting

        room.visual.text(`${i + 1}. ${_.capitalize(show)}`, x + 0.2, yOffset, {
            color: color,
            align: 'left',
            font: '0.5 Tahoma'
        });
        room.visual.text(`${cost}⚡ P:${item.priority}`, x + width - 0.2, yOffset, {
            color: '#dddddd',
            align: 'right',
            font: '0.5 Tahoma'
        });
        yOffset += 1.1;
    }
}

const CLAIM_ROLES = new Set(['claimer', 'claimAttacker', 'reserver']);

const assignmentCooldown = {};
function getAssignedRoom(targetRoom, level, creepInfo) {
    // Check if this room is on cooldown
    if (assignmentCooldown[targetRoom] && assignmentCooldown[targetRoom] > Game.time) return null;

    let assignmentCounts = {};
    for (const op of Object.values(Memory.targetRooms)) {
        if (op && op.assignedRoom) assignmentCounts[op.assignedRoom] = (assignmentCounts[op.assignedRoom] || 0) + 1;
    }
    for (const op of Object.values(Memory.auxiliaryTargets)) {
        if (op && op.assignedRoom) assignmentCounts[op.assignedRoom] = (assignmentCounts[op.assignedRoom] || 0) + 1;
    }

    const candidates = MY_ROOMS
        .filter((key) => key !== targetRoom)
        .map((key) => ({key, linear: Game.map.getRoomLinearDistance(targetRoom, key)}))
        .sort((a, b) => a.linear - b.linear);

    const maxDistance = CLAIM_ROLES.has(creepInfo.role) ? 12 : 22;

    let closest = null;
    let closestDistance = Infinity;

    for (const {key, linear} of candidates) {
        if (linear >= closestDistance) break;
        const myRoom = Game.rooms[key];
        if (!myRoom) continue;
        if (myRoom.controller.level !== myRoom.level || myRoom.downgraded || !myRoom.memory.combatReady) continue;
        if (myRoom.level < level) continue;

        // Check for readiness
        if (Memory.targetRooms[key] && !myRoom.memory.combatReady) continue;
        if (Memory.auxiliaryTargets[key] && !myRoom.memory.auxilaryReady) continue;

        const route = myRoom.shibRoute(targetRoom);
        const distance = Array.isArray(route) && route.length ? route.length : Infinity;
        if (distance >= closestDistance || distance > maxDistance) continue;

        if ((assignmentCounts[key] || 0) >= CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][myRoom.level]) continue;

        // Verify we can make the body
        const generatedInfo = new generator(myRoom.level, creepInfo.role, myRoom, creepInfo).generateBody();
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) continue;

        closestDistance = distance;
        closest = key;
        if (distance === 1) break;
    }

    assignmentCooldown[targetRoom] = Game.time + 50;
    return closest;
}

function unassignRoom(destination, logEntry) {
    const opMemory = Memory.targetRooms[destination] || Memory.auxiliaryTargets[destination];
    if (!opMemory || !opMemory.assignedRoom) return;
    const fromRoom = opMemory.assignedRoom;
    delete opMemory.assignedRoom;
    delete opMemory.assignedAt;
    log.a(`Unassigning the operation in ${roomLink(destination)} from ${roomLink(fromRoom)}. ${logEntry}`, 'OPERATIONS:');
}

function determineEnergyOrder(room) {
    storedLevel[room.name] = getLevel(room);
    if (!room.hub.x) {
        const planner = require('module.roomPlanner');
        planner.findHub(room);
        return false;
    }
    if (energyOrder[room.name] && orderStored[room.name] + 750 >= Game.time) return true;

    // Source extensions = extensions within range 2 of a source. The stationary harvester
    // sits at range 1 of its source, so range-2 extensions are within one transfer of the
    // harvester and can be refilled without involving haulers. Spawns are excluded — a
    // spawn that happens to be range-2 of a source isn't part of the harvester refill
    // loop, and putting it ahead of actual extensions drains spawn energy first (which
    // is what we want to keep as fallback).
    const sourceExtIds = new Set();
    for (const source of room.sources) {
        for (const s of source.pos.findInRange(room.extensions, 2)) {
            sourceExtIds.add(s.id);
        }
    }

    const byHub = (a, b) => a.pos.getRangeTo(room.hub) - b.pos.getRangeTo(room.hub);

    // Source extensions first — drain-and-refill loop with the harvester.
    const sourceExts = room.extensions.filter(s => sourceExtIds.has(s.id)).sort(byHub);

    // Other extensions next, closer-to-hub first so hauler refill trips stay short.
    const otherExts = room.extensions.filter(s => !sourceExtIds.has(s.id)).sort(byHub);

    // Spawns last — keeps their internal energy reserved as the fallback bucket once
    // extensions run dry.
    const spawns = room.spawns.slice().sort(byHub);

    energyOrder[room.name] = JSON.stringify(sourceExts.concat(otherExts, spawns));
    orderStored[room.name] = Game.time;
    return true;
}

function updateCreepCountCache() {
    const currentTick = Game.time;
    if (CREEP_COUNT_CACHE.tick === currentTick) return;

    if (currentTick - CREEP_COUNT_CACHE.lastUpdate < 5 && lastGlobalSpawn + 10 < currentTick) {
        CREEP_COUNT_CACHE.tick = currentTick;
        return;
    }

    const counts = {};
    const allCreeps = Object.values(Game.creeps);

    for (const creep of allCreeps) {
        if (!creep.my) continue;
        processCreepForCache(counts, creep);
    }

    CREEP_COUNT_CACHE.counts = counts;
    CREEP_COUNT_CACHE.tick = currentTick;
    CREEP_COUNT_CACHE.lastUpdate = currentTick;
}

function processCreepForCache(counts, creep) {
    const role = creep.memory.oldRole || creep.memory.role || '';
    const destination = creep.memory.destination || creep.room.name;
    const room = creep.room.name || creep.memory.colony;
    const colony = creep.memory.colony || creep.room.name;
    const operation = creep.memory.operation || '';
    const assignment = creep.memory.assignment || '';

    incrementCreepCount(counts, `${role}_${room}_noDest_noOp`, creep);
    if (operation) incrementCreepCount(counts, `${role}_${room}_noDest_${operation}`, creep);
    if (assignment) incrementCreepCount(counts, `${role}_${assignment}`, creep);
    if (destination) incrementCreepCount(counts, `${role}_${destination}_noOp`, creep);
    if (operation) incrementCreepCount(counts, `${role}_noDest_${operation}`, creep);
    if (destination && operation) incrementCreepCount(counts, `${role}_${destination}_${operation}`, creep);
    if (colony) incrementCreepCount(counts, `${role}_noDest_noOp_${colony}`, creep);
    incrementCreepCount(counts, `${role}_noDest_noOp_noColony`, creep);
}

function incrementCreepCount(counts, key, creep) {
    if (!counts[key]) counts[key] = {count: 0, minTTL: Infinity, bodyLen: 0};
    counts[key].count++;
    const ttl = creep.spawning ? Infinity : (creep.ticksToLive || Infinity);
    if (ttl < counts[key].minTTL) {
        counts[key].minTTL = ttl;
        counts[key].bodyLen = creep.body.length;
    }
}

function getCreepCount(room = undefined, role, destination = undefined, operation = undefined, colony = undefined, assignment = undefined) {
    updateCreepCountCache();
    const counts = CREEP_COUNT_CACHE.counts;

    let key;
    if (assignment) key = `${role}_${assignment}`;
    else if (!destination && !operation && !assignment && room) key = `${role}_${room.name}_noDest_noOp`;
    else if (room && operation && !destination && !assignment) key = `${role}_${room.name}_noDest_${operation}`;
    else if (destination && !operation) key = `${role}_${destination}_noOp`;
    else if (!destination && operation) key = `${role}_noDest_${operation}`;
    else if (destination && operation) key = `${role}_${destination}_${operation}`;
    else if (!destination && !operation && !room && colony) key = `${role}_noDest_noOp_${colony.name}`;
    else if (!destination && !operation && !room) key = `${role}_noDest_noOp_noColony`;
    else return 0;

    return counts[key] ? counts[key].count : 0;
}

function creepExpiringSoon(room = undefined, role, destination = undefined, operation = undefined, colony = undefined, assignment = undefined) {
    updateCreepCountCache();
    const counts = CREEP_COUNT_CACHE.counts;

    let key;
    if (assignment) key = `${role}_${assignment}`;
    else if (!destination && !operation && !assignment && room) key = `${role}_${room.name}_noDest_noOp`;
    else if (room && operation && !destination && !assignment) key = `${role}_${room.name}_noDest_${operation}`;
    else if (destination && !operation) key = `${role}_${destination}_noOp`;
    else if (!destination && operation) key = `${role}_noDest_${operation}`;
    else if (destination && operation) key = `${role}_${destination}_${operation}`;
    else if (!destination && !operation && !room && colony) key = `${role}_noDest_noOp_${colony.name}`;
    else if (!destination && !operation && !room) key = `${role}_noDest_noOp_noColony`;
    else return false;

    const data = counts[key];
    if (!data || data.count <= 0 || data.minTTL === Infinity) return false;

    let distance = 0;
    if (destination) {
        const originRoom = findClosestOwnedRoom(destination, false, MAX_LEVEL);
        distance = originRoom ? Game.map.getRoomLinearDistance(originRoom, destination) * 50 : 0;
    }
    const spawnTime = 3 * data.bodyLen;
    return data.minTTL <= (spawnTime + distance);
}

function getBodyAbilityPower(room, role) {
    const generated = new generator(room.level, role, room).generateBody();
    return abilityPower(generated.body);
}

function generateCreepName(role, level, operation) {
    let name = role.slice(0, 3) + '' + level + '' + getRandomInt(100, 999);
    if (operation) name = operation.slice(0, 3) + '' + level + '' + getRandomInt(100, 999);
    return name;
}

function adjustQueuePriority(queue, room) {
    for (const key in queue) {
        const creep = queue[key];
        creep.body = undefined;

        const target = creep.destination && (creep.other && creep.other.assignment
            ? creep.other.assignment
            : creep.destination);
        const opMemory = target
            ? Memory.targetRooms[target] || Memory.auxiliaryTargets[target]
            : null;

        const generatedInfo = new generator(room.level, creep.role, room, creep).generateBody();
        if (!generatedInfo || !generatedInfo.body || !generatedInfo.body.length) {
            // Only unassign when this room is the actual assignee — otherwise we'd be
            // tearing down another colony's assignment because of our own constraints.
            if (opMemory && opMemory.assignedRoom === room.name) {
                unassignRoom(target, 'Unable to generate needed body.');
            }
            delete queue[key];
            continue;
        }

        const body = generatedInfo.body;
        creep.body = body;
        if (!body.length) continue;

        if (opMemory && opMemory.boosts && opMemory.boosts.includes(HEAL) &&
            !room.boostCheck(body, undefined, opMemory.boostTier)) {
            if (opMemory.assignedRoom === room.name) {
                unassignRoom(target, 'Missing required boosts.');
            }
            delete queue[key];
            continue;
        }

        if (creep.destination && (Memory.targetRooms[creep.destination] || Memory.auxiliaryTargets[creep.destination])) {
            if (room.energyState && room.storage) creep.priority *= 0.5;
            else if (creep.military) creep.priority *= 6;
        }
        creep.priority = Math.max(1, Math.round(creep.priority));
    }
    return queue;
}

function getPriority(room) {
    const range = findClosestOwnedRoom(room, true);
    const typeMulti = Memory.targetRooms[room] ? 1 : 2;
    const energyMulti = room.energyState < 2 ? 1.5 : 1;
    if (range <= 3) return (PRIORITIES.priority * typeMulti) * energyMulti;
    else if (range <= 5) return (PRIORITIES.urgent * typeMulti) * energyMulti;
    else if (range <= 7) return (PRIORITIES.high * typeMulti) * energyMulti;
    else if (range <= 10) return (PRIORITIES.medium * typeMulti) * energyMulti;
    else return (PRIORITIES.secondary * typeMulti) * energyMulti;
}

module.exports.operationSustainability = function (room, operationRoom = room.name) {
    let operation = Memory.targetRooms[operationRoom] || Memory.auxiliaryTargets[operationRoom]
        || Memory.targetRooms[room.name] || Memory.auxiliaryTargets[room.name];

    if (!operation) return;

    if (room.controller && room.controller.safeMode) {
        markAsPending(operationRoom, room);
        return;
    }

    if (operation && operation.sustainabilityCheck === Game.time) return;

    let friendlyDead = operation.friendlyDead || 0;
    let trackedFriendly = operation.trackedFriendly || [];
    let enemyDead = operation.enemyDead || 0;
    let trackedEnemy = operation.trackedEnemy || [];
    let isAtRisk = false;

    friendlyDead = processTombstones(room.tombstones, FRIENDLIES, friendlyDead, trackedFriendly);
    enemyDead = processTombstones(room.tombstones, null, enemyDead, trackedEnemy);

    operation.friendlyDead = friendlyDead;
    operation.trackedFriendly = trackedFriendly;
    operation.enemyDead = enemyDead;
    operation.trackedEnemy = trackedEnemy;
    operation.sustainabilityCheck = Game.time;
    operation.isAtRisk = isAtRisk;

    if (room.tombstones.length) {
        const deadEnemy = _.filter(room.tombstones, (t) => !FRIENDLIES.includes(t.creep.owner.username));
        operation.lastEnemyKilled = _.max(deadEnemy, 'deathTime');
    }

    saveOperation(operationRoom, operation);

    if (isAtRisk) {
        log.w(`Operation in ${room.name} is at risk due to enemy reinforcements or resource depletion. Consider adjusting strategy.`, 'OPERATION PLANNER: ');
    }
};

function markAsPending(operationRoom, room) {
    let cache = Memory.targetRooms || {};
    let tick = Game.time;
    cache[operationRoom] = {
        tick: tick,
        type: 'remoteDenial',
        level: 1,
        dDay: tick + room.controller.safeMode,
    };

    log.a(`${room.name} is now marked as a Remote Denial due to safemode.`, 'OPERATION PLANNER: ');
    Memory.targetRooms = cache;
}

function processTombstones(tombstones, friendlyList, deadCount, trackedList) {
    let relevantTombstones = _.filter(tombstones, (s) => (friendlyList ? _.includes(friendlyList, s.creep.owner.username) : !_.includes(FRIENDLIES, s.creep.owner.username)));
    for (let tombstone of relevantTombstones) {
        if (_.includes(trackedList, tombstone.id)) continue;
        deadCount += UNIT_COST(tombstone.creep.body);
        trackedList.push(tombstone.id);
    }
    return deadCount;
}

function saveOperation(operationRoom, operation) {
    if (Memory.targetRooms[operationRoom]) {
        Memory.targetRooms[operationRoom] = operation;
    } else if (Memory.auxiliaryTargets[operationRoom]) {
        Memory.auxiliaryTargets[operationRoom] = operation;
    }
}

function siegeLevel(towerCount) {
    if (towerCount > 3) return false;
    if (towerCount >= 3) return MAX_LEVEL >= 8;
    if (towerCount >= 2) return MAX_LEVEL >= 7;
    return MAX_LEVEL >= 6;
}

module.exports.generateThreat = function (creep) {
    let user = INTEL[creep.room.name].user;
    if (_.includes(FRIENDLIES, user)) return;
    let cache = Memory._userList || {};
    let standing = 50;
    if (cache[user] && (cache[user]['standing'] > 50 || _.includes(FRIENDLIES, user))) standing = cache[user]['standing'];
    cache[user] = {
        standing: standing,
        lastAction: Game.time,
    };
    Memory._userList = cache;
};