/**
 * Created by Bob on 7/1/2017.
 */
const profiler = require('screeps-profiler');
let towers = require('module.towerController');
let shib = require("shibBench");

function controller(room) {
//Claimed Defense
    let towerCpu = Game.cpu.getUsed();
    towers.towerControl(room);
    shib.shibBench('towerController', towerCpu);
    let creeps = room.creeps;
    let structures = room.structures;
    room.invaderCheck();
    room.handleNukeAttack();
    if (room.memory.threatLevel >= 4) {
        let coveredSpawns = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.pos.checkForRampart());
        let hostiles = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner));
        if (!coveredSpawns.length && hostiles.length && !room.controller.safeMode) {
            switch (room.controller.activateSafeMode()) {
                case OK:
                    log.a(room.name + ' has entered Safemode.');
                    Game.notify(room.name + ' has entered Safemode.');
                    break;
            }
        }
    }
    if (room.memory.responseNeeded && !room.memory.alertEmail) {
        room.memory.alertEmail = true;
        if (room.memory.threatLevel >= 4) {
            Game.notify(room.name + ' - Enemy detected, room is now in FPCON DELTA.');
            Game.notify(room.memory.numberOfHostiles + ' - Foreign Hostiles Reported');
        }
    }
    if (room.memory.responseNeeded) {
        rampartManager(room, structures, true);
        let playerHostile = _.filter(creeps, (c) => (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && _.includes(FRIENDLIES, c.owner.username) === false && c.owner.username !== 'Invader')[0];
        let tower = _.max(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER), 'energy');
        let responders = _.filter(creeps, (c) => c.memory && c.memory.role === 'responder' && c.memory.overlord === room.name);
        if ((tower.energy < 10 && responders.length === 0) || !tower || playerHostile || room.memory.threatLevel >= 4) {
            room.memory.requestingSupport = true;
        }
    } else {
        //ramparts up unless ally in room and no enemies near him
        rampartManager(room, structures);
        if (!room.memory.requestingSupport && room.controller.level > 4) {
            let needyRoom = _.filter(Memory.ownedRooms, (r) => r.memory.requestingSupport && Game.map.findRoute(room.name, r.name).length < 9)[0];
            if (needyRoom) {
                if (room.memory.sendingResponse !== needyRoom.name) {
                    room.memory.sendingResponse = needyRoom.name;
                    log.a(room.name + ' is sending remote responders to ' + needyRoom.name);
                }
            } else {
                delete room.memory.sendingResponse;
            }
        }
    }


//Remote Defense


//Allied Defense

}

module.exports.controller = profiler.registerFN(controller, 'defenseController');

//Functions

function rampartManager(room, structures) {
    let ramparts = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART);
    let enemies = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
    if (ramparts.length) {
        if (room.memory.responseNeeded) {
            if (Game.cpu.bucket > 7500) {
                for (let key in ramparts) {
                    let rampart = ramparts[key];
                    if (rampart.pos.findInRange(enemies, 5)) {
                        rampart.setPublic(false)
                    } else {
                        rampart.setPublic(true)
                    }
                }
            } else {
                for (let key in ramparts) {
                    let rampart = ramparts[key];
                    rampart.setPublic(false)
                }
            }
        } else if (Game.time % 100) {
            for (let key in ramparts) {
                let rampart = ramparts[key];
                rampart.setPublic(true)
            }
        }
    }
}

rampartManager = profiler.registerFN(rampartManager, 'rampartManagerDefense');