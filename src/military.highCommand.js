/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function highCommand() {
    if (!Memory.targetRooms) Memory.targetRooms = {};
    let maxLevel = _.max(Memory.ownedRooms, 'controller.level').controller.level;
    if (maxLevel < 2) return;
    // Check for flags
    if (Game.time % 10 === 0) manualAttacks();

    // Manage old operations
    if (Game.time % 50 === 0) manageAttacks();

    // Request scouting for new operations
    if (Game.time % 100 === 0) operationRequests();
}

module.exports.highCommand = profiler.registerFN(highCommand, 'highCommand');

function operationRequests() {
    let totalCount = _.size(Memory.targetRooms) || 0;
    let totalCountFiltered = _.filter(Memory.targetRooms, (target) => target.type !== 'pending' && target.type !== 'poke' && target.type !== 'guard') || 0;
    let totalRooms = Memory.ownedRooms.length || 0;
    let surplusRooms = _.filter(Memory.ownedRooms, (r) => r.memory.energySurplus).length;
    // Local targets
    if (ATTACK_LOCALS && Game.cpu.bucket > 5500 && totalCountFiltered < _.round(totalRooms / 2)) {
        for (let ownedRoom of Memory.ownedRooms) {
            if (_.size(Memory.targetRooms) >= totalRooms) break;
            let localTargets = _.filter(Memory.roomCache, (r) => Game.map.findRoute(r.name, ownedRoom.name).length <= LOCAL_SPHERE && r.cached > Game.time - 5000 && !Memory.targetRooms[r.name] && ((r.owner && !_.includes(FRIENDLIES, r.owner.username) && !_.includes(NO_AGGRESSION, r.owner.username))
                || (r.reservation && !_.includes(FRIENDLIES, r.reservation) && !_.includes(NO_AGGRESSION, r.reservation)) || r.potentialTarget) && (!r.attackCooldown || r.attackCooldown + 5000 < Game.time));
            if (localTargets.length) {
                let target = _.sample(localTargets);
                if (Memory.targetRooms[target.name] && Memory.targetRooms[target.name].type !== 'poke') continue;
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'attack',
                    local: true
                };
                Memory.targetRooms = cache;
            }
        }
    }
    // Harass Targets
    if (totalCountFiltered < surplusRooms || !totalCountFiltered) {
        let enemyHarass = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 && !Memory.targetRooms[r.name] &&
            ((r.reservation && !_.includes(FRIENDLIES, r.reservation)) || r.potentialTarget));
        if (enemyHarass.length) {
            for (let target of enemyHarass) {
                if (Memory.targetRooms[target.name] && Memory.targetRooms[target.name].type !== 'poke') continue;
                let lastOperation = Memory.roomCache[target.name].lastOperation || 0;
                if (lastOperation !== 0 && lastOperation + 2000 > Game.time) continue;
                let cache = Memory.targetRooms || {};
                let tick = Game.time;
                cache[target.name] = {
                    tick: tick,
                    type: 'attack'
                };
                Memory.targetRooms = cache;
                break;
            }
        }
    }
    // Pokes
    let pokeCount = _.filter(Memory.targetRooms, (target) => target.type === 'poke').length || 0;
    if (pokeCount < 10) {
        let enemyHarass = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 && !Memory.targetRooms[r.name] &&
            ((r.reservation && !_.includes(FRIENDLIES, r.reservation)) || r.potentialTarget));
        if (enemyHarass.length) {
            for (let target of enemyHarass) {
                if (Memory.targetRooms[target.name]) continue;
                pokeCount = _.filter(Memory.targetRooms, (target) => target.type === 'poke').length || 0;
                if (pokeCount >= 10) break;
                let lastOperation = Memory.roomCache[target.name].lastPoke || 0;
                if (lastOperation !== 0 && lastOperation + _.random(1000, 5000) > Game.time) continue;
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
            }
        }
    }
}

function manageAttacks() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;
    let pokeCount = _.filter(Memory.targetRooms, (target) => target.type === 'poke').length || 0;
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
    for (let key in Memory.targetRooms) {
        let type = Memory.targetRooms[key].type;
        // Special Conditions
        switch (type) {
            // Manage Pokes
            case 'poke':
                if (pokeCount > 10) delete Memory.targetRooms[key];
                continue;
            // Manage Holds
            case 'hold':
                continue;
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
                continue;
        }
        // Cancel stale ops with no kills
        if (Memory.targetRooms[key].tick + 3000 < Game.time && !Memory.targetRooms[key].lastEnemyKilled) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + key + ' as it has gone stale.');
            continue;
        }
        // Cancel once active stale ops who hasn't killed in 1 creep lifetime
        if (Memory.targetRooms[key].lastEnemyKilled && Memory.targetRooms[key].lastEnemyKilled + 1500 < Game.time) {
            delete Memory.targetRooms[key];
            log.a('Canceling operation in ' + key + ' as it has gone stale.');
            continue;
        }
        // Delete wave based rooms at the threshold
        if (Memory.targetRooms[key].waves) {
            if (Memory.targetRooms[key].waves >= 3) {
                delete Memory.targetRooms[key];
            }
        }
    }
}

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
        return Memory.targetRooms = cache;
    }
    let operation = Memory.targetRooms[room.name];
    if (!operation || operation.sustainabilityCheck === Game.time) return;
    let friendlyDead = operation.friendlyDead || 0;
    let trackedFriendly = operation.trackedFriendly || [];
    let friendlyTombstones = _.filter(room.tombstones, (s) => _.includes(FRIENDLIES, s.creep.owner.username));
    for (let tombstone of friendlyTombstones) {
        if (_.includes(trackedFriendly, tombstone.id) || tombstone.creep.ticksToLive <= 10) continue;
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
    if (operation.tick + 500 >= Game.time && ((operation.friendlyDead > operation.enemyDead || operation.enemyDead === 0 || operation.lastEnemyKilled + 1300 < Game.time) && operation.type !== 'drain' && operation.type !== 'guard') ||
        operation.type === 'drain' && operation.trackedFriendly.length >= 4) {
        room.cacheRoomIntel(true);
        log.a('Canceling operation in ' + room.name + ' due to it no longer being economical.');
        delete Memory.targetRooms[room.name];
        Memory.roomCache[room.name].attackCooldown = Game.time;
    } else {
        Memory.targetRooms[room.name] = operation;
    }
};


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
                manual: true
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
                manual: true
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
        log.a('NUCLEAR LAUNCH DETECTED - ' + flag.pos.roomName + ' ' + flag.pos.x + '.' + flag.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
        flag.remove();
    }
}

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