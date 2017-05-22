//Roles
let rolesHaulers = require('roles.Haulers');
let rolesPeasants = require('roles.Peasants');
let rolesWorkers = require('roles.Workers');
let rolesMilitary = require('roles.Military');
let rolesRemote = require('roles.Remote');
let towerControl = require('module.Tower');
let profiler = require('screeps-profiler');

//modules
let creepBalancer = require('module.balancer');
let autoBuild = require('module.autoBuild');
let respawnCreeps = require('module.respawn');

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
        for(let name in Game.spawns) {
            //HOSTILE CHECK//
            let closestHostile = Game.spawns[name].room.find(FIND_HOSTILE_CREEPS);
            if (closestHostile[0]) {
                const pos = new RoomPosition(2, 2, Game.spawns[name].room.name);
                pos.createFlag('combatBuild');
            } else if (Game.flags.combatBuild) {
                Game.flags.combatBuild.remove();
            }

            //Tower Management
            let towers = Game.spawns[name].room.find(FIND_STRUCTURES, {filter: (t) => t.structureType === STRUCTURE_TOWER});
            for (let i = 0; towers.length < i; i++) {
                if (towers[i]) {
                    towerControl.run(towers[i]);
                }
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
            if (creep.memory.role === 'expediter') {
                rolesHaulers.Expediter(creep);
            }
            if (creep.memory.role === 'dumpTruck') {
                rolesHaulers.DumpTruck(creep);
            }
            if (creep.memory.role === 'basicHauler') {
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
            if (creep.memory.role === 'defender') {
                rolesMilitary.Defender(creep);
            }
            if (creep.memory.role === 'scout') {
                rolesMilitary.Scout(creep);
            }
            if (creep.memory.role === 'attacker') {
                rolesMilitary.Attacker(creep);
            }
            if (creep.memory.role === 'remoteHarvester') {
                rolesRemote.RHarvester(creep);
            }
            if (creep.memory.role === 'remoteHauler') {
                rolesRemote.RHauler(creep);
            }
        }
    });
};