/**
 * Created by rober on 5/16/2017.
 */

module.exports.highCommand = function () {
    if (!Memory.targetRooms) Memory.targetRooms = {};
    let maxLevel = _.max(Memory.ownedRooms, 'controller.level').controller.level;
    if (maxLevel < 2) return;
    // Manage dispatching responders
    if (Game.time % 10 === 0) manageResponseForces();
    // Request scouting for new operations
    if (Game.time % 100 === 0) operationRequests();
    // Manage old operations
    if (Game.time % 50 === 0) manageAttacks();
    // Check for flags
    if (Game.time % 10 === 0) manualAttacks();
    // Send help if needed
    if (Memory._alliedRoomDefense) {
        Memory._alliedRoomDefense.forEach((r) => queueHelp(r));
    }
    if (Memory._alliedRoomAttack) {
        Memory._alliedRoomAttack.forEach((r) => queueAllyAttack(r));
    }
};

module.exports.operationSustainability = function (room) {
    // Switch to pending if safemodes
    if (room.controller && room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + room.controller.safeMode,
        };
        // Set no longer needed creeps to go recycle
        _.filter(Game.creeps, (c) => c.my && c.memory.targetRoom && c.memory.targetRoom === room.name).forEach((c) => c.memory.recycle = true);
        log.a(room.name + ' is now marked as Pending as it has a safemode.', 'OPERATION PLANNER: ');
        return Memory.targetRooms = cache;
    }
    let operation = Memory.targetRooms[room.name];
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
    if (operation.tick + 1500 <= Game.time && ((operation.friendlyDead > operation.enemyDead || operation.enemyDead === 0 || operation.lastEnemyKilled + 1300 < Game.time) && operation.type !== 'drain' && operation.type !== 'guard' && operation.type !== 'hold' && operation.type !== 'clean') ||
        (operation.type === 'drain' && (operation.trackedFriendly.length + 1 >= 4 || operation.tick + 10000 < Game.time)) || (operation.type === 'guard' && operation.tick + 10000 < Game.time) || (operation.type === 'clean' && operation.tick + 10000 < Game.time && !operation.manual)) {
        room.cacheRoomIntel(true);
        log.a('Canceling operation in ' + roomLink(room.name) + ' due to it no longer being economical.', 'HIGH COMMAND: ');
        delete Memory.targetRooms[room.name];
        Memory.roomCache[room.name].lastOperation = Game.time;
        Memory.roomCache[room.name].attackCooldown = Game.time;
        if (operation.type === 'drain') Memory.roomCache[room.name].noDrain = true;
    } else {
        Memory.targetRooms[room.name] = operation;
    }
};

module.exports.threatManagement = function (creep) {
    if (!creep.room.controller) return;
    let user;
    if (creep.room.controller.owner) user = creep.room.controller.owner.username;
    if (creep.room.controller.reservation) user = creep.room.controller.reservation.username;
    if (!user || (_.includes(FRIENDLIES, user) && !_.includes(Memory._threatList, user))) return;
    let cache = Memory._badBoyList || {};
    let threatRating = 50;
    if (cache[user] && (cache[user]['threatRating'] > 50 || _.includes(FRIENDLIES, user))) threatRating = cache[user]['threatRating'];
    cache[user] = {
        threatRating: threatRating,
        lastAction: Game.time,
    };
    Memory._badBoyList = cache;
};

function manageResponseForces() {
    let responseTargets = _.max(_.filter(Game.rooms, (r) => r.memory && r.memory.responseNeeded && r.findClosestOwnedRoom(true) <= 1), 'memory.threatLevel');
    if (!responseTargets || !responseTargets.name) {
        let highestHeat = _.max(_.filter(Game.rooms, (r) => r.memory && r.memory.roomHeat), 'memory.roomHeat');
        if (highestHeat) {
            let idleResponders = _.filter(Game.creeps, (c) => c.memory && highestHeat.name !== c.room.name && c.memory.awaitingOrders && Game.map.findRoute(c.memory.overlord, responseTargets.name).length <= 4);
            for (let creep of idleResponders) {
                creep.memory.responseTarget = highestHeat.name;
                creep.memory.awaitingOrders = undefined;
                log.a(creep.name + ' reassigned to guard ' + highestHeat.name + ' from ' + creep.room.name);
            }
        }
    } else {
        let idleResponders = _.filter(Game.creeps, (c) => c.memory && responseTargets.name !== c.room.name && c.memory.awaitingOrders && Game.map.findRoute(c.memory.overlord, responseTargets.name).length <= 4);
        for (let creep of idleResponders) {
            creep.memory.responseTarget = responseTargets.name;
            creep.memory.awaitingOrders = undefined;
            log.a(creep.name + ' reassigned to assist ' + responseTargets.name + ' from ' + creep.room.name);
        }
    }
}

function queueHelp(roomName) {
    let cache = Memory.targetRooms || {};
    if (!cache[roomName]) {
        let op = 'scout';
        if (Memory.roomCache[roomName]) op = 'guard';
        log.e('~~ALLY REQUESTING HELP~~ Guard Patrol Requested For ' + roomName);
        Game.notify('~~ALLY REQUESTING HELP~~ Guard Patrol Requested For ' + roomName);
        cache[roomName] = {
            tick: Game.time,
            type: op,
            level: 1,
            priority: 1
        };
    }
    Memory.targetRooms = cache;
}

function queueAllyAttack(roomName) {
    let cache = Memory.targetRooms || {};
    if (!cache[roomName]) {
        log.e('~~ALLY REQUESTING ATTACK~~ Attack Requested For ' + roomName);
        Game.notify('~~ALLY REQUESTING ATTACK~~ Attack Requested For ' + roomName);
        cache[roomName] = {
            tick: Game.time,
            type: 'scout',
            level: 1,
            priority: 1
        };
    }
    Memory.targetRooms = cache;
}

function operationRequests() {
    if (!Memory._enemies || !Memory._enemies.length) Memory._enemies = [];
    if (!Memory._nuisance || !Memory._nuisance.length) Memory._nuisance = [];
    let baddies = _.union(Memory._enemies, Memory._nuisance);
    let totalCountFiltered = _.filter(Memory.targetRooms, (target) => target.type !== 'pending' && target.type !== 'poke' && target.type !== 'guard' && target.type !== 'clean').length || 0;
    // Harass Targets
    let targetLimit = (_.size(Memory.ownedRooms) * 2.5);
    if (baddies.length) {
        if (TEN_CPU) targetLimit = 1;
        let enemyHarass = _.sortBy(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && _.includes(baddies, r.user) && !Memory.targetRooms[r.name] && !r.sk && !r.isHighway && !r.level), 'closestRange');
        for (let target of enemyHarass) {
            if (totalCountFiltered >= targetLimit) break;
            if (Memory.targetRooms[target.name]) continue;
            let lastOperation = Memory.roomCache[target.name].lastOperation || 0;
            if (lastOperation + 5000 > Game.time) continue;
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[target.name] = {
                tick: tick,
                type: 'attack'
            };
            Memory.targetRooms = cache;
            log.a('Scout operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Nearest Room -' + target.closestRange + ' rooms away)', 'HIGH COMMAND: ');
            break;
        }
    }
    // Attack owned rooms of enemies
    let activeSieges = _.filter(Memory.targetRooms, (target) => target.type === 'siege' || target.type === 'siegeGroup' || target.type === 'swarm' || target.type === 'conscripts' || target.type === 'drain').length || 0;
    if (Memory._enemies.length && !activeSieges) {
        let enemyHarass = _.sortBy(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && _.includes(Memory._enemies, r.user) && !Memory.targetRooms[r.name] && !r.sk && !r.isHighway && r.level), 'closestRange');
        for (let target of enemyHarass) {
            if (Memory.targetRooms[target.name]) continue;
            let lastOperation = Memory.roomCache[target.name].lastOperation || 0;
            if (lastOperation + 5000 > Game.time) continue;
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[target.name] = {
                tick: tick,
                type: 'attack'
            };
            Memory.targetRooms = cache;
            log.a('Scout operation planned for ' + roomLink(target.name) + ' owned by ' + target.user + ' (Room Level - ' + target.level + ' ), Nearest Room -' + target.closestRange + ' rooms away)', 'HIGH COMMAND: ');
            break;
        }
    }
    // Clean
    let cleanCount = _.filter(Memory.targetRooms, (target) => target.type === 'clean').length || 0;
    let cleanLimit = 3;
    if (TEN_CPU) cleanLimit = 1;
    if (cleanCount < cleanLimit) {
        let enemyClean = _.sortBy(_.filter(Memory.roomCache, (r) => !Memory.targetRooms[r.name] && r.needsCleaning), 'closestRange');
        if (enemyClean.length) {
            let cleanTarget = _.sample(enemyClean);
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[cleanTarget.name] = {
                tick: tick,
                type: 'clean',
                level: 1,
                priority: 4
            };
            Memory.targetRooms = cache;
            log.a('Cleaning operation planned for ' + roomLink(cleanTarget.name), 'HIGH COMMAND: ');
        }
    }
    // Pokes
    let pokeCount = _.filter(Memory.targetRooms, (target) => target.type === 'poke').length || 0;
    let pokeLimit = 10;
    if (TEN_CPU) pokeLimit = 3;
    if (pokeCount < pokeLimit) {
        let enemyHarass = [];
        if (baddies.length) {
            enemyHarass = _.sortBy(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && _.includes(baddies, r.user) && !Memory.targetRooms[r.name] && !r.level && !r.sk && !r.isHighway), 'closestRange');
        } else if (POKE_NEUTRALS) {
            enemyHarass = _.sortBy(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && !checkForNap(r.user) && !Memory.targetRooms[r.name] && !r.level && !r.sk && !r.isHighway), 'closestRange');
        }
        if (enemyHarass.length) {
            for (let target of enemyHarass) {
                if (Memory.targetRooms[target.name]) continue;
                pokeCount = _.filter(Memory.targetRooms, (target) => target.type === 'poke').length || 0;
                if (pokeCount >= 5) break;
                let lastOperation = Memory.roomCache[target.name].lastPoke || 0;
                if (lastOperation !== 0 && lastOperation + _.random(2000, 5000) > Game.time) continue;
                Memory.roomCache[target.name].lastPoke = Game.time;
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'poke',
                    level: 1,
                    priority: 4
                };
                Memory.targetRooms = cache;
                log.a('Poke operation planned for ' + roomLink(target.name) + ' owned by ' + target.user, 'HIGH COMMAND: ');
            }
        }
    }
}

function manageAttacks() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;
    let pokeCount = _.filter(Memory.targetRooms, (target) => target.type === 'poke').length || 0;
    let pokeLimit = 10;
    if (TEN_CPU) pokeLimit = 3;
    let cleanCount = _.filter(Memory.targetRooms, (target) => target.type === 'clean').length || 0;
    let cleanLimit = 3;
    if (TEN_CPU) cleanLimit = 1;
    let sieges = _.filter(Memory.targetRooms, (t) => t.type === 'siege');
    if (sieges.length) {
        let activeSiege = _.filter(sieges, (t) => t.activeSiege)[0];
        if (!activeSiege) {
            let newActive = shuffle(sieges)[0];
            newActive.activeSiege = true;
            newActive.tick = Game.time;
        }
    }
    let swarms = _.filter(Memory.targetRooms, (t) => t.type === 'swarm');
    if (swarms.length) {
        let activeSwarm = _.filter(swarms, (t) => t.activeSwarm)[0];
        if (!activeSwarm) {
            let newActive = shuffle(swarms)[0];
            newActive.activeSwarm = true;
            newActive.tick = Game.time;
        }
    }
    if (!Memory.targetRooms) Memory.targetRooms = {};
    let staleMulti = 1;
    for (let key in Memory.targetRooms) {
        let type = Memory.targetRooms[key].type;
        // Special Conditions
        switch (type) {
            // Manage Pokes
            case 'poke':
                if (pokeCount > pokeLimit) delete Memory.targetRooms[key];
                staleMulti = 3;
                break;
            // Manage Holds
            case 'hold':
                staleMulti = 10;
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
                        type: 'attack',
                        level: 1,
                        dDay: undefined
                    };
                    Memory.targetRooms = cache;
                }
                continue;
            // Manage Guard
            case 'guard':
                staleMulti = 2;
                break;
            // Manage Cleaning
            case 'clean':
                if (cleanCount > cleanLimit) delete Memory.targetRooms[key];
                continue;
        }
        // Cancel stale ops with no kills
        if (Memory.targetRooms[key].tick + (3000 * staleMulti) < Game.time && !Memory.targetRooms[key].lastEnemyKilled) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
            continue;
        }
        // Cancel once active stale ops who hasn't killed in 1 creep lifetime
        if (Memory.targetRooms[key].lastEnemyKilled && Memory.targetRooms[key].lastEnemyKilled + (3000 * staleMulti) < Game.time) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + roomLink(key) + ' as it has gone stale.', 'HIGH COMMAND: ');
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
            if (Memory.targetRooms[key].waves >= 3) {
                delete Memory.targetRooms[key];
                log.a('Canceling operation in ' + roomLink(key) + ' as it has reached the maximum number of attack waves.', 'HIGH COMMAND: ');
            }
        }
    }
}

function manualAttacks() {
    for (let name in Game.flags) {
        //Cancel attacks
        if (_.startsWith(name, 'cancel')) {
            delete Memory.targetRooms[Game.flags[name].pos.roomName];
            delete Memory.roomCache[Game.flags[name].pos.roomName];
            if (Memory.activeSiege && Memory.activeSiege === Game.flags[name].pos.roomName) delete Memory.activeSiege;
            Game.flags[name].remove();
        }
        //Bad room flag
        if (_.startsWith(name, 'avoid')) {
            let cache = Memory.avoidRooms || [];
            cache.push(Game.flags[name].pos.roomName);
            Memory.avoidRooms = cache;
            Game.flags[name].remove();
            log.e(Game.flags[name].pos.roomName + ' will be avoided.')
        }
        //Bad remote
        if (_.startsWith(name, 'remote')) {
            let cache = Memory.avoidRemotes || [];
            cache.push(Game.flags[name].pos.roomName);
            Memory.avoidRemotes = cache;
            Game.flags[name].remove();
            log.e(Game.flags[name].pos.roomName + ' will be avoided.')
        }
        //Remove bad room/remote flag
        if (_.startsWith(name, 'remove')) {
            if (Memory.avoidRooms && _.includes(Memory.avoidRooms, Game.flags[name].pos.roomName)) {
                let cache = Memory.avoidRooms;
                cache = _.filter(cache, (r) => r !== Game.flags[name].pos.roomName);
                Memory.avoidRooms = cache;
                log.e(Game.flags[name].pos.roomName + ' will no longer be avoided.')
            } else if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, Game.flags[name].pos.roomName)) {
                let cache = Memory.avoidRemotes;
                cache = _.filter(cache, (r) => r !== Game.flags[name].pos.roomName);
                Memory.avoidRemotes = cache;
                log.e(Game.flags[name].pos.roomName + ' will no longer be avoided.')
            } else {
                log.e(Game.flags[name].pos.roomName + ' is not on any avoid lists.')
            }
            Game.flags[name].remove();
        }
        // Claim target
        if (_.startsWith(name, 'claim')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'claimScout',
                manual: true,
                priority: 1
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        //Set staging room
        if (_.startsWith(name, 'stage')) {
            let cache = Memory.stagingRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick
            };
            Memory.stagingRooms = cache;
            Game.flags[name].remove();
        }
        //Set future
        if (_.startsWith(name, 'future')) {
            let cache = Memory.targetRooms || {};
            let ticks = name.match(/\d+$/)[0];
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                dDay: tick + ticks,
                type: 'pending',
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'siege')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'siege',
                level: Number(level),
                priority: Number(priority),
                manual: true
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'attack')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'attack',
                manual: true,
                priority: 1
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'guard')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            let priority = 1;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'guard',
                level: 1,
                priority: Number(priority),
                manual: true
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'scout')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'scout',
                manual: true,
                priority: 1
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'clear')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'claimClear'
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'clean')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'clean',
                manual: true,
                level: Number(level),
                priority: Number(priority)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'harass')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'harass',
                level: Number(level),
                priority: Number(priority),
                manual: true
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'hold')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'hold',
                level: Number(level),
                priority: Number(priority),
                manual: true
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'drain')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'drain',
                level: Number(level),
                priority: Number(priority),
                manual: true
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'robbery')) {
            let cache = Memory.targetRooms || {};
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'robbery',
                level: 1,
                priority: Number(priority)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'ranger')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'rangers',
                level: level,
                priority: Number(priority),
                manual: true
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'swarm')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'swarm',
                level: level,
                priority: Number(priority)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'conscripts')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'conscripts',
                level: level,
                priority: Number(priority)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'nuke')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                dDay: tick + 50000,
                type: 'nuke',
                level: Number(level)
            };
            nukeFlag(Game.flags[name])
        }
    }
}

function nukeFlag(flag) {
    let nuker = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy === s.energyCapacity && s.ghodium === s.ghodiumCapacity && !s.cooldown && Game.map.getRoomLinearDistance(s.room.name, flag.pos.roomName) <= 10)[0];
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
    let LOANdata = JSON.parse(ALLIANCE_DATA);
    let LOANdataKeys = Object.keys(LOANdata);
    for (let iL = (LOANdataKeys.length - 1); iL >= 0; iL--) {
        if (LOANdata[LOANdataKeys[iL]].indexOf(user) >= 0 && _.includes(NAP_ALLIANCE, LOANdataKeys[iL])) {
            return true;
        }
    }
    return false;
}