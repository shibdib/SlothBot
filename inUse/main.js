//modules
//Setup globals and prototypes
global.NODE_USAGE = {
    first: Game.time
    , last: Game.time
    , total: 0
}; // NOTE: Can't put this in the global file since the require caches can be reset outside of a global reset
Memory.stats.cpu.preRequires = Game.cpu.getUsed();
require("globals")(); // NOTE: All globals not from an external resource should be declared here
require("prototype.workerCreep");
require("prototype.roomPosition");
require("prototype.room");
require("prototype.creepCombat");
require("military.tacticsRanged");
require("military.tacticsMelee");
require("military.tacticsMedic");
require("military.tacticsDeconstructor");
let creepController = require('module.creepController');
let profiler = require('screeps-profiler');
let _ = require('lodash');
let screepsPlus = require('screepsplus');
require('module.traveler');
require('module.pathFinder');
Memory.stats.cpu.postRequires = Game.cpu.getUsed();

// This line monkey patches the global prototypes.
profiler.enable();

module.exports.loop = function () {
    profiler.wrap(function () {
        Memory.stats.cpu.init = Game.cpu.getUsed();

        //Get tick duration
        Memory.stats.tickLength = Math.round(new Date() / 1000) - Memory.stats.tickOldEpoch;
        Memory.stats.tickOldEpoch = Math.round(new Date() / 1000);

        //GRAFANA
        screepsPlus.collect_stats();

        //CLEANUP
        Memory.stats.cpu.preCleanup = Game.cpu.getUsed();
        if (Game.time % 1000 === 0) {
            cleanPathCache(); //clean path cache
        }
        for (let name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
            }
        }
        Memory.stats.cpu.postCleanup = Game.cpu.getUsed();

        //Room Management
        Memory.stats.cpu.preRoom = Game.cpu.getUsed();
        if (Game.cpu.bucket > 5000) {
            let roomController = require('module.roomController');
            roomController.roomControl();
        }
        Memory.stats.cpu.postRoom = Game.cpu.getUsed();

        //Military management
        Memory.stats.cpu.preMilitary = Game.cpu.getUsed();
        if (Game.cpu.bucket > 1500) {
            let attackController = require('military.attack');
            let defenseController = require('military.defense');
            Memory.stats.cpu.preMilitaryDefense = Game.cpu.getUsed();
            defenseController.controller();
            Memory.stats.cpu.postMilitaryDefense = Game.cpu.getUsed();
            Memory.stats.cpu.preMilitaryAttack = Game.cpu.getUsed();
            attackController.controller();
            Memory.stats.cpu.postMilitaryAttack = Game.cpu.getUsed();
        } else {
            let raiders = _.filter(Game.creeps, (h) => h.memory.attackType === 'raid' || h.memory.role === 'scout');
            for (let i=0; i < raiders.length; i++) {
                raiders[i].suicide();
            }
        }
        Memory.stats.cpu.postMilitary = Game.cpu.getUsed();

        //Creep Management
        Memory.stats.cpu.preCreep = Game.cpu.getUsed();
        creepController.creepControl();
        Memory.stats.cpu.postCreep = Game.cpu.getUsed();

        //Tower Management
        Memory.stats.cpu.preTower = Game.cpu.getUsed();
        if (Game.cpu.bucket > 2500) {
            let towerController = require('module.towerController');
            towerController.towerControl();
        }
        Memory.stats.cpu.postTower = Game.cpu.getUsed();

        //Link Management
        Memory.stats.cpu.preLink = Game.cpu.getUsed();
        if (Game.cpu.bucket > 2500) {
            let linkController = require('module.linkController');
            //linkController.linkControl();
        }
        Memory.stats.cpu.postLink = Game.cpu.getUsed();

        //Lab Management
        Memory.stats.cpu.preLab = Game.cpu.getUsed();
        if (Game.cpu.bucket > 5000) {
            if (Game.time % 10 === 0) {
                //let labController = require('module.labController');
               // labController.labControl();
            }
        }
        Memory.stats.cpu.postLab = Game.cpu.getUsed();

        //Terminal Management
        Memory.stats.cpu.preTerminal = Game.cpu.getUsed();
        if (Game.cpu.bucket > 5000) {
            if (Game.time % 50 === 0) {
                let terminalController = require('module.terminalController');
                terminalController.terminalControl();
            }
        }
        Memory.stats.cpu.postTerminal = Game.cpu.getUsed();

        //Alliance List Management
        Memory.stats.cpu.preSegments = Game.cpu.getUsed();
        let doNotAggress = [
            {"username": "Shibdib", "status": "alliance"},
            {"username": "PostCrafter", "status": "alliance"},
            {"username": "Rising", "status": "alliance"},
            {"username": "wages123", "status": "alliance"},
            {"username": "SpaceRedleg", "status": "alliance"},
            {"username": "Donat", "status": "alliance"},
            {"username": "KageJ", "status": "alliance"},
            {"username": "BrinkDaDrink", "status": "alliance"},
            {"username": "Tyac", "status": "alliance"},
            {"username": "herghost", "status": "alliance"},
            {"username": "kirk", "status": "alliance"},
            {"username": "arcath", "status": "alliance"},
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
            'Tyac',
            'herghost',
            'kirk',
            'arcath',
            'droben'];
        let mainRaw = {
            "api": {
                "version": "draft",
                "update": 19939494
            },
            "channels": {
                "needs": {
                    "protocol": "roomneeds",
                    "segments": [50],
                    "update": 20155510
                },
            }
        };
        let roomNeeds = {
            "W53N83": {
                "power": true,
                "G": true
            }
        };
        RawMemory.segments[1] = JSON.stringify(doNotAggress);
        RawMemory.segments[2] = JSON.stringify(doNotAggressArray);
        if (JSON.stringify(mainRaw) !== RawMemory.segments[10]) RawMemory.segments[10] = JSON.stringify(mainRaw);
        if (JSON.stringify(roomNeeds) !== RawMemory.segments[50]) RawMemory.segments[50] = JSON.stringify(roomNeeds);
        RawMemory.setPublicSegments([1, 2, 10, 50]);
        RawMemory.setDefaultPublicSegment(1);
        RawMemory.setActiveSegments([1, 2, 10, 50]);

        //Cache Foreign Segments
        RawMemory.setActiveForeignSegment("Bovius");
        if (RawMemory.foreignSegment && RawMemory.foreignSegment.username === "Bovius" && RawMemory.foreignSegment.id === 0) {
            // Can't use data if you can't see it.
            Memory.marketCache = RawMemory.foreignSegment.data;
        }
        Memory.stats.cpu.postSegments = Game.cpu.getUsed();

        Memory.stats.cpu.used = Game.cpu.getUsed();
        let used = Memory.stats.cpu.used - Memory.stats.cpu.init;
        if (used > Game.cpu.limit * 2) console.log("<font color='#adff2f'>Abnormally High CPU Usage - " + used + " CPU</font>");
    });
};

cleanPathCache = function () {
    let counter = 0;
    let tick = Game.time;
    for (let key in Memory.pathCache) {
        let cached = Memory.pathCache[key];
        if (cached.tick + EST_TICKS_PER_DAY < tick || cached.tick === undefined) {
            Memory.pathCache[key] = undefined;
            counter += 1;
        }
    }
};
