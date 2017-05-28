//Roles
let rolesHaulers = require('roles.Haulers');
let rolesPeasants = require('roles.Peasants');
let rolesWorkers = require('roles.Workers');
let rolesMilitary = require('roles.Military');
let rolesRemote = require('roles.Remote');
let towerControl = require('module.Tower');
let cache = require('module.cache');
let profiler = require('screeps-profiler');

//modules
let autoBuild = require('module.autoBuild');
let respawnCreeps = require('module.respawn');
let militaryFunctions = require('module.militaryFunctions');
let _ = require('lodash');

// This line monkey patches the global prototypes.
profiler.enable();

module.exports.loop = function () {
    profiler.wrap(function () {

        //CLEANUP
        for (let name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
                console.log('Clearing dead creep memory:' + name);
            }
        }
        cache.cleanPathCache(); //clean path cache

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
        for (let name in Game.spawns) {
            //SAFE MODE
            if (Game.spawns[name].hits < Game.spawns[name].hitsMax/2){
                Game.spawns[name].room.controller.activateSafeMode();
            }
            //DEFENSE MODE
            let attackDetected = _.filter(Game.creeps, (creep) => creep.memory.enemyCount !== null && creep.memory.role === 'scout');
            if (attackDetected.length > 0 || Game.spawns[name].memory.defenseMode === true) {
                militaryFunctions.activateDefense(Game.spawns[name], attackDetected);
            }
            if (Game.spawns[name].memory.defenseMode === true) {
                Game.spawns[name].memory.defenseModeTicker++;
                if (Game.spawns[name].memory.defenseModeTicker > 250) {
                    Game.spawns[name].memory.defenseMode = false;
                }
            }

            //RENEWAL/RECYCLE CHECK
            if (!Game.spawns[name].spawning) {
                let creep = Game.spawns[name].pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => c.memory.recycle === true});
                if (creep.length) {
                    Game.spawns[name].recycleCreep(creep[0]);
                } else {
                    let creep = _.min(Game.spawns[name].pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => c.memory.renew === true}), 'ticksToLive');
                    if (creep.length > 0) {
                        let cost = _.sum(creep.body, p => BODYPART_COST[p]);
                        let totalParts = creep.body.length;
                        let renewPerTick = Math.floor(600 / totalParts);
                        let costPerRenew = Math.ceil(cost / 2.5 / totalParts);
                        let renewCost = ((1000 - creep.ticksToLive) / renewPerTick) * costPerRenew;
                        if (renewCost < cost - (cost * 0.05)) {
                            Game.spawns[name].renewCreep(creep);
                            if (creep.ticksToLive > 1000) {
                                creep.memory.renew = false;
                            }
                        } else {
                            Game.spawns[name].recycleCreep(creep);
                        }
                    }
                }
            }

            autoBuild.rcl1(name);

            //CREEP SPAWNING
            let level = Game.spawns[name].room.controller.level;
            if (level === 1) {
                respawnCreeps.rcl1(name)
            }
            if (level === 2) {
                respawnCreeps.rcl2(name)
            }
            if (level === 3) {
                respawnCreeps.rcl3(name)
            }
            if (level === 4) {
                respawnCreeps.rcl4(name)
            }
            if (level === 5) {
                respawnCreeps.rcl4(name)
            }
            if (level === 6) {
                respawnCreeps.rcl4(name)
            }
            if (level === 7) {
                respawnCreeps.rcl4(name)
            }
            if (level === 8) {
                respawnCreeps.rcl4(name)
            }


            if (Game.time % 50 === 0) {
                //BASE BUILDING
                if (level === 1) {
                    autoBuild.rcl1(name)
                }
                if (level === 2) {
                    autoBuild.rcl2(name)
                }
                if (level === 3) {
                    autoBuild.rcl3(name)
                }
                if (level === 4) {
                    autoBuild.rcl4(name)
                }
                if (level === 5) {
                    autoBuild.rcl4(name)
                }
                if (level === 6) {
                    autoBuild.rcl4(name)
                }
                if (level === 7) {
                    autoBuild.rcl4(name)
                }
                if (level === 8) {
                    autoBuild.rcl4(name)
                }
                //REBUILD RAMPARTS/WALLS IF FALSE/INITIAL
                if (Game.spawns[name].memory.wallCheck !== true && level >= 3) {
                    militaryFunctions.buildWalls(Game.spawns[name]);
                    militaryFunctions.borderWalls(Game.spawns[name])
                }
            }

            //Mark old creeps for recycling
            let legacyCreeps = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[name].id && creep.memory.level === undefined || creep.memory.level === null);
            for (let i = 0; i < legacyCreeps.length; i++){
                legacyCreeps[i].memory.level = level;
            }
            let recycleCreeps = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[name].id && creep.memory.level < level && creep.memory.level !== 0);
            for (let i = 0; i < recycleCreeps.length; i++){
                recycleCreeps[i].memory.recycle = true;
            }

            //Every 100 ticks
            if (Game.time % 100 === 0) {
                //autoBuild.run(name);
                if (Game.spawns[name].memory.wallCheck !== true && level >= 3) {
                    militaryFunctions.buildWalls(Game.spawns[name]);
                    //militaryFunctions.roadNetwork(Game.spawns[name]);
                }
            }
        }

        //Tower Management
        for (let structure of _.values(Game.structures)) {
            if (structure.structureType === STRUCTURE_TOWER) {
                towerControl.run(structure);
            }
        }

        for (var name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.role === 'peasant') {
                rolesPeasants.Peasant(creep);
            }
            if (creep.memory.role === 'peasantBuilder') {
                rolesPeasants.PeasantBuilder(creep);
            }
            if (creep.memory.role === 'peasantUpgrader') {
                rolesPeasants.PeasantUpgrader(creep);
            }
            if (creep.memory.role === 'hauler') {
                rolesHaulers.Hauler(creep);
            }
            if (creep.memory.role === 'dumpTruck') {
                rolesHaulers.DumpTruck(creep);
            }
            if (creep.memory.role === 'basicHauler') {
                rolesHaulers.BasicHauler(creep);
            }
            if (creep.memory.role === 'basicHaulerLarge') {
                rolesHaulers.BasicHauler(creep);
            }
            if (creep.memory.role === 'worker') {
                rolesWorkers.Worker(creep);
            }
            if (creep.memory.role === 'roadBuilder') {
                rolesWorkers.RoadBuilder(creep);
            }
            if (creep.memory.role === 'upgrader') {
                rolesWorkers.Upgrader(creep);
            }
            if (creep.memory.role === 'wallRepairer') {
                rolesWorkers.wallRepairer(creep);
            }
            if (creep.memory.role === 'stationaryBuilder') {
                rolesWorkers.Builder(creep);
            }
            if (creep.memory.role === 'stationaryHarvester') {
                rolesWorkers.Harvester(creep);
            }
            if (creep.memory.role === 'sentry') {
                rolesMilitary.Sentry(creep);
            }
            if (creep.memory.role === 'healer') {
                rolesMilitary.Healer(creep);
            }
            if (creep.memory.role === 'defender') {
                rolesMilitary.Defender(creep);
            }
            if (creep.memory.role === 'scout') {
                rolesMilitary.Scout(creep);
            }
            if (creep.memory.role === 'attacker') {
                rolesMilitary.Attacker(creep);
            }
            if (creep.memory.role === 'reserver') {
                rolesMilitary.Reserver(creep);
            }
            if (creep.memory.role === 'raider') {
                rolesMilitary.Raider(creep);
            }
            if (creep.memory.role === 'remoteHarvester') {
                rolesRemote.RHarvester(creep);
            }
            if (creep.memory.role === 'remoteHauler') {
                rolesRemote.RHauler(creep);
            }
            if (creep.memory.role === 'longRoadBuilder') {
                rolesRemote.LongRoadBuilder(creep);
            }
        }
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