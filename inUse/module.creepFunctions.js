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
    const roads = creep.pos.findInRange(FIND_STRUCTURES, 2);
    if (roads.length >= 3 && roads.structureType === STRUCTURE_ROAD) {
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

module.exports.renewal = function (creep) {
    if (creep.memory.level === 0) {
        return;
    }
    if (creep.memory.renew === true) {
        creep.say('Renew');
        pathing.Move(creep, Game.getObjectById(creep.memory.assignedSpawn));
        return true;
    } else if (Game.time % 15 === 0) {
        creep.memory.returnPath = pathing.FindPath(creep, Game.getObjectById(creep.memory.assignedSpawn), true);
        if (creep.memory.returnPath) {
            let totalParts = creep.body.length;
            let moveParts = creep.getActiveBodyparts(MOVE);
            let fatigueWeight = 2 * ((totalParts - moveParts) * 1.25 - moveParts) / (Math.ceil(1.25 * (totalParts - moveParts) / moveParts));
            let deathTick = ((creep.memory.returnPath.length + 3) * fatigueWeight) + ((creep.memory.returnPath.length + 3) * 0.02) + 15;
            if (creep.ticksToLive <= deathTick) {
                creep.memory.pathAge = 200;
                creep.memory.path = null;
                creep.memory.renew = true;
            }
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
            creep.say('Recycle');
            let home = Game.getObjectById(creep.memory.assignedSpawn);
            pathing.Move(creep, home);
            return true;
        } else {
            return false;
        }
    }
};

module.exports.withdrawEnergy = function (creep) {
    if (!creep.memory.energyDestination) {
        return null;
    } else {
        let energyItem = Game.getObjectById(creep.memory.energyDestination);
        if (energyItem) {
            if (energyItem.structureType !== null || energyItem.structureType !== undefined) {
                if (creep.withdraw(energyItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, energyItem);
                } else {
                    creep.memory.energyDestination = null;
                }
            }
        }
    }
};


module.exports.findEnergy = function (creep, hauler = false) {
    let energy = [];
    //Container
    let container = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'container'), 'id');
    if (container.length > 0) {
        let containers = [];
        for (i = 0; i < container.length; i++) {
            const object = Game.getObjectById(container[i]);
            if (object) {
                if (object.store[RESOURCE_ENERGY] === 0) {
                    continue;
                }
                const containerAmountWeighted = (object.store[RESOURCE_ENERGY] / object.storeCapacity);
                const containerDistWeighted = object.pos.getRangeTo(creep) * (1 - containerAmountWeighted);
                containers.push({
                    id: container[i],
                    distWeighted: containerDistWeighted,
                    harvest: false
                });
            }
        }
        let bestContainer = _.min(containers, 'distWeighted');
        energy.push({
            id: bestContainer.id,
            distWeighted: bestContainer.distWeighted,
            harvest: false
        });
    }
    //Spawn
    if (hauler === false) {
        let spawn = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'spawn'), 'id');
        if (spawn.length > 0) {
            let spawns = [];
            for (i = 0; i < spawn.length; i++) {
                const object = Game.getObjectById(spawn[i]);
                if (object) {
                    if (object.energy === 0) {
                        continue;
                    }
                    const spawnDistWeighted = object.pos.getRangeTo(creep) * 5.5;
                    spawns.push({
                        id: spawn[i],
                        distWeighted: spawnDistWeighted,
                        harvest: false
                    });
                }
            }
            let bestSpawn = _.min(spawns, 'distWeighted');
            energy.push({
                id: bestSpawn.id,
                distWeighted: bestSpawn.distWeighted,
                harvest: false
            });
        }
    }
    //Extension
    if (hauler === false) {
        let extension = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'extension'), 'id');
        if (extension.length > 0) {
            let extensions = [];
            for (i = 0; i < extension.length; i++) {
                const object = Game.getObjectById(extension[i]);
                if (object) {
                    if (object.energy === 0) {
                        continue;
                    }
                    const extensionDistWeighted = object.pos.getRangeTo(creep) * 5.5;
                    extensions.push({
                        id: extension[i],
                        distWeighted: extensionDistWeighted,
                        harvest: false
                    });
                }
            }
            let bestExtension = _.min(extensions, 'distWeighted');
            energy.push({
                id: bestExtension.id,
                distWeighted: bestExtension.distWeighted,
                harvest: false
            });
        }
    }
    //Storage
    let storage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
    if (storage.length > 0) {
        let storages = [];
        for (i = 0; i < storage.length; i++) {
            const object = Game.getObjectById(storage[i]);

            if (object) {
                if (object.store[RESOURCE_ENERGY] === 0) {
                    continue;
                }
                const storageDistWeighted = object.pos.getRangeTo(creep) * 0.5;
                storages.push({
                    id: storage[i],
                    distWeighted: storageDistWeighted,
                    harvest: false
                });
            }
        }
        let bestStorage = _.min(storages, 'distWeighted');
        energy.push({
            id: bestStorage.id,
            distWeighted: bestStorage.distWeighted,
            harvest: false
        });
    }

    //Tower
    let tower = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'tower'), 'id');
    if (tower.length > 0) {
        let towers = [];
        for (i = 0; i < tower.length; i++) {
            const object = Game.getObjectById(tower[i]);

            if (object) {
                if (object.energy === 0) {
                    continue;
                }
                const towerDistWeighted = object.pos.getRangeTo(creep) * 100;
                towers.push({
                    id: tower[i],
                    distWeighted: towerDistWeighted,
                    harvest: false
                });
            }
        }
        let bestTower = _.min(towers, 'distWeighted');
        energy.push({
            id: bestTower.id,
            distWeighted: bestTower.distWeighted,
            harvest: false
        });
    }

    let sorted = _.min(energy, 'distWeighted');

    if (sorted) {
        if (sorted.harvest === false) {
            let energyItem = Game.getObjectById(sorted.id);
            if (energyItem) {
                creep.memory.energyDestination = energyItem.id;
            }
        } else if (sorted.harvest === true) {
            let energyItem = Game.getObjectById(sorted.id);
            if (energyItem) {
                if (creep.harvest(energyItem) === ERR_NOT_IN_RANGE) {
                    pathing.Move(creep, energyItem);
                }
            }
        } else {
            let energyItem = Game.getObjectById(sorted.id);
            if (creep.pickup(energyItem) === ERR_NOT_IN_RANGE) {
                pathing.Move(creep, energyItem);
            }
        }
    }
};

module.exports.findStorage = function (creep) {

    let storage = [];
    //Container
    let container = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'container'), 'id');
    if (container.length > 0) {
        let containers = [];
        for (i = 0; i < container.length; i++) {
            const object = Game.getObjectById(container[i]);
            if (object) {
                if (object.pos.getRangeTo(creep) !== 1) {
                    if (object.store[RESOURCE_ENERGY] === object.storeCapacity) {
                        continue;
                    }
                    const containerDistWeighted = object.pos.getRangeTo(creep) * 10;
                    containers.push({
                        id: container[i],
                        distWeighted: containerDistWeighted,
                        harvest: false
                    });
                }
            }
        }
        let bestContainer = _.min(containers, 'distWeighted');
        storage.push({
            id: bestContainer.id,
            distWeighted: bestContainer.distWeighted,
            harvest: false
        });
    }
    //Spawn
    let spawn = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'spawn'), 'id');
    if (spawn.length > 0) {
        let spawns = [];
        for (i = 0; i < spawn.length; i++) {
            const object = Game.getObjectById(spawn[i]);
            if (object) {
                if (object.pos.getRangeTo(creep) !== 1) {
                    if (object.energy === object.energyCapacity) {
                        continue;
                    }
                    const spawnDistWeighted = object.pos.getRangeTo(creep) * 0.5;
                    spawns.push({
                        id: spawn[i],
                        distWeighted: spawnDistWeighted,
                        harvest: false
                    });
                }
            }
        }
        let bestSpawn = _.min(spawns, 'distWeighted');
        storage.push({
            id: bestSpawn.id,
            distWeighted: bestSpawn.distWeighted,
            harvest: false
        });
    }
    //Extension
    let extension = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'extension'), 'id');
    if (extension.length > 0) {
        let extensions = [];
        for (i = 0; i < extension.length; i++) {
            const object = Game.getObjectById(extension[i]);
            if (object) {
                if (object.pos.getRangeTo(creep) !== 1) {
                    if (object.energy === object.energyCapacity) {
                        continue;
                    }
                    const extensionDistWeighted = object.pos.getRangeTo(creep) * 0.3;
                    extensions.push({
                        id: extension[i],
                        distWeighted: extensionDistWeighted,
                        harvest: false
                    });
                }
            }
        }
        let bestExtension = _.min(extensions, 'distWeighted');
        storage.push({
            id: bestExtension.id,
            distWeighted: bestExtension.distWeighted,
            harvest: false
        });
    }
    //Storage
    let sStorage = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'storage'), 'id');
    if (sStorage.length > 0) {
        let storages = [];
        for (i = 0; i < sStorage.length; i++) {
            const object = Game.getObjectById(sStorage[i]);
            if (object) {
                if (object.pos.getRangeTo(creep) !== 1) {
                    const storageDistWeighted = object.pos.getRangeTo(creep) * 2;
                    storages.push({
                        id: sStorage[i],
                        distWeighted: storageDistWeighted,
                        harvest: false
                    });
                }
            }
        }
        let bestStorage = _.min(storages, 'distWeighted');
        storage.push({
            id: bestStorage.id,
            distWeighted: bestStorage.distWeighted,
            harvest: false
        });
    }
    //Tower
    let tower = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'tower'), 'id');
    if (tower.length > 0) {
        let towers = [];
        for (i = 0; i < tower.length; i++) {
            const object = Game.getObjectById(tower[i]);
            if (object) {
                if (object.pos.getRangeTo(creep) !== 1) {
                    const towerAmountWeighted = 1.01 - (object.energy / object.energyCapacity);
                    const towerDistWeighted = (object.pos.getRangeTo(creep) * 2) - towerAmountWeighted;
                    towers.push({
                        id: tower[i],
                        distWeighted: towerDistWeighted,
                        harvest: false
                    });
                }
            }
        }
        let bestTower = _.min(towers, 'distWeighted');
        storage.push({
            id: bestTower.id,
            distWeighted: bestTower.distWeighted,
            harvest: false
        });
    }

    let sorted = _.min(storage, 'distWeighted');
    if (sorted) {
        let storageItem = Game.getObjectById(sorted.id);
        if (storageItem) {
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.memory.storageDestination = storageItem.id;
                pathing.Move(creep, storageItem);
            }
        }
    }

};