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
        if (Game.cpu.bucket > 1500) {
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
        }

        //Haulers
        if (creep.memory.role === "pawn") {
            let storage = Game.getObjectById(_.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id')[0]);
            let fillers = _.filter(Game.creeps, (c) => c.memory.role === 'filler' && c.memory.assignedRoom === creep.room.name);
            let getters = _.filter(Game.creeps, (c) => c.memory.role === 'getter' && c.memory.assignedRoom === creep.room.name);
            let labTech = _.filter(Game.creeps, (c) => c.memory.role === 'labTech' && c.memory.assignedRoom === creep.room.name);
            let mineralHauler = _.filter(Game.creeps, (c) => c.memory.role === 'mineralHauler' && c.memory.assignedRoom === creep.room.name);
            let mineral = creep.pos.findClosestByRange(FIND_MINERALS);
            if (fillers.length < 2) {
                creep.memory.role = 'filler';
                continue;
            } else if (creep.room.controller.level >= 6 && getters.length > 0 && labTech.length === 0) {
                creep.memory.role = 'labTech';
                continue;
            } else if (creep.room.controller.level >= 6 && getters.length > 0 && mineralHauler.length === 0 && mineral.mineralAmount > 0) {
                creep.memory.role = 'mineralHauler';
                continue;
            } else {
                creep.memory.role = 'getter';
                continue;
            }
        }
        if (creep.memory.role === 'basicHauler') roleBasicHauler.role(creep);
        if (creep.memory.role === 'getter') roleGetter.role(creep);
        if (creep.memory.role === 'filler') roleFiller.role(creep);
        if (creep.memory.role === 'mineralHauler') roleMineralHauler.role(creep);
        if (creep.memory.role === 'labTech') roleLabTech.role(creep);
        if (creep.memory.role === 'resupply') roleResupply.role(creep);

        //Workers
        if (creep.memory.role === 'worker') roleWorker.role(creep);
        if (creep.memory.role === 'upgrader') roleUpgrader.role(creep);
        if (creep.memory.role === 'stationaryHarvester' || creep.memory.role === 'basicHarvester') roleHarvester.role(creep);
        if (creep.memory.role === 'mineralHarvester') roleMineralHarvester.role(creep);
        if (creep.memory.role === 'resupply') roleResupply.role(creep);

        if (Game.cpu.bucket > 2500) {
            //SK
            if (creep.memory.role === 'SKworker') roleSKWorker.role(creep);
            if (creep.memory.role === 'SKranged') roleSKRanged.role(creep);
            if (creep.memory.role === 'SKattacker') roleSKAttacker.role(creep);

            //Remotes
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
let roleLabTech = require('role.LabTech');
let roleMineralHauler = require('role.MineralHauler');
let roleResupply = require('role.Resupply');
let roleWorker = require('role.Worker');
let roleHarvester = require('role.Harvester');
let roleMineralHarvester = require('role.MineralHarvester');
let roleUpgrader = require('role.Upgrader');
let roleSKWorker = require('role.SKWorker');
let roleSKRanged = require('role.SKRanged');
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