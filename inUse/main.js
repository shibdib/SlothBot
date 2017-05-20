let rolePeasant = require('role.peasant');
let rolePeasantBuilder = require('role.peasantBuilder');
let rolePeasantUpgrader = require('role.peasantUpgrader');
let roleBasicHauler = require('role.basicHauler');
let roleHarvester = require('role.harvester');
let roleUpgrader = require('role.upgrader');
let roleDefenderRanged = require('role.defenderRanged');
let roleDefender = require('role.defender');
let roleHauler = require('role.Hauler');
let roleExpediter = require('role.Expediter');
let roleScout = require('role.Scout');
let roleDumpTruck = require('role.DumpTruck');
let roleWorker = require('role.worker');
let roleWallRepairer = require('role.wallRepairer');
let roleStationaryBuilder = require('role.StationaryBuilder');
let roleRemoteHarvester = require('role.remoteHarvester');
let roleRemoteHauler = require('role.remoteHauler');
let towerControl = require('module.Tower');
let profiler = require('screeps-profiler');
let creepBalancer = require('module.balancer');
let autoBuild = require('module.autoBuild');
let respawnCreeps = require('module.respawn')

// This line monkey patches the global prototypes.
//profiler.enable();

module.exports.loop = function () {
    profiler.wrap(function () {

        for (var name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
                console.log('Clearing non-existing creep memory:' + name);
            }
        }
        console.log('1');

        //Room Management
        for(let name in Game.spawns) {
            //HOSTILE CHECK//
            let closestHostile = Game.spawns[name].room.find(FIND_HOSTILE_CREEPS);
            if (closestHostile[0]) {
                var pos = new RoomPosition(2, 2, Game.spawns[name].room.name);
                pos.createFlag('combatBuild');
            } else if (Game.flags.combatBuild) {
                Game.flags.combatBuild.remove();
            }

            //Every 5 ticks
            if (Game.time % 5 === 0) {
                creepBalancer.run(name);
            }

            //Every 15 ticks
            if (Game.time % 15 === 0) {
                respawnCreeps.run(name);
            }

            //Every 100 ticks
            if (Game.time % 100 === 0) {
                //autoBuild.run(name);
            }
        }
        console.log('2');

        //Tower Management
        var tower = Game.getObjectById('591d48b421061c6c5b9bfaea');
        if (tower) {
            towerControl.run(tower);
        }
        console.log('3');

        for (var name in Game.creeps) {
            var creep = Game.creeps[name];
            if (creep.memory.role === 'peasant') {
                rolePeasant.run(creep);
            }
            if (creep.memory.role === 'peasantBuilder') {
                rolePeasantBuilder.run(creep);
            }
            if (creep.memory.role === 'peasantUpgrader') {
                rolePeasantUpgrader.run(creep);
            }
            if (creep.memory.role === 'stationaryHarvester') {
                roleHarvester.run(creep);
            }
            if (creep.memory.role === 'hauler') {
                roleHauler.run(creep);
            }
            if (creep.memory.role === 'expediter') {
                roleExpediter.run(creep);
            }
            if (creep.memory.role === 'dumpTruck') {
                roleDumpTruck.run(creep);
            }
            if (creep.memory.role === 'worker') {
                roleWorker.run(creep);
            }
            if (creep.memory.role === 'upgrader') {
                roleUpgrader.run(creep);
            }
            if (creep.memory.role === 'wallRepairer') {
                roleWallRepairer.run(creep);
            }
            if (creep.memory.role === 'stationaryBuilder') {
                roleStationaryBuilder.run(creep);
            }
            if (creep.memory.role === 'rangedDefender') {
                roleDefenderRanged.run(creep);
            }
            if (creep.memory.role === 'defender') {
                roleDefender.run(creep);
            }
            if (creep.memory.role === 'scout') {
                roleScout.run(creep);
            }
            if (creep.memory.role === 'remoteHarvester') {
                roleRemoteHarvester.run(creep);
            }
            if (creep.memory.role === 'remoteHauler') {
                roleRemoteHauler.run(creep);
            }
            if (creep.memory.role === 'basicHauler') {
                roleBasicHauler.run(creep);
            }
        }
    });
}