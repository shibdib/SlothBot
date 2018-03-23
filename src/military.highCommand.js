/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function highCommand() {
    manualAttacks();
    if (Game.time % 150 === 0) {
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
                let localTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 2000 && r.owner && !_.includes(FRIENDLIES, r.owner['username']) && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 3);
                for (let key in localTargets) {
                    if (!Memory.targetRooms[localTargets[key].name]) {
                        let cache = Memory.targetRooms || {};
                        let tick = Game.time;
                        cache[localTargets[key].name] = {
                            tick: tick,
                            type: 'attack'
                        };
                        Memory.targetRooms = cache;
                    }
                }
            }
            let enemyTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 2000 && r.owner && _.includes(HOSTILES, r.owner['username']) && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 8);
            for (let key in enemyTargets) {
                if (!Memory.targetRooms[enemyTargets[key].name]) {
                    let cache = Memory.targetRooms || {};
                    let tick = Game.time;
                    cache[enemyTargets[key].name] = {
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
        if (_.startsWith(name, 'cancel')) {
            delete Memory.targetRooms[Game.flags[name].pos.roomName];
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'stage')) {
            let cache = Memory.stagingRooms || {};
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick
            };
            Memory.stagingRooms = cache;
            Game.flags[name].remove();
        }
        if (_.startsWith(name, 'siege')) {
            let cache = Memory.targetRooms || {};
            let level = name.match(/\d+$/)[0] || 1;
            let tick = Game.time;
            cache[Game.flags[name].pos.roomName] = {
                tick: tick,
                type: 'siege',
                level: level
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
                level: level
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
                level: level
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
                level: level
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
                level: level
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
                level: level
            };
            Memory.targetRooms = cache;
            Game.flags[name].remove();
        }
    }
}

module.exports.highCommand = profiler.registerFN(highCommand, 'highCommand');

