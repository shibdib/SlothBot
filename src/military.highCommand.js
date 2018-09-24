/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function highCommand() {
    if (!Memory.targetRooms) Memory.targetRooms = {};
    manualAttacks();
    manageResponseForces();
    if (Game.time % 10 === 0 || Game.cpu.bucket < 5000) manageAttacks();
    operationRequests();
}

module.exports.highCommand = profiler.registerFN(highCommand, 'highCommand');

function operationRequests() {
    let totalCount = 0;
    if (_.size(Memory.targetRooms)) totalCount = _.size(Memory.targetRooms);
    let totalRooms = Memory.ownedRooms.length;
    let surplusRooms = _.filter(Memory.ownedRooms, (r) => r.memory.energySurplus).length;
    // Local targets
    if (Game.time % 100 === 0 && ATTACK_LOCALS && Game.cpu.bucket > 5500 && totalCount < totalRooms) {
        for (let ownedRoom of Memory.ownedRooms) {
            if (_.size(Memory.targetRooms) >= totalRooms) break;
            let localTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 5000 && !Memory.targetRooms[r.name] && ((r.owner && !_.includes(FRIENDLIES, r.owner.username))
                || (r.reservation && !_.includes(FRIENDLIES, r.reservation)) || r.potentialTarget) && (!r.attackCooldown || r.attackCooldown + 5000 < Game.time) && Game.map.findRoute(r.name, ownedRoom.name).length <= 3);
            if (localTargets.length) {
                for (let target of localTargets) {
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
    }
    if (totalCount < surplusRooms * 1.5) {
        // Harass Targets
        if (Game.time % 250 === 0 && Game.cpu.bucket > 7500) {
            for (let ownedRoom of Memory.ownedRooms) {
                let enemyHarass = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 && !Memory.targetRooms[r.name] &&
                    ((r.reservation && _.includes(Memory._threatList, r.reservation.username)) || r.potentialTarget) &&
                    9 > Game.map.findRoute(r.name, ownedRoom.name).length > 3);
                if (enemyHarass.length) {
                    for (let target of enemyHarass) {
                        if (_.size(Memory.targetRooms) >= surplusRooms * 3 && _.size(Memory.targetRooms) >= totalRooms) break;
                        let cache = Memory.targetRooms || {};
                        let tick = Game.time;
                        cache[target.name] = {
                            tick: tick,
                            type: 'attack'
                        };
                        Memory.targetRooms = cache;
                    }
                }
            }
        }
    }
}

function manageAttacks() {
    if (!Memory.targetRooms || !_.size(Memory.targetRooms)) return;
    // Get available rooms
    let totalCount;
    if (_.size(Memory.targetRooms)) {
        totalCount = _.size(_.filter(Memory.targetRooms, (t) => t.type !== 'attack'));
    }
    let totalRooms = Memory.ownedRooms.length;
    let surplusRooms = _.filter(Memory.ownedRooms, (r) => r.memory.energySurplus).length;
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
    for (let key in Memory.targetRooms) {
        if (totalCount > surplusRooms * 3 && totalCount > totalRooms && Memory.targetRooms[key].priority !== 1 && Memory.targetRooms[key].type !== 'attack' && !Memory.targetRooms[key].local) {
            delete Memory.targetRooms[key];
            totalCount--;
            continue;
        }
        if (Game.cpu.bucket < 7500 || (Memory.targetRooms[key].tick + 5000 < Game.time && Memory.targetRooms[key].type !== 'hold' && Memory.targetRooms[key].type !== 'nuke' && Memory.targetRooms[key].type !== 'pending')) {
            delete Memory.targetRooms[key];
            continue;
        }
        if (Memory.targetRooms[key].dDay && Memory.targetRooms[key].dDay - 150 <= Game.time) {
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
        if (Memory.targetRooms[key].waves) {
            if (Memory.targetRooms[key].waves >= 3) {
                delete Memory.targetRooms[key];
            }
        }
    }
}

function manageResponseForces() {
    let responseTargets = _.max(_.filter(Game.rooms, (r) => r.memory && r.memory.responseNeeded), 'memory.threatLevel');
    if (!responseTargets || !responseTargets.name) {
        let highestHeat = _.max(_.filter(Game.rooms, (r) => r.memory && r.memory.roomHeat), 'memory.roomHeat');
        if (highestHeat) {
            let idleResponders = _.filter(Game.creeps, (c) => c.memory && highestHeat.name !== c.room.name && c.memory.awaitingOrders && Game.map.findRoute(c.room.name, highestHeat.name).length <= 5);
            for (let creep of idleResponders) {
                creep.memory.responseTarget = highestHeat.name;
                creep.memory.awaitingOrders = undefined;
                log.a(creep.name + ' reassigned to guard ' + highestHeat.name + ' from ' + creep.room.name);
            }
        }
    } else {
        let idleResponders = _.filter(Game.creeps, (c) => c.memory && c.memory.awaitingOrders && Game.map.findRoute(c.room.name, responseTargets.name).length <= 8);
        for (let creep of idleResponders) {
            creep.memory.responseTarget = responseTargets.name;
            creep.memory.awaitingOrders = undefined;
            log.a(creep.name + ' reassigned to assist ' + responseTargets.name + ' from ' + creep.room.name);
        }
    }
}

module.exports.operationSustainability = function (room) {
    let operation = Memory.targetRooms[room.name];
    if (!operation || operation.sustainabilityCheck === Game.time) return;
    let friendlyDead = operation.friendlyDead || 0;
    let trackedFriendly = operation.trackedFriendly || [];
    let friendlyTombstones = _.filter(room.tombstones, (s) => _.includes(FRIENDLIES, s.creep.owner.username));
    for (let tombstone of friendlyTombstones) {
        if (_.includes(trackedFriendly, tombstone.id)) continue;
        friendlyDead = friendlyDead + UNIT_COST(tombstone.creep.body);
        trackedFriendly.push(tombstone.id);
    }
    let friendlyForces = _.filter(room.creeps, (c) => c.memory && c.memory.military);
    let enemyForces = _.filter(room.creeps, (c) => !c.memory);
    if (friendlyForces.length === 1 && friendlyForces[0].hits < friendlyForces[0].hitsMax * 0.20 && enemyForces.length && !_.includes(trackedFriendly, friendlyForces[0].id)) {
        friendlyDead = friendlyDead + UNIT_COST(friendlyForces[0].body);
        trackedFriendly.push(friendlyForces[0].id);
    }
    let enemyDead = operation.enemyDead || 0;
    let trackedEnemy = operation.trackedEnemy || [];
    let enemyTombstones = _.filter(room.tombstones, (s) => !_.includes(FRIENDLIES, s.creep.owner.username));
    let enemyKilled = operation.lastEnemyKilled || Game.time;
    for (let tombstone of enemyTombstones) {
        if (_.includes(trackedEnemy, tombstone.id)) continue;
        enemyKilled = Game.time;
        enemyDead = enemyDead + UNIT_COST(tombstone.creep.body);
        trackedEnemy.push(tombstone.id);
    }
    operation.lastEnemyKilled = enemyKilled;
    operation.enemyDead = enemyDead;
    operation.friendlyDead = friendlyDead;
    operation.trackedEnemy = trackedEnemy;
    operation.trackedFriendly = trackedFriendly;
    operation.sustainabilityCheck = Game.time;
    if (operation.tick + 500 >= Game.time && (operation.friendlyDead > operation.enemyDead || operation.enemyDead === 0 || operation.lastEnemyKilled + 1000 < Game.time)) {
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
        }
        //Remove bad room flag
        if (_.startsWith(name, 'remove')) {
            if (Memory.avoidRooms) {
                let cache = Memory.avoidRooms;
                cache = _.filter(cache, (r) => r !== Game.flags[name].pos.roomName);
                Memory.avoidRooms = cache;
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
                priority: Number(priority)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'attack')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'attack'
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'defend')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            let level = name.match(/\d+$/)[0] || 1;
            let priority = 1;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'defend',
                level: Number(level),
                priority: Number(priority)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'scout')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'scout'
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
                priority: Number(priority)
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
                priority: Number(priority)
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
                priority: Number(priority)
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
                priority: Number(priority)
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