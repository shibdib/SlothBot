/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let OPERATION_LIMIT;
let lastTick = 0;

module.exports.highCommand = function () {
    // Check for flags
    if (_.size(Game.flags)) manualAttacks();
    if (lastTick + 10 > Game.time) return;
    lastTick = Game.time;
    OPERATION_LIMIT = _.filter(MY_ROOMS, (r) => Game.rooms[r].energyState && Game.rooms[r].level === MAX_LEVEL).length + 1;
    if (!Memory.nonCombatRooms) Memory.nonCombatRooms = [];
    if (!Memory.targetRooms) Memory.targetRooms = {};
    if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};
    // Update harasser targets
    Memory.harassTargets = _.filter(Object.keys(Memory._userList), (r) => !_.includes(FRIENDLIES, r) && _.includes(THREATS, r) && userStrength(r) <= MAX_LEVEL);
    // Manage dispatching responders
    manageResponseForces();
    // Auxiliary
    if (Math.random() > 0.5) auxiliaryOperations();
    // Request scouting for new operations
    else if (MAX_LEVEL >= 2 && Math.random() > 0.5) operationRequests();
    // Manage old operations
    else {
        manageAttacks();
        manageAuxiliary();
    }
};

function operationRequests() {
    if (!Memory._enemies || !Memory._enemies.length) Memory._enemies = [];
    // Ally defense request
    if (_.size(ALLY_HELP_REQUESTS)) {
        for (let ally of _.filter(ALLY_HELP_REQUESTS)) {
            let defenseRequest = _.find(ally, (r) => r.requestType === 1 && !Memory.targetRooms[r.roomName]);
            if (defenseRequest) {
                let cache = Memory.targetRooms || {};
                let totalGuards = _.filter(Memory.targetRooms, (target) => target.type === 'guard').length || 0;
                let lowestGuard = _.max(_.filter(Object.keys(Memory.targetRooms), (target) => Memory.targetRooms[target].type === 'guard'), 'priority');
                if (totalGuards >= 2 && priority >= lowestGuard.priority) continue;
                cache[defenseRequest.roomName] = {
                    tick: Game.time,
                    type: 'guard',
                    level: 1,
                    priority: getPriority(defenseRequest.roomName)
                };
                Memory.targetRooms = cache;
                return log.a('ALLY REQUEST!! Guard operation planned for ' + roomLink(defenseRequest.roomName), 'HIGH COMMAND: ');
            }
        }
        // Ally attack request
        for (let ally of _.filter(ALLY_HELP_REQUESTS)) {
            let attackRequest = _.find(ally, (r) => r.requestType === 2 && !Memory.targetRooms[r.roomName]);
            if (attackRequest) {
                let cache = Memory.targetRooms || {};
                // Determine type
                let type = 'harass';
                if (INTEL[attackRequest.roomName] && !INTEL[attackRequest.roomName].towers) type = 'hold';
                else continue;
                cache[attackRequest.roomName] = {
                    tick: Game.time,
                    type: type,
                    level: 1,
                    priority: getPriority(attackRequest.roomName)
                };
                Memory.targetRooms = cache;
                return log.a('ALLY REQUEST!! ' + type + ' operation planned for ' + roomLink(attackRequest.roomName), 'HIGH COMMAND: ');
            }
        }
    }
    // Kill strongholds
    // TODO: Add stronghold attack
    let stronghold = _.sortBy(_.filter(INTEL, (r) => r.sk && r.towers && r.towers < 3 && (sameSectorCheck(findClosestOwnedRoom(r.name), r.name) || findClosestOwnedRoom(r.name, true) <= 3)), function (t) {
        return findClosestOwnedRoom(t.name, true)
    })[0];
    // Direct Room Attacks
    if (OFFENSIVE_OPERATIONS && _.size(Memory.targetRooms) < OPERATION_LIMIT) {
        let initialFilter = _.filter(INTEL, (r) => r.user && userStrength(r.user) <= MAX_LEVEL && !_.includes(FRIENDLIES, r.user) && !Memory.targetRooms[r.name] &&
            !_.includes(Memory.nonCombatRooms, r.name) && ((r.lastOperation || 0) + ATTACK_COOLDOWN < Game.time) && !checkForNap(r.user) && (!r.safemode || r.safemode - 500 < Game.time));
        // New Spawn Denial/No towers
        let target = _.min(_.filter(initialFilter, (r) => (NEW_SPAWN_DENIAL || (HOLD_SECTOR && sameSectorCheck(findClosestOwnedRoom(r.name), r.name))) && r.owner && !r.towers), function (t) {
            return findClosestOwnedRoom(t.name, true)
        });
        if (target.name) {
            let cache = Memory.targetRooms || {};
            cache[target.name] = {
                tick: Game.time,
                type: 'hold',
                level: 1,
                priority: getPriority(target.name)
            };
            Memory.targetRooms = cache;
            INTEL[target.name].lastOperation = Game.time;
            return log.a('Hold operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Friendly Room - ' + findClosestOwnedRoom(target.name, true) + ' rooms away)', 'HIGH COMMAND: ');
        }
        // Denial attacks
        let activeDenial = _.min(_.filter(Memory.targetRooms, (target) => target && target.type === 'denial'), function (t) {
            return findClosestOwnedRoom(t.name, true)
        });
        if (activeDenial.name) {
            let target = _.min(_.filter(initialFilter, (r) => r.owner && (ATTACK_LOCALS || _.includes(Memory._threats, r.user) || (HOLD_SECTOR && sameSectorCheck(findClosestOwnedRoom(r.name), r.name)))), function (t) {
                return findClosestOwnedRoom(t.name, true)
            });
            if (target) {
                let cache = Memory.targetRooms || {};
                cache[target.name] = {
                    tick: Game.time,
                    type: 'denial',
                    level: 1,
                    priority: getPriority(target.name)
                };
                Memory.targetRooms = cache;
                INTEL[target.name].lastOperation = Game.time;
                return log.a('Denial operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Friendly Room - ' + findClosestOwnedRoom(target.name, true) + ' rooms away)', 'HIGH COMMAND: ');
            }
        }
    }
}

function auxiliaryOperations() {
    let initialFilter = _.filter(INTEL, (r) => r.name && !Memory.auxiliaryTargets[r.name] && !_.includes(Memory.nonCombatRooms, r.name) && !r.hostile);
    if (MAX_LEVEL >= 4) {
        // Power Mining
        if (MAX_LEVEL >= 8 && getResourceTotal(RESOURCE_POWER) < DUMP_AMOUNT) {
            let powerRoom = _.min(_.filter(initialFilter, (r) => r.power && r.power + 1500 >= Game.time && findClosestOwnedRoom(r.name, true) <= 8), function (t) {
                return findClosestOwnedRoom(t.name, true);
            });
            let powerMining = _.find(Memory.auxiliaryTargets, (target) => target && target.type === 'power');
            if (powerRoom.name && !powerMining) {
                let cache = Memory.auxiliaryTargets || {};
                let tick = Game.time;
                cache[powerRoom.name] = {
                    tick: tick,
                    type: 'power',
                    level: 1,
                    priority: PRIORITIES.medium
                };
                Memory.auxiliaryTargets = cache;
                log.a('Mining operation planned for ' + roomLink(powerRoom.name) + ' suspected power bank location, Nearest Room - ' + findClosestOwnedRoom(powerRoom.name, true) + ' rooms away', 'HIGH COMMAND: ');
            }
        }
        // Commodity Mining
        let commodityRoom = _.min(_.filter(initialFilter, (r) => r.commodity && getResourceTotal(r.commodity) < DUMP_AMOUNT && findClosestOwnedRoom(r.name, true) <= 8), function (t) {
            return findClosestOwnedRoom(t.name, true);
        });
        let commodityMining = _.filter(Memory.auxiliaryTargets, (target) => target && target.type === 'commodity').length;
        if (commodityRoom.name && commodityMining < _.size(MY_ROOMS)) {
            let cache = Memory.auxiliaryTargets || {};
            let tick = Game.time;
            cache[commodityRoom.name] = {
                tick: tick,
                type: 'commodity',
                level: 1,
                priority: PRIORITIES.medium
            };
            Memory.auxiliaryTargets = cache;
            log.a('Mining operation planned for ' + roomLink(commodityRoom.name) + ' suspected commodity deposit location, Nearest Room - ' + findClosestOwnedRoom(commodityRoom.name, true) + ' rooms away', 'HIGH COMMAND: ');
        }
        // Mineral mine center rooms
        let mineralRoom = _.find(initialFilter, (r) => !r.sk && r.sources >= 3 && r.mineralAmount && !MY_MINERALS.includes(r.mineral) && sameSectorCheck(findClosestOwnedRoom(r.name), r.name));
        if (mineralRoom) {
            let cache = Memory.auxiliaryTargets || {};
            let tick = Game.time;
            cache[mineralRoom.name] = {
                tick: tick,
                type: 'mineral',
                level: 1,
                priority: PRIORITIES.medium
            };
            Memory.auxiliaryTargets = cache;
            log.a('Mining operation planned for ' + roomLink(mineralRoom.name) + ' mineral deposit location, Nearest Room - ' + findClosestOwnedRoom(mineralRoom.name, true) + ' rooms away', 'HIGH COMMAND: ');
        }
        // Robbery
        let robberyTarget = _.find(initialFilter, (r) => r.loot);
        if (robberyTarget) {
            let cache = Memory.auxiliaryTargets || {};
            let tick = Game.time;
            cache[robberyTarget.name] = {
                tick: tick,
                type: 'robbery',
                level: 1,
                priority: PRIORITIES.high
            };
            Memory.auxiliaryTargets = cache;
            log.a('Robbery operation planned for ' + roomLink(robberyTarget.name) + ', Nearest Room - ' + findClosestOwnedRoom(robberyTarget.name, true) + ' rooms away', 'HIGH COMMAND: ');
        }
    }
    // Rebuild allies
    let needyRoom = _.find(MY_ROOMS, (r) => Game.rooms[r].memory.buildersNeeded && INTEL[r] && !INTEL[r].threatLevel && !Memory.auxiliaryTargets[r]);
    if (needyRoom) {
        let cache = Memory.auxiliaryTargets || {};
        let tick = Game.time;
        cache[needyRoom] = {
            tick: tick,
            type: 'rebuild',
            level: 1,
            priority: PRIORITIES.priority
        };
        Memory.auxiliaryTargets = cache;
        log.a('Rebuild operation planned for ' + roomLink(needyRoom) + ', Nearest Room - ' + findClosestOwnedRoom(needyRoom, true) + ' rooms away', 'HIGH COMMAND: ');
    }
}

function manageResponseForces() {
    let idleResponders = _.filter(Game.creeps, (c) => c.memory && c.memory.awaitingOrders);
    if (!idleResponders.length) return;
    let activeResponders = _.filter(Game.creeps, (c) => c.memory && !c.memory.awaitingOrders);
    let ownedRoomAttack = _.findKey(INTEL, (r) => r.owner && r.owner === MY_USERNAME && (r.lastPlayerSighting + 25 > Game.time || Game.rooms[r.name].memory.requestingSupport));
    let invaderCore = _.findKey(INTEL, (r) => !r.sk && !r.towers && r.invaderCore && (!r.responseDispatched || r.responseDispatched + 50 < Game.time) && findClosestOwnedRoom(r.name, true) <= 3);
    let responseTargets = _.max(_.filter(INTEL, (r) => r.threatLevel && r.friendlyPower <= r.hostilePower * 1.2 && !r.sk && r.user === MY_USERNAME && r.lastInvaderCheck + 550 >= Game.time && findClosestOwnedRoom(r.name, true) <= 3), '.threatLevel');
    let unarmedVisitors = _.findKey(INTEL, (r) => r.numberOfHostiles && !r.sk && r.user === MY_USERNAME && (!r.hostilePower || r.hostilePower <= 5) && r.lastInvaderCheck + 550 >= Game.time && (!r.responseDispatched || r.responseDispatched + 100 < Game.time) && findClosestOwnedRoom(r.name, true) <= 3);
    let guard = _.findKey(Memory.targetRooms, (o) => o && o.type === 'guard' && o.level) || _.findKey(Memory.auxiliaryTargets, (o) => o && o.type === 'guard' && o.level);
    let friendlyResponsePower = 0;
    if (ownedRoomAttack) {
        for (let creep of _.filter(activeResponders, (c) => c.memory.destination === ownedRoomAttack)) friendlyResponsePower += creep.combatPower;
        for (let creep of _.sortBy(idleResponders, function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, ownedRoomAttack);
        })) {
            INTEL[ownedRoomAttack].responseDispatched = Game.time;
            if (friendlyResponsePower > INTEL[ownedRoomAttack].hostilePower) break;
            friendlyResponsePower += creep.combatPower;
            creep.memory.destination = ownedRoomAttack;
            creep.memory.awaitingOrders = undefined;
            creep.memory._shibMove = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== ownedRoomAttack) log.a(creep.name + ' reassigned to assist in the defense of ' + roomLink(ownedRoomAttack) + ' from ' + roomLink(creep.room.name));
        }
    } else if (responseTargets && responseTargets.name) {
        for (let creep of _.filter(activeResponders, (c) => c.memory.destination === ownedRoomAttack)) friendlyResponsePower += creep.combatPower;
        for (let creep of _.sortBy(idleResponders, function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, responseTargets.name);
        })) {
            INTEL[responseTargets.name].responseDispatched = Game.time;
            if (friendlyResponsePower > responseTargets.hostilePower) break;
            friendlyResponsePower += creep.combatPower;
            creep.memory.destination = responseTargets.name;
            creep.memory.awaitingOrders = undefined;
            creep.memory._shibMove = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== responseTargets.name) log.a(creep.name + ' responding to ' + roomLink(responseTargets.name) + ' from ' + roomLink(creep.room.name));
        }
    } else if (invaderCore) {
        for (let creep of _.filter(activeResponders, (c) => c.memory.destination === ownedRoomAttack)) friendlyResponsePower += creep.combatPower;
        for (let creep of _.sortBy(idleResponders, function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, invaderCore);
        })) {
            INTEL[invaderCore].responseDispatched = Game.time;
            if (friendlyResponsePower > 50) break;
            friendlyResponsePower += creep.combatPower;
            creep.memory.destination = invaderCore;
            creep.memory.awaitingOrders = undefined;
            creep.memory._shibMove = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== invaderCore) log.a(creep.name + ' reassigned to deal with invader core in ' + roomLink(invaderCore) + ' from ' + roomLink(creep.room.name));
        }
    } else if (unarmedVisitors) {
        for (let creep of _.sortBy(idleResponders, function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, unarmedVisitors);
        })) {
            INTEL[unarmedVisitors].responseDispatched = Game.time;
            if (friendlyResponsePower) break;
            friendlyResponsePower += creep.combatPower;
            creep.memory.destination = unarmedVisitors;
            creep.memory.awaitingOrders = undefined;
            creep.memory._shibMove = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== unarmedVisitors) log.a(creep.name + ' investigating ' + roomLink(unarmedVisitors) + ' for possible trespassers, coming from ' + roomLink(creep.room.name));
        }
    } else if (guard) {
        for (let creep of _.sortBy(idleResponders, function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, guard);
        })) {
            creep.memory.destination = guard;
            creep.memory.awaitingOrders = undefined;
            creep.memory._shibMove = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== guard) log.a(creep.name + ' reassigned to help guard ' + roomLink(guard) + ' from ' + roomLink(creep.room.name));
        }
    }
}

function manageAttacks() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;
    let totalCountFiltered = _.filter(Memory.targetRooms, (target) => target && target.type !== 'guard' && target.type !== 'pending').length || 0;
    let staleMulti = 1;
    targetRooms:
        for (let key in Memory.targetRooms) {
            let type = Memory.targetRooms[key].type;
            if (!Memory.targetRooms[key].manual) {
                // Try to force an intel update if we don't have any. If unable cancel the operation.
                if (!INTEL[key]) {
                    if (Game.rooms[key]) {
                        Game.rooms[key].cacheRoomIntel();
                    } else if (type !== 'scout' && type !== 'pending') {
                        log.a('Canceling operation in ' + roomLink(key) + ' as we have no intel.', 'HIGH COMMAND: ');
                        delete Memory.targetRooms[key];
                    }
                    continue;
                }
                // If room is a manual no combat room cancel operation
                if (_.includes(Memory.nonCombatRooms, key)) {
                    delete Memory.targetRooms[key];
                    log.a('Canceling operation in ' + roomLink(key) + ' as it is set as a manual non combat room.', 'HIGH COMMAND: ');
                    continue;
                }
                // If target rooms user is too powerful don't poke it
                if (INTEL[key] && userStrength(INTEL[key].user) > MAX_LEVEL) {
                    delete Memory.targetRooms[key];
                    log.a('Canceling operation in ' + roomLink(key) + ' as ' + INTEL[key].user + ' is too powerful.', 'HIGH COMMAND: ');
                    continue;
                }
                // If high level hostiles have been seen cancel it
                if (Memory.targetRooms[key].userList) {
                    for (let user of Memory.targetRooms[key].userList) {
                        if (userStrength(user) > MAX_LEVEL) {
                            delete Memory.targetRooms[key];
                            log.a('Canceling operation in ' + roomLink(key) + ' as we detected ' + user + ' who is too powerful.', 'HIGH COMMAND: ');
                            continue targetRooms;
                        }
                    }
                }
            }
            let level = Memory.targetRooms[key].level || 0;
            // Special Conditions
            switch (type) {
                // Skip test
                case 'test':
                    continue;
                // Manage Holds
                case 'hold':
                    staleMulti = 100;
                    if (totalCountFiltered > OPERATION_LIMIT) {
                        log.a('Canceling ' + type + ' in ' + roomLink(key) + ' as we have too many active operations.', 'HIGH COMMAND: ');
                        delete Memory.targetRooms[key];
                        continue;
                    } else if (INTEL[key] && _.includes(FRIENDLIES, INTEL[key].owner)) {
                        log.a('Canceling ' + _.capitalize(Memory.targetRooms[key].type) + ' in ' + roomLink(key) + ' as it is no longer hostile.', 'HIGH COMMAND: ');
                        delete Memory.targetRooms[key];
                        totalCountFiltered--;
                        continue;
                    } else if (INTEL[key] && (!INTEL[key].owner || INTEL[key].owner === 'Invader') && !INTEL[key].reservation && !Memory.targetRooms[key].manual) {
                        log.a('Canceling ' + _.capitalize(Memory.targetRooms[key].type) + ' in ' + roomLink(key) + ' as it is no longer controlled by anyone.', 'HIGH COMMAND: ');
                        delete Memory.targetRooms[key];
                        totalCountFiltered--;
                        continue;
                    }
                    break;
                // Manage Nukes
                case 'nukes':
                    continue;
                // Manage Pending
                case 'pending':
                    if (Memory.targetRooms[key].dDay - 50 <= Game.time) {
                        let cache = Memory.targetRooms || {};
                        let tick = Game.time;
                        cache[key] = {
                            tick: tick,
                            type: 'hold',
                            level: 0
                        };
                        Memory.targetRooms = cache;
                        log.a('Pending expired in ' + roomLink(key) + ' switching to a hold.', 'HIGH COMMAND: ');
                    }
                    continue;
                // Manage Harass
                case 'harass':
                case 'denial':
                    staleMulti = 100;
                    if (totalCountFiltered > OPERATION_LIMIT) {
                        log.a('Canceling harass in ' + roomLink(key) + ' as we have too many active operations.', 'HIGH COMMAND: ');
                        delete Memory.targetRooms[key];
                        continue;
                    }
                    staleMulti = 4;
                    break;
                // Manage Guard
                case 'guard':
                    let guardCount = _.filter(Memory.targetRooms, (target) => target && target.type === 'guard').length || 0;
                    if (guardCount > 2) {
                        log.a('Canceling guard in ' + roomLink(key) + ' as we have too many active operations.', 'HIGH COMMAND: ');
                        delete Memory.targetRooms[key];
                        continue;
                    }
                    staleMulti *= (level + 1);
                    break;
                // Remove auxiliary
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
            if (Memory.targetRooms[key].manual) staleMulti = 50;
            // Cancel stale ops with no kills
            if (type !== 'hold' && (Memory.targetRooms[key].tick + (1500 * staleMulti) < Game.time && !Memory.targetRooms[key].lastEnemyKilled) ||
                (Memory.targetRooms[key].lastEnemyKilled && Memory.targetRooms[key].lastEnemyKilled + (2500 * staleMulti) < Game.time)) {
                delete Memory.targetRooms[key];
                log.a('Canceling operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
                continue;
            }
            // Remove your rooms
            if (INTEL[key] && Memory.targetRooms[key].type !== 'guard' && INTEL[key].user && INTEL[key].user === MY_USERNAME) {
                delete Memory.targetRooms[key];
                log.a('Canceling operation in ' + roomLink(key) + ' as it is targeting one of our rooms.', 'HIGH COMMAND: ');
                continue;
            }
            // Remove allied rooms
            if (INTEL[key] && Memory.targetRooms[key].type !== 'guard' && INTEL[key].user && _.includes(FRIENDLIES, INTEL[key].user)) {
                delete Memory.targetRooms[key];
                log.a('Canceling operation in ' + roomLink(key) + ' as ' + INTEL[key].user + ' is a friend.', 'HIGH COMMAND: ');
                continue;
            }
            // Remove NAP rooms
            if (INTEL[key] && Memory.targetRooms[key].type !== 'guard' && INTEL[key].user && checkForNap(INTEL[key].user)) {
                delete Memory.targetRooms[key];
                log.a('Canceling operation in ' + roomLink(key) + ' as ' + INTEL[key].user + ' is part of a friendly alliance.', 'HIGH COMMAND: ');
                continue;
            }
            // Remove no longer hostile rooms
            if (Memory.targetRooms[key].type !== 'guard' && Memory.targetRooms[key].type !== 'hold' && INTEL[key] && INTEL[key].user && !Memory._threats.includes(INTEL[key].user) && (!HOLD_SECTOR || !sameSectorCheck(findClosestOwnedRoom(key), key))) {
                delete Memory.targetRooms[key];
                log.a('Canceling operation in ' + roomLink(key) + ' as ' + INTEL[key].user + ' is no longer considered a threat.', 'HIGH COMMAND: ');
                continue;
            }
            // Delete wave based rooms at the threshold
            if (Memory.targetRooms[key].waves) {
                if (Memory.targetRooms[key].waves >= 5) {
                    delete Memory.targetRooms[key];
                    log.a('Canceling operation in ' + roomLink(key) + ' as it has reached the maximum number of attack waves.', 'HIGH COMMAND: ');
                }
            }
            // Remove rooms where we're getting wrecked
            if (Memory.targetRooms[key].tick + 1750 && Memory.targetRooms[key].friendlyDead) {
                let alliedLosses = Memory.targetRooms[key].friendlyDead;
                let enemyLosses = Memory.targetRooms[key].enemyDead || 1000;
                if (alliedLosses > enemyLosses * staleMulti) {
                    delete Memory.targetRooms[key];
                    log.a('Canceling operation in ' + roomLink(key) + ' due to heavy casualties.', 'HIGH COMMAND: ');
                }
            }
        }
}

function manageAuxiliary() {
    if (!Memory.auxiliaryTargets || !_.size(Memory.auxiliaryTargets)) return;
    for (let key in Memory.auxiliaryTargets) {
        // Try to force an intel update if we don't have any. If unable cancel the operation.
        if (!INTEL[key]) {
            if (Game.rooms[key]) {
                Game.rooms[key].cacheRoomIntel();
            } else if (!Memory.auxiliaryTargets[key].manual) {
                log.a('Canceling auxiliary operation in ' + roomLink(key) + ' as we have no intel.', 'HIGH COMMAND: ');
                delete Memory.auxiliaryTargets[key];
            }
            continue;
        }
        let type = Memory.auxiliaryTargets[key].type;
        if (_.includes(Memory.nonCombatRooms, key)) {
            delete Memory.auxiliaryTargets[key];
            log.a('Canceling auxiliary operation in ' + roomLink(key) + ' as it is set as a manual non combat room.', 'HIGH COMMAND: ');
            continue;
        }
        // Special Conditions
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
                break;
            case 'commodity':
                if (MAX_LEVEL < 4) {
                    delete Memory.auxiliaryTargets[key];
                    log.a('Canceling mining operation in ' + roomLink(key) + ' as we have no storages.', 'HIGH COMMAND: ');
                }
                if (getResourceTotal(INTEL[key].commodity) >= DUMP_AMOUNT) {
                    log.a('Canceling mining operation in ' + roomLink(key) + ' as we have enough ' + INTEL[key].commodity + '.', 'HIGH COMMAND: ');
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
        if (!Memory.auxiliaryTargets[key]) continue;
        // Cancel stale ops
        if (Memory.auxiliaryTargets[key].tick + CREEP_LIFE_TIME * 3 < Game.time) {
            delete Memory.auxiliaryTargets[key];
            log.a('Canceling auxiliary operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
        }
    }
}

function manualAttacks() {
    for (let name in Game.flags) {
        // Handle nukes
        if (_.startsWith(name, 'nuke')) {
            nukeFlag(name);
            Game.flags[name].remove();
            continue;
        }
        // Cancel attacks
        if (_.startsWith(name, 'cancel')) {
            delete Memory.targetRooms[Game.flags[name].pos.roomName];
            delete Memory.auxiliaryTargets[Game.flags[name].pos.roomName];
            delete INTEL[Game.flags[name].pos.roomName];
            log.a('Canceling operation in ' + roomLink(Game.flags[name].pos.roomName) + ' at your request.', 'HIGH COMMAND: ');
            Game.flags[name].remove();
            continue;
        }
        // Bad room flag
        if (_.startsWith(name, 'avoid')) {
            let cache = Memory.avoidRooms || [];
            cache.push(Game.flags[name].pos.roomName);
            Memory.avoidRooms = cache;
            log.e(roomLink(Game.flags[name].pos.roomName) + ' will be avoided.');
            Game.flags[name].remove();
            continue;
        }
        // Set non combat
        if (_.startsWith(name, 'ignore')) {
            let cache = Memory.nonCombatRooms || [];
            cache.push(Game.flags[name].pos.roomName);
            Memory.nonCombatRooms = cache;
            log.a(Game.flags[name].pos.roomName + ' added as a non combat target.');
            Game.flags[name].remove();
            continue;
        }
        // Set manual observation
        if (_.startsWith(name, 'observe')) {
            Memory.observeRoom = Game.flags[name].pos.roomName;
            log.a('Observing ' + roomLink(Game.flags[name].pos.roomName) + ' at your request.', 'HIGH COMMAND: ');
            Game.flags[name].remove();
            continue;
        }
        // Remove bad room/remote flag
        if (_.startsWith(name, 'remove')) {
            if (Memory.avoidRooms && _.includes(Memory.avoidRooms, Game.flags[name].pos.roomName)) {
                let cache = Memory.avoidRooms;
                cache = _.filter(cache, (r) => r !== Game.flags[name].pos.roomName);
                Memory.avoidRooms = cache;
                log.e(roomLink(Game.flags[name].pos.roomName) + ' will no longer be avoided.')
            } else if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, Game.flags[name].pos.roomName)) {
                let cache = Memory.avoidRemotes;
                cache = _.filter(cache, (r) => r !== Game.flags[name].pos.roomName);
                Memory.avoidRemotes = cache;
                log.e(roomLink(Game.flags[name].pos.roomName) + ' will no longer be avoided.')
            } else if (Memory.nonCombatRooms && _.includes(Memory.nonCombatRooms, Game.flags[name].pos.roomName)) {
                Memory.nonCombatRooms = _.filter(Memory.nonCombatRooms, (r) => r !== Game.flags[name].pos.roomName);
                log.e(Game.flags[name].pos.roomName + ' removed as a non combat target.');
            } else {
                log.e(roomLink(Game.flags[name].pos.roomName) + ' is not on any avoid lists.')
            }
            Game.flags[name].remove();
            continue;
        }
        // Abandon a room
        if (_.startsWith(name, 'abandon')) {
            abandonRoom(Game.flags[name].pos.roomName)
            Game.flags[name].remove();
            continue;
        }
        // Manual combat
        let tick = Game.time;
        let operation = name.replace(/[^a-z]/gi, '');
        if (['clear', 'clean', 'claim', 'rebuild', 'robbery'].includes(operation)) {
            Memory.auxiliaryTargets[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: operation,
                level: 1,
                manual: true
            }
            Game.flags[name].remove();
            log.a('Manual ' + operation + ' task in ' + roomLink(Game.flags[name].pos.roomName) + ' has been initiated.', 'HIGH COMMAND: ');
        } else {
            Memory.targetRooms[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: operation,
                level: 1,
                manual: true
            }
            Game.flags[name].remove();
            log.a('Manual ' + operation + ' task in ' + roomLink(Game.flags[name].pos.roomName) + ' has been initiated.', 'HIGH COMMAND: ');
        }
    }
}

function nukeFlag(flag) {
    let nuker = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && !s.store.getFreeCapacity(RESOURCE_ENERGY) && !s.store.getFreeCapacity(RESOURCE_GHODIUM) && !s.cooldown && Game.map.getRoomLinearDistance(s.room.name, flag.pos.roomName) <= 10)[0];
    if (!nuker) {
        log.e('Nuke request for room ' + flag.pos.roomName + ' denied, no nukes found in-range.');
        flag.remove();
    } else {
        nuker.launchNuke(flag.pos);
        log.a('NUCLEAR LAUNCH DETECTED - ' + flag.pos.roomName + ' ' + flag.pos.x + '.' + flag.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.', 'HIGH COMMAND: ');
        flag.remove();
    }
}

function checkForNap(user) {
    // If we have no alliance data return false
    try {
        if (!ALLIANCE_DATA || !NAP_ALLIANCE.length || _.includes(Memory._enemies, user)) return false;
        let LOANData = JSON.parse(ALLIANCE_DATA);
        let LOANDataKeys = Object.keys(LOANData);
        for (let iL = (LOANDataKeys.length - 1); iL >= 0; iL--) {
            if (LOANDataKeys[LOANDataKeys[iL]] && LOANDataKeys[LOANDataKeys[iL]].indexOf(user) >= 0 && (_.includes(NAP_ALLIANCE, LOANDataKeys[iL]) || AVOID_ATTACKING_ALLIANCES)) {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

function getPriority(room) {
    let range = findClosestOwnedRoom(room, true)
    if (range <= 1) return PRIORITIES.priority;
    else if (range <= 3) return PRIORITIES.urgent;
    else if (range <= 5) return PRIORITIES.high;
    else if (range <= 10) return PRIORITIES.medium;
    else return PRIORITIES.secondary;
}

module.exports.operationSustainability = function (room, operationRoom = room.name) {
    let operation;
    if (Memory.targetRooms[operationRoom]) operation = Memory.targetRooms[operationRoom]; else if (Memory.auxiliaryTargets[operationRoom]) operation = Memory.auxiliaryTargets[operationRoom];
    else if (Memory.targetRooms[room.name]) operation = Memory.targetRooms[room.name]; else if (Memory.auxiliaryTargets[room.name]) operation = Memory.auxiliaryTargets[room.name];
    // Switch to pending if safemode
    if (room.controller && room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[operationRoom] = {
            tick: tick,
            type: 'pending',
            dDay: tick + room.controller.safeMode,
        };
        // Set no longer needed creeps to go recycle
        _.filter(Game.creeps, (c) => c.my && c.memory.destination && c.memory.destination === room.name && c.memory.military).forEach((c) => c.suicide());
        log.a(room.name + ' is now marked as Pending as it has a safemode.', 'OPERATION PLANNER: ');
        if (Memory.targetRooms[operationRoom]) Memory.targetRooms = cache; else if (Memory.auxiliaryTargets[operationRoom]) Memory.auxiliaryTargets = cache;
        return;
    }
    if (!operation || operation.sustainabilityCheck === Game.time) return;
    let friendlyDead = operation.friendlyDead || 0;
    let trackedFriendly = operation.trackedFriendly || [];
    let friendlyTombstones = _.filter(room.tombstones, (s) => _.includes(FRIENDLIES, s.creep.owner.username));
    for (let tombstone of friendlyTombstones) {
        if (_.includes(trackedFriendly, tombstone.id) || tombstone.creep.ticksToLive <= 5) continue;
        friendlyDead = friendlyDead + UNIT_COST(tombstone.creep.body);
        trackedFriendly.push(tombstone.id);
    }
    let friendlyForces = _.filter(room.creeps, (c) => c.memory && c.memory.military);
    let enemyForces = _.filter(room.creeps, (c) => !c.memory);
    if (friendlyForces.length === 1 && friendlyForces[0].hits < friendlyForces[0].hitsMax * 0.15 && enemyForces.length && !_.includes(trackedFriendly, friendlyForces[0].id)) {
        friendlyDead = friendlyDead + UNIT_COST(friendlyForces[0].body);
        trackedFriendly.push(friendlyForces[0].id);
    }
    let enemyDead = operation.enemyDead || 0;
    let trackedEnemy = operation.trackedEnemy || [];
    let enemyTombstones = _.filter(room.tombstones, (s) => !_.includes(FRIENDLIES, s.creep.owner.username));
    for (let tombstone of enemyTombstones) {
        if (_.includes(trackedEnemy, tombstone.id) || tombstone.creep.ticksToLive <= 10) continue;
        operation.lastEnemyKilled = Game.time;
        enemyDead = enemyDead + UNIT_COST(tombstone.creep.body);
        trackedEnemy.push(tombstone.id);
    }
    operation.enemyDead = enemyDead;
    operation.friendlyDead = friendlyDead;
    operation.trackedEnemy = trackedEnemy;
    operation.trackedFriendly = trackedFriendly;
    operation.sustainabilityCheck = Game.time;
    if (Memory.targetRooms[operationRoom]) Memory.targetRooms[operationRoom] = operation; else if (Memory.auxiliaryTargets[operationRoom]) Memory.auxiliaryTargets[operationRoom] = operation;
    else if (Memory.targetRooms[room.name]) Memory.targetRooms[room.name] = operation; else if (Memory.auxiliaryTargets[room.name]) Memory.auxiliaryTargets[room.name] = operation;
};

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