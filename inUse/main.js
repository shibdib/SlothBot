//modules
let autoBuild = require('module.autoBuild');
let militaryFunctions = require('module.militaryFunctions');
let roomController = require('module.roomController');
let creepController = require('module.creepController');
let towerController = require('module.towerController');
let linkController = require('module.linkController');
let remoteController = require('module.remoteController');
let cache = require('module.cache');
let profiler = require('screeps-profiler');
let _ = require('lodash');
let pebble = require('pebble');
let resources = require('resources');
Memory.stats.cpu.init = Game.cpu.getUsed();

// This line monkey patches the global prototypes.
profiler.enable();

module.exports.loop = function () {
    profiler.wrap(function () {

        //Grafana
        for (let name in Game.rooms) {
            if (Game.rooms[name].find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_SPAWN}}).length) {
                resources.summarize_room(name);
            }
        }

        //CLEANUP
        if (Game.time % 150 === 0) {
            cache.cleanPathCache(); //clean path cache
        }
        for (let name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
                console.log('Clearing dead creep memory:' + name);
            }
        }

        //ATTACK CHECKS
        for (let i = 0; i < 5; i++) {
            let attack = 'attack' + i;
            if (Game.flags[attack]) {
                if (Game.flags[attack].room) {
                    if (Game.flags[attack].pos.findClosestByRange(FIND_HOSTILE_CREEPS) === null && Game.flags[attack].pos.findClosestByRange(FIND_HOSTILE_SPAWNS) === null) {
                        Game.flags[attack].remove();
                    }
                }
            }
        }

        //Room Management
        roomController.roomControl();
        Memory.stats.cpu.roomController = Game.cpu.getUsed();

        //Creep Management
        creepController.creepControl();
        Memory.stats.cpu.creepController = Game.cpu.getUsed();

        //Tower Management
        towerController.towerControl();
        Memory.stats.cpu.towerController = Game.cpu.getUsed();

        //Link Management
        linkController.linkControl();
        Memory.stats.cpu.linkController = Game.cpu.getUsed();

        //Remote Management
        remoteController.claimedControl();
        Memory.stats.cpu.remoteController = Game.cpu.getUsed();

        //GRAFANA
        screepsplus.collect_stats();
        Memory.stats.cpu.used = Game.cpu.getUsed();
    });
};

function showCacheUsage() {
    let usageCountCounter = {};
    let howManyTimesCacheUsed = 0;
    for (let key in Memory.pathCache) {
        let cached = Memory.pathCache[key];
        usageCountCounter['used'+cached.uses] = usageCountCounter['used'+cached.uses] + 1 || 1;
        howManyTimesCacheUsed += cached.uses;
    }

    console.log(JSON.stringify(usageCountCounter));
    console.log('howManyTimesCacheUsed: ' + howManyTimesCacheUsed);
    console.log('cache size: ' + _.size(Memory.pathCache));
}
let screepsplus = require('screepsplus');