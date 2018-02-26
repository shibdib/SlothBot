/**
 * Created by Bob on 7/1/2017.
 */
const profiler = require('screeps-profiler');

function controller(room) {
//Claimed Defense
            let creeps = room.creeps;
            let structures = room.structures;
            invaderCheck(room, creeps);
            //ramparts public unless needed
            rampartManager(room, structures);
    room.handleNukeAttack();
            if (room.memory.responseNeeded && !room.memory.alertEmail) {
                room.memory.alertEmail = true;
                Game.notify(room.name + ' - Enemy detected, initiating defense mode.')
            }
            if (spawn.room.memory.responseNeeded) {
                let hostiles = _.filter(creeps, (c) => c.pos.y < 45 && c.pos.y > 5 && c.pos.x < 45 && c.pos.y > 5 && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && _.includes(RawMemory.segments[2], c.owner['username']) === false && c.owner['username'] !== 'Invader');
                let tower = _.max(room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER}), 'energy');
                let responders = _.filter(creeps, (c) => c.memory && c.memory.role && c.memory.role === 'responder');
                if (hostiles.length > 0 && tower.energy === 0 && responders.length === 0) {
                    room.controller.activateSafeMode();
                    Game.notify(spawn.pos.roomName + ' has entered safe mode.')
                }
            }


//Remote Defense


//Allied Defense

}
module.exports.controller = profiler.registerFN(controller, 'defenseController');
//Functions
function invaderCheck(spawn, creeps) {
    let invader = _.filter(creeps, (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false);
    if (invader.length > 0) {
        spawn.room.memory.responseNeeded = true;
        spawn.room.memory.tickDetected = Game.time;
        if (!spawn.room.memory.numberOfHostiles || spawn.room.memory.numberOfHostiles < invader.length) {
            spawn.room.memory.numberOfHostiles = invader.length;
        }
    } else if (spawn.room.memory.tickDetected < Game.time - 100 || spawn.room.memory.responseNeeded === false) {
        spawn.room.memory.numberOfHostiles = undefined;
        spawn.room.memory.responseNeeded = undefined;
        spawn.room.memory.alertEmail = undefined;
    }
}
invaderCheck = profiler.registerFN(invaderCheck, 'invaderCheckDefense');

function rampartManager(spawn, structures) {
    let rampart = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART);
    if (rampart.length > 0) {
        if (rampart[0]) {
            if (!spawn.room.memory.responseNeeded) {
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