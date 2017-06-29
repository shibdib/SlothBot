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
        if (creep.memory.role === 'peasant' || creep.memory.role === 'peasantBuilder' || creep.memory.role === 'peasantUpgrader') {
            rolesPeasants.Manager(creep);
            continue;
        }
        if (creep.memory.role === 'hauler' || creep.memory.role === 'largeHauler' || creep.memory.role === 'mineralHauler') {
            rolesHaulers.Manager(creep);
            continue;
        }
        if (creep.memory.role === 'worker' || creep.memory.role === 'upgrader' || creep.memory.role === 'stationaryHarvester' || creep.memory.role === 'mineralHarvester') {
            rolesWorkers.Manager(creep);
            continue;
        }
        if (creep.memory.role === 'remoteHarvester' || creep.memory.role === 'remoteHauler' || creep.memory.role === 'spawnBuilder' || creep.memory.role === 'explorer') {
            rolesRemote.Manager(creep);
            continue;
        }
        if (creep.memory.role === 'ranged' || creep.memory.role === 'healer' || creep.memory.role === 'deconstructor' || creep.memory.role === 'scout' || creep.memory.role === 'attacker' || creep.memory.role === 'reserver' || creep.memory.role === 'claimer' || creep.memory.role === 'responder' || creep.memory.role === 'raider') {
            rolesMilitary.Manager(creep);
        }
    }
};