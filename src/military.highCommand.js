/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function highCommand() {
    roomHud();
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

function roomHud() {
    let opCount = 0;
    for (let key in Memory.targetRooms) {
        let level = Memory.targetRooms[key].level || 1;
        let type = Memory.targetRooms[key].type;
        if (Memory.targetRooms[key].type === 'attack') type = 'Scout';
        new RoomVisual(key).text(
            ICONS.crossedSword + ' Operation Type: ' + _.capitalize(type) + ' Level ' + level,
            1,
            3,
            {align: 'left', opacity: 0.8}
        );
        let creeps = _.filter(Game.creeps, (c) => c.memory.targetRoom === key);
        let y = 0;
        for (let creep in creeps) {
            if (creeps[creep].room.name !== key) {
                new RoomVisual(key).text(
                    creeps[creep].name + ' Is ' + Game.map.findRoute(creeps[creep].room.name, key).length + ' rooms away. Currently in ' + creeps[creep].room.name + '.',
                    1,
                    4 + y,
                    {align: 'left', opacity: 0.8}
                );
            } else {
                new RoomVisual(key).text(
                    creeps[creep].name + ' Is On Scene.',
                    1,
                    4 + y,
                    {align: 'left', opacity: 0.8}
                );
            }
            y++;
        }
        new RoomVisual().text(
            ICONS.crossedSword + ' ACTIVE OPERATIONS ' + ICONS.crossedSword,
            1,
            34,
            {align: 'left', opacity: 0.5}
        );
        new RoomVisual().text(
            ' Operation Type: ' + _.capitalize(type) + ' Level ' + level + ' in Room ' + key,
            1,
            35 + opCount,
            {align: 'left', opacity: 0.5}
        );
        opCount++;
    }
}

module.exports.highCommand = profiler.registerFN(highCommand, 'highCommand');

