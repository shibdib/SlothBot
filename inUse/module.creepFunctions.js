

module.exports.rangeSource = function (creep) {
    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (creep.pos.getRangeTo(source) === 1) {
        return 1;
    }
    return null;
};

module.exports.findContainer = function (creep) {

    var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 1000});
    if (container) {
        creep.memory.container = container.id;
        return container.id;
    }

    var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 500});
    if (container) {
        creep.memory.container = container.id;
        return container.id;
    }

    var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 100});
    if (container) {
        creep.memory.container = container.id;
        return container.id;
    }
    creep.memory.container = null;
    return null;
};

module.exports.findBuilder = function (creep) {
    const stationaryBuilder = creep.pos.findClosestByRange(_.filter(Game.creeps, (builder) => builder.memory.incomingEnergy === creep.id));
    if (stationaryBuilder) {
        creep.memory.builderID = stationaryBuilder.id;
        return stationaryBuilder.id;
    }
    return null;
};

module.exports.findNewBuilder = function (creep) {
    const stationaryBuilder = creep.pos.findClosestByRange(_.filter(Game.creeps, (builder) => builder.memory.needEnergy === true && builder.memory.incomingEnergy === false));
    if (stationaryBuilder) {
        creep.memory.builderID = stationaryBuilder.id;
        creep.memory.haulCounter = 0;
        return stationaryBuilder.id;
    }
    return null;
};

module.exports.rangeAssignment = function (creep) {
    const container = Game.getObjectById(creep.memory.assignedContainer);
    const assignment = creep.pos.getRangeTo(container);
    if (assignment) {
        return assignment;
    }
    return null;
};

module.exports.findSource = function (creep) {
    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (source) {
        if (creep.moveTo(source) !== ERR_NO_PATH) {
            if (source.id) {
                creep.memory.source = source.id;
                return source;
            }
        }
    }
    return null;
};

module.exports.findTower = function (creep) {

    const tower = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && s.energy !== s.energyCapacity});
    if (tower) {
        return tower.id;
    }
    return null;
};

module.exports.findSpawn = function (creep) {
    let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
    if (spawn) {
        if (creep.moveTo(spawn) !== ERR_NO_PATH) {
            if (spawn.id) {
                creep.memory.spawnID = spawn.id;
                return spawn;
            }
        }
    }
};

module.exports.findConstruction = function (creep) {

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
};

module.exports.findRoadWork = function (creep) {

    site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_ROAD});
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
};

module.exports.dumpTruck = function (creep) {
    if (!creep.memory.incomingEnergy) {
        creep.memory.incomingEnergy = false;
    }
    if (creep.memory.incomingEnergy) {
        creep.memory.incomingCounter = creep.memory.incomingCounter + 1;
        if (creep.memory.incomingCounter > 50) {
            creep.memory.incomingEnergy = false;
        }
    }
    if (creep.carry.energy < (creep.carryCapacity / 2)) {
        creep.memory.needEnergy = true;
    }
    if (creep.carry.energy > (creep.carryCapacity * 0.75)) {
        creep.memory.incomingCounter = 0;
        creep.memory.needEnergy = false;
        creep.memory.incomingEnergy = false;
    }
};

module.exports.findRepair = function (creep) {

    site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 1000});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < 1000});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax / 2});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL && s.hits < 10000});
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
};

module.exports.wallRepair = function (creep) {

    site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && s.hits < s.hitsMax});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 25000});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL && s.hits < 25000});
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
};