/**
 * Created by Bob on 7/1/2017.
 */
const profiler = require('screeps-profiler');

function controller() {
//Claimed Defense
    for (let key in Game.rooms) {
        let spawn = _.filter(Game.spawns, (spawn) => spawn.room.name === key)[0];
        if (spawn) {
            invaderCheck(spawn);
            //ramparts public unless needed
            rampartManager(spawn);
            spawn.room.handleNukeAttack();
            if (spawn.room.memory.responseNeeded && !spawn.room.memory.alertEmail) {
                spawn.room.memory.alertEmail = true;
                Game.notify(spawn.room.name + ' - Enemy detected, initiating defense mode.')
            }
            if (spawn.room.memory.responseNeeded) {
                let hostiles = spawn.room.find(FIND_CREEPS, {filter: (c) => c.pos.y < 45 && c.pos.y > 5 && c.pos.x < 45 && c.pos.y > 5 && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && _.includes(RawMemory.segments[2], c.owner['username']) === false && c.owner['username'] !== 'Invader'});
                let tower = _.max(spawn.room.find(FIND_MY_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER}), 'energy');
                let responders = spawn.room.find(FIND_MY_CREEPS, {filter: (c) => c.memory.role === 'responder'});
                if (hostiles.length > 0 && tower.energy === 0 && responders.length === 0) {
                    spawn.room.controller.activateSafeMode();
                    Game.notify(spawn.pos.roomName + ' has entered safe mode.')
                }
            }
        }
    }


//Remote Defense


//Allied Defense

}
module.exports.controller = profiler.registerFN(controller, 'defenseController');
//Functions
function invaderCheck(spawn) {
    let invader = spawn.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && _.includes(RawMemory.segments[2], c.owner['username']) === false});
    if (invader) {
        let number = spawn.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
        spawn.room.memory.responseNeeded = true;
        spawn.room.memory.tickDetected = Game.time;
        if (!spawn.room.memory.numberOfHostiles || spawn.room.memory.numberOfHostiles < number.length) {
            spawn.room.memory.numberOfHostiles = number.length;
        }
    } else if (spawn.room.memory.tickDetected < Game.time - 30 || spawn.room.memory.responseNeeded === false) {
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