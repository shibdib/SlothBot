/**
 * Created by Bob on 5/30/2017.
 */
//Roles
let profiler = require('screeps-profiler');

function creepControl() {

    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.idle || creep.spawning === true) continue;
        creep.notifyWhenAttacked(false);
        if (creep.memory.role === 'ranged' || creep.memory.role === 'healer' || creep.memory.role === 'deconstructor' || creep.memory.role === 'scout' || creep.memory.role === 'attacker' || creep.memory.role === 'reserver' || creep.memory.role === 'claimer' || creep.memory.role === 'responder' || creep.memory.role === 'raider') {
            let rolesMilitary = require('roles.Military');
            rolesMilitary.Manager(creep);
        }
    }
    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.idle || creep.spawning === true) continue;
        creep.notifyWhenAttacked(false);
        if (creep.memory.role === 'basicHauler' || creep.memory.role === 'largeHauler' || creep.memory.role === 'mineralHauler' || creep.memory.role === 'labTech' || creep.memory.role === 'hauler' || creep.memory.role === 'getter' || creep.memory.role === 'filler' || creep.memory.role === 'pawn' || creep.memory.role === 'resupply') {
            let rolesHaulers = require('roles.Haulers');
            rolesHaulers.Manager(creep);
            continue;
        }
        if (creep.memory.role === 'worker' || creep.memory.role === 'upgrader' || creep.memory.role === 'stationaryHarvester' || creep.memory.role === 'mineralHarvester') {
            let rolesWorkers = require('roles.Workers');
            rolesWorkers.Manager(creep);
            continue;
        }
        if (creep.memory.role === 'remoteHarvester' || creep.memory.role === 'remoteHauler' || creep.memory.role === 'pioneer' || creep.memory.role === 'explorer') {
            let rolesRemote = require('roles.Remote');
            rolesRemote.Manager(creep);
        }
    }
}
module.exports.creepControl = profiler.registerFN(creepControl, 'creepController');