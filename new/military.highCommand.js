/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function highCommand() {
    manualAttacks();
    if (Game.time % 150 === 0) {
        for (let key in Memory.ownedRooms) {
            let cleaningTargets = _.pluck(_.filter(Memory.roomCache, (r) => r.cached > Game.time - 2000 && r.needsCleaning && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 5), 'name');
            if (cleaningTargets.length > 0) {
                Memory.ownedRooms[key].memory.cleaningTargets = cleaningTargets;
            }
            let localTargets = _.pluck(_.filter(Memory.roomCache, (r) => r.cached > Game.time - 2000 && r.owner && !_.includes(FRIENDLIES, r.owner['username']) && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 3), 'name');
            if (localTargets.length > 0) {
                Memory.ownedRooms[key].memory.localTargets = localTargets;
            }
            let enemyTargets = _.pluck(_.filter(Memory.roomCache, (r) => r.cached > Game.time - 2000 && r.owner && _.includes(HOSTILES, r.owner['username']) && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 8), 'name');
            if (enemyTargets.length > 0) {
                Memory.ownedRooms[key].memory.enemyTargets = enemyTargets;
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

