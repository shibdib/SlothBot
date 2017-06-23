//modules
let autoBuild = require('module.autoBuild');
let militaryFunctions = require('module.militaryFunctions');
let roomController = require('module.roomController');
let creepController = require('module.creepController');
let towerController = require('module.towerController');
let linkController = require('module.linkController');
let terminalController = require('module.terminalController');
let cache = require('module.cache');
let profiler = require('screeps-profiler');
let _ = require('lodash');
let screepsPlus = require('screepsplus');

// This line monkey patches the global prototypes.
//profiler.enable();

module.exports.loop = function () {
    profiler.wrap(function () {

        //GRAFANA
        screepsPlus.collect_stats();
        Memory.stats.cpu.init = Game.cpu.getUsed();

        //CLEANUP
        if (Game.time % 150 === 0) {
            cache.cleanPathCache(); //clean path cache
        }
        for (let name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
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
        Memory.stats.cpu.preRoom = Game.cpu.getUsed();
        roomController.roomControl();

        //Creep Management
        Memory.stats.cpu.preCreep = Game.cpu.getUsed();
        creepController.creepControl();

        //Tower Management
        Memory.stats.cpu.preTower = Game.cpu.getUsed();
        towerController.towerControl();

        //Link Management
        Memory.stats.cpu.preLink = Game.cpu.getUsed();
        linkController.linkControl();

        //Terminal Management
        Memory.stats.cpu.preTerminal = Game.cpu.getUsed();
        if (Game.time % 10 === 0) {
            terminalController.terminalControl();
        }

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