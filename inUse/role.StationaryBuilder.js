var roleStationaryBuilder = {

    /** @param {Creep} creep **/
    run: function (creep) {
        if (!findSpawn(creep).memory.build === false) {
            if (rangeSource(creep) === 1) {
                creep.moveTo(Game.flags.defender1);
                return null;
            }
            dumpTruck(creep);

            if (creep.memory.constructionSite && creep.carry.energy > 0) {
                target = Game.getObjectById(creep.memory.constructionSite);
                if (target && target.progress < target.progressTotal) {
                    if (creep.build(target) === ERR_INVALID_TARGET) {
                        creep.moveTo(Game.flags.haulers);
                    } else {
                        if (creep.build(target) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                        }
                    }
                } else {
                    creep.memory.constructionSite = null;
                }
            } else if (creep.carry.energy > 0) {
                var target = findConstruction(creep);
                target = Game.getObjectById(target);
                if (target) {
                    if (creep.build(target) === ERR_INVALID_TARGET) {
                        creep.moveTo(Game.flags.haulers);
                    } else {
                        if (creep.build(target) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                        }
                    }
                } else {
                    if (creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
                        creep.moveTo(creep.room.controller, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
        }
    }
};

module.exports = roleStationaryBuilder;

function findConstruction(creep) {

    site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_RAMPART});
    }
    if (site !== null && site !== undefined) {
        creep.memory.constructionSite = site.id;
        return site.id;
    }
}

function dumpTruck(creep) {
    if (!creep.memory.incomingEnergy) {
        creep.memory.incomingEnergy = false;
    }
    if (creep.memory.incomingEnergy) {
        creep.memory.incomingCounter = creep.memory.incomingCounter+1;
        if (creep.memory.incomingCounter > 25){
            creep.memory.incomingEnergy = false;
        }
    }
    if (creep.carry.energy < (creep.carryCapacity/2)) {
        creep.memory.needEnergy = true;
    }
    if (creep.carry.energy > (creep.carryCapacity/2)) {
        creep.memory.incomingCounter = 0;
        creep.memory.needEnergy = false;
        creep.memory.incomingEnergy = false;
    }
}

function rangeSource(creep) {
    var source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (creep.pos.getRangeTo(source) === 1) {
        return 1;
    }
    return null;
}

function findSpawn(creep) {
    let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (spawn) {
        if (creep.moveTo(spawn) !== ERR_NO_PATH) {
            if (spawn.id) {
                creep.memory.spawnID = spawn.id;
                return spawn;
            }
        }
    }
}