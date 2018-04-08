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
    if (room.memory.responseNeeded && !room.memory.alertEmail) {
        room.memory.alertEmail = true;
        if (room.memory.threatLevel >= 4) {
            Game.notify(room.name + ' - Enemy detected, room is now in FPCON DELTA.');
            Game.notify(room.memory.numberOfHostiles + ' - Foreign Hostiles Reported');
        }
    }
    if (room.memory.responseNeeded) {
        rampartManager(room, structures, true);
        let playerHostile = _.filter(creeps, (c) => (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && _.includes(FRIENDLIES, c.owner['username']) === false && c.owner['username'] !== 'Invader')[0];
        let tower = _.max(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER), 'energy');
        let responders = _.filter(creeps, (c) => c.memory && c.memory.role === 'responder' && c.memory.overlord === room.name);
        if ((tower.energy < 10 && responders.length === 0) || !tower || playerHostile || room.memory.threatLevel >= 4) {
            room.memory.requestingSupport = true;
        }
    } else {
        //ramparts public unless needed
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

function rampartManager(room, structures, attack = undefined) {
    if (attack !== room.memory.rampartState) {
        let rampart = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART);
        if (rampart.length > 0) {
            if (rampart[0]) {
                if (!room.memory.responseNeeded) {
                    for (let i = 0; i < rampart.length; i++) {
                        if (rampart[i]) {
                            if (rampart[i].isPublic === false) {
                                rampart[i].setPublic(true);
                            }
                        }
                    }
                    delete room.memory.rampartState;
                } else {
                    for (let i = 0; i < rampart.length; i++) {
                        if (rampart[i]) {
                            if (rampart[i].isPublic === true) {
                                rampart[i].setPublic(false);
                            }
                        }
                    }
                    room.memory.rampartState = true;
                }
            }
        }
    }
}

rampartManager = profiler.registerFN(rampartManager, 'rampartManagerDefense');