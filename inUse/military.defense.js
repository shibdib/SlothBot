/**
 * Created by Bob on 7/1/2017.
 */
const profiler = require('screeps-profiler');

//Claimed Defense
for (let key in Game.rooms) {
    let spawn = _.filter(Game.spawns, (spawn) => spawn.room.name === key)[0];
    if (spawn) {
        invaderCheck(spawn);
        //ramparts public unless needed
        rampartManager(spawn);
        if (spawn.room.memory.responseNeeded && !spawn.room.memory.alertEmail) {
            spawn.room.memory.alertEmail = true;
            Game.notify(spawn.room.name + ' - Enemy detected, initiating defense mode.')
        }
    }
}


//Remote Defense


//Allied Defense


//Functions
function invaderCheck(spawn) {
    let invader = spawn.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
    if (invader) {
        let number = spawn.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
        spawn.room.memory.responseNeeded = true;
        spawn.room.memory.tickDetected = Game.time;
        if (!spawn.room.memory.numberOfHostiles || spawn.room.memory.numberOfHostiles < number.length) {
            spawn.room.memory.numberOfHostiles = number.length;
        }
    } else if (spawn.room.memory.tickDetected < Game.time - 150 || spawn.room.memory.responseNeeded === false) {
        spawn.room.memory.numberOfHostiles = undefined;
        spawn.room.memory.responseNeeded = undefined;
        spawn.room.memory.alertEmail = undefined;
    }
}
invaderCheck = profiler.registerFN(invaderCheck, 'invaderCheckDefense');

function rampartManager(spawn) {
    let rampart = _.pluck(_.filter(spawn.room.memory.structureCache, 'type', 'rampart'), 'id');
    if (rampart.length > 0) {
        if (Game.getObjectById(rampart[0])) {
            if (!spawn.room.memory.responseNeeded) {
                for (let i = 0; i < rampart.length; i++) {
                    if (Game.getObjectById(rampart[i])) {
                        if (Game.getObjectById(rampart[i]).isPublic === false) {
                            Game.getObjectById(rampart[i]).setPublic(true);
                        }
                    }
                }
            } else {
                for (let i = 0; i < rampart.length; i++) {
                    if (Game.getObjectById(rampart[i])) {
                        if (Game.getObjectById(rampart[i]).isPublic === true) {
                            Game.getObjectById(rampart[i]).setPublic(false);
                        }
                    }
                }
            }
        }
    }
}
rampartManager = profiler.registerFN(rampartManager, 'rampartManagerDefense');