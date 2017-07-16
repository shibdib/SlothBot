//modules
//Setup globals and prototypes
global.NODE_USAGE = {
    first: Game.time
    , last: Game.time
    , total: 0
}; // NOTE: Can't put this in the global file since the require caches can be reset outside of a global reset
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

// This line monkey patches the global prototypes.
profiler.enable();

module.exports.loop = function () {
    profiler.wrap(function () {

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
        if (Game.cpu.bucket > 5000) {
            let roomController = require('module.roomController');
            roomController.roomControl();
        }

        //Military management
        Memory.stats.cpu.preMilitary = Game.cpu.getUsed();
        if (Game.cpu.bucket > 1500) {
            let attackController = require('military.attack');
            let defenseController = require('military.defense');
            defenseController.controller();
            attackController.controller();
        } else {
            let raiders = _.filter(Game.creeps, (h) => h.memory.attackType === 'raid' || h.memory.role === 'scout');
            for (let i=0; i < raiders.length; i++) {
                raiders[i].suicide();
            }
        }

        //Creep Management
        Memory.stats.cpu.preCreep = Game.cpu.getUsed();
        creepController.creepControl();

        //Tower Management
        Memory.stats.cpu.preTower = Game.cpu.getUsed();
        if (Game.cpu.bucket > 2500) {
            let towerController = require('module.towerController');
            towerController.towerControl();
        }

        //Link Management
        Memory.stats.cpu.preLink = Game.cpu.getUsed();
        if (Game.cpu.bucket > 2500) {
            let linkController = require('module.linkController');
            linkController.linkControl();
        }

        //Lab Management
        Memory.stats.cpu.preLab = Game.cpu.getUsed();
        if (Game.cpu.bucket > 5000) {
            if (Game.time % 10 === 0) {
                //let labController = require('module.labController');
               // labController.labControl();
            }
        }

        //Terminal Management
        Memory.stats.cpu.preTerminal = Game.cpu.getUsed();
        if (Game.cpu.bucket > 5000) {
            if (Game.time % 50 === 0) {
                let terminalController = require('module.terminalController');
                terminalController.terminalControl();
            }
        }

        //Spawn Management
        Memory.stats.cpu.preSpawn = Game.cpu.getUsed();
        if (Game.time % 10 === 0) {
            let spawnController = require('module.spawnController');
            //spawnController.creepRespawn();
        }

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

        Memory.stats.cpu.used = Game.cpu.getUsed();
    });
};