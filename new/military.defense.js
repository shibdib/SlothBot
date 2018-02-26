/**
 * Created by Bob on 7/1/2017.
 */
const profiler = require('screeps-profiler');
let towers = require('module.towerController')
let shib = require("shibBench");

function controller() {
//Claimed Defense
    let towerCpu = Game.cpu.getUsed();
    towers.towerControl();
    shib.shibBench('towerController', towerCpu);
    for (let key in Memory.ownedRooms) {
        let room = Memory.ownedRooms[key];
        let creeps = room.find(FIND_CREEPS);
        let structures = room.find(FIND_STRUCTURES);
        room.invaderCheck();
        room.handleNukeAttack();
        if (room.memory.responseNeeded && !room.memory.alertEmail) {
            room.memory.alertEmail = true;
            Game.notify(room.name + ' - Enemy detected, initiating defense mode.')
        }
        if (room.memory.responseNeeded) {
            rampartManager(room, structures, true);
            let hostiles = _.filter(creeps, (c) => c.pos.y < 45 && c.pos.y > 5 && c.pos.x < 45 && c.pos.y > 5 && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && _.includes(FRIENDLIES, c.owner['username']) === false && c.owner['username'] !== 'Invader');
            let tower = _.max(room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER}), 'energy');
            let responders = _.filter(creeps, (c) => c.memory && c.memory.role && c.memory.role === 'responder' && c.memory.overlord === room.name);
            if (tower.energy === 0 && responders.length === 0) {
                room.memory.requestingSupport = true;
            }
        } else {
            //ramparts public unless needed
            rampartManager(room, structures);
            if (!room.memory.requestingSupport) {
                let needyRoom = _.filter(Memory.ownedRooms, (r) => r.memory.requestingSupport && Game.map.findRoute(room.name, r.name).length < 9)[0];
                if (needyRoom) {
                    if (room.memory.sendingResponse !== needyRoom.name) {
                        room.memory.sendingResponse = needyRoom.name;
                        log.a(room.name + ' is responders to ' + needyRoom.name);
                    }
                } else {
                    room.memory.sendingResponse = undefined;
                }
            }
        }
    }


//Remote Defense


//Allied Defense

}

module.exports.controller = profiler.registerFN(controller, 'defenseController');

//Functions

function rampartManager(room, structures, attack = false) {
    let tickState;
    if (!attack) {
        tickState = undefined;
    } else {
        tickState = true;
    }
    if (tickState !== room.memory.responseNeeded) {
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
                } else {
                    for (let i = 0; i < rampart.length; i++) {
                        if (rampart[i]) {
                            if (rampart[i].isPublic === true) {
                                rampart[i].setPublic(false);
                            }
                        }
                    }
                }
            }
        }
    }
}

rampartManager = profiler.registerFN(rampartManager, 'rampartManagerDefense');