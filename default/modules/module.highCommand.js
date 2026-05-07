/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let OPERATION_LIMIT;
let SIEGE_LIMIT;
const lastRun = {};
const tasks = ['housekeeping', 'flags', 'military', 'auxiliary', 'response', 'nukes']
module.exports.highCommand = function () {
    OPERATION_LIMIT = Math.ceil(MY_ROOMS.filter((r) => Game.rooms[r].level >= 5 && Game.rooms[r].level >= MAX_LEVEL - 1 && Game.rooms[r].energyState).length * 0.5) || 1;
    SIEGE_LIMIT = Math.ceil(MY_ROOMS.filter((r) => Game.rooms[r].level >= 7 && Game.rooms[r].energyState).length * 0.5);
    // Handle tasks
    for (const task of tasks) {
        switch (task) {
            case 'housekeeping':
                if (checkCooldown('housekeeping', 10000)) {
                    // Handle memory initialization
                    if (!Memory.nonCombatRooms || !Memory.nonCombatRooms instanceof Array) Memory.nonCombatRooms = [];
                    if (!Memory.targetRooms || !Memory.targetRooms instanceof Object) Memory.targetRooms = {};
                    if (!Memory.auxiliaryTargets || !Memory.auxiliaryTargets instanceof Object) Memory.auxiliaryTargets = {};
                }
                break;
            case 'flags':
                if (checkCooldown('flags', 25)) {
                    if (_.size(Game.flags)) manualAttacks();
                    return;
                }
                break;
            case 'military':
                if (checkCooldown('military', 50)) {
                    militaryOperations();
                    manageMilitary();
                    return;
                }
                break;
            case 'auxiliary':
                if (checkCooldown('auxiliary', 100)) {
                    auxiliaryOperations();
                    manageAuxiliary();
                    return;
                }
                break;
            case 'response':
                if (checkCooldown('response', 5)) {
                    manageResponseForces();
                    return;
                }
                break;
            case 'nukes':
                if (checkCooldown('nukes', 500)) {
                    autoNuke();
                    return;
                }
                break;
        }
    }
};

function checkCooldown(task, cooldown) {
    if (!lastRun[task] || lastRun[task] + cooldown < Game.time) {
        lastRun[task] = Game.time;
        return true;
    } else {
        return false;
    }
}

function militaryOperations() {
    // --- Manual operations ---
    if (MANUAL_OPERATIONS.length) {
        for (const op of MANUAL_OPERATIONS) {
            if (!Memory.targetRooms[op.room]) {
                Memory.targetRooms[op.room] = {
                    tick: Game.time, type: op.type || 'guard',
                    level: op.level || 1, priority: op.priority || PRIORITIES.high,
                    waveLimit: MAX_LEVEL, manual: true
                };
            }
        }
        for (const key in Memory.targetRooms) {
            if (Memory.targetRooms[key].manual && !MANUAL_OPERATIONS.find(o => o.room === key)) {
                delete Memory.targetRooms[key];
            }
        }
    }

    // --- Count active operations in a single pass, track which owners we're already hitting ---
    let activeStrongholds = 0, activeNonSiege = 0, activeSiege = 0;
    const attackedOwners = new Set();
    for (const key in Memory.targetRooms) {
        const op = Memory.targetRooms[key];
        if (!op) continue;
        if (op.type === 'stronghold') activeStrongholds++;
        else if (op.type === 'roomDenial' || op.dDay) activeSiege++;
        else activeNonSiege++;
        const intel = INTEL[key];
        if (intel && intel.owner) attackedOwners.add(intel.owner);
    }

    // --- Stronghold operations ---
    if (activeStrongholds < OPERATION_LIMIT) {
        let best = null, bestScore = Infinity;
        for (const r of Object.values(INTEL)) {
            if (!r || !r.sk || !r.towers || !r.name) continue;
            if (Memory.targetRooms[r.name]) continue;
            if (!r.invaderCore || r.invaderCore + CREEP_LIFE_TIME <= Game.time) continue;
            if (!siegeLevel(r.towers) || !myRoomInSectorCheck(r.name)) continue;
            if ((r.lastOperation || 0) + ATTACK_COOLDOWN >= Game.time) continue;
            const score = scoreTarget(r.name, 'stronghold');
            if (score < bestScore) {
                bestScore = score;
                best = r;
            }
        }
        if (best) setTarget(best.name, 'stronghold', 1);
    }

    if (!OFFENSIVE_OPERATIONS) return;

    // --- Build candidate pool (pre-compute exclusion set to avoid array spread per entry) ---
    const noAttackSet = new Set([...FRIENDLIES, ...NO_DIRECT_ATTACKS]);
    const candidates = [];
    for (const r of Object.values(INTEL)) {
        if (!r || !r.name || !r.owner) continue;
        if (r.cached + CREEP_LIFE_TIME * 4 <= Game.time) continue;
        if (Memory.targetRooms[r.name]) continue;
        if (noAttackSet.has(r.owner) || Memory.nonCombatRooms.includes(r.name)) continue;
        if (checkForNap(r.owner) || userStrength(r.owner) > MAX_LEVEL) continue;
        if ((r.lastOperation || 0) + ATTACK_COOLDOWN >= Game.time) continue;
        if (!ATTACK_LOCALS && !THREATS.includes(r.owner) &&
            !(HOLD_SECTOR && myRoomInSectorCheck(r.name)) &&
            findClosestOwnedRoom(r.name, true) > DEFENSIVE_BUBBLE) continue;
        candidates.push(r);
    }

    if (!candidates.length) return;

    // --- Standard operations ---
    if (activeNonSiege < OPERATION_LIMIT) {
        // Guard: camp rooms with a single available remote exit
        let bestGuard = null, bestGuardScore = Infinity, bestGuardRemote = null;
        for (const r of candidates) {
            const remote = singleRemote(r.name);
            if (!remote) continue;
            const score = scoreTarget(r.name, 'guard', attackedOwners);
            if (score < bestGuardScore) {
                bestGuardScore = score;
                bestGuard = r;
                bestGuardRemote = remote;
            }
        }
        if (bestGuard) {
            setTarget(bestGuardRemote, 'guard');
            attackedOwners.add(bestGuard.owner);
        }

        // Remote denial: prefer a different player than the guard target
        // Only target rooms that have at least one unowned/accessible neighbor to deny
        let bestDenial = null, bestDenialScore = Infinity;
        for (const r of candidates) {
            const neighbors = Object.values(Game.map.describeExits(r.name));
            const hasRemote = neighbors.some((n) => !INTEL[n] || !INTEL[n].owner || INTEL[n].owner === r.owner);
            if (!hasRemote) continue;
            const score = scoreTarget(r.name, 'remoteDenial', attackedOwners);
            if (score < bestDenialScore) {
                bestDenialScore = score;
                bestDenial = r;
            }
        }
        if (bestDenial) setTarget(bestDenial.name, 'remoteDenial');
    }

    // --- Siege operations ---
    if (activeSiege < SIEGE_LIMIT) {
        const siegeCooldown = ATTACK_COOLDOWN * 2;
        let bestNoTower = null, bestNoTowerScore = Infinity;
        let bestTower = null, bestTowerScore = Infinity;
        for (const r of candidates) {
            if (r.safemode || (r.lastSiege || 0) + siegeCooldown >= Game.time) continue;
            if (!r.towers) {
                const score = scoreTarget(r.name, 'roomDenial', attackedOwners);
                if (score < bestNoTowerScore) {
                    bestNoTowerScore = score;
                    bestNoTower = r;
                }
            } else if (siegeLevel(r.towers)) {
                const score = scoreTarget(r.name, 'roomDenial', attackedOwners);
                if (score < bestTowerScore) {
                    bestTowerScore = score;
                    bestTower = r;
                }
            }
        }
        if (bestNoTower) setTarget(bestNoTower.name, 'roomDenial');
        if (bestTower && activeSiege + (bestNoTower ? 1 : 0) < SIEGE_LIMIT) {
            setTarget(bestTower.name, 'roomDenial', bestTower.towers <= 2 ? 3 : 4);
        }
    }
}

function scoreTarget(roomName, type, attackedOwners = null) {
    const r = INTEL[roomName];
    if (!r) return Infinity;

    let score = 0;
    const distance = findClosestOwnedRoom(roomName, true);

    // Distance (closer is better)
    score += distance * 20;

    // Threats get priority
    if (THREATS.includes(r.owner)) score -= 200;

    // Room difficulty
    if (type === 'roomDenial') {
        score += (r.level || 0) * 10;
        if (r.towers) score += r.towers * 100;
    } else {
        score += (r.level || 0) * 30;
        if (r.towers) score += r.towers * 100;
    }

    // Sector control bonus
    if (HOLD_SECTOR && myRoomInSectorCheck(roomName)) score -= 150;

    // Avoid picking on the very weak unless they're a threat
    if (!THREATS.includes(r.owner) && r.level < 4) score += 100;

    // Prefer fresh intel — stale scouting is less reliable
    score += Math.max(0, (Game.time - r.cached) / 100);

    // Soft penalty for piling on a player already under attack — spread pressure if possible
    if (attackedOwners && attackedOwners.has(r.owner)) score += 300;

    return score;
}

function auxiliaryOperations() {
    const cache = Memory.auxiliaryTargets || {};

    // Pre-count active op types in one pass to gate searches before running them
    let activePowerOps = 0, activeCommodityOps = 0;
    for (const key in cache) {
        const op = cache[key];
        if (!op) continue;
        if (op.type === 'power') activePowerOps++;
        if (op.type === 'commodity') activeCommodityOps++;
    }

    // Build candidate pool once — rooms not yet targeted, not hostile, not excluded
    const candidates = Object.values(INTEL).filter(r =>
        r && r.name && !cache[r.name] && !r.hostile && !Memory.nonCombatRooms.includes(r.name)
    );

    if (MAX_LEVEL >= 4) {
        // Power Mining — only search if no active power op and we're below threshold
        if (MAX_LEVEL >= 8 && activePowerOps === 0 && getResourceTotal(RESOURCE_POWER) < DUMP_AMOUNT) {
            let bestPower = null, bestDist = Infinity;
            for (const r of candidates) {
                if (!r.power || r.power - 1500 < Game.time) continue;
                const dist = findClosestOwnedRoom(r.name, true);
                if (dist <= 8 && dist < bestDist) {
                    bestDist = dist;
                    bestPower = r;
                }
            }
            if (bestPower) {
                cache[bestPower.name] = {tick: Game.time, type: 'power', level: 1, priority: PRIORITIES.medium};
                log.a(`Mining operation planned for ${roomLink(bestPower.name)} (Power Bank Location)`, 'HIGH COMMAND: ');
            }
        }

        // Commodity Mining — up to 2 concurrent, pick closest qualifying deposit
        if (activeCommodityOps < 2) {
            const commodityCutoff = Game.market.credits < CREDIT_BUFFER * 2 ? 150 : 40;
            let bestCommodity = null, bestDist = Infinity;
            for (const r of candidates) {
                if (!r.commodity || r.commodityCooldown >= commodityCutoff) continue;
                if (getResourceTotal(r.commodity) >= DUMP_AMOUNT) continue;
                const dist = findClosestOwnedRoom(r.name, true);
                if (dist <= 8 && dist < bestDist) {
                    bestDist = dist;
                    bestCommodity = r;
                }
            }
            if (bestCommodity) {
                cache[bestCommodity.name] = {tick: Game.time, type: 'commodity', level: 1, priority: PRIORITIES.medium};
                log.a(`Mining operation planned for ${roomLink(bestCommodity.name)} (Commodity Deposit Location)`, 'HIGH COMMAND: ');
            }
        }

        // Mineral Mining — pick closest qualifying room in our sector
        let bestMineral = null, bestDist = Infinity;
        for (const r of candidates) {
            if (r.sk || r.sources < 3 || !r.mineralAmount || MY_MINERALS[r.mineral]) continue;
            if (!myRoomInSectorCheck(r.name)) continue;
            const dist = findClosestOwnedRoom(r.name, true);
            if (dist < bestDist) {
                bestDist = dist;
                bestMineral = r;
            }
        }
        if (bestMineral) {
            cache[bestMineral.name] = {tick: Game.time, type: 'mineral', level: 1, priority: PRIORITIES.medium};
            log.a(`Mining operation planned for ${roomLink(bestMineral.name)} (Mineral Deposit Location)`, 'HIGH COMMAND: ');
        }
    }

    // Rebuild allies — queue the first room that needs builders and isn't hostile
    for (const r of MY_ROOMS) {
        if (!Game.rooms[r].memory.buildersNeeded || !INTEL[r] || INTEL[r].hostile || cache[r]) continue;
        cache[r] = {tick: Game.time, type: 'rebuild', level: 1, priority: PRIORITIES.priority};
        log.a(`Rebuild operation planned for ${roomLink(r)} (Rebuilding Required)`, 'HIGH COMMAND: ');
        break;
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
        waveLimit: 4
    };
    if (military) Memory.targetRooms = cache; else Memory.auxiliaryTargets = cache;
    if (operation !== 'roomDenial') INTEL[room].lastOperation = Game.time; else INTEL[room].lastSiege = Game.time;
    return log.a(`${operation} operation planned for ${roomLink(room)} owned by ${INTEL[room].owner || 'N/A'} (Nearest Friendly Room - ${findClosestOwnedRoom(room, true)} rooms away)`, 'HIGH COMMAND: ');
}

function manageResponseForces() {
    let idleResponders = _.filter(Game.creeps, (c) => c.memory && c.memory.awaitingOrders && (!c.memory.partner || c.memory.leader));
    if (!idleResponders.length) return;

    let activeResponders = _.filter(Game.creeps, (c) => c.memory && !c.memory.awaitingOrders);
    let friendlyResponsePower = 0;

    // Get the highest-priority target based on the current situation
    let target = getPriorityTarget();

    trackPower();

    // Helper function to prioritize targets based on threat and distance
    function getPriorityTarget() {
        // Return the highest priority target based on threat levels and distances
        let potentialTargets = [];

        // Support requested
        for (let rName in INTEL) {
            let r = INTEL[rName];
            if (r && r.requestingSupport) {
                let prio = 10;
                if (r.owner === MY_USERNAME) prio += 5; // Extra priority for our own rooms
                potentialTargets.push({type: 'ownedRoomAttack', room: rName, priority: prio});
            }

            // Remote support hostile
            if (r && r.threatLevel > 1 && r.activeRemote + CREEP_LIFE_TIME > Game.time && (!r.responseDispatched || r.friendlyPower < r.hostilePower)) {
                let dist = findClosestOwnedRoom(rName, true);
                if (dist <= 2) {
                    potentialTargets.push({type: 'remoteRoomAttack', room: rName, priority: 9 - dist});
                }
            }

            // Invader Core
            if (r && r.invaderCore && r.activeRemote + CREEP_LIFE_TIME > Game.time && !r.responseDispatched) {
                potentialTargets.push({type: 'invaderCore', room: rName, priority: 8});
            }

            // Remote support unarmed
            if (r && r.threatLevel === 1 && r.activeRemote + CREEP_LIFE_TIME > Game.time && !r.responseDispatched) {
                potentialTargets.push({type: 'unarmedVisitors', room: rName, priority: 7});
            }
        }

        // Add guard duty rooms
        let guard = _.findKey(Memory.targetRooms, (o) => o && o.type === 'guard' && o.level) || _.findKey(Memory.auxiliaryTargets, (o) => o && o.type === 'guard' && o.level);
        if (guard) {
            potentialTargets.push({type: 'guard', room: guard, priority: 6});
        }

        // Sort targets by priority (highest first) and return the highest-priority target
        return _.max(potentialTargets, 'priority');
    }

    // Assign responder to the best target based on priority and distance
    function assignRespondersToTarget(targetRoom, logMessage, requiredPower) {
        let responsePower = friendlyResponsePower;
        for (let creep of _.filter(activeResponders, (c) => c.memory.destination === targetRoom)) responsePower += creep.combatPower;

        for (let creep of _.sortBy(idleResponders, (c) => Game.map.getRoomLinearDistance(c.pos.roomName, targetRoom) < 4)) {
            if (responsePower >= requiredPower) break; // Stop assigning if we've achieved the required power

            responsePower += creep.combatPower;
            creep.memory.destination = targetRoom;
            creep.memory.awaitingOrders = undefined;
            creep.memory._shibMove = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== targetRoom) {
                log.a(`${creep.name} ${logMessage} ${roomLink(targetRoom)} from ${roomLink(creep.room.name)}`);
            }
        }
    }

    if (target) {
        // Assign responders based on target type
        switch (target.type) {
            case 'ownedRoomAttack':
                INTEL[target.room].responseDispatched = Game.time;
                assignRespondersToTarget(target.room, 'reassigned to assist in the defense of', INTEL[target.room].hostilePower);
                break;

            case 'remoteRoomAttack':
                INTEL[target.room].responseDispatched = Game.time;
                assignRespondersToTarget(target.room, 'reassigned to re-secure', INTEL[target.room].hostilePower);
                break;

            case 'invaderCore':
                INTEL[target.room].responseDispatched = Game.time;
                assignRespondersToTarget(target.room, 'reassigned to deal with invader core in', 50); // Assuming invader core requires minimal power
                break;

            case 'responseTarget':
                INTEL[target.room].responseDispatched = Game.time;
                assignRespondersToTarget(target.room, 'responding to', INTEL[target.room].hostilePower);
                break;

            case 'unarmedVisitors':
                INTEL[target.room].responseDispatched = Game.time;
                assignRespondersToTarget(target.room, 'investigating for possible trespassers at', 0);
                break;

            case 'guard':
                assignRespondersToTarget(target.room, 'reassigned to help guard', 0);
                break;
        }
    }

    function trackPower() {
        const respondingPatrols = _.filter(Game.creeps, (c) => c.my && c.memory.destination && c.memory.operation === 'borderPatrol');
        const incomingPower = {};
        for (const key in respondingPatrols) {
            const patrol = respondingPatrols[key];
            if (!incomingPower[patrol.memory.destination]) incomingPower[patrol.memory.destination] = {
                power: 0,
                room: patrol.memory.destination
            };
            const ap = abilityPower(patrol.body);
            incomingPower[patrol.memory.destination].power += ap.attack + ap.effectiveHeal + (ap.defense / 100);
        }
        for (const key in incomingPower) {
            const i = incomingPower[key];
            if (!INTEL[i.room]) INTEL[i.room] = {};
            INTEL[i.room].friendlyPower = i.power;
        }
    }
}

function manageMilitary() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;
    let activeNonSiegeOperations = _.size(_.filter(Memory.targetRooms, (o) => o && !['roomDenial', 'stronghold'].includes(o.type) && !o.dDay));
    let activeSiegeOperations = _.size(_.filter(Memory.targetRooms, (o) => o && (o.type === 'roomDenial' || o.dDay)));
    let staleMulti = 1;

    // Iterate through target rooms
    for (let key in Memory.targetRooms) {
        let target = Memory.targetRooms[key];
        if (!target || target.manual) continue;
        let type = target.type;

        // Handle rooms with a d-day
        if (target.dDay && target.dDay - 50 <= Game.time) {
            target.type = 'scout';
            target.tick = Game.time;
            target.dDay = undefined;
            log.a(roomLink(key) + ' cooldown expired, switching to a scout.', 'HIGH COMMAND: ');
            continue;
        }

        // Handle room-specific conditions based on the type of operation
        switch (type) {
            case 'test':
                continue;  // Skip test operations

            case 'roomDenial':
                if (target.camping) {
                    staleMulti = 9999;
                    break;
                }
                staleMulti = 5;
                if (activeSiegeOperations > SIEGE_LIMIT || !INTEL[key] || FRIENDLIES.includes(INTEL[key].owner)) {
                    log.a('Canceling ' + type + ' in ' + roomLink(key) + ' due to high operation count or non-hostile status.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeSiegeOperations--;
                    INTEL[key].lastSiege = Game.time;
                    continue;
                }
                break;

            case 'nukes':
                continue;

            case 'harass':
            case 'remoteDenial':
                if (target.dDay) {
                    staleMulti = SAFE_MODE_DURATION;
                    break;
                }
                if (activeNonSiegeOperations > OPERATION_LIMIT) {
                    log.a('Canceling ' + type + ' in ' + roomLink(key) + ' due to too many active operations.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiegeOperations--;
                    INTEL[key].lastOperation = Game.time;
                    continue;
                }
                break;

            case 'guard':
                staleMulti *= (target.level + 1);
                if (activeNonSiegeOperations > OPERATION_LIMIT) {
                    log.a('Canceling ' + type + ' in ' + roomLink(key) + ' due to too many active operations.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiegeOperations--;
                    INTEL[key].lastOperation = Game.time;
                    continue;
                }
                break;

            case 'stronghold':
                staleMulti = 5;
                if (!INTEL[key] || !INTEL[key].invaderCore || INTEL[key].invaderCore < Game.time) {
                    log.a('Canceling ' + type + ' in ' + roomLink(key) + ' as the invader core is gone.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    activeNonSiegeOperations--;
                    INTEL[key].lastOperation = Game.time;
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

        // Skip manual no combat rooms
        if (_.includes(Memory.nonCombatRooms, key)) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + roomLink(key) + ' as it is set as a manual non-combat room.', 'HIGH COMMAND: ');
            continue;
        }

        // Try to update room intel if missing, and cancel operation if no intel available
        if (!INTEL[key]) {
            if (Game.rooms[key]) {
                Game.rooms[key].cacheRoomIntel();
            } else if (type !== 'scout') {
                log.a('Canceling operation in ' + roomLink(key) + ' as we have no intel.', 'HIGH COMMAND: ');
                delete Memory.targetRooms[key];
                continue;
            }
        }

        // Cancel operation for powerful users or hostile users beyond max level
        if (!target.manual && INTEL[key] && userStrength(INTEL[key].user) > MAX_LEVEL) {
            log.a('Canceling operation in ' + roomLink(key) + ' as ' + INTEL[key].user + ' is too powerful.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            INTEL[key].lastSiege = Game.time;
            continue;
        }

        // Cancel operation for high-level hostile users detected in the room
        if (!target.manual && target.userList && target.userList.some(user => userStrength(user) > MAX_LEVEL)) {
            log.a('Canceling operation in ' + roomLink(key) + ' due to high-level user detection.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            INTEL[key].lastSiege = Game.time;
            continue;
        }

        // Skip stale operations
        if (target.tick + (CREEP_LIFE_TIME * staleMulti) < Game.time && !target.lastEnemyKilled ||
            (target.lastEnemyKilled && target.lastEnemyKilled.deathTime + (CREEP_LIFE_TIME * staleMulti) < Game.time)) {
            log.a('Canceling operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            continue;
        }

        // Skip if it's targeting our rooms
        if (INTEL[key] && INTEL[key].user === MY_USERNAME && target.type !== 'guard') {
            log.a('Canceling operation in ' + roomLink(key) + ' as it is targeting one of our rooms.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        // Skip if it’s an allied room or NAP room
        if (INTEL[key] && (_.includes(FRIENDLIES, INTEL[key].user) || checkForNap(INTEL[key].user)) && target.type !== 'guard') {
            log.a('Canceling operation in ' + roomLink(key) + ' as it is targeting an allied or NAP room.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        // Skip no longer hostile rooms
        if (target.type !== 'scout' && target.type !== 'guard' && target.type !== 'roomDenial' && INTEL[key] && INTEL[key].user
            && !THREATS.includes(INTEL[key].user) && findClosestOwnedRoom(key, true) > DEFENSIVE_BUBBLE) {
            log.a('Canceling operation in ' + roomLink(key) + ' as ' + INTEL[key].user + ' is no longer considered a threat.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            INTEL[key].lastSiege = Game.time;
            continue;
        }

        // Final checks for stale or problematic operations
        if (target.waves && target.waves >= target.waveLimit) {
            log.a('Canceling operation in ' + roomLink(key) + ' due to max waves reached.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            INTEL[key].lastOperation = Game.time;
            INTEL[key].lastSiege = Game.time;
            continue;
        }

        // Proportional casualty check
        if (target.friendlyDead && target.tick + CREEP_LIFE_TIME < Game.time) {
            const casualtyRatio = target.friendlyDead / (target.enemyDead || 100);
            if (casualtyRatio > 2 && target.friendlyDead > 5000) {
                log.a('Canceling operation in ' + roomLink(key) + ' due to unsustainable casualty ratio (' + casualtyRatio.toFixed(2) + ').', 'HIGH COMMAND: ');
                delete Memory.targetRooms[key];
                INTEL[key].lastOperation = Game.time;
                INTEL[key].lastSiege = Game.time;
                continue;
            }
        }
    }
}

function manageAuxiliary() {
    if (!Memory.auxiliaryTargets || !_.size(Memory.auxiliaryTargets)) return;

    for (let key in Memory.auxiliaryTargets) {
        let target = Memory.auxiliaryTargets[key];
        if (!target) continue;
        let type = target.type;

        // Force an intel update if missing, and cancel operation if no intel
        if (!INTEL[key]) {
            if (Game.rooms[key]) {
                Game.rooms[key].cacheRoomIntel();
            } else if (!target.manual) {
                log.a('Canceling auxiliary operation in ' + roomLink(key) + ' as we have no intel.', 'HIGH COMMAND: ');
                delete Memory.auxiliaryTargets[key];
            }
            continue;
        }

        // Skip manual non-combat rooms
        if (_.includes(Memory.nonCombatRooms, key)) {
            delete Memory.auxiliaryTargets[key];
            log.a('Canceling auxiliary operation in ' + roomLink(key) + ' as it is set as a manual non-combat room.', 'HIGH COMMAND: ');
            continue;
        }

        // Handle special conditions based on operation type
        switch (type) {
            case 'power':
                if (INTEL[key].power - 100 < Game.time) {
                    log.a('Canceling power mining operation in ' + roomLink(key) + ' as the resource is about to expire.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (getResourceTotal(RESOURCE_POWER) >= DUMP_AMOUNT) {
                    log.a('Canceling power mining operation in ' + roomLink(key) + ' as we have enough power.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'mineral':
                if (!INTEL[key].mineralAmount) {
                    log.a('Canceling mineral mining operation in ' + roomLink(key) + ' as the resource is depleted.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'rebuild':
                if (!MY_ROOMS.includes(key)) {
                    log.a('Canceling rebuild operation in ' + roomLink(key) + ' as we are no longer needed.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (INTEL[key].hostile) {
                    log.a('Canceling rebuild operation in ' + roomLink(key) + ' as it is under attack.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'commodity':
                if (MAX_LEVEL < 4) {
                    log.a('Canceling commodity mining operation in ' + roomLink(key) + ' as we have no storages.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (getResourceTotal(INTEL[key].commodity) >= DUMP_AMOUNT) {
                    log.a('Canceling commodity mining operation in ' + roomLink(key) + ' as we have enough ' + INTEL[key].commodity + '.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;

            case 'claim':
            case 'claimClear':
                if (Game.gcl.level === MY_ROOMS.length) {
                    log.a('Canceling claim operation in ' + roomLink(key) + ' as we have no available GCL.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                if (MAX_LEVEL < 4) {
                    log.a('Canceling claim operation in ' + roomLink(key) + ' as we have no RCL 4+.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    continue;
                }
                break;
        }

        // Cancel stale operations if no activity in a long time
        if (target.tick + CREEP_LIFE_TIME * 3 < Game.time) {
            delete Memory.auxiliaryTargets[key];
            log.a('Canceling auxiliary operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
        }
    }
}

function manualAttacks() {
    for (let name in Game.flags) {
        const flag = Game.flags[name];
        const roomName = flag.pos.roomName;
        const operation = name.replace(/[^a-z]/gi, '');
        const tick = Game.time;

        // D flags are used to simulate attackers, do not remove
        if (operation.toLowerCase() === 'd') {
            continue;
        }

        // Handle nukes
        if (operation.includes('nuke')) {
            nukeFlag(flag);
            removeFlagAndLog('Nuke operation initiated in ' + roomLink(roomName));
            continue;
        }

        // Handle forced reassignment
        if (operation.includes('assign')) {
            if (Memory.targetRooms[roomName]) Memory.targetRooms[roomName].assignedRoom = undefined;
            if (Memory.auxiliaryTargets[roomName]) Memory.auxiliaryTargets[roomName].assignedRoom = undefined;
            removeFlagAndLog('Clearing room assignment for ' + roomLink(roomName));
            continue;
        }

        // Handle cancellations
        if (operation.includes('cancel')) {
            delete Memory.targetRooms[roomName];
            delete Memory.auxiliaryTargets[roomName];
            removeFlagAndLog('Canceling operation in ' + roomLink(roomName) + ' at your request.');
            continue;
        }

        // Handle bad room avoidance
        if (operation.includes('noRemote')) {
            Memory.avoidRemotes = Memory.avoidRemotes || [];
            if (!Memory.avoidRemotes.includes(roomName)) {
                Memory.avoidRemotes.push(roomName);
                log.a(roomLink(roomName) + ' will not be remote mined.');
            }
            removeFlagAndLog('');
            continue;
        }

        // Handle bad remote avoidance
        if (operation.includes('avoid')) {
            Memory.avoidRooms = Memory.avoidRooms || [];
            if (!Memory.avoidRooms.includes(roomName)) {
                Memory.avoidRooms.push(roomName);
                log.a(roomLink(roomName) + ' will be avoided.');
            }
            removeFlagAndLog('');
            continue;
        }

        // Handle non-combat room designation
        if (operation.includes('ignore')) {
            Memory.nonCombatRooms = Memory.nonCombatRooms || [];
            if (!Memory.nonCombatRooms.includes(roomName)) {
                Memory.nonCombatRooms.push(roomName);
                log.a(roomName + ' added as a non combat target.');
            }
            removeFlagAndLog('');
            continue;
        }

        // Handle observation
        if (operation.includes('observe')) {
            Memory.observeRoom = roomName;
            removeFlagAndLog('Observing ' + roomLink(roomName) + ' at your request.');
            continue;
        }

        // Remove from avoid or non-combat lists
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
            if (!removed) {
                log.a(roomLink(roomName) + ' is not on any avoid lists.');
            }
            removeFlagAndLog('');
            continue;
        }

        // Handle room abandonment
        if (operation.includes('abandon')) {
            abandonRoom(Game.rooms[roomName]);
            removeFlagAndLog('Abandoning room ' + roomLink(roomName));
            continue;
        }

        // Manual combat operations (e.g., clear, clean, claim, rebuild, robbery)
        if (['clear', 'clean', 'claim', 'rebuild', 'robbery'].includes(operation)) {
            Memory.auxiliaryTargets[roomName] = {
                tick: tick,
                type: operation,
                level: 1,
                manual: true
            };
            removeFlagAndLog('Manual ' + operation + ' task in ' + roomLink(roomName) + ' has been initiated.');
        } else {
            Memory.targetRooms[roomName] = {
                tick: tick,
                type: operation,
                level: 1,
                manual: true
            };
            removeFlagAndLog('Manual ' + operation + ' task in ' + roomLink(roomName) + ' has been initiated.');
        }

        function removeFlagAndLog(message) {
            log.a(message, 'HIGH COMMAND: ');
            flag.remove();
        }
    }
}

function nukeFlag(flag) {
    // Find a nuker that has no cooldown and is in range of the flag's room
    const nuker = _.find(Game.structures, s =>
        s.structureType === STRUCTURE_NUKER &&
        !s.store.getFreeCapacity(RESOURCE_ENERGY) &&
        !s.store.getFreeCapacity(RESOURCE_GHODIUM) &&
        !s.cooldown &&
        Game.map.getRoomLinearDistance(s.room.name, flag.pos.roomName) <= 10
    );

    // If no nuker is found, log an error and remove the flag
    if (!nuker) {
        log.a('Nuke request for room ' + roomLink(flag.pos.roomName) + ' denied, no nukers in range.');
        flag.remove();
        return;
    }

    // Launch the nuke and log the event
    nuker.launchNuke(flag.pos);
    log.a('NUCLEAR LAUNCH DETECTED - ' + roomLink(flag.pos.roomName) + ' ' + flag.pos.x + '.' + flag.pos.y +
        ' has a nuke inbound from ' + roomLink(nuker.room.name) + ' and will impact in 50,000 ticks.', 'HIGH COMMAND: ');
    flag.remove();
}

function autoNuke() {
    if (!Memory.MAD) return false;
    // Check for available nuker launchers
    let availableLaunchers = [];
    for (let r of MY_ROOMS) {
        let room = Game.rooms[r];
        if (room && room.nuker && !room.nuker.store.getFreeCapacity(RESOURCE_ENERGY) && !room.nuker.store.getFreeCapacity(RESOURCE_GHODIUM) && !room.nuker.cooldown) {
            availableLaunchers.push(room.nuker);
        }
    }
    if (!availableLaunchers.length) return;

    // Find the MAD target with a nuke target and no recent nukes
    let MADTarget = _.min(_.filter(INTEL, (r) => {
        // Check if the target room qualifies (owner included in MAD, last nuke time passed, etc.)
        return Memory.MAD.includes(r.owner) && !Memory.targetRooms[r.name] &&
            (!r.lastNuke || r.lastNuke + NUKE_LAND_TIME < Game.time) &&
            r.nukeTarget &&
            _.find(availableLaunchers, (s) => Game.map.getRoomLinearDistance(s.room.name, r.name) <= 10);
    }), function (r) {
        return findClosestOwnedRoom(r.name, true);
    });

    if (MADTarget && MADTarget.name) {
        log.a('MAD Target Acquired - ' + roomLink(MADTarget.name) + ' - LAUNCHING NUKES', 'HIGH COMMAND: ');
        Game.notify('MAD Target Acquired - ' + MADTarget.name + ' - LAUNCHING NUKES');

        // Find the closest available launcher to the MAD target
        let launcher = _.find(availableLaunchers, (s) => Game.map.getRoomLinearDistance(s.room.name, MADTarget.name) <= 10);

        if (launcher) {
            // Determine the target position for the nuke
            let target = new RoomPosition(1, 1, MADTarget.name).posFromString(MADTarget.nukeTarget);

            // Launch the nuke
            launcher.launchNuke(target);

            // Record the nuke launch time for MAD Target
            MADTarget.lastNuke = Game.time;
            INTEL[MADTarget.name] = MADTarget;
            Memory.MAD = _.filter(Memory.MAD, (u) => u !== MADTarget.owner);  // Remove the target's owner from MAD list

            // Record the room as a target for the pending nuke strike
            let cache = Memory.targetRooms || {};
            cache[MADTarget.name] = {
                tick: Game.time,
                type: 'remoteDenial',
                dDay: Game.time + NUKE_LAND_TIME
            };
            Memory.targetRooms = cache;

            // Log nuke launch event for tracking
            log.a('Nuke launched at ' + roomLink(MADTarget.name) + ' by ' + launcher.room.name);
        }
    }
}

function checkForNap(user) {
    // Return false if we have no alliance data or the user is in our enemies list
    if (!global.LOAN_CHECK || !ALLIANCE_DATA || !NAP_ALLIANCE.length || _.includes(ENEMIES, user)) {
        return false;
    }

    try {
        // Parse the alliance data and extract keys
        let LOANData = JSON.parse(ALLIANCE_DATA);
        let LOANDataKeys = Object.keys(LOANData);

        // Loop through the keys to check if the user is part of any NAP or avoid alliance
        for (let iL = 0; iL < LOANDataKeys.length; iL++) {
            let allianceKey = LOANDataKeys[iL];
            if (allianceKey.includes(user) && (_.includes(NAP_ALLIANCE, allianceKey) || AVOID_ATTACKING_ALLIANCES)) {
                return true;
            }
        }
    } catch (e) {
        // In case of any error parsing the alliance data, return false
        log.a('Error checking for NAP: ' + e.message); // Optional logging for debugging
        return false;
    }

    return false;
}

function getPriority(room) {
    let range = findClosestOwnedRoom(room, true)
    if (range <= 1) return PRIORITIES.priority;
    else if (range <= 3) return PRIORITIES.urgent;
    else if (range <= 5) return PRIORITIES.high;
    else if (range <= 10) return PRIORITIES.medium;
    else return PRIORITIES.secondary;
}

function singleRemote(roomName) {
    const neighbors = Object.values(Game.map.describeExits(roomName));
    const remotes = _.filter(neighbors, (n) => !INTEL[n] || !INTEL[n].user || INTEL[n].user === INTEL[roomName].owner);
    if (remotes.length === 1) {
        return remotes[0];
    }
}

module.exports.operationSustainability = function (room, operationRoom = room.name) {
    // Retrieve the operation object from memory
    let operation = Memory.targetRooms[operationRoom] || Memory.auxiliaryTargets[operationRoom]
        || Memory.targetRooms[room.name] || Memory.auxiliaryTargets[room.name];

    if (!operation) return;

    // Mark room as pending if it has a safemode
    if (room.controller && room.controller.safeMode) {
        markAsPending(operationRoom, room);
        return;
    }

    // Skip sustainability check if already done this tick
    if (operation && operation.sustainabilityCheck === Game.time) return;

    // Initialize variables for tracking dead units and tombstones
    let friendlyDead = operation.friendlyDead || 0;
    let trackedFriendly = operation.trackedFriendly || [];
    let enemyDead = operation.enemyDead || 0;
    let trackedEnemy = operation.trackedEnemy || [];
    let isAtRisk = false; // Flag to track if the operation is at risk

    // Process tombstones
    friendlyDead = processTombstones(room.tombstones, FRIENDLIES, friendlyDead, trackedFriendly);
    enemyDead = processTombstones(room.tombstones, null, enemyDead, trackedEnemy);

    // Update the operation object with new statistics
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

    // Save the updated operation object back to memory
    saveOperation(operationRoom, operation);

    // If operation is at risk, notify the planner to adjust strategy
    if (isAtRisk) {
        log.w(`Operation in ${room.name} is at risk due to enemy reinforcements or resource depletion. Consider adjusting strategy.`, 'OPERATION PLANNER: ');
    }
};

// Switch to remote denial
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

// Process friendly or enemy tombstones, return updated dead count
function processTombstones(tombstones, friendlyList, deadCount, trackedList) {
    let relevantTombstones = _.filter(tombstones, (s) => (friendlyList ? _.includes(friendlyList, s.creep.owner.username) : !_.includes(FRIENDLIES, s.creep.owner.username)));
    for (let tombstone of relevantTombstones) {
        if (_.includes(trackedList, tombstone.id)) continue;
        deadCount += UNIT_COST(tombstone.creep.body);
        trackedList.push(tombstone.id);
    }
    return deadCount;
}

// Save the operation object back into memory
function saveOperation(operationRoom, operation) {
    if (Memory.targetRooms[operationRoom]) {
        Memory.targetRooms[operationRoom] = operation;
    } else if (Memory.auxiliaryTargets[operationRoom]) {
        Memory.auxiliaryTargets[operationRoom] = operation;
    }
}

// Check if we have high enough level for the number of towers
function siegeLevel(towerCount) {
    if (towerCount > 3) return false;
    if (towerCount >= 3) return MAX_LEVEL >= 8;
    if (towerCount >= 2) return MAX_LEVEL >= 7;
    return MAX_LEVEL >= 6;
}


/**
 * Generate threat for a user
 * @param creep
 */
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