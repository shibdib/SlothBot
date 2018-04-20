/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function highCommand() {
    manualAttacks();
    if (Game.time % 10 === 0) manageAttacks();
    if (Game.time % 150 === 0) {
        let maxLevel = _.max(_.filter(Game.spawns), '.room.controller.level').room.controller.level;
        for (let key in Memory.ownedRooms) {
            let cleaningTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 2000 && r.needsCleaning && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 5);
            for (let key in cleaningTargets) {
                if (!Memory.targetRooms[cleaningTargets[key].name]) {
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
            if (ATTACK_LOCALS) {
                let localTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 && ((r.owner && r.level <= 4 && !_.includes(FRIENDLIES, r.owner.username))
                    || (r.reservation && !_.includes(FRIENDLIES, r.reservation))) && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 2);
                for (let key in localTargets) {
                    if (!Memory.targetRooms || !Memory.targetRooms[localTargets[key].name]) {
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
            let enemySiege = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 &&
                (r.owner && (_.includes(HOSTILES, r.owner.username) || _.includes(Memory._enemies, r.owner.username))) &&
                Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 5);
            for (let key in enemySiege) {
                if (!Memory.targetRooms || !Memory.targetRooms[enemySiege[key].name]) {
                    if (enemySiege[key].level >= 3) {
                        let cache = Memory.targetRooms || {};
                        if (maxLevel >= 7 && _.random(0, 1) === 1) {
                            let level = _.round(enemySiege[key].towers / 2);
                            let tick = Game.time;
                            cache[enemySiege[key].name] = {
                                tick: tick,
                                type: 'siege',
                                level: level
                            };
                        } else if (enemySiege[key].level <= 6) {
                            let level = 1;
                            let tick = Game.time;
                            cache[enemySiege[key].name] = {
                                tick: tick,
                                type: 'swarm',
                                level: level
                            };
                        }
                        Memory.targetRooms = cache;
                    } else {
                        let cache = Memory.targetRooms || {};
                        let tick = Game.time;
                        cache[enemySiege[key].name] = {
                            tick: tick,
                            type: 'hold',
                            level: 2
                        };
                        Memory.targetRooms = cache;
                    }
                }
            }
            let enemyHarass = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 10000 &&
                (r.reservation && (_.includes(HOSTILES, r.reservation.username) || _.includes(Memory._threatList, r.reservation.username) || _.includes(Memory._nuisance, r.reservation.username))) &&
                Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 8);
            for (let key in enemyHarass) {
                if (!Memory.targetRooms[enemyHarass[key].name]) {
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
}


function manualAttacks() {
    for (let name in Game.flags) {
        //Cancel attacks
        if (_.startsWith(name, 'cancel')) {
            delete Memory.targetRooms[Game.flags[name].pos.roomName];
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
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'siege',
                level: Number(level)
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
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'defend',
                level: Number(level)
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
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'clean',
                level: Number(level)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'harass')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'harass',
                level: Number(level)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'hold')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'hold',
                level: Number(level)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'drain')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'drain',
                level: Number(level)
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'robbery')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'robbery',
                level: 1
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'swarm')) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'swarm',
                level: 1
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

module.exports.highCommand = profiler.registerFN(highCommand, 'highCommand');

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
        if (!Memory.targetRooms[key].dDay) {
            if (Memory.targetRooms[key].tick + 6000 < Game.time && Memory.targetRooms[key].type !== 'hold' && Memory.targetRooms[key].type !== 'nuke' && Memory.targetRooms[key].type !== 'pending' && Memory.targetRooms[key].type !== 'attack') delete Memory.targetRooms[key];
        } else if (Memory.targetRooms[key].dDay - 150 <= Game.time) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[key] = {
                tick: tick,
                type: 'attack',
                level: 1,
                dDay: undefined
            };
        }
    }
}