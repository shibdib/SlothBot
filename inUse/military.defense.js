/**
 * Created by Bob on 7/1/2017.
 */

//Claimed Defense
for (let key in Game.rooms) {
    if (_.filter(Game.spawns, (spawn) => spawn.room.name === key)) {

    }
}


//Remote Defense


//Allied Defense


//Functions
function invaderCheck(room) {
    let invader = room.find(FIND_HOSTILE_CREEPS);
    if (invader) {
        let number = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
        creep.room.memory.responseNeeded = true;
        creep.room.memory.tickDetected = Game.time;
        if (!creep.room.memory.numberOfHostiles || creep.room.memory.numberOfHostiles < number.length) {
            creep.room.memory.numberOfHostiles = number.length;
        }
        creep.memory.invaderDetected = true;
    } else if (creep.room.memory.tickDetected < Game.time - 150) {
        creep.memory.invaderDetected = undefined;
        creep.memory.invaderID = undefined;
        creep.room.memory.numberOfHostiles = undefined;
        creep.room.memory.responseNeeded = false;
    }
}
invaderCheck = profiler.registerFN(invaderCheck, 'invaderCheckDefense');