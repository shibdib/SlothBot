/***
 localMiner is built for simplicity. It will be assigned a sourceId and mine it for it's lifetime
 It will return energy to the nearest storage source with available space.
 If idle, it will find a flag on the room with the word "miner" in it.
 ***/

var localMinerCreep = {
    /** @param {Creep} creep object **/
    /** goal: mine source **/
    run: function (creep) {
        // Mine if assigned a source
        if (creep.memory.source != null && (creep.memory.full == false || creep.memory.full == null)) {
            if (creep.harvest(Game.getObjectById(creep.memory.source)) == ERR_NOT_IN_RANGE) {
                creep.moveTo(Game.getObjectById(creep.memory.source), {reusePath: 20});
            }
            if (creep.carry.energy == creep.carryCapacity) {
                creep.memory.full = true;
            }
        }
        // Energy might be full, go dump it
        else if (creep.memory.full) {
            var targets = creep.room.find(FIND_STRUCTURES, {
                        filter: (structure) => {
                        return (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN || structure.structureType == STRUCTURE_CONTAINER) &&
                structure.energy < (structure.energyCapacity);
        }
        })
            ;
            var containersWithRoom = creep.room.find(FIND_STRUCTURES, {
                    filter: (i) => i.structureType == STRUCTURE_CONTAINER &&
                i.store[RESOURCE_ENERGY] < i.storeCapacity
        })
            ;
            var storageCont = creep.room.find(FIND_STRUCTURES, {
                    filter: (i) => i.structureType == STRUCTURE_STORAGE &&
                i.store[RESOURCE_ENERGY] < i.storeCapacity
        })
            ;
            if (targets.length > 0) {
                //console.log("Moving to spawn to store energy.");
                if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], {reusePath: 20});
                }
            }
            // Extensions/spawns are full, find containers
            else if (containersWithRoom.length > 0) {
                if (creep.transfer(containersWithRoom[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(containersWithRoom[0]);
                }
            }
            else if (storageCont.length > 0) {
                if (creep.transfer(storageCont[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
                    creep.moveTo(storageCont[0]);
                }
            }
            else {
                // At least we could dump some of it? Go back to mining...
                if (creep.carry.energy < creep.carryCapacity) {
                    creep.memory.full = false;
                }
                else {
                    // We'd only be here if energy is 100% full and there is just no where to dump it
                    goIdle(creep);
                }
            }
            // Did we manage to empty energy?
            if (creep.carry.energy == 0) {
                creep.memory.full = false;
            }
        }
        // Otherwise find a flag containing "miner"
        else {
            goIdle(creep);
        }
    }
};
module.exports = localMinerCreep;

function goIdle(myCreep) {
    // if a flag is already set, don't loop for it
    if (myCreep.memory.idleFlag != null) {
        if (myCreep.moveTo(Game.flags[myCreep.memory.idleFlag]) == ERR_INVALID_TARGET) {
            myCreep.memory.idleFlag = null;
        }
    }
    // Otherwise, see if a flag is in the room
    else {
        for (var flagName in Game.flags) {
            if (flagName.includes("miner") && Game.flags[flagName].pos.roomName == myCreep.room.name) {
                myCreep.memory.idleFlag = flagName;
                break;
            }
        }
    }
}