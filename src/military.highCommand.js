/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.highCommand = function () {
    if (!Memory.targetRooms) Memory.targetRooms = {};
    if (!Memory.auxiliaryTargets) Memory.auxiliaryTargets = {};
    let maxLevel = Memory.maxLevel;
    // Manage dispatching responders
    if (Game.time % 10 === 0) manageResponseForces();
    // Auxiliary
    if (Game.time % 10 === 0) auxiliaryOperations();
    // Request scouting for new operations
    if (maxLevel >= 4 && Game.time % 750 === 0) operationRequests();
    // Manage old operations
    if (Game.time % 50 === 0) {
        manageAttacks();
        manageAuxiliary();
    }
    // Check for flags
    if (Game.time % 10 === 0) manualAttacks();
};

function manageResponseForces() {
    let idlePower = 0;
    let idleResponders = _.filter(Game.creeps, (c) => c.memory && c.memory.awaitingOrders && c.memory.operation === 'borderPatrol');
    idleResponders.forEach((c) => idlePower += c.combatPower);
    let activeResponders = _.filter(Game.creeps, (c) => c.memory && !c.memory.awaitingOrders && c.memory.operation === 'borderPatrol');
    let ownedRoomAttack = _.findKey(Memory.roomCache, (r) => r.owner && r.owner === MY_USERNAME && r.lastPlayerSighting + 25 > Game.time && (!r.responseDispatched || r.responseDispatched + 500 < Game.time));
    let invaderCore = _.findKey(Memory.roomCache, (r) => r.closestRange <= 2 && !r.sk && r.invaderCore && !_.find(Game.creeps, (c) => c.my && c.memory.responseTarget === r.name) && (!r.responseDispatched || r.responseDispatched + 500 < Game.time));
    let responseTargets = _.max(_.filter(Memory.roomCache, (r) => r.numberOfHostiles && !r.sk && (!r.user || r.user === MY_USERNAME) && r.closestRange <= LOCAL_SPHERE && r.lastInvaderCheck + 550 >= Game.time && (!r.responseDispatched || r.responseDispatched + 500 < Game.time)), '.threatLevel');
    let highestHeat = _.max(_.filter(Memory.roomCache, (r) => r.roomHeat && !r.sk && (!r.user || r.user === MY_USERNAME) && r.closestRange <= LOCAL_SPHERE && !r.numberOfHostiles &&
        r.lastInvaderCheck + 550 >= Game.time), '.roomHeat');
    let guard = _.findKey(Memory.targetRooms, (o) => o && o.type === 'guard' && o.level);
    let friendlyResponsePower = 0;
    if (ownedRoomAttack) {
        for (let creep of _.filter(activeResponders, (c) => c.memory.responseTarget === ownedRoomAttack)) {
            friendlyResponsePower += creep.combatPower;
        }
        for (let creep of _.sortBy(_.filter(idleResponders, (c) => Game.map.getRoomLinearDistance(c.room.name, ownedRoomAttack) <= 5), function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, ownedRoomAttack);
        })) {
            Memory.roomCache[ownedRoomAttack].responseDispatched = Game.time;
            if (friendlyResponsePower > Memory.roomCache[ownedRoomAttack].hostilePower) break;
            friendlyResponsePower += creep.combatPower;
            creep.memory.other.responseTarget = ownedRoomAttack;
            creep.memory.awaitingOrders = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== ownedRoomAttack) log.a(creep.name + ' reassigned to assist in the defense of ' + roomLink(ownedRoomAttack) + ' from ' + roomLink(creep.room.name));
        }
    } else if (responseTargets && responseTargets.name) {
        for (let creep of _.filter(activeResponders, (c) => c.memory.responseTarget === responseTargets.name)) {
            friendlyResponsePower += creep.combatPower;
        }
        for (let creep of _.sortBy(_.filter(idleResponders, (c) => Game.map.getRoomLinearDistance(c.room.name, responseTargets.name) <= 5), function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, responseTargets.name);
        })) {
            Memory.roomCache[responseTargets.name].responseDispatched = Game.time;
            if (friendlyResponsePower > responseTargets.hostilePower * 1.1) break;
            friendlyResponsePower += creep.combatPower;
            creep.memory.other.responseTarget = responseTargets.name;
            creep.memory.awaitingOrders = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== responseTargets.name) log.a(creep.name + ' responding to ' + roomLink(responseTargets.name) + ' from ' + roomLink(creep.room.name));
        }
    } else if (invaderCore) {
        for (let creep of _.sortBy(_.filter(idleResponders, (c) => Game.map.getRoomLinearDistance(c.room.name, invaderCore) <= 5), function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, invaderCore);
        })) {
            Memory.roomCache[invaderCore].responseDispatched = Game.time;
            if (friendlyResponsePower) break;
            friendlyResponsePower += creep.combatPower;
            creep.memory.other.responseTarget = invaderCore;
            creep.memory.awaitingOrders = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== invaderCore) log.a(creep.name + ' reassigned to a to deal with invader core in ' + roomLink(invaderCore) + ' from ' + roomLink(creep.room.name));
        }
    }
    /** else if (highestHeat && highestHeat.name) {
        for (let creep of _.sortBy(_.filter(idleResponders, (c) => Game.map.getRoomLinearDistance(c.room.name, highestHeat.name) <= 5), function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, highestHeat.name);
        })) {
            creep.memory.other.responseTarget = highestHeat.name;
            creep.memory.awaitingOrders = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== highestHeat.name) log.a(creep.name + ' reassigned to a contested room ' + roomLink(highestHeat.name) + ' from ' + roomLink(creep.room.name));
        }
    } **/
    else if (guard) {
        for (let creep of _.sortBy(_.filter(idleResponders, (c) => Game.map.getRoomLinearDistance(c.room.name, guard) <= 5), function (c) {
            Game.map.getRoomLinearDistance(c.pos.roomName, guard);
        })) {
            creep.memory.other.responseTarget = guard;
            creep.memory.awaitingOrders = undefined;
            creep.memory.idle = undefined;
            if (creep.room.name !== guard) log.a(creep.name + ' reassigned to help guard ' + roomLink(guard) + ' from ' + roomLink(creep.room.name));
        }
    }
}

function auxiliaryOperations() {
    let maxLevel = Memory.maxLevel;
    if (maxLevel >= 6) {
        // Power Mining
        if (maxLevel >= 8) {
            let powerRooms = _.filter(Memory.roomCache, (r) => r.power && r.power + 1500 >= Game.time && r.closestRange <= 8);
            let powerMining = _.filter(Memory.auxiliaryTargets, (target) => target && target.type === 'power').length || 0;
            if (powerRooms.length && !powerMining) {
                for (let powerRoom of powerRooms) {
                    if (Memory.auxiliaryTargets[powerRoom.name]) continue;
                    let cache = Memory.auxiliaryTargets || {};
                    let tick = Game.time;
                    cache[powerRoom.name] = {
                        tick: tick,
                        type: 'power',
                        level: 1,
                        priority: 1
                    };
                    Memory.auxiliaryTargets = cache;
                    log.a('Mining operation planned for ' + roomLink(powerRoom.name) + ' suspected power bank location, Nearest Room - ' + powerRoom.closestRange + ' rooms away', 'HIGH COMMAND: ');
                    break;
                }
            }
        }
        // Commodity Mining
        let commodityRooms = _.filter(Memory.roomCache, (r) => r.commodity && r.closestRange <= 8 && !r.user);
        let commodityMining = _.filter(Memory.targetRooms, (target) => target && target.type === 'commodity').length || 0;
        if (commodityRooms.length && !commodityMining) {
            for (let commodityRoom of commodityRooms) {
                if (Memory.auxiliaryTargets[commodityRoom.name]) continue;
                let cache = Memory.auxiliaryTargets || {};
                let tick = Game.time;
                cache[commodityRoom.name] = {
                    tick: tick,
                    type: 'commodity',
                    level: 1,
                    priority: 1
                };
                Memory.auxiliaryTargets = cache;
                log.a('Mining operation planned for ' + roomLink(commodityRoom.name) + ' suspected commodity deposit location, Nearest Room - ' + commodityRoom.closestRange + ' rooms away', 'HIGH COMMAND: ');
                break;
            }
        }
    }
}

function operationRequests() {
    if (!Memory._enemies || !Memory._enemies.length) Memory._enemies = [];
    if (!Memory._nuisance || !Memory._nuisance.length) Memory._nuisance = [];
    let maxLevel = Memory.maxLevel;
    let totalCountFiltered = _.filter(Memory.targetRooms, (target) => target && target.type !== 'guard').length || 0;
    // Set limit
    let targetLimit = COMBAT_LIMIT;
    if (TEN_CPU) targetLimit = 1;
    // Guard new rooms
    let guardNeeded = _.filter(Memory.roomCache, (r) => r.owner && r.owner === MY_USERNAME && r.level && !r.towers && r.closestRange <= LOCAL_SPHERE * 3);
    for (let target of guardNeeded) {
        if (Memory.targetRooms[target.name]) continue;
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[target.name] = {
            tick: tick,
            type: 'guard',
            level: 0,
            priority: 1
        };
        Memory.targetRooms = cache;
        break;
    }
    // Handle MAD
    if (Memory.MAD && Memory.MAD.length) {
        let MADTarget = _.sortBy(_.filter(Memory.roomCache, (r) => r.owner && _.includes(Memory.MAD, r.owner) && !checkForNap(r.user) && r.level >= 5), 'closestRange');
        if (MADTarget.length && !Memory.targetRooms[MADTarget[0].name]) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[MADTarget[0].name] = {
                tick: tick,
                type: 'attack'
            };
            Memory.targetRooms = cache;
            log.a('NUCLEAR Scout operation planned for ' + roomLink(MADTarget[0].name) + ' INITIATING MAD PROTOCOL. (Nearest Friendly Room - ' + MADTarget[0].closestRange + ' rooms away)', 'HIGH COMMAND: ');
        }
    }
    if (totalCountFiltered <= targetLimit) {
        // Kill strongholds (Falls under target rooms)
        let stronghold = _.sortBy(_.filter(Memory.roomCache, (r) => r.sk && r.towers && r.closestRange <= 3), 'closestRange');
        if (stronghold.length && !_.filter(Memory.targetRooms, (target) => target && target.type === 'siegeGroup').length) {
            for (let target of stronghold) {
                if (Memory.targetRooms[target.name]) continue;
                let lastOperation = Memory.roomCache[target.name].lastOperation || 0;
                if (lastOperation + 5500 > Game.time) continue;
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'attack'
                };
                Memory.targetRooms = cache;
                log.a('Scout operation planned for ' + roomLink(target.name) + ' SUSPECTED INVADER STRONGHOLD (Nearest Friendly Room - ' + target.closestRange + ' rooms away)', 'HIGH COMMAND: ');
                break;
            }
        }
        // New Spawn Denial/No towers
        if (NEW_SPAWN_DENIAL) {
            let newSpawns = _.sortBy(_.filter(Memory.roomCache, (r) => !Memory.targetRooms[r.name] && !r.towers && r.structures && r.owner && !checkForNap(r.owner) && !_.includes(FRIENDLIES, r.owner) && r.owner !== 'Invader' && !r.safemode && r.closestRange <= LOCAL_SPHERE * 3), 'closestRange');
            for (let target of newSpawns) {
                if (Memory.targetRooms[target.name]) continue;
                let lastOperation = Memory.roomCache[target.name].lastOperation || 0;
                if (lastOperation + 1000 > Game.time) continue;
                let cache = Memory.targetRooms || {};
                cache[target.name] = {
                    tick: Game.time,
                    type: 'hold',
                    level: 1,
                    priority: 1
                };
                Memory.targetRooms = cache;
                log.a('Hold operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Friendly Room - ' + target.closestRange + ' rooms away)', 'HIGH COMMAND: ');
                break;
            }
        }
        // Harass Enemies
        let enemyHarass = _.sortBy(_.filter(Memory.roomCache, (r) => HARASS_ATTACKS && r.user && r.user !== MY_USERNAME && !checkForNap(r.user) && (_.includes(Memory._nuisance, r.user) || _.includes(Memory._enemies, r.user)) && !Memory.targetRooms[r.name] && !Memory.auxiliaryTargets[r.name] && !r.sk && (!r.isHighway || r.power || r.commodity) && !r.level && r.closestRange <= LOCAL_SPHERE * 3), 'closestRange');
        if (!enemyHarass.length) enemyHarass = _.sortBy(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && !checkForNap(r.user) && !_.includes(FRIENDLIES, r.user) && !Memory.targetRooms[r.name] && !Memory.auxiliaryTargets[r.name] && !r.sk && (!r.isHighway || r.power || r.commodity) && !r.level && r.closestRange <= LOCAL_SPHERE && (ATTACK_LOCALS || POKE_NEUTRALS)), 'closestRange');
        for (let target of enemyHarass) {
            if (Memory.targetRooms[target.name]) continue;
            let lastOperation = Memory.roomCache[target.name].lastOperation || 0;
            if (lastOperation + 4500 > Game.time) continue;
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[target.name] = {
                tick: tick,
                type: 'attack'
            };
            Memory.targetRooms = cache;
            log.a('Scout operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Friendly Room - ' + target.closestRange + ' rooms away)', 'HIGH COMMAND: ');
            break;
        }
    }
    // SIEGES
    if (Memory._enemies.length && SIEGE_ENABLED) {
        // Attack owned rooms of enemies
        let activeSieges = _.filter(Memory.targetRooms, (target) => target && (target.type === 'siege' || target.type === 'siegeGroup')).length || 0;
        if (Memory._enemies.length && !activeSieges) {
            let enemySiege = _.sortBy(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && _.includes(Memory._enemies, r.user) && !checkForNap(r.user) &&
                !Memory.targetRooms[r.name] && !r.sk && !r.isHighway && r.level && r.closestRange <= LOCAL_SPHERE * 3 && (r.level < 3 || maxLevel >= 6) && (Game.shard.name !== 'treecafe' || r.forestPvp)), 'closestRange');
            for (let target of enemySiege) {
                if (Memory.targetRooms[target.name]) continue;
                let lastOperation = Memory.roomCache[target.name].lastOperation || 0;
                if (lastOperation + 4500 > Game.time) continue;
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'attack'
                };
                Memory.targetRooms = cache;
                log.a('Scout operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Room Level - ' + target.level + '), Nearest Room - ' + target.closestRange + ' rooms away)', 'HIGH COMMAND: ');
                break;
            }
        }
    }
}

function manageAttacks() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;
    let maxLevel = Memory.maxLevel;
    let totalCountFiltered = _.filter(Memory.targetRooms, (target) => target && target.type !== 'attack' && target.type !== 'scout' && target.type !== 'guard').length || 0;
    let siegeCountFiltered = _.filter(Memory.targetRooms, (target) => target && (target.type === 'siege' || target.type === 'siegeGroup')).length || 0;
    let staleMulti = 1;
    for (let key in Memory.targetRooms) {
        if (!Memory.targetRooms[key]) {
            delete Memory.targetRooms[key];
            continue;
        }
        if (!Memory.roomCache[key]) {
            delete Memory.targetRooms[key];
            return;
        }
        let type = Memory.targetRooms[key].type;
        // Special Conditions
        switch (type) {
            // Manage Scouts
            case 'scout':
            case 'attack':
                // Clear scouts first if over limit
                if (totalCountFiltered > COMBAT_LIMIT) {
                    log.a('Canceling scouting in ' + roomLink(key) + ' as we have too many active operations.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                } else {
                    if (!_.filter(Game.creeps, (c) => c.my && c.memory.role === 'scout' && c.memory.destination === key).length) staleMulti = 0.25;
                }
                break;
            // Manage harassment
            case 'harass':
            case 'rangers':
                if (totalCountFiltered > COMBAT_LIMIT + 2) {
                    log.a('Canceling operation in ' + roomLink(key) + ' as we have too many active operations.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    totalCountFiltered--;
                    continue;
                }
                if (Memory.roomCache[key] && Memory.roomCache[key].closestRange <= LOCAL_SPHERE) staleMulti = 2;
                break;
            // Manage Holds
            case 'hold':
                staleMulti = 10;
                break;
            // Manage Nukes
            case 'nukes':
                continue;
            // Manage siege
            case 'siegeGroup':
            case 'siege':
                if (maxLevel < 6) {
                    delete Memory.targetRooms[key];
                    continue;
                }
                if (siegeCountFiltered > 1) {
                    log.a('Canceling operation in ' + roomLink(key) + ' as we have too many active operations.', 'HIGH COMMAND: ');
                    delete Memory.targetRooms[key];
                    siegeCountFiltered--;
                    continue;
                }
                break;
            // Manage Pending
            case 'pending':
                if (Memory.targetRooms[key].dDay - 50 <= Game.time) {
                    let cache = Memory.targetRooms || {};
                    let tick = Game.time;
                    cache[key] = {
                        tick: tick,
                        type: 'attack',
                        level: 1,
                        dDay: undefined
                    };
                    Memory.targetRooms = cache;
                }
                continue;
            // Manage Guard
            case 'guard':
                staleMulti = 10;
                break;
            // Remove auxiliary
            case 'power':
            case 'poke':
            case 'commodity':
            case 'clean':
            case 'claimClear':
            case 'claimScout':
            case 'claim':
                delete Memory.targetRooms[key];
                break;
        }
        if (!Memory.targetRooms[key]) continue;
        // Cancel stale ops with no kills
        if ((Memory.targetRooms[key].tick + (1500 * staleMulti) < Game.time && !Memory.targetRooms[key].lastEnemyKilled) ||
            (Memory.targetRooms[key].lastEnemyKilled && Memory.targetRooms[key].lastEnemyKilled + (1500 * staleMulti) < Game.time)) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
            continue;
        }
        // Remove far rooms
        if (Memory.roomCache[key] && Memory.roomCache[key].closestRange > LOCAL_SPHERE * 3) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + roomLink(key) + ' as it is too far away.', 'HIGH COMMAND: ');
            continue;
        }
        // Remove your rooms
        if (Memory.roomCache[key] && Memory.targetRooms[key].type !== 'guard' && Memory.roomCache[key].user && Memory.roomCache[key].user === MY_USERNAME) {
            delete Memory.targetRooms[key];
            continue;
        }
        // Remove allied rooms
        if (Memory.roomCache[key] && Memory.targetRooms[key].type !== 'guard' && Memory.roomCache[key].user && _.includes(FRIENDLIES, Memory.roomCache[key].user)) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + roomLink(key) + ' as ' + Memory.roomCache[key].user + ' is a friend.', 'HIGH COMMAND: ');
            continue;
        }
        // Remove allied rooms
        if (Memory.roomCache[key] && Memory.targetRooms[key].type !== 'guard' && Memory.roomCache[key].user && checkForNap(Memory.roomCache[key].user)) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + roomLink(key) + ' as ' + Memory.roomCache[key].user + ' is part of a friendly alliance.', 'HIGH COMMAND: ');
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
        if (Memory.targetRooms[key].tick + (1500 * staleMulti) && Memory.targetRooms[key].friendlyDead) {
            let alliedLosses = Memory.targetRooms[key].friendlyDead;
            let enemyLosses = Memory.targetRooms[key].enemyDead || 1000;
            if (alliedLosses * staleMulti > enemyLosses) {
                delete Memory.targetRooms[key];
                log.a('Canceling operation in ' + roomLink(key) + ' due to heavy casualties.', 'HIGH COMMAND: ');
            }
        }
    }
}

function manageAuxiliary() {
    if (!Memory.auxiliaryTargets || !_.size(Memory.auxiliaryTargets)) return;
    let maxLevel = Memory.maxLevel;
    for (let key in Memory.auxiliaryTargets) {
        if (!Memory.auxiliaryTargets[key]) {
            delete Memory.auxiliaryTargets[key];
            continue;
        }
        let type = Memory.auxiliaryTargets[key].type;
        if (!Memory.roomCache[key]) {
            delete Memory.auxiliaryTargets[key];
            return;
        }
        // Special Conditions
        switch (type) {
            case 'power':
                if (maxLevel < 8) delete Memory.auxiliaryTargets[key];
                if (Memory.roomCache[key].power + 1500 < Game.time) delete Memory.auxiliaryTargets[key];
                break;
            case 'commodity':
                if (maxLevel < 6) delete Memory.auxiliaryTargets[key];
                break;
            case 'claim':
            case 'claimScout':
            case 'claimClear':
                if (Game.gcl.level === Memory.myRooms.length) delete Memory.auxiliaryTargets[key];
                break;
            case 'clean':
                break;
        }
        if (!Memory.auxiliaryTargets[key]) continue;
        // Cancel stale ops
        if (Memory.auxiliaryTargets[key].tick + 10000 < Game.time) {
            delete Memory.auxiliaryTargets[key];
            log.a('Canceling operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
            continue;
        }
        // Remove your rooms
        if (Memory.roomCache[key] && Memory.roomCache[key].user && Memory.roomCache[key].user === MY_USERNAME) {
            delete Memory.auxiliaryTargets[key];
            continue;
        }
        // Remove allied rooms
        if (Memory.roomCache[key] && Memory.roomCache[key].user && (_.includes(FRIENDLIES, Memory.roomCache[key].user) || checkForNap(Memory.roomCache[key].user))) {
            delete Memory.auxiliaryTargets[key];
        }
    }
}

function manualAttacks() {
    for (let name in Game.flags) {
        //Cancel attacks
        if (_.startsWith(name, 'cancel')) {
            delete Memory.targetRooms[Game.flags[name].pos.roomName];
            delete Memory.auxiliaryTargets[Game.flags[name].pos.roomName];
            delete Memory.roomCache[Game.flags[name].pos.roomName];
            log.a('Canceling operation in ' + roomLink(Game.flags[name].pos.roomName) + ' at your request.', 'HIGH COMMAND: ');
            Game.flags[name].remove();
            continue;
        }
        //Bad room flag
        if (_.startsWith(name, 'avoid')) {
            let cache = Memory.avoidRooms || [];
            cache.push(Game.flags[name].pos.roomName);
            Memory.avoidRooms = cache;
            log.e(roomLink(Game.flags[name].pos.roomName) + ' will be avoided.');
            Game.flags[name].remove();
            continue;
        }
        //Remove bad room/remote flag
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
            } else {
                log.e(roomLink(Game.flags[name].pos.roomName) + ' is not on any avoid lists.')
            }
            Game.flags[name].remove();
            continue;
        }
        // Manual combat
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        //Set future
        if (_.startsWith(name, 'future')) {
            let ticks = name.match(/\d+$/)[0];
            cache[Game.flags[name].pos.roomName] = {
                dDay: tick + ticks,
                type: 'pending'
            };
        } else
        if (_.startsWith(name, 'siege')) {
            let type = 'siege';
            if (Memory.maxLevel < 8) type = 'siegeGroup';
            cache[Game.flags[name].pos.roomName] = {
                type: type
            };
        } else
        if (_.startsWith(name, 'attack')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'attack'
            };
        } else
        if (_.startsWith(name, 'guard')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'guard'
            };
        } else
        if (_.startsWith(name, 'hold')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'hold'
            };
        } else
        if (_.startsWith(name, 'drain')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'drain'
            };
        } else
        if (_.startsWith(name, 'ranger')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'rangers'
            };
        } else
        if (_.startsWith(name, 'swarm')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'swarm'
            };
        } else
        if (_.startsWith(name, 'power')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'power'
            };
        } else
        if (_.startsWith(name, 'nuke')) {
            cache[Game.flags[name].pos.roomName] = {
                dDay: tick + 50000,
                type: 'nuke'
            };
            nukeFlag(Game.flags[name])
        }
        if (cache[Game.flags[name].pos.roomName]) {
            let op = cache[Game.flags[name].pos.roomName];
            op.tick = Game.time;
            op.priority = 1;
            op.level = 1;
            op.manual = true;
            cache[Game.flags[name].pos.roomName] = op;
            Memory.targetRooms = cache;
            Game.flags[name].remove();
            continue;
        }
        // Manual Aux
        cache = Memory.auxiliaryTargets || {};
        if (_.startsWith(name, 'clear')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'claimClear'
            };
        } else if (_.startsWith(name, 'clean')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'clean'
            };
        } else if (_.startsWith(name, 'claim')) {
            cache[Game.flags[name].pos.roomName] = {
                type: 'claim'
            };
        }
        if (cache[Game.flags[name].pos.roomName]) {
            let op = cache[Game.flags[name].pos.roomName];
            op.tick = Game.time;
            op.priority = 1;
            op.level = 1;
            op.manual = true;
            cache[Game.flags[name].pos.roomName] = op;
            Memory.auxiliaryTargets = cache;
            Game.flags[name].remove();
        }
    }
}

function nukeFlag(flag) {
    let nuker = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy === s.energyCapacity && !s.store.getFreeCapacity(RESOURCE_GHODIUM) && !s.cooldown && Game.map.getRoomLinearDistance(s.room.name, flag.pos.roomName) <= 10)[0];
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
    if (!ALLIANCE_DATA || !NAP_ALLIANCE.length || _.includes(Memory._enemies, user)) return false;
    let LOANData = JSON.parse(ALLIANCE_DATA);
    let LOANDataKeys = Object.keys(LOANData);
    for (let iL = (LOANDataKeys.length - 1); iL >= 0; iL--) {
        if (LOANDataKeys[LOANDataKeys[iL]] && LOANDataKeys[LOANDataKeys[iL]].indexOf(user) >= 0 && _.includes(NAP_ALLIANCE, LOANDataKeys[iL])) {
            return true;
        }
    }
    return false;
}

module.exports.operationSustainability = function (room) {
    // Switch to pending if safemode
    if (room.controller && room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + room.controller.safeMode,
        };
        // Set no longer needed creeps to go recycle
        _.filter(Game.creeps, (c) => c.my && c.memory.destination && c.memory.destination === room.name).forEach((c) => c.memory.recycle = true);
        log.a(room.name + ' is now marked as Pending as it has a safemode.', 'OPERATION PLANNER: ');
        return Memory.targetRooms = cache;
    }
    let operation = Memory.targetRooms[room.name] || Memory.auxiliaryTargets[room.name];
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
    if (friendlyForces.length === 1 && friendlyForces[0].hits < friendlyForces[0].hitsMax * 0.14 && enemyForces.length && !_.includes(trackedFriendly, friendlyForces[0].id)) {
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
    if (Memory.targetRooms[room.name]) Memory.targetRooms[room.name] = operation; else Memory.auxiliaryTargets[room.name] = operation;
};

module.exports.generateThreat = function (creep) {
    creep.room.cacheRoomIntel();
    let user = Memory.roomCache[creep.room.name].user;
    if (!user || (_.includes(FRIENDLIES, user))) return;
    let cache = Memory._badBoyList || {};
    let threatRating = 50;
    if (cache[user] && (cache[user]['threatRating'] > 50 || _.includes(FRIENDLIES, user))) threatRating = cache[user]['threatRating'];
    cache[user] = {
        threatRating: threatRating,
        lastAction: Game.time,
    };
    Memory._badBoyList = cache;
};