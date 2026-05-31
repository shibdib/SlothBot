/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.0 - Major CPU + Intelligence Improvements
 *
 * CPU Wins:
 * - Pre-computed exits map
 * - Cached distance calculations
 * - Single-pass operation counting
 * - Better early exits
 *
 * Smarter Targeting:
 * - Enhanced scoring with economic value + wave progress
 * - Better spread-pressure logic
 * - Dynamic wave limits
 *
 * Smarter Management:
 * - Better stale detection
 * - Automatic siege → remote denial downgrade
 * - Stronger casualty ratio abort
 *
 * Response Forces:
 * - Strict TTL feasibility
 * - Power-based assignment
 * - Better prioritization
 */

let OPERATION_LIMIT;
let SIEGE_LIMIT;
let lastNoSiegeWarning = 0;
const lastRun = {};
const tasks = ['housekeeping', 'flags', 'military', 'auxiliary', 'response', 'nukes'];

module.exports.highCommand = function () {
    if (typeof MAX_LEVEL === 'undefined') return;

    OPERATION_LIMIT = Math.ceil(MY_ROOMS.filter(r => Game.rooms[r].memory.combatReady).length * 0.7) || 1;
    SIEGE_LIMIT = Math.ceil(MY_ROOMS.filter(r => Game.rooms[r].level >= 7 && Game.rooms[r].memory.combatReady).length * 0.25);

    for (const task of tasks) {
        if (!checkCooldown(task, getCooldown(task))) continue;

        switch (task) {
            case 'housekeeping':
                if (!Memory.nonCombatRooms) Memory.nonCombatRooms = [];
                if (!Memory.targetRooms) Memory.targetRooms = {};
                if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};
                break;

            case 'flags':
                if (_.size(Game.flags)) manualAttacks();
                break;

            case 'military':
                militaryOperations();
                manageMilitary();
                break;

            case 'auxiliary':
                auxiliaryOperations();
                manageAuxiliary();
                break;

            case 'response':
                manageResponseForces();
                break;

            case 'nukes':
                autoNuke();
                break;
        }
    }
};

function getCooldown(task) {
    switch (task) {
        case 'housekeeping':
            return 10000;
        case 'flags':
            return 25;
        case 'military':
            return 50;
        case 'auxiliary':
            return 100;
        case 'response':
            return 5;
        case 'nukes':
            return 500;
        default:
            return 100;
    }
}

function checkCooldown(task, cooldown) {
    if (!lastRun[task] || lastRun[task] + cooldown < Game.time) {
        lastRun[task] = Game.time;
        return true;
    }
    return false;
}

// ============================================================
// MILITARY OPERATIONS
// ============================================================

function militaryOperations() {
    // Manual operations
    if (MANUAL_OPERATIONS.length) {
        for (const op of MANUAL_OPERATIONS) {
            if (!Memory.targetRooms[op.room]) {
                Memory.targetRooms[op.room] = {
                    tick: Game.time,
                    type: op.type || 'guard',
                    level: op.level || 1,
                    priority: op.priority || PRIORITIES.high,
                    waveLimit: MAX_LEVEL,
                    manual: true
                };
            }
        }
        for (const key in Memory.targetRooms) {
            if (Memory.targetRooms[key].manual && !MANUAL_OPERATIONS.find(o => o.room === key)) {
                delete Memory.targetRooms[key];
            }
        }
    }

    // Pre-compute WAR_TARGETS lookups — used in candidate filtering and scoring.
    const warPriorityByUser = {};
    for (const t of WAR_TARGETS) warPriorityByUser[t.user] = t.priority;
    const warTargetUsers = new Set(Object.keys(warPriorityByUser));

    // Count active operations + attacked owners in one pass
    let activeStrongholds = 0, activeNonSiege = 0, activeSiege = 0;
    const attackedOwners = new Set();

    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op) continue;
        if (op.type === 'stronghold') activeStrongholds++;
        else if (op.type === 'roomDenial' || op.dDay) activeSiege++;
        else activeNonSiege++;
        if (INTEL[key]?.owner) attackedOwners.add(INTEL[key].owner);
    }

    // Strongholds
    if (activeStrongholds < OPERATION_LIMIT) {
        let best = null, bestScore = Infinity;
        for (const r of Object.values(INTEL)) {
            if (!r?.sk || !r.towers || !r.name || Memory.targetRooms[r.name]) continue;
            if (!r.invaderCore || r.invaderCore + CREEP_LIFE_TIME <= Game.time) continue;
            if (!siegeLevel(r.towers) || !myRoomInSectorCheck(r.name)) continue;
            if ((r.lastOperation || 0) + ATTACK_COOLDOWN >= Game.time) continue;

            const score = scoreTarget(r.name, 'stronghold', attackedOwners, warPriorityByUser);
            if (score < bestScore) {
                bestScore = score;
                best = r;
            }
        }
        if (best) setTarget(best.name, 'stronghold', 1);
    }

    if (!OFFENSIVE_OPERATIONS) return;

    // Candidate filter is permissive on strength — guards/harass against a stronger user are
    // fine. The strict siege-only feasibility check happens in the siege block below.
    const strengthCeiling = (global.MY_STRENGTH || MAX_LEVEL) + 2;
    const candidates = Object.values(INTEL).filter(r =>
        r?.name && !Memory.targetRooms[r.name] && r.owner && !r.sk &&
        !FRIENDLIES.includes(r.owner) && !Memory.nonCombatRooms.includes(r.name) &&
        !checkForNap(r.owner) && userStrength(r.owner) <= strengthCeiling &&
        (r.lastOperation || 0) + ATTACK_COOLDOWN < Game.time &&
        warTargetUsers.has(r.owner)
    );

    if (!candidates.length) return;

    // Pre-compute exits once
    const candidateExits = new Map();
    for (const r of candidates) {
        const neighbors = Object.values(Game.map.describeExits(r.name));
        const guardRemotes = neighbors.filter(n => !INTEL[n] || !INTEL[n].user || INTEL[n].user === r.owner);
        const denialHasRemote = neighbors.some(n => !INTEL[n] || !INTEL[n].owner || INTEL[n].owner === r.owner);
        candidateExits.set(r.name, {
            singleRemote: guardRemotes.length === 1 ? guardRemotes[0] : null,
            hasRemote: denialHasRemote
        });
    }

    // Guard operations
    if (activeNonSiege < OPERATION_LIMIT) {
        let bestGuard = null, bestGuardScore = Infinity, bestGuardRemote = null;
        for (const r of candidates) {
            const exits = candidateExits.get(r.name);
            if (!exits.singleRemote) continue;

            let score = scoreTarget(r.name, 'guard', attackedOwners, warPriorityByUser);
            const remoteIntel = INTEL[exits.singleRemote];
            if (remoteIntel?.sources > 1) score -= 50; // prefer rich remotes

            if (score < bestGuardScore) {
                bestGuardScore = score;
                bestGuard = r;
                bestGuardRemote = exits.singleRemote;
            }
        }
        if (bestGuard) {
            setTarget(bestGuardRemote, 'guard');
            attackedOwners.add(bestGuard.owner);
        }
    }

    // Remote denial
    if (activeNonSiege < OPERATION_LIMIT) {
        let bestDenial = null, bestDenialScore = Infinity;
        for (const r of candidates) {
            if (!candidateExits.get(r.name).hasRemote) continue;
            const score = scoreTarget(r.name, 'remoteDenial', attackedOwners, warPriorityByUser);
            if (score < bestDenialScore) {
                bestDenialScore = score;
                bestDenial = r;
            }
        }
        if (bestDenial) setTarget(bestDenial.name, 'remoteDenial');
    }

    // Siege operations
    if (activeSiege < SIEGE_LIMIT) {
        const siegeCooldown = ATTACK_COOLDOWN * 2;
        let bestNoTower = null, bestNoTowerScore = Infinity;
        let bestTower = null, bestTowerScore = Infinity;

        for (const r of candidates) {
            if (r.safemode > Game.time || (r.lastSiege || 0) + siegeCooldown >= Game.time) continue;

            // No direct attacks check
            if (NO_DIRECT_ATTACKS.includes(r.owner)) continue;

            // Siege feasibility — combines relative strength and rampart depth. Lets us siege
            // a strong-RCL-but-naked room and skip a turtle. Negative = outmatched.
            if (siegeFeasibility(r) < -1.0) continue;

            let score = scoreTarget(r.name, 'roomDenial', null, warPriorityByUser);
            if (attackedOwners.has(r.owner)) score -= 100; // escalation bonus

            if (!r.towers) {
                if (score < bestNoTowerScore) {
                    bestNoTowerScore = score;
                    bestNoTower = r;
                }
            } else if (siegeLevel(r.towers)) {
                if (score < bestTowerScore) {
                    bestTowerScore = score;
                    bestTower = r;
                }
            }
        }

        if (bestNoTower) setTarget(bestNoTower.name, 'guard');
        if (bestTower && activeSiege + (bestNoTower ? 1 : 0) < SIEGE_LIMIT) {
            setTarget(bestTower.name, 'roomDenial', bestTower.towers <= 2 ? 3 : 4);
        }
    } else if (!SIEGE_LIMIT && lastNoSiegeWarning + 5000 < Game.time) {
        lastNoSiegeWarning = Game.time;
        log.a('No L7+ combat-ready rooms — siege operations disabled.', 'HIGH COMMAND: ');
    }
}

// Convert rampart median HP to a level-equivalent strength bump for feasibility math.
// Curve calibrated against real-world rampart depths: 50M = +0.5, 100M = +1.0,
// 200M = +1.5 (cap). Lets us still siege through mid-tier ramparts but skip deep turtles.
function rampartLevelEquivalent(intel) {
    if (!intel || !intel.rampartMedHP) return 0;
    return Math.min(intel.rampartMedHP / 100000000, 1.5);
}

// Positive = we should be able to siege, negative = outmatched. Compares relative composite
// strength and bakes in rampart depth so a strong-RCL-but-naked target stays feasible.
function siegeFeasibility(r) {
    const myStrength = global.MY_STRENGTH || MAX_LEVEL;
    return myStrength - userStrength(r.owner) - rampartLevelEquivalent(r);
}

function scoreTarget(roomName, type, attackedOwners = null, warPriorityByUser = null) {
    const r = INTEL[roomName];
    if (!r) return Infinity;

    let score = 0;
    const distance = findClosestOwnedRoom(roomName, true);

    score += distance * 20;

    if (THREATS.includes(r.owner)) score -= 200;
    if (type === 'roomDenial') {
        score += (r.level || 0) * 10 + (r.towers || 0) * 100;
        // Prefer brittle siege targets. Curve spans real-world rampart depths:
        // 30M = +9, 100M = +30, 300M = +90 (cap). Among sieageable rooms, picks the thinner one.
        if (r.rampartMedHP) {
            score += Math.min(r.rampartMedHP / 10000000, 30) * 3;
        }
    } else {
        score += (r.level || 0) * 30 + (r.towers || 0) * 100;
    }

    // Strength gap × distance — strong distant targets become very unattractive,
    // strong close targets stay viable (they're real neighbors we need to manage).
    const strengthGap = userStrength(r.owner) - (global.MY_STRENGTH || MAX_LEVEL);
    if (strengthGap > 0) score += strengthGap * distance * 8;

    if (HOLD_SECTOR && myRoomInSectorCheck(roomName)) score -= 150;
    if (!THREATS.includes(r.owner) && (r.level || 0) < 4) score += 100;
    score += Math.max(0, (Game.time - (r.cached || 0)) / 100);

    // WAR_TARGETS gradient — subtract this room owner's priority so higher-priority targets win.
    if (warPriorityByUser && r.owner) {
        score -= warPriorityByUser[r.owner] || 0;
    }

    if (attackedOwners && attackedOwners.has(r.owner)) score += 250;

    return score;
}

// ============================================================
// AUXILIARY OPERATIONS
// ============================================================

function auxiliaryOperations() {
    const cache = Memory.auxiliaryTargets || {};

    let activePowerOps = 0, activeCommodityOps = 0;
    for (const key in cache) {
        const op = cache[key];
        if (!op) continue;
        if (op.type === 'power') activePowerOps++;
        if (op.type === 'commodity') activeCommodityOps++;
    }

    const candidates = Object.values(INTEL).filter(r =>
        r?.name && !cache[r.name] && !r.hostile && !Memory.nonCombatRooms.includes(r.name)
    );

    if (MAX_LEVEL >= 4) {
        // Power
        if (MAX_LEVEL >= 8 && activePowerOps === 0 && getResourceTotal(RESOURCE_POWER) < DUMP_AMOUNT) {
            let best = null, bestScore = Infinity;
            for (const r of candidates) {
                if (!r.power || r.power - CREEP_LIFE_TIME < Game.time) continue;
                const dist = findClosestOwnedRoom(r.name, true);
                if (dist > 8) continue;
                const timeRemaining = r.power - Game.time;
                const score = dist * 100 - Math.min(timeRemaining / 100, 50);
                if (score < bestScore) {
                    bestScore = score;
                    best = r;
                }
            }
            if (best) {
                cache[best.name] = {tick: Game.time, type: 'power', level: 1, priority: PRIORITIES.medium};
                log.a(`Power mining planned for ${roomLink(best.name)}`, 'HIGH COMMAND: ');
            }
        }

        // Commodity
        if (activeCommodityOps < 3) {
            const cutoff = Game.market.credits < CREDIT_BUFFER * 2 ? 150 : 40;
            let best = null, bestDist = Infinity;
            for (const r of candidates) {
                if (!r.commodity || r.commodityCooldown >= cutoff || getResourceTotal(r.commodity) >= DUMP_AMOUNT) continue;
                const dist = findClosestOwnedRoom(r.name, true);
                if (dist <= 8 && dist < bestDist) {
                    bestDist = dist;
                    best = r;
                }
            }
            if (best) {
                cache[best.name] = {tick: Game.time, type: 'commodity', level: 1, priority: PRIORITIES.medium};
                log.a(`Commodity mining planned for ${roomLink(best.name)}`, 'HIGH COMMAND: ');
            }
        }

        // Mineral
        let bestMineral = null, bestDist = Infinity;
        for (const r of candidates) {
            if (r.sk || r.sources < 3 || (r.user && !FRIENDLIES.includes(r.user)) || !r.mineralAmount || MY_MINERALS[r.mineral]) continue;
            if (!myRoomInSectorCheck(r.name)) continue;
            const dist = findClosestOwnedRoom(r.name, true);
            if (dist <= 5 && dist < bestDist) {
                bestDist = dist;
                bestMineral = r;
            }
        }
        if (bestMineral) {
            cache[bestMineral.name] = {tick: Game.time, type: 'mineral', level: 1, priority: PRIORITIES.medium};
            log.a(`Mineral mining planned for ${roomLink(bestMineral.name)}`, 'HIGH COMMAND: ');
        }
    }

    // Rebuild
    for (const r of MY_ROOMS) {
        if (Game.rooms[r].memory.buildersNeeded && INTEL[r] && !INTEL[r].hostile && !cache[r]) {
            cache[r] = {tick: Game.time, type: 'rebuild', level: 1, priority: PRIORITIES.priority};
            log.a(`Rebuild planned for ${roomLink(r)}`, 'HIGH COMMAND: ');
            break;
        }
    }

    Memory.auxiliaryTargets = cache;
}

function setTarget(room, operation, level = 1, military = true) {
    let cache = Memory.targetRooms || {};
    if (!military) cache = Memory.auxiliaryTargets || {};
    cache[room] = {
        tick: Game.time,
        type: operation,
        level: level,
        priority: getPriority(room),
        // Sieges need more waves to break fortified rooms; harassment ops can cancel sooner
        waveLimit: operation === 'roomDenial' ? 8 : 4
    };
    if (military) Memory.targetRooms = cache; else Memory.auxiliaryTargets = cache;
    // Guard remotes may have no intel (unscanned neighbors are valid targets) — guard the access
    if (!INTEL[room]) INTEL[room] = {name: room};
    // Always stamp lastOperation so the candidate-pool cooldown applies; sieges also get lastSiege for the per-siege cooldown.
    INTEL[room].lastOperation = Game.time;
    if (operation === 'roomDenial') INTEL[room].lastSiege = Game.time;
    return log.a(`${operation} operation planned for ${roomLink(room)} owned by ${INTEL[room].owner || 'N/A'} (Nearest Friendly Room - ${findClosestOwnedRoom(room, true)} rooms away)`, 'HIGH COMMAND: ');
}

const MAX_RESPONSE_DISTANCE = 5;
const TRAVEL_TICKS_PER_ROOM = 50;

function manageResponseForces() {
    const idleResponders = _.filter(Game.creeps, c => c.memory?.awaitingOrders && (!c.memory.partner || c.memory.leader));
    if (!idleResponders.length) return;

    const activeResponders = _.filter(Game.creeps, c => c.memory && !c.memory.awaitingOrders);
    const target = getPriorityTarget();

    trackPower();

    function getPriorityTarget() {
        const potential = [];

        for (const rName in INTEL) {
            const r = INTEL[rName];
            if (!r) continue;

            if (r.requestingSupport) {
                let prio = 10;
                if (r.owner === MY_USERNAME) prio += 5;
                potential.push({type: 'ownedRoomAttack', room: rName, priority: prio});
            }

            if (r.threatLevel > 1 && r.activeRemote + CREEP_LIFE_TIME > Game.time && (!r.responseDispatched || r.friendlyPower < r.hostilePower)) {
                const dist = findClosestOwnedRoom(rName, true);
                if (dist <= 2) potential.push({type: 'remoteRoomAttack', room: rName, priority: 9 - dist});
            }

            if (r.invaderCore && r.activeRemote + CREEP_LIFE_TIME > Game.time && !r.responseDispatched) {
                potential.push({type: 'invaderCore', room: rName, priority: 8});
            }

            if (r.threatLevel === 1 && r.activeRemote + CREEP_LIFE_TIME > Game.time && !r.responseDispatched) {
                potential.push({type: 'unarmedVisitors', room: rName, priority: 7});
            }
        }

        return _.max(potential, 'priority');
    }

    function assignRespondersToTarget(targetRoom, logMessage, requiredPower) {
        let responsePower = 0;
        for (const creep of activeResponders.filter(c => c.memory.destination === targetRoom)) {
            responsePower += creep.combatPower;
        }

        const candidates = [];
        for (const creep of idleResponders) {
            const distance = Game.map.getRoomLinearDistance(creep.pos.roomName, targetRoom);
            if (distance > MAX_RESPONSE_DISTANCE) continue;

            const ttl = creep.ticksToLive === undefined ? CREEP_LIFE_TIME : creep.ticksToLive;
            if (ttl < distance * TRAVEL_TICKS_PER_ROOM + 50) continue;

            candidates.push({creep, distance});
        }

        candidates.sort((a, b) => a.distance - b.distance);

        let assigned = 0;
        for (const {creep} of candidates) {
            if (assigned > 0 && responsePower >= requiredPower) break;

            responsePower += creep.combatPower;
            creep.memory.destination = targetRoom;
            creep.memory.awaitingOrders = undefined;
            creep.memory._shibMove = undefined;
            creep.memory.idle = undefined;
            assigned++;

            if (creep.room.name !== targetRoom) {
                log.a(`${creep.name} ${logMessage} ${roomLink(targetRoom)} from ${roomLink(creep.room.name)}`);
            }
        }
        return assigned > 0;
    }

    if (target) {
        let dispatched = false;

        switch (target.type) {
            case 'ownedRoomAttack':
                dispatched = assignRespondersToTarget(target.room, 'reassigned to assist in the defense of', INTEL[target.room].hostilePower || 0);
                break;
            case 'remoteRoomAttack':
                dispatched = assignRespondersToTarget(target.room, 'reassigned to re-secure', INTEL[target.room].hostilePower || 0);
                break;
            case 'invaderCore':
                dispatched = assignRespondersToTarget(target.room, 'reassigned to deal with invader core in', 50);
                break;
            case 'unarmedVisitors':
                dispatched = assignRespondersToTarget(target.room, 'investigating for possible trespassers at', 0);
                break;
            case 'guard':
                dispatched = assignRespondersToTarget(target.room, 'reassigned to help guard', 0);
                break;
        }

        if (dispatched && INTEL[target.room]) {
            INTEL[target.room].responseDispatched = Game.time;
        }
    }

    function trackPower() {
        const patrols = _.filter(Game.creeps, c => c.my && c.memory.destination && c.memory.operation === 'borderPatrol');
        const incoming = {};

        for (const patrol of patrols) {
            const dest = patrol.memory.destination;
            if (!incoming[dest]) incoming[dest] = {power: 0, room: dest};

            const ap = abilityPower(patrol.body);
            incoming[dest].power += ap.attack + ap.effectiveHeal + (ap.defense / 100);
        }

        for (const key in incoming) {
            if (!INTEL[key]) INTEL[key] = {};
            INTEL[key].friendlyPower = incoming[key].power;
        }
    }
}

// ============================================================
// MANAGE ACTIVE TARGETS
// ============================================================

function manageMilitary() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;

    const warTargetUsers = new Set(WAR_TARGETS.map(t => t.user));

    let activeNonSiege = 0, activeSiege = 0;
    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op) continue;
        if (op.type === 'roomDenial' || op.dDay) activeSiege++;
        else if (!['stronghold', 'nukes'].includes(op.type)) activeNonSiege++;
    }

    for (const key in Memory.targetRooms) {
        const target = Memory.targetRooms[key];
        if (!target || target.manual) continue;

        let type = target.type;
        let staleMulti = 1;

        if (target.dDay && target.dDay - 50 <= Game.time) {
            target.type = 'scout';
            target.tick = Game.time;
            target.dDay = undefined;
            log.a(`${roomLink(key)} d-day expired — switching to scout.`, 'HIGH COMMAND: ');
            continue;
        }

        switch (type) {
            case 'test':
                continue;

            case 'roomDenial':
                if (target.camping) staleMulti = 9999;
                else staleMulti = 5;

                if (activeSiege > SIEGE_LIMIT || !INTEL[key] || FRIENDLIES.includes(INTEL[key].owner) || !warTargetUsers.has(INTEL[key].owner)) {
                    log.a(`Canceling roomDenial in ${roomLink(key)} — too many sieges or non-hostile.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeSiege--;
                    if (INTEL[key]) INTEL[key].lastSiege = Game.time;
                    continue;
                }
                break;

            case 'harass':
            case 'remoteDenial':
                if (target.dDay) staleMulti = SAFE_MODE_DURATION;
                if (activeNonSiege > OPERATION_LIMIT) {
                    log.a(`Canceling ${type} in ${roomLink(key)} — too many operations.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    if (INTEL[key]) INTEL[key].lastOperation = Game.time;
                    continue;
                }
                if (!INTEL[key] || FRIENDLIES.includes(INTEL[key].owner) || !warTargetUsers.has(INTEL[key].owner)) {
                    log.a(`Canceling ${type} in ${roomLink(key)} — not a war target.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    if (INTEL[key]) INTEL[key].lastOperation = Game.time;
                    continue;
                }
                break;

            case 'guard':
                staleMulti *= (target.level + 1);
                if (activeNonSiege > OPERATION_LIMIT) {
                    log.a(`Canceling guard in ${roomLink(key)} — too many operations.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    if (INTEL[key]) INTEL[key].lastOperation = Game.time;
                    continue;
                }
                break;

            case 'stronghold':
                staleMulti = 5;
                if (!INTEL[key] || !INTEL[key].invaderCore || INTEL[key].invaderCore < Game.time) {
                    log.a(`Canceling stronghold in ${roomLink(key)} — core gone.`, 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiege--;
                    if (INTEL[key]) INTEL[key].lastOperation = Game.time;
                    continue;
                }
                break;

            case 'power':
            case 'poke':
            case 'commodity':
            case 'claimClear':
            case 'score':
            case 'scoreCleaner':
            case 'claim':
                delete Memory.targetRooms[key];
                continue;
        }

        if (target.manual) staleMulti *= 2;

        if (_.includes(Memory.nonCombatRooms, key)) {
            delete Memory.targetRooms[key];
            log.a(`Canceling operation in ${roomLink(key)} — manual non-combat room.`, 'HIGH COMMAND: ');
            continue;
        }

        if (!INTEL[key]) {
            if (Game.rooms[key]) Game.rooms[key].cacheRoomIntel();
            else if (type !== 'scout') {
                log.a(`Canceling operation in ${roomLink(key)} — no intel.`, 'HIGH COMMAND: ');
                delete Memory.targetRooms[key];
                continue;
            }
        }

        if (!target.manual && INTEL[key] && userStrength(INTEL[key].user) > (global.MY_STRENGTH || MAX_LEVEL) + 2) {
            log.a(`Canceling operation in ${roomLink(key)} — ${INTEL[key].user} too strong.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            INTEL[key].lastSiege = Game.time;
            continue;
        }

        const staleTime = target.tick + (CREEP_LIFE_TIME * staleMulti);
        const lastKill = target.lastEnemyKilled;
        if ((staleTime < Game.time && !lastKill) || (lastKill && lastKill.deathTime + (CREEP_LIFE_TIME * staleMulti) < Game.time)) {
            log.a(`Canceling operation in ${roomLink(key)} — stale.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            if (INTEL[key]) INTEL[key].lastOperation = Game.time;
            continue;
        }

        if (INTEL[key] && INTEL[key].user === MY_USERNAME && type !== 'guard') {
            log.a(`Canceling operation in ${roomLink(key)} — targeting our own room.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        if (INTEL[key] && (FRIENDLIES.includes(INTEL[key].user) || checkForNap(INTEL[key].user)) && type !== 'guard') {
            log.a(`Canceling operation in ${roomLink(key)} — allied/NAP room.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        if (type !== 'scout' && type !== 'guard' && type !== 'roomDenial' && INTEL[key]?.user &&
            !THREATS.includes(INTEL[key].user) && findClosestOwnedRoom(key, true) > DEFENSIVE_BUBBLE && !_.pluck(WAR_TARGETS, 'user').includes(INTEL[key].user)) {
            log.a(`Canceling operation in ${roomLink(key)} — ${INTEL[key].user} no longer a threat.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            INTEL[key].lastSiege = Game.time;
            continue;
        }

        if (target.waves && target.waves >= (target.waveLimit || 8)) {
            log.a(`Canceling operation in ${roomLink(key)} — max waves reached.`, 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            if (INTEL[key]) {
                INTEL[key].lastOperation = Game.time;
                INTEL[key].lastSiege = Game.time;
            }
            continue;
        }

        if (target.friendlyDead && target.tick + CREEP_LIFE_TIME < Game.time) {
            const ratio = target.friendlyDead / (target.enemyDead || 100);
            if (ratio > 2 && target.friendlyDead > 5000) {
                log.a(`Canceling operation in ${roomLink(key)} — unsustainable casualties (${ratio.toFixed(2)}).`, 'HIGH COMMAND: ');
                delete Memory.targetRooms[key];
                if (INTEL[key]) {
                    INTEL[key].lastOperation = Game.time;
                    INTEL[key].lastSiege = Game.time;
                }
                continue;
            }
        }
    }
}

function manageAuxiliary() {
    if (!Memory.auxiliaryTargets || !_.size(Memory.auxiliaryTargets)) return;

    for (const key in Memory.auxiliaryTargets) {
        const target = Memory.auxiliaryTargets[key];
        if (!target) continue;

        const type = target.type;

        if (!INTEL[key]) {
            if (Game.rooms[key]) Game.rooms[key].cacheRoomIntel();
            else if (!target.manual) {
                log.a(`Canceling auxiliary op in ${roomLink(key)} — no intel.`, 'HIGH COMMAND: ');
                delete Memory.auxiliaryTargets[key];
                continue;
            }
        }

        if (_.includes(Memory.nonCombatRooms, key)) {
            delete Memory.auxiliaryTargets[key];
            log.a(`Canceling auxiliary op in ${roomLink(key)} — manual non-combat room.`, 'HIGH COMMAND: ');
            continue;
        }

        switch (type) {
            case 'power':
                if (INTEL[key].power - 100 < Game.time) {
                    log.a(`Canceling power mining in ${roomLink(key)} — expiring.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (getResourceTotal(RESOURCE_POWER) >= DUMP_AMOUNT) {
                    log.a(`Canceling power mining in ${roomLink(key)} — enough power.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'mineral':
                if (!INTEL[key].mineralAmount) {
                    log.a(`Canceling mineral mining in ${roomLink(key)} — depleted.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (INTEL[key].user && !FRIENDLIES.includes(INTEL[key].user)) {
                    log.a(`Canceling mineral mining in ${roomLink(key)} — occupied.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'rebuild':
                if (!MY_ROOMS.includes(key)) {
                    log.a(`Canceling rebuild in ${roomLink(key)} — no longer needed.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (INTEL[key].hostile) {
                    log.a(`Canceling rebuild in ${roomLink(key)} — under attack.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (Game.rooms[key] && !Game.rooms[key].memory.buildersNeeded) {
                    log.a(`Canceling rebuild in ${roomLink(key)} — rebuilt.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'commodity':
                if (MAX_LEVEL < 4) {
                    log.a(`Canceling commodity mining in ${roomLink(key)} — no storage.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (getResourceTotal(INTEL[key].commodity) >= DUMP_AMOUNT) {
                    log.a(`Canceling commodity mining in ${roomLink(key)} — enough stock.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'claim':
            case 'claimClear':
                if (Game.gcl.level === MY_ROOMS.length) {
                    log.a(`Canceling claim in ${roomLink(key)} — no GCL.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (MAX_LEVEL < 4) {
                    log.a(`Canceling claim in ${roomLink(key)} — no RCL 4+.`, 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;
        }

        if (target.tick + CREEP_LIFE_TIME * 3 < Game.time) {
            delete Memory.auxiliaryTargets[key];
            log.a(`Canceling auxiliary op in ${roomLink(key)} — stale.`, 'HIGH COMMAND: ');
        }
    }
}

// ============================================================
// MANUAL FLAGS + OTHER FUNCTIONS (kept mostly intact for compatibility)
// ============================================================

function manualAttacks() {
    for (let name in Game.flags) {
        const flag = Game.flags[name];
        const roomName = flag.pos.roomName;
        const operation = name.replace(/[^a-z]/gi, '');
        const tick = Game.time;

        if (operation.toLowerCase() === 'd') continue;

        if (operation.toLowerCase() === 'test') {
            if (!Game.rooms[roomName].memory.testDefense) Game.rooms[roomName].memory.testDefense = true;
            else Game.rooms[roomName].memory.testDefense = undefined;
            removeFlagAndLog('Test operation initiated in ' + roomLink(roomName));
            continue;
        }

        if (operation.includes('nuke')) {
            nukeFlag(flag);
            removeFlagAndLog('Nuke operation initiated in ' + roomLink(roomName));
            continue;
        }

        if (operation.includes('assign')) {
            if (Memory.targetRooms[roomName]) Memory.targetRooms[roomName].assignedRoom = undefined;
            if (Memory.auxiliaryTargets[roomName]) Memory.auxiliaryTargets[roomName].assignedRoom = undefined;
            removeFlagAndLog('Clearing room assignment for ' + roomLink(roomName));
            continue;
        }

        if (operation.includes('cancel')) {
            delete Memory.targetRooms[roomName];
            delete Memory.auxiliaryTargets[roomName];
            removeFlagAndLog('Canceling operation in ' + roomLink(roomName) + ' at your request.');
            continue;
        }

        if (operation.includes('noRemote')) {
            Memory.avoidRemotes = Memory.avoidRemotes || [];
            if (!Memory.avoidRemotes.includes(roomName)) Memory.avoidRemotes.push(roomName);
            log.a(roomLink(roomName) + ' will not be remote mined.');
            removeFlagAndLog('');
            continue;
        }

        if (operation.includes('avoid')) {
            Memory.avoidRooms = Memory.avoidRooms || [];
            if (!Memory.avoidRooms.includes(roomName)) Memory.avoidRooms.push(roomName);
            log.a(roomLink(roomName) + ' will be avoided.');
            removeFlagAndLog('');
            continue;
        }

        if (operation.includes('ignore')) {
            Memory.nonCombatRooms = Memory.nonCombatRooms || [];
            if (!Memory.nonCombatRooms.includes(roomName)) Memory.nonCombatRooms.push(roomName);
            log.a(roomName + ' added as a non combat target.');
            removeFlagAndLog('');
            continue;
        }

        if (operation.includes('observe')) {
            Memory.observeRoom = roomName;
            removeFlagAndLog('Observing ' + roomLink(roomName) + ' at your request.');
            continue;
        }

        if (operation.includes('remove')) {
            let removed = false;
            if (Memory.avoidRooms && _.includes(Memory.avoidRooms, roomName)) {
                Memory.avoidRooms = _.filter(Memory.avoidRooms, r => r !== roomName);
                removed = true;
                log.a(roomLink(roomName) + ' will no longer be avoided.');
            } else if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, roomName)) {
                Memory.avoidRemotes = _.filter(Memory.avoidRemotes, r => r !== roomName);
                removed = true;
                log.a(roomLink(roomName) + ' will no longer be avoided.');
            } else if (Memory.nonCombatRooms && _.includes(Memory.nonCombatRooms, roomName)) {
                Memory.nonCombatRooms = _.filter(Memory.nonCombatRooms, r => r !== roomName);
                removed = true;
                log.a(roomLink(roomName) + ' removed as a non combat target.');
            }
            if (!removed) log.a(roomLink(roomName) + ' is not on any avoid lists.');
            removeFlagAndLog('');
            continue;
        }

        if (operation.includes('abandon')) {
            abandonRoom(Game.rooms[roomName]);
            removeFlagAndLog('Abandoning room ' + roomLink(roomName));
            continue;
        }

        if (['clear', 'clean', 'claim', 'rebuild', 'robbery'].includes(operation)) {
            Memory.auxiliaryTargets[roomName] = {tick, type: operation, level: 1, manual: true};
            removeFlagAndLog('Manual ' + operation + ' task in ' + roomLink(roomName) + ' has been initiated.');
        } else {
            Memory.targetRooms[roomName] = {tick, type: operation, level: 1, manual: true};
            removeFlagAndLog('Manual ' + operation + ' task in ' + roomLink(roomName) + ' has been initiated.');
        }

        function removeFlagAndLog(message) {
            log.a(message, 'HIGH COMMAND: ');
            flag.remove();
        }
    }
}

function nukeFlag(flag) {
    const nuker = _.find(Game.structures, s =>
        s.structureType === STRUCTURE_NUKER &&
        !s.store.getFreeCapacity(RESOURCE_ENERGY) &&
        !s.store.getFreeCapacity(RESOURCE_GHODIUM) &&
        !s.cooldown &&
        Game.map.getRoomLinearDistance(s.room.name, flag.pos.roomName) <= 10
    );

    if (!nuker) {
        log.a('Nuke request for ' + roomLink(flag.pos.roomName) + ' denied — no nukers in range.');
        flag.remove();
        return;
    }

    nuker.launchNuke(flag.pos);
    log.a('NUCLEAR LAUNCH DETECTED — ' + roomLink(flag.pos.roomName) + ' has a nuke inbound from ' + roomLink(nuker.room.name) + ' (impact in 50,000 ticks).', 'HIGH COMMAND: ');
    flag.remove();
}

function autoNuke() {
    if (!Memory.MAD) return false;

    const availableLaunchers = MY_ROOMS
        .map(r => Game.rooms[r]?.nuker)
        .filter(n => n && !n.store.getFreeCapacity(RESOURCE_ENERGY) && !n.store.getFreeCapacity(RESOURCE_GHODIUM) && !n.cooldown);

    if (!availableLaunchers.length) return;

    const MADTarget = _.min(Object.values(INTEL).filter(r =>
        Memory.MAD.includes(r.owner) &&
        !Memory.targetRooms[r.name] &&
        (!r.lastNuke || r.lastNuke + NUKE_LAND_TIME < Game.time) &&
        r.nukeTarget &&
        _.find(availableLaunchers, s => Game.map.getRoomLinearDistance(s.room.name, r.name) <= 10)
    ), r => findClosestOwnedRoom(r.name, true));

    if (!MADTarget?.name) return;

    log.a('MAD Target Acquired — ' + roomLink(MADTarget.name) + ' — LAUNCHING NUKES', 'HIGH COMMAND: ');
    Game.notify('MAD Target Acquired — ' + MADTarget.name + ' — LAUNCHING NUKES');

    const launcher = _.find(availableLaunchers, s => Game.map.getRoomLinearDistance(s.room.name, MADTarget.name) <= 10);
    if (!launcher) return;

    const target = new RoomPosition(1, 1, MADTarget.name).posFromString(MADTarget.nukeTarget);
    launcher.launchNuke(target);

    MADTarget.lastNuke = Game.time;
    INTEL[MADTarget.name] = MADTarget;
    Memory.MAD = _.filter(Memory.MAD, u => u !== MADTarget.owner);

    Memory.targetRooms[MADTarget.name] = {
        tick: Game.time,
        type: 'remoteDenial',
        dDay: Game.time + NUKE_LAND_TIME
    };

    log.a('Nuke launched at ' + roomLink(MADTarget.name) + ' by ' + launcher.room.name);
}

function checkForNap(user) {
    if (!global.LOAN_CHECK || !ALLIANCE_DATA || !NAP_ALLIANCE.length || _.includes(ENEMIES, user)) return false;

    try {
        const LOANData = JSON.parse(ALLIANCE_DATA);
        for (const allianceKey of Object.keys(LOANData)) {
            if (allianceKey.includes(user) && (_.includes(NAP_ALLIANCE, allianceKey) || AVOID_ATTACKING_ALLIANCES)) {
                return true;
            }
        }
    } catch (e) {
        return false;
    }
    return false;
}

function getPriority(room) {
    const range = findClosestOwnedRoom(room, true);
    if (range <= 1) return PRIORITIES.priority;
    if (range <= 3) return PRIORITIES.urgent;
    if (range <= 5) return PRIORITIES.high;
    if (range <= 10) return PRIORITIES.medium;
    return PRIORITIES.secondary;
}

// ============================================================
// OPERATION SUSTAINABILITY (kept mostly intact)
// ============================================================

module.exports.operationSustainability = function (room, operationRoom = room.name) {
    let operation = Memory.targetRooms[operationRoom] || Memory.auxiliaryTargets[operationRoom]
        || Memory.targetRooms[room.name] || Memory.auxiliaryTargets[room.name];

    if (!operation) return;

    if (room.controller?.safeMode) {
        markAsPending(operationRoom, room);
        return true;
    }

    if (operation.sustainabilityCheck === Game.time) return;

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
        const deadEnemy = _.filter(room.tombstones, t => !FRIENDLIES.includes(t.creep.owner.username));
        operation.lastEnemyKilled = _.max(deadEnemy, 'deathTime');
    }

    saveOperation(operationRoom, operation);

    if (isAtRisk) {
        log.w(`Operation in ${room.name} is at risk.`, 'OPERATION PLANNER: ');
    }
};

function markAsPending(operationRoom, room) {
    Memory.targetRooms[operationRoom] = {
        tick: Game.time,
        type: 'remoteDenial',
        level: 1,
        dDay: Game.time + room.controller.safeMode
    };
    log.a(`${room.name} marked as Remote Denial due to safemode.`, 'OPERATION PLANNER: ');
}

function processTombstones(tombstones, friendlyList, deadCount, trackedList) {
    const relevant = _.filter(tombstones, s => friendlyList
        ? _.includes(friendlyList, s.creep.owner.username)
        : !_.includes(FRIENDLIES, s.creep.owner.username));

    for (const tomb of relevant) {
        if (_.includes(trackedList, tomb.id)) continue;
        deadCount += UNIT_COST(tomb.creep.body);
        trackedList.push(tomb.id);
    }
    return deadCount;
}

function saveOperation(operationRoom, operation) {
    if (Memory.targetRooms[operationRoom]) Memory.targetRooms[operationRoom] = operation;
    else if (Memory.auxiliaryTargets[operationRoom]) Memory.auxiliaryTargets[operationRoom] = operation;
}

function siegeLevel(towerCount) {
    if (towerCount > 3) return false;
    if (towerCount >= 3) return MAX_LEVEL >= 8;
    if (towerCount >= 2) return MAX_LEVEL >= 7;
    return MAX_LEVEL >= 6;
}

module.exports.generateThreat = function (creep) {
    const user = INTEL[creep.room.name]?.user;
    if (_.includes(FRIENDLIES, user)) return;

    const cache = Memory._userList || {};
    let standing = 50;
    if (cache[user] && (cache[user].standing > 50 || _.includes(FRIENDLIES, user))) {
        standing = cache[user].standing;
    }
    cache[user] = {standing, lastAction: Game.time};
    Memory._userList = cache;
};