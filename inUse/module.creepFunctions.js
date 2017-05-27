let pathing = require('module.pathFinder');

module.exports.rangeSource = function (creep) {
    const source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (creep.pos.getRangeTo(source) === 1) {
        return 1;
    }
    return null;
};

module.exports.findBuilder = function (creep) {
    const needsEnergy = creep.pos.findClosestByRange(_.filter(Game.creeps, (builder) => builder.memory.incomingEnergy === creep.id));
    if (needsEnergy) {
        creep.memory.builderID = needsEnergy.id;
        return needsEnergy.id;
    }
    return null;
};

module.exports.findNewBuilder = function (creep) {
    const needsEnergy = creep.pos.findClosestByRange(_.filter(Game.creeps, (builder) => builder.memory.needEnergy === true && builder.memory.incomingEnergy === false));
    if (needsEnergy) {
        creep.memory.builderID = needsEnergy.id;
        creep.memory.haulCounter = 0;
        return needsEnergy.id;
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
    } else {
        return null;
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
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 250000});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < 75000});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax / 2});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL && s.hits < 250000});
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
};

module.exports.wallRepair = function (creep) {

    site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && s.hits < s.hitsMax});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL && s.hits < 250000});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 250000});
    }
    if (site !== null && site !== undefined) {
        return site.id;
    }
};

module.exports.wallBuilding = function (creep) {

    site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_WALL});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_RAMPART});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES);
    }
    if (site !== null && site !== undefined) {
        creep.memory.constructionSite = site.id;
        return site.id;
    }
};

module.exports.containerBuilding = function (creep) {

    site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (site !== null && site !== undefined) {
        if (creep.pos.getRangeTo(site) <= 1) {
            return site.id;
        }
    }
};

module.exports.harvestDeposit = function (creep) {
    let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (creep.pos.getRangeTo(container) <= 1) {
        if (container.hits < 25000) {
            creep.repair(container);
            creep.say('Fixing');
        }
        return container.id;
    } else if (creep.pos.getRangeTo(container) <= 3) {
        creep.moveTo(container);
        return container.id;
    }
    return null;
};

module.exports.harvesterContainerBuild = function (creep) {
    if (creep.pos.createConstructionSite(STRUCTURE_CONTAINER) !== OK) {
        return null;
    }
};

module.exports.findRoad = function (creep) {
    const roads = creep.pos.findInRange(FIND_STRUCTURES, 2, {filter: (r) => r.structureType === STRUCTURE_ROAD});
    if (roads.length >= 3) {
        return roads[0].id;
    } else {
        return false;
    }
};

module.exports.findNearbyConstruction = function (creep) {
    const site = creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 1);
    if (site.length > 0) {
        creep.memory.constructionSite = site[0].id;
        return site[0].id;
    } else {
        return false;
    }
};

module.exports.renewal = function (creep, breakingPoint = 120) {
    if (!creep.memory.assignedSpawn) {
        let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            creep.memory.assignedSpawn = spawn.id;
        }
    } else {
        if (creep.ticksToLive < breakingPoint || creep.memory.renew === true) {
            creep.say('Renewing');
            let home = Game.getObjectById(creep.memory.assignedSpawn);
            creep.memory.renew = true;
            pathing.Move(creep, home, 3);
            if (creep.ticksToLive > 1000) {
                creep.memory.renew = false;
            }
            return true;
        } else {
            return false;
        }
    }
};

module.exports.recycle = function (creep) {
    if (!creep.memory.assignedSpawn) {
        let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            creep.memory.assignedSpawn = spawn.id;
        }
    } else {
        if (creep.memory.recycle === true) {
            creep.say('Recycling');
            let home = Game.getObjectById(creep.memory.assignedSpawn);
            pathing.Move(creep, home, 3);
            return true;
        } else {
            return false;
        }
    }
};


module.exports.findEnergy = function (creep, hauler = false) {
    let energy = [];
    //Container
    let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > creep.carryCapacity});
    if (container) {
        const containerDistWeighted = container.pos.getRangeTo(creep) * 0.65;
        energy.push({
            id: container.id,
            distWeighted: containerDistWeighted,
            harvest: false
        });
    }
    //Dropped Energy
    let dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {filter: {resourceType: RESOURCE_ENERGY}});
    if (dropped) {
        const droppedDistWeighted = container.pos.getRangeTo(creep) * 0.1;
        energy.push({
            id: dropped.id,
            distWeighted: droppedDistWeighted,
            harvest: null
        });
    }
    //Source
    let source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
        const sourceDistWeighted = source.pos.getRangeTo(creep * 2.5);
        energy.push({
            id: source.id,
            distWeighted: sourceDistWeighted,
            harvest: true
        });
    }
    //Spawn
    if (hauler === false) {
        let spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS, {filter: (s) => s.energy > 250});
        if (spawn) {
            const spawnDistWeighted = spawn.pos.getRangeTo(creep) * 5.5;
            energy.push({
                id: spawn.id,
                distWeighted: spawnDistWeighted,
                harvest: false
            });
        }
    }
    //Extension
    if (hauler === false) {
        let extension = creep.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.energy > 0});
        if (extension) {
            const extensionDistWeighted = extension.pos.getRangeTo(creep) * 4.5;
            energy.push({
                id: extension.id,
                distWeighted: extensionDistWeighted,
                harvest: false
            });
        }
    }
    //Storage
    if (hauler === false) {
        let storage = creep.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] > creep.carryCapacity});
        if (storage) {
            const storageDistWeighted = storage.pos.getRangeTo(creep) * 0.5;
            energy.push({
                id: storage.id,
                distWeighted: storageDistWeighted,
                harvest: false
            });
        }
    }

    let sorted = _.sortBy(energy, s => s.distWeighted);

    if (sorted[0].harvest === false) {
        let energyItem = Game.getObjectById(sorted[0].id);
        if (energyItem) {
            if (creep.withdraw(energyItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, energyItem, 2);
            }
        }
    } else if (sorted[0].harvest === true) {
        let energyItem = Game.getObjectById(sorted[0].id);
        if (energyItem) {
            if (creep.harvest(energyItem) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, energyItem, 2);
            }
        }
    } else {
        let energyItem = Game.getObjectById(sorted[0].id);
        if (creep.pickup(energyItem) === ERR_NOT_IN_RANGE) {
            pathing.Move(creep, energyItem, 2);
        }
    }
};

module.exports.findStorage = function (creep) {
    let storage = [];
    //Container
    let container = creep.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] - s.storeCapacity > creep.carry.energy});
    if (container) {
        const containerDistWeighted = container.pos.getRangeTo(creep) * 10;
        storage.push({
            id: container.id,
            distWeighted: containerDistWeighted
        });
    }
    //Spawn
    let spawn = creep.pos.findClosestByPath(FIND_MY_SPAWNS, {filter: (s) => s.energy < s.energyCapacity});
    if (spawn) {
        const spawnDistWeighted = spawn.pos.getRangeTo(creep) * 0.25;
        storage.push({
            id: spawn.id,
            distWeighted: spawnDistWeighted
        });
    }
    //Extension
    let extension = creep.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION && s.energy < s.energyCapacity});
    if (extension) {
        const extensionDistWeighted = extension.pos.getRangeTo(creep) * 0.25;
        storage.push({
            id: extension.id,
            distWeighted: extensionDistWeighted
        });
    }
    //Storage
    let sStorage = creep.pos.findClosestByPath(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_STORAGE && s.store[RESOURCE_ENERGY] - s.storeCapacity > creep.carryCapacity});
    if (sStorage) {
        const storageDistWeighted = sStorage.pos.getRangeTo(creep) * 0.45;
        storage.push({
            id: sStorage.id,
            distWeighted: storageDistWeighted
        });
    }

    let sorted = _.sortBy(storage, s => s.distWeighted);
    if (sorted[0]) {
        let storageItem = Game.getObjectById(sorted[0].id);
        if (storageItem) {
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, storageItem, 2);
            }
        }
    }
};