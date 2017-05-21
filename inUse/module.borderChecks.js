module.exports.nextStepIntoRoom = function(creep) {
    if(creep.pos.x == 0 && creep.pos.y == 0)
    {
        creep.move(BOTTOM_RIGHT);
    }
    else if(creep.pos.x == 0 && creep.pos.y == 49)
    {
        creep.move(TOP_RIGHT);
    }
    else if(creep.pos.x == 49 && creep.pos.y == 0)
    {
        creep.move(BOTTOM_LEFT);
    }
    else if(creep.pos.x == 49 && creep.pos.y == 49)
    {
        creep.move(TOP_LEFT);
    }
    else if(creep.pos.x == 49)
    {
        creep.move(LEFT);
    }
    else if (creep.pos.x == 0)
    {
        creep.move(RIGHT);
    }
    else if (creep.pos.y == 0)
    {
        creep.move(BOTTOM);
    }
    else if (creep.pos.y == 49)
    {
        creep.move(TOP);
    }
};

module.exports.isOnBorder = function(creep) {
    if(creep.pos.x == 0 || creep.pos.y == 0 || creep.pos.x == 49 || creep.pos.y == 49)
    {
        return true;
    }
    else
    {
        return false;
    }
};

module.exports.wrongRoom = function(creep) {
    if(creep.memory.assignedSpawn !== null) {
        let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            if (spawn.id !== creep.memory.assignedSpawn) {
                let home = Game.getObjectById(creep.memory.assignedSpawn);
                creep.moveTo(home, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            } else {
                return false;
            }
        } else {
            let home = Game.getObjectById(creep.memory.assignedSpawn);
            creep.moveTo(home, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
        }
    } else {
        creep.suicide();
    }
};