/**
 * Created by Bob on 5/30/2017.
 */
//Roles
let rolesHaulers = require('roles.Haulers');
let rolesPeasants = require('roles.Peasants');
let rolesWorkers = require('roles.Workers');
let rolesMilitary = require('roles.Military');
let rolesRemote = require('roles.Remote');

module.exports.creepControl = function () {

    for (let name in Game.creeps) {
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
        if (creep.memory.role === 'claimer') {
            rolesMilitary.Claimer(creep);
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
        if (creep.memory.role === 'roadBuilder') {
            rolesRemote.roadBuilder(creep);
        }
        if (creep.memory.role === 'spawnBuilder') {
            rolesRemote.spawnBuilder(creep);
        }
    }

}