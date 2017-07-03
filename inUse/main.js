//modules
//Setup globals and prototypes
global.NODE_USAGE = {
    first: Game.time
    , last: Game.time
    , total: 0
}; // NOTE: Can't put this in the global file since the require caches can be reset outside of a global reset
require("globals")(); // NOTE: All globals not from an external resource should be declared here
require("prototype.workerCreep")();
let config = require('config');
let roomController = require('module.roomController');
let creepController = require('module.creepController');
let towerController = require('module.towerController');
let linkController = require('module.linkController');
let labController = require('module.labController');
let spawnController = require('module.spawnController');
let defenseController = require('military.defense');
let profiler = require('screeps-profiler');
let _ = require('lodash');
let screepsPlus = require('screepsplus');
require('module.traveler');

// This line monkey patches the global prototypes.
profiler.enable();

module.exports.loop = function () {
    profiler.wrap(function () {
        //Update config entries
        config.updateConfig();

        //Get tick duration
        Memory.stats.tickLength = Math.round(new Date() / 1000) - Memory.stats.tickOldEpoch;
        Memory.stats.tickOldEpoch = Math.round(new Date() / 1000);

        //GRAFANA
        screepsPlus.collect_stats();
        Memory.stats.cpu.init = Game.cpu.getUsed();

        //CLEANUP
        if (Game.time % 150 === 0) {
            let cache = require('module.cache');
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
        defenseController.controller();

        //Creep Management
        Memory.stats.cpu.preCreep = Game.cpu.getUsed();
        creepController.creepControl();

        //Tower Management
        Memory.stats.cpu.preTower = Game.cpu.getUsed();
        towerController.towerControl();

        //Link Management
        Memory.stats.cpu.preLink = Game.cpu.getUsed();
        linkController.linkControl();

        //Lab Management
        Memory.stats.cpu.preLab = Game.cpu.getUsed();
        //labController.labControl();

        //Terminal Management
        Memory.stats.cpu.preTerminal = Game.cpu.getUsed();
        if (Game.time % 10 === 0) {
            let terminalController = require('module.terminalController');
            terminalController.terminalControl();
        }

        //Spawn Management
        Memory.stats.cpu.preSpawn = Game.cpu.getUsed();
        spawnController.creepRespawn();

        //Alliance List Management
        let doNotAggress = [
            {"username": "Shibdib", "status": "alliance"},
            {"username": "PostCrafter", "status": "alliance"},
            {"username": "Rising", "status": "alliance"},
            {"username": "wages123", "status": "alliance"},
            {"username": "SpaceRedleg", "status": "alliance"},
            {"username": "Donat", "status": "alliance"},
            {"username": "KageJ", "status": "alliance"},
            {"username": "BrinkDaDrink", "status": "alliance"},
            {"username": "droben", "status": "nap"}
        ];
        let doNotAggressArray = [
            'Shibdib',
            'PostCrafter',
            'Rising',
            'wages123',
            'SpaceRedleg',
            'Donat',
            'KageJ',
            'BrinkDaDrink',
            'droben'];
        RawMemory.segments[1] = JSON.stringify(doNotAggress);
        RawMemory.segments[2] = JSON.stringify(doNotAggressArray);
        RawMemory.setPublicSegments([1, 2]);
        RawMemory.setDefaultPublicSegment(1);
        RawMemory.setActiveSegments([1, 2]);

        Memory.stats.cpu.used = Game.cpu.getUsed();
    });
};

function showCacheUsage() {
    let usageCountCounter = {};
    let howManyTimesCacheUsed = 0;
    for (let key in Memory.pathCache) {
        let cached = Memory.pathCache[key];
        usageCountCounter['used' + cached.uses] = usageCountCounter['used' + cached.uses] + 1 || 1;
        howManyTimesCacheUsed += cached.uses;
    }

    console.log(JSON.stringify(usageCountCounter));
    console.log('howManyTimesCacheUsed: ' + howManyTimesCacheUsed);
    console.log('cache size: ' + _.size(Memory.pathCache));
}