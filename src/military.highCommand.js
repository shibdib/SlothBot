/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function highCommand() {
    manualAttacks();
    let totalCount;
    if (_.size(Memory.targetRooms)) {
        totalCount = _.size(_.filter(Memory.targetRooms, (t) => t.type !== 'attack'));
    }
    let totalRooms = Memory.ownedRooms.length;
    let surplusRooms = _.filter(Memory.ownedRooms, (r) => r.memory.energySurplus).length;
    if (Game.time % 10 === 0 || Game.cpu.bucket < 5000) manageAttacks();
    if (Game.time % 200 === 0 && (totalCount < surplusRooms * 3 || totalCount < totalRooms)) {
        let maxLevel = _.max(_.filter(Game.spawns), '.room.controller.level').room.controller.level;
        for (let key in Memory.ownedRooms) {
            let cleaningTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 2000 && r.needsCleaning && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 5);
            for (let key in cleaningTargets) {
                if (Game.cpu.bucket > 7500 && !Memory.targetRooms[cleaningTargets[key].name] && Math.random() > Math.random()) {
                    let cache = Memory.targetRooms || {};
                    let tick = Game.time;
                    cache[cleaningTargets[key].name] = {
                        tick: tick,
                        type: 'clean',
                        level: 1
                    };
                    Memory.targetRooms = cache;
                }
            }
            let enemySiege = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 &&
                (r.owner && (_.includes(HOSTILES, r.owner.username) || _.includes(Memory._enemies, r.owner.username))) &&
                Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 6);
            for (let key in enemySiege) {
                let priority;
                if (Game.map.findRoute(enemySiege[key].name, Memory.ownedRooms[key].name).length <= 2) {
                    priority = 2;
                } else {
                    priority = 4;
                }
                if (Game.cpu.bucket > 7500 && (!Memory.targetRooms || !Memory.targetRooms[enemySiege[key].name]) && Math.random() > Math.random()) {
                    if (enemySiege[key].level >= 3) {
                        let cache = Memory.targetRooms || {};
                        if (maxLevel >= 7 && _.random(0, 1) === 1) {
                            let level = _.round(enemySiege[key].towers / 2);
                            let tick = Game.time;
                            cache[enemySiege[key].name] = {
                                tick: tick,
                                type: 'siege',
                                level: level,
                                priority: priority
                            };
                        } else if (enemySiege[key].level <= 5 && Memory.ownedRooms.length > 1) {
                            let level = 2;
                            let tick = Game.time;
                            cache[enemySiege[key].name] = {
                                tick: tick,
                                type: 'swarm',
                                level: level,
                                priority: priority
                            };
                        }
                        Memory.targetRooms = cache;
                    } else {
                        let cache = Memory.targetRooms || {};
                        let tick = Game.time;
                        cache[enemySiege[key].name] = {
                            tick: tick,
                            type: 'hold',
                            level: 2,
                            priority: 2
                        };
                        Memory.targetRooms = cache;
                    }
                }
            }
            let enemyHarass = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 &&
                (r.reservation && (_.includes(HOSTILES, r.reservation.username) || _.includes(Memory._threatList, r.reservation.username) || _.includes(Memory._nuisance, r.reservation.username) || r.possibleRemote)) &&
                Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 8);
            for (let key in enemyHarass) {
                if (Game.cpu.bucket > 8500 && (!Memory.targetRooms || !Memory.targetRooms[enemyHarass[key].name]) && Math.random() > Math.random()) {
                    let cache = Memory.targetRooms || {};
                    let tick = Game.time;
                    cache[enemyHarass[key].name] = {
                        tick: tick,
                        type: 'attack'
                    };
                    Memory.targetRooms = cache;
                }
            }
        }
    }
    if (Game.time % 100 === 0 && ATTACK_LOCALS) {
        for (let key in Memory.ownedRooms) {
            let localTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 && ((r.owner && r.level <= 4 && !_.includes(FRIENDLIES, r.owner.username))
                || (r.reservation && !_.includes(FRIENDLIES, r.reservation)) || r.possibleRemote) && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 2);
            for (let key in localTargets) {
                if (Game.cpu.bucket > 5500 && (!Memory.targetRooms || !Memory.targetRooms[localTargets[key].name]) && Math.random() > 0.3) {
                    let cache = Memory.targetRooms || {};
                    let tick = Game.time;
                    cache[localTargets[key].name] = {
                        tick: tick,
                        type: 'attack',
                        local: true
                    };
                    Memory.targetRooms = cache;
                }
            }
        }
    }
}

module.exports.highCommand = profiler.registerFN(highCommand, 'highCommand');


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
            let priority = name.match(/\d+$/)[1] || 4;
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
            let priority = name.match(/\d+$/)[1] || 4;
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
        if (_.startsWith(name, 'clean')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let priority = name.match(/\d+$/)[1] || 4;
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
            let priority = name.match(/\d+$/)[1] || 4;
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
            let priority = name.match(/\d+$/)[1] || 4;
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
            let priority = name.match(/\d+$/)[1] || 4;
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
            let priority = name.match(/\d+$/)[1] || 4;
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
            let priority = name.match(/\d+$/)[1] || 4;
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
            let priority = name.match(/\d+$/)[1] || 4;
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
        if (totalCount > surplusRooms * 3 && totalCount > totalRooms && Memory.targetRooms[key].priority !== 1 && Memory.targetRooms[key].type !== 'attack') {
            delete Memory.targetRooms[key];
            totalCount--;
            continue;
        }
        if (Game.cpu.bucket < 7500 || (Memory.targetRooms[key].tick + 5000 < Game.time && Memory.targetRooms[key].type !== 'hold' && Memory.targetRooms[key].type !== 'nuke' && Memory.targetRooms[key].type !== 'pending' && Memory.targetRooms[key].type !== 'attack')) {
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

module.exports.operationSustainability = function (room) {
    let operation = Memory.targetRooms[room.name];
    if (!operation || operation.sustainabilityCheck === Game.time) return;
    let friendlyDead = operation.friendlyDead || 0;
    let friendlyTombstones = _.pluck(_.filter(room.tombstones, (s) => _.includes(FRIENDLIES, s.creep.owner.username)), '.creep.body');
    for (let creep of friendlyTombstones) {
        friendlyDead = friendlyDead + UNIT_COST(creep);
    }
    let enemyDead = operation.enemyDead || 0;
    let enemyTombstones = _.pluck(_.filter(room.tombstones, (s) => !_.includes(FRIENDLIES, s.creep.owner.username)), '.creep.body');
    for (let creep of enemyTombstones) {
        enemyDead = enemyDead + UNIT_COST(creep);
    }
    operation.enemyDead = enemyDead;
    operation.friendlyDead = friendlyDead;
    operation.sustainabilityCheck = Game.time;
    if (operation.tick + 500 >= Game.time && operation.friendlyDead > operation.enemyDead) {
        delete Memory.targetRooms[room.name]
    } else {
        Memory.targetRooms[room.name] = operation;
    }
};