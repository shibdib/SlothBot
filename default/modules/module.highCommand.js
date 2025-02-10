/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let OPERATION_LIMIT;
const lastRun = {};
const tasks = ['housekeeping', 'flags', 'military', 'auxiliary', 'response', 'nukes']
module.exports.highCommand = function () {
    OPERATION_LIMIT = _.filter(MY_ROOMS, (r) => Game.rooms[r].level >= MAX_LEVEL - 1 && Game.rooms[r].energyState).length || 1;
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
    if (!Memory._enemies || !Memory._enemies.length) Memory._enemies = [];
    // Handle stronghold operations
    let activeStrongholdAttacks = _.find(Memory.targetRooms, (target) => target && target.type === 'stronghold');
    if (!activeStrongholdAttacks) {
        let stronghold = _.sortBy(_.filter(INTEL, (r) => r.sk && r.towers && siegeLevel(r.towers) && myRoomInSectorCheck(r.name)), function (t) {
            return findClosestOwnedRoom(t.name, true);
        })[0];

        if (stronghold) {
            let targetRoom = stronghold.name;
            if (!Memory.targetRooms[targetRoom]) {
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[targetRoom] = {
                    tick: tick,
                    type: 'stronghold',
                    level: 1,
                    priority: getPriority(targetRoom),
                    boostsRequired: true
                };
                Memory.targetRooms = cache;

                return log.a('Stronghold operation planned for ' + roomLink(targetRoom), 'HIGH COMMAND: ');
            }
        }
    }

    // Handle direct room attacks
    if (OFFENSIVE_OPERATIONS && _.size(Memory.targetRooms) < OPERATION_LIMIT) {
        let initialFilter = _.filter(INTEL, (r) => r.user && userStrength(r.user) <= MAX_LEVEL && !_.includes(FRIENDLIES, r.user) && !_.includes(NO_DIRECT_ATTACKS, r.user) && !Memory.targetRooms[r.name] &&
            !_.includes(Memory.nonCombatRooms, r.name) && ((r.lastOperation || 0) + ATTACK_COOLDOWN < Game.time) && !checkForNap(r.user) && (!r.safemode || r.safemode - 500 < Game.time));

        // Room Denial
        let activeRoomDenials = _.filter(Memory.targetRooms, (target) => target && target.type === 'roomDenial').length || 0;
        if (activeRoomDenials < 2) {
            let target = _.min(_.filter(initialFilter, (r) => r.owner && !r.towers && (NEW_SPAWN_DENIAL || (HOLD_SECTOR && myRoomInSectorCheck(r.name)))), function (t) {
                if (!t.name) return Infinity;
                return findClosestOwnedRoom(t.name, true);
            });

            if (target && target.name) {
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'roomDenial',
                    level: 1,
                    priority: getPriority(target.name)
                };
                Memory.targetRooms = cache;
                INTEL[target.name].lastOperation = Game.time;

                return log.a('Room Denial operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Friendly Room - ' + findClosestOwnedRoom(target.name, true) + ' rooms away)', 'HIGH COMMAND: ');
            }
        }

        // Sieges
        if (activeRoomDenials < 2) {
            let target = _.min(_.filter(initialFilter, (r) => r.owner && r.towers && siegeLevel(r.towers) && HOLD_SECTOR && myRoomInSectorCheck(r.name)), function (t) {
                if (!t.name) return Infinity;
                return findClosestOwnedRoom(t.name, true);
            });
            if (target && target.name) {
                const level = target.towers <= 2 ? 3 : 4;
                const boosts = true;
                const cache = Memory.targetRooms || {};
                const tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'roomDenial',
                    level: level,
                    priority: getPriority(target.name),
                    boostsRequired: boosts
                };
                Memory.targetRooms = cache;
                INTEL[target.name].lastOperation = Game.time;

                return log.a('Room Denial operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Friendly Room - ' + findClosestOwnedRoom(target.name, true) + ' rooms away)', 'HIGH COMMAND: ');
            }
        }

        // Remote camping
        let activeCamping = _.filter(Memory.targetRooms, (target) => target && target.type === 'guard' && target.camping).length || 0;
        const campingAmount = HARASSMENT_OPERATIONS ? 1 : _.min(3, MY_ROOMS.length);
        if (activeCamping < campingAmount) {
            // If the enemy room only has one exit, we setup a guard op to camp instead
            let target = _.min(_.filter(initialFilter, (r) => r.owner && (ATTACK_LOCALS || _.includes(THREATS, r.user)) && singleRemote(r.name)), function (t) {
                if (!t.name) return Infinity;
                return findClosestOwnedRoom(t.name, true);
            });
            if (target && target.name) {
                INTEL[target.name].lastOperation = Game.time;
                target.name = singleRemote(target.name);
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'guard',
                    level: 1,
                    priority: getPriority(target.name),
                    camping: true
                };
                Memory.targetRooms = cache;
                return log.a('Remote camping operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Friendly Room - ' + findClosestOwnedRoom(target.name, true) + ' rooms away)', 'HIGH COMMAND: ');
            }
        }

        // Remote Denial
        let activeRemoteDenials = _.filter(Memory.targetRooms, (target) => target && target.type === 'remoteDenial').length || 0;
        const denialAmount = HARASSMENT_OPERATIONS ? 1 : _.min(3, MY_ROOMS.length);
        if (activeRemoteDenials < denialAmount) {
            // If the enemy room only has one exit, we setup a guard op to camp instead
            let target = _.min(_.filter(initialFilter, (r) => r.owner && (ATTACK_LOCALS || _.includes(THREATS, r.user))), function (t) {
                if (!t.name) return Infinity;
                return findClosestOwnedRoom(t.name, true);
            });
            if (target && target.name) {
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'remoteDenial',
                    level: 1,
                    priority: getPriority(target.name)
                };
                Memory.targetRooms = cache;

                return log.a('Remote Denial operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Friendly Room - ' + findClosestOwnedRoom(target.name, true) + ' rooms away)', 'HIGH COMMAND: ');
            }
        }
    }
}

function auxiliaryOperations() {
    let initialFilter = _.filter(INTEL, (r) => r.name && !Memory.auxiliaryTargets[r.name] && !_.includes(Memory.nonCombatRooms, r.name) && !r.hostile);

    if (MAX_LEVEL >= 4) {
        let tick = Game.time;
        let cache = Memory.auxiliaryTargets || {};

        // Power Mining (level 8 and power threshold check)
        if (MAX_LEVEL >= 8 && getResourceTotal(RESOURCE_POWER) < DUMP_AMOUNT) {
            let powerRoom = _.min(_.filter(initialFilter, (r) => r.power && r.power - 1500 >= tick && findClosestOwnedRoom(r.name, true) <= 8), function (t) {
                return findClosestOwnedRoom(t.name, true);
            });

            if (powerRoom && powerRoom.name && !_.find(Memory.auxiliaryTargets, (target) => target && target.type === 'power')) {
                cache[powerRoom.name] = {tick, type: 'power', level: 1, priority: PRIORITIES.medium};
                log.a(`Mining operation planned for ${roomLink(powerRoom.name)} (Power Bank Location)`, 'HIGH COMMAND: ');
            }
        }

        // Commodity Mining
        let commodityRoom = _.find(initialFilter, (r) => r.commodity && getResourceTotal(r.commodity) < DUMP_AMOUNT && findClosestOwnedRoom(r.name, true) <= 8);
        if (commodityRoom && commodityRoom.name && _.size(_.filter(Memory.auxiliaryTargets, (t) => t && t.type === 'commodity')) < 2) {
            cache[commodityRoom.name] = {tick, type: 'commodity', level: 1, priority: PRIORITIES.medium};
            log.a(`Mining operation planned for ${roomLink(commodityRoom.name)} (Commodity Deposit Location)`, 'HIGH COMMAND: ');
        }

        // Mineral Mining (rooms with more than 3 sources and minerals)
        let mineralRoom = _.find(initialFilter, (r) => !r.sk && r.sources >= 3 && r.mineralAmount && !MY_MINERALS[r.mineral] && myRoomInSectorCheck(r.name));
        if (mineralRoom && mineralRoom.name) {
            cache[mineralRoom.name] = {tick, type: 'mineral', level: 1, priority: PRIORITIES.medium};
            log.a(`Mining operation planned for ${roomLink(mineralRoom.name)} (Mineral Deposit Location)`, 'HIGH COMMAND: ');
        }

        // Update auxiliary targets with the new planned operations
        Memory.auxiliaryTargets = cache;
    }

    // Rebuild allies (if the room needs builders and is not hostile)
    let needyRoom = _.find(MY_ROOMS, (r) => Game.rooms[r].memory.buildersNeeded && INTEL[r] && !INTEL[r].hostile && !Memory.auxiliaryTargets[r]);
    if (needyRoom) {
        let cache = Memory.auxiliaryTargets || {};
        let tick = Game.time;
        cache[needyRoom] = {tick, type: 'rebuild', level: 1, priority: PRIORITIES.priority};
        Memory.auxiliaryTargets = cache;
        log.a(`Rebuild operation planned for ${roomLink(needyRoom)} (Rebuilding Required)`, 'HIGH COMMAND: ');
    }
}

function manageResponseForces() {
    let idleResponders = _.filter(Game.creeps, (c) => c.memory && c.memory.awaitingOrders);
    if (!idleResponders.length) return;

    let activeResponders = _.filter(Game.creeps, (c) => c.memory && !c.memory.awaitingOrders);
    let friendlyResponsePower = 0;

    // Helper function to prioritize targets based on threat and distance
    function getPriorityTarget() {
        // Return the highest priority target based on threat levels and distances
        let potentialTargets = [];

        // Support requested
        let requestingSupport = _.findKey(INTEL, (r) => r.requestingSupport && (!r.responseDispatched || r.responseDispatched + 50 < Game.time));
        if (requestingSupport) {
            potentialTargets.push({type: 'ownedRoomAttack', room: requestingSupport, priority: 10});
        }

        // Remote support hostile
        let remoteSupport = _.findKey(INTEL, (r) => r.threatLevel > 1 && r.activeRemote + CREEP_LIFE_TIME > Game.time && (!r.responseDispatched || r.responseDispatched + 50 < Game.time));
        if (remoteSupport) {
            potentialTargets.push({type: 'remoteRoomAttack', room: remoteSupport, priority: 9});
        }

        // Invader Core
        let invaderCore = _.findKey(INTEL, (r) => r.invaderCore && r.activeRemote + CREEP_LIFE_TIME > Game.time && (!r.responseDispatched || r.responseDispatched + 50 < Game.time));
        if (invaderCore) {
            potentialTargets.push({type: 'invaderCore', room: invaderCore, priority: 8});
        }

        // Remote support unarmed
        let remoteSupportUnarmed = _.findKey(INTEL, (r) => r.threatLevel === 1 && r.activeRemote + CREEP_LIFE_TIME > Game.time && (!r.responseDispatched || r.responseDispatched + 50 < Game.time));
        if (remoteSupportUnarmed) {
            potentialTargets.push({type: 'unarmedVisitors', room: remoteSupportUnarmed, priority: 7});
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

        for (let creep of _.sortBy(idleResponders, (c) => Game.map.getRoomLinearDistance(c.pos.roomName, targetRoom))) {
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

    // Get the highest-priority target based on the current situation
    let target = getPriorityTarget();

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
}

function manageMilitary() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;
    let totalCountFiltered = _.filter(Memory.targetRooms, target => target && !target.manual && target.type !== 'guard' && target.type !== 'pending').length || 0;
    let staleMulti = 1;

    // Iterate through target rooms
    for (let key in Memory.targetRooms) {
        let target = Memory.targetRooms[key];
        if (!target) continue;
        let type = target.type;

        // Handle room-specific conditions based on the type of operation
        switch (type) {
            case 'test':
                continue;  // Skip test operations

            case 'roomDenial':
                staleMulti = 1000;
                if (target.manual) break;
                if (totalCountFiltered > OPERATION_LIMIT ||
                    (INTEL[key] && (_.includes(FRIENDLIES, INTEL[key].owner) || !INTEL[key].owner || INTEL[key].owner === 'Invader'))) {
                    log.a('Canceling ' + type + ' in ' + roomLink(key) + ' due to high operation count or non-hostile status.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    totalCountFiltered--;
                    continue;
                }
                break;

            case 'nukes':
                continue;  // Nukes are handled differently, continue

            case 'pending':
                if (target.dDay - 50 <= Game.time) {
                    target.type = 'roomDenial';
                    target.tick = Game.time;
                    log.a('Pending expired in ' + roomLink(key) + ' switching to a hold.', 'HIGH COMMAND: ');
                }
                continue;

            case 'harass':
            case 'remoteDenial':
                staleMulti = 100;
                if (target.manual) break;
                if (totalCountFiltered > OPERATION_LIMIT) {
                    log.a('Canceling ' + type + ' in ' + roomLink(key) + ' due to too many active operations.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    continue;
                }
                break;

            case 'guard':
                let guardCount = _.filter(Memory.targetRooms, target => target && target.type === 'guard').length || 0;
                if (guardCount > 2) {
                    log.a('Canceling guard in ' + roomLink(key) + ' as we have too many active guard operations.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    continue;
                }
                staleMulti *= (target.level + 1);
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
            } else if (type !== 'scout' && type !== 'pending') {
                log.a('Canceling operation in ' + roomLink(key) + ' as we have no intel.', 'HIGH COMMAND: ');
                delete Memory.targetRooms[key];
                continue;
            }
        }

        // Cancel operation for powerful users or hostile users beyond max level
        if (!target.manual && INTEL[key] && userStrength(INTEL[key].user) > MAX_LEVEL) {
            log.a('Canceling operation in ' + roomLink(key) + ' as ' + INTEL[key].user + ' is too powerful.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        // Cancel operation for high-level hostile users detected in the room
        if (!target.manual && target.userList && target.userList.some(user => userStrength(user) > MAX_LEVEL)) {
            log.a('Canceling operation in ' + roomLink(key) + ' due to high-level user detection.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        // Skip stale operations
        if (target.tick + (CREEP_LIFE_TIME * staleMulti) < Game.time && !target.lastEnemyKilled ||
            (target.lastEnemyKilled && target.lastEnemyKilled + (2500 * staleMulti) < Game.time)) {
            log.a('Canceling operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
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
        if (target.type !== 'scout' && target.type !== 'guard' && target.type !== 'roomDenial' && INTEL[key] && INTEL[key].user && !Memory._threats.includes(INTEL[key].user)) {
            log.a('Canceling operation in ' + roomLink(key) + ' as ' + INTEL[key].user + ' is no longer considered a threat.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        // Final checks for stale or problematic operations
        if (target.waves && target.waves >= 5) {
            log.a('Canceling operation in ' + roomLink(key) + ' due to max waves reached.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
            continue;
        }

        if (target.friendlyDead && target.tick + 1750 && target.friendlyDead > (target.enemyDead || 1000) * staleMulti) {
            log.a('Canceling operation in ' + roomLink(key) + ' due to heavy casualties.', 'HIGH COMMAND: ');
            delete Memory.targetRooms[key];
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
                    delete INTEL[key];
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
                    delete INTEL[key];
                    continue;
                }
                break;

            case 'rebuild':
                if (!MY_ROOMS.includes(key)) {
                    log.a('Canceling rebuild operation in ' + roomLink(key) + ' as we are no longer needed.', 'HIGH COMMAND: ');
                    delete Memory.auxiliaryTargets[key];
                    delete INTEL[key];
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

        // Define a helper function for flag removal and logging
        function removeFlagAndLog(message) {
            log.a(message, 'HIGH COMMAND: ');
            flag.remove();
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
            delete INTEL[roomName];
            removeFlagAndLog('Canceling operation in ' + roomLink(roomName) + ' at your request.');
            continue;
        }

        // Handle bad room avoidance
        if (operation.includes('avoid')) {
            Memory.avoidRooms = Memory.avoidRooms || [];
            if (!Memory.avoidRooms.includes(roomName)) {
                Memory.avoidRooms.push(roomName);
                log.e(roomLink(roomName) + ' will be avoided.');
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
                log.e(roomLink(roomName) + ' will no longer be avoided.');
            } else if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, roomName)) {
                Memory.avoidRemotes = _.filter(Memory.avoidRemotes, r => r !== roomName);
                removed = true;
                log.e(roomLink(roomName) + ' will no longer be avoided.');
            } else if (Memory.nonCombatRooms && _.includes(Memory.nonCombatRooms, roomName)) {
                Memory.nonCombatRooms = _.filter(Memory.nonCombatRooms, r => r !== roomName);
                removed = true;
                log.e(roomLink(roomName) + ' removed as a non combat target.');
            }
            if (!removed) {
                log.e(roomLink(roomName) + ' is not on any avoid lists.');
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
        log.e('Nuke request for room ' + roomLink(flag.pos.roomName) + ' denied, no nukers in range.');
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
    let availableLaunchers = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && !s.store.getFreeCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity(RESOURCE_GHODIUM) && !s.cooldown);
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
                type: 'pending',
                dDay: Game.time + NUKE_LAND_TIME,
                observerCheck: Game.time
            };
            Memory.targetRooms = cache;

            // Log nuke launch event for tracking
            log.a('Nuke launched at ' + roomLink(MADTarget.name) + ' by ' + launcher.room.name);
        }
    }
}

function checkForNap(user) {
    // Return false if we have no alliance data or the user is in our enemies list
    if (!global.LOAN_CHECK || !ALLIANCE_DATA || !NAP_ALLIANCE.length || _.includes(Memory._enemies, user)) {
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
        log.e('Error checking for NAP: ' + e.message); // Optional logging for debugging
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
    const remotes = _.filter(neighbors, (n) => !INTEL[n] || (!INTEL[n].sources && !INTEL[n].isHighway && !INTEL[n].owner && !INTEL[n].sk));
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

    // Process friendly tombstones
    friendlyDead = processTombstones(room.tombstones, FRIENDLIES, friendlyDead, trackedFriendly, 5);

    // Process friendly forces (add unit cost if friendly is critically low)
    friendlyDead = processFriendlyForces(room, friendlyDead, trackedFriendly);

    // Process enemy tombstones and enemy forces
    enemyDead = processTombstones(room.tombstones, null, enemyDead, trackedEnemy, 10);
    let enemyReinforcements = assessEnemyReinforcements(room);

    // If enemy reinforcements are coming and the room is not reinforced, mark operation at risk
    if (enemyReinforcements > 0 && !isRoomReinforced(room)) {
        isAtRisk = true;
    }

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

// Mark a room as pending due to safemode
function markAsPending(operationRoom, room) {
    let cache = Memory.targetRooms || {};
    let tick = Game.time;
    cache[operationRoom] = {
        tick: tick,
        type: 'pending',
        dDay: tick + room.controller.safeMode,
    };

    // Suicide military creeps associated with the room
    _.filter(Game.creeps, (c) => c.my && c.memory.destination === room.name && c.memory.military).forEach(c => c.suicide());

    log.a(`${room.name} is now marked as Pending due to safemode.`, 'OPERATION PLANNER: ');
    Memory.targetRooms = cache;
    Memory.auxiliaryTargets = cache;
}

// Process friendly or enemy tombstones, return updated dead count
function processTombstones(tombstones, friendlyList, deadCount, trackedList, minTTL = 5) {
    let relevantTombstones = _.filter(tombstones, (s) => (friendlyList ? _.includes(friendlyList, s.creep.owner.username) : !_.includes(FRIENDLIES, s.creep.owner.username)));
    for (let tombstone of relevantTombstones) {
        if (_.includes(trackedList, tombstone.id) || tombstone.creep.ticksToLive <= minTTL) continue;
        deadCount += UNIT_COST(tombstone.creep.body);
        trackedList.push(tombstone.id);
    }
    return deadCount;
}

// Process friendly forces (creeps), updating dead count if needed
function processFriendlyForces(room, friendlyDead, trackedFriendly) {
    let friendlyForces = _.filter(room.creeps, (c) => c.memory && c.memory.military);
    let enemyForces = _.filter(room.creeps, (c) => !c.memory);

    // Check if a friendly force is critically low and add its cost to dead count
    if (friendlyForces.length === 1 && friendlyForces[0].hits < friendlyForces[0].hitsMax * 0.15 && enemyForces.length && !_.includes(trackedFriendly, friendlyForces[0].id)) {
        friendlyDead += UNIT_COST(friendlyForces[0].body);
        trackedFriendly.push(friendlyForces[0].id);
    }

    return friendlyDead;
}

// Assess the number of incoming enemy reinforcements
function assessEnemyReinforcements(room) {
    // Placeholder logic for determining incoming enemy reinforcements. This can be expanded to consider hostile structures, power creeps, etc.
    let enemyUnits = _.filter(Game.creeps, (c) => !c.my && c.pos.roomName === room.name && !c.memory.exemptReinforcements);
    return enemyUnits.length;
}

// Check if the room is adequately reinforced by friendly forces
function isRoomReinforced(room) {
    // Placeholder logic for checking if the room is reinforced. Can consider friendly creep numbers, presence of defenses, etc.
    let friendlyReinforcements = _.filter(Game.creeps, (c) => c.my && c.pos.roomName === room.name && c.memory.military);
    return friendlyReinforcements.length > 5;  // Simple threshold; this can be adjusted based on strategy.
}

// Save the operation object back into memory
function saveOperation(operationRoom, operation) {
    if (Memory.targetRooms[operationRoom]) {
        Memory.targetRooms[operationRoom] = operation;
    } else if (Memory.auxiliaryTargets[operationRoom]) {
        Memory.auxiliaryTargets[operationRoom] = operation;
    } else if (Memory.targetRooms[operationRoom]) {
        Memory.targetRooms[operationRoom] = operation;
    } else if (Memory.auxiliaryTargets[operationRoom]) {
        Memory.auxiliaryTargets[operationRoom] = operation;
    }
}

// Check if we have high enough level for the number of towers
function siegeLevel(towerCount) {
    if (towerCount === 1 && MAX_LEVEL >= 6) {
        return true;
    } else if (towerCount > 1 && MAX_LEVEL >= 7) {
        return true;
    }
    return false;
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