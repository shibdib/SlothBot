/**
 * Created by Bob on 5/30/2017.
 */
//Roles
let profiler = require('screeps-profiler');
require("prototype.workerCreep");
require("prototype.creepCombat");
require("military.tacticsRanged");
require("military.tacticsMelee");
require("military.tacticsMedic");
require("military.tacticsDeconstructor");

function creepControl() {
    for (let name in Game.creeps) {
        const creep = Game.creeps[name];
        if (creep.spawning === true) continue;
        if (creep.idle) {
            creep.say('Zzzzz');
            continue;
        }
        creep.notifyWhenAttacked(false);

        if (!creep.memory.role) creep.suicide();

        //Military
        if (creep.memory.role === 'ranged') roleRanged.role(creep);
        if (creep.memory.role === 'healer') roleHealer.role(creep);
        if (creep.memory.role === 'deconstructor') roleDeconstructor.role(creep);
        if (creep.memory.role === 'scout') roleScout.role(creep);
        if (creep.memory.role === 'attacker') roleAttacker.role(creep);
        if (creep.memory.role === 'reserver') roleReserver.role(creep);
        if (creep.memory.role === 'claimer') roleClaimer.role(creep);
        if (creep.memory.role === 'responder') roleResponder.role(creep);
        if (creep.memory.role === 'raider') roleRaider.role(creep);
        if (creep.memory.role === 'drainer') roleDrainer.role(creep);
        if (creep.memory.role === 'swarm') roleSwarm.role(creep);

        //SK
        if (creep.memory.role === 'SKsupport') roleSKSupport.role(creep);
        if (creep.memory.role === 'SKattacker') roleSKAttacker.role(creep);

        //Non Essential
        if (Game.cpu.getUsed() <= Game.cpu.limit * 0.50 || Game.cpu.bucket >= 1000) {
            if (creep.memory.role === "pawn") {
                let fillers = _.filter(Game.creeps, (c) => c.memory.role === 'filler' && c.memory.assignedRoom === creep.room.name);
                if (fillers.length < 1) {
                    creep.memory.role = 'filler';
                    continue;
                } else {
                    creep.memory.role = 'getter';
                    continue;
                }
            }
            if (creep.memory.role === 'basicHauler') roleBasicHauler.role(creep);
            if (creep.memory.role === 'resupply') roleResupply.role(creep);
            if (creep.memory.role === 'getter') roleGetter.role(creep);
            if (creep.memory.role === 'filler') roleFiller.role(creep);
            if (creep.memory.role === 'worker') roleWorker.role(creep);
            if (creep.memory.role === 'waller') roleWaller.role(creep);
            if (creep.memory.role === 'upgrader') roleUpgrader.role(creep);
            if (creep.memory.role === 'stationaryHarvester' || creep.memory.role === 'basicHarvester') roleHarvester.role(creep);
            if (creep.memory.role === 'mineralHarvester') roleMineralHarvester.role(creep);
            if (creep.memory.role === 'SKworker') roleSKWorker.role(creep);
            if (creep.memory.role === 'remoteHarvester') roleRemoteHarvester.role(creep);
            if (creep.memory.role === 'remoteHauler') roleRemoteHauler.role(creep);
            if (creep.memory.role === 'pioneer') rolePioneer.role(creep);
            if (creep.memory.role === 'explorer') roleExplorer.role(creep);
        }
    }
}

module.exports.creepControl = profiler.registerFN(creepControl, 'creepController');


let roleGetter = require('role.Getter');
let roleFiller = require('role.Filler');
let roleBasicHauler = require('role.BasicHauler');
let roleResupply = require('role.Resupply');
let roleWorker = require('role.Worker');
let roleWaller = require('role.Waller');
let roleHarvester = require('role.Harvester');
let roleMineralHarvester = require('role.MineralHarvester');
let roleUpgrader = require('role.Upgrader');
let roleSKWorker = require('role.SKWorker');
let roleSKSupport = require('role.SKSupport');
let roleSKAttacker = require('role.SKAttacker');
let roleRemoteHarvester = require('role.RemoteHarvester');
let roleRemoteHauler = require('role.RemoteHauler');
let rolePioneer = require('role.Pioneer');
let roleExplorer = require('role.Explorer');
let roleHealer = require('role.Healer');
let roleRanged = require('role.Ranged');
let roleAttacker = require('role.Attacker');
let roleDeconstructor = require('role.Deconstructor');
let roleRaider = require('role.Raider');
let roleReserver = require('role.Reserver');
let roleClaimer = require('role.Claimer');
let roleResponder = require('role.Responder');
let roleScout = require('role.Scout');
let roleDrainer = require('role.Drainer');
let roleSwarm = require('role.Swarm');