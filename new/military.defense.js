/**
 * Created by Bob on 7/1/2017.
 */
const profiler = require('screeps-profiler');
let towers = require('module.towerController');

function controller() {
//Claimed Defense
    towers.towerControl();
    for (let key in Memory.ownedRooms) {
        let room = Memory.ownedRooms[key];
        let creeps = room.find(FIND_CREEPS);
        let structures = room.find(FIND_STRUCTURES);
        room.invaderCheck();
        //ramparts public unless needed
        rampartManager(room, structures);
        room.handleNukeAttack();
        if (room.memory.responseNeeded && !room.memory.alertEmail) {
            room.memory.alertEmail = true;
            Game.notify(room.name + ' - Enemy detected, initiating defense mode.')
        }
        if (room.memory.responseNeeded) {
            let hostiles = _.filter(creeps, (c) => c.pos.y < 45 && c.pos.y > 5 && c.pos.x < 45 && c.pos.y > 5 && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && _.includes(FRIENDLIES, c.owner['username']) === false && c.owner['username'] !== 'Invader');
            let tower = _.max(room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER}), 'energy');
            let responders = _.filter(creeps, (c) => c.memory && c.memory.role && c.memory.role === 'responder');
            if (hostiles.length > 0 && tower.energy === 0 && responders.length === 0) {
                room.controller.activateSafeMode();
                Game.notify(room.name + ' has entered safe mode.')
            }
        }
    }


//Remote Defense


//Allied Defense

}

module.exports.controller = profiler.registerFN(controller, 'defenseController');

//Functions

function rampartManager(room, structures) {
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

rampartManager = profiler.registerFN(rampartManager, 'rampartManagerDefense');