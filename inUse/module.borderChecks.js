const profiler = require('screeps-profiler');

function borderCheck(creep) {
    if (creep.pos.x === 0 || creep.pos.y === 0 || creep.pos.x === 49 || creep.pos.y === 49) {
        if(creep.pos.x === 0 && creep.pos.y === 0)
        {
            creep.move(BOTTOM_RIGHT);
        }
        else if(creep.pos.x === 0 && creep.pos.y === 49)
        {
            creep.move(TOP_RIGHT);
        }
        else if(creep.pos.x === 49 && creep.pos.y === 0)
        {
            creep.move(BOTTOM_LEFT);
        }
        else if(creep.pos.x === 49 && creep.pos.y === 49)
        {
            creep.move(TOP_LEFT);
        }
        else if(creep.pos.x === 49)
        {
            if (creep.move(LEFT) !== ERR_NO_PATH) {
            } else if (creep.move(TOP_LEFT) !== ERR_NO_PATH){
            } else {
                creep.move(BOTTOM_LEFT);
            }
        }
        else if (creep.pos.x === 0)
        {
            if (creep.move(RIGHT) !== ERR_NO_PATH) {
            } else if (creep.move(TOP_RIGHT) !== ERR_NO_PATH){
            } else {
            }
        }
        else if (creep.pos.y === 0)
        {
            if (creep.move(BOTTOM) !== ERR_NO_PATH) {
            } else if (creep.move(BOTTOM_RIGHT) !== ERR_NO_PATH){
            } else {
                creep.move(BOTTOM_LEFT);
            }
        }
        else if (creep.pos.y === 49)
        {
            if (creep.move(TOP) !== ERR_NO_PATH) {
            } else if (creep.move(TOP_RIGHT) !== ERR_NO_PATH){
            } else {
                creep.move(TOP_LEFT);
            }
        }
        return null;
    }
}
module.exports.borderCheck = profiler.registerFN(borderCheck, 'borderCheck');

function wrongRoom(creep) {
    if(!creep.memory.assignedSpawn) {
        let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            creep.memory.assignedSpawn = spawn.id;
        } else {
            creep.suicide();
        }
    } else {
        let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            if (spawn.id !== creep.memory.assignedSpawn) {
                let home = Game.getObjectById(creep.memory.assignedSpawn);
                creep.travelTo(home);
            } else {
                return false;
            }
        } else {
            let home = Game.getObjectById(creep.memory.assignedSpawn);
            creep.travelTo(home);
        }
    }
}
module.exports.wrongRoom = profiler.registerFN(wrongRoom, 'wrongRoomCheck');