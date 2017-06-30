const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

function findSource(creep) {
    const source = creep.room.find(FIND_SOURCES_ACTIVE);
    if (source.length > 0) {
        for (let i = 0; i < source.length; i++) {
            if (source[i].pos.findInRange(FIND_CREEPS, 1, {filter: (c) => c.memory.role === 'remoteHarvester' || c.memory.role === 'stationaryHarvester'}).length === 0) {
                if (creep.travelTo(source[i]) !== ERR_NO_PATH) {
                    if (source[i].id) {
                        creep.memory.source = source[i].id;
                        return source[i];
                    }
                }
            }
        }
    }
    return null;
}
module.exports.findSource = profiler.registerFN(findSource, 'findSourceCreepFunctions');

function findTower(creep) {

    const tower = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_TOWER && s.energy !== s.energyCapacity});
    if (tower) {
        return tower.id;
    }
    return null;
}
module.exports.findTower = profiler.registerFN(findTower, 'findTowerCreepFunctions');

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
module.exports.findConstruction = profiler.registerFN(findConstruction, 'findConstructionCreepFunctions');

function findRepair(creep, level = 1) {

    site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 1000});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_WALL && s.hits < 250000 * level});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 250000 * level});
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
    if (site !== null && site !== undefined) {
        return site.id;
    }
}
module.exports.findRepair = profiler.registerFN(findRepair, 'findRepairCreepFunctions');

function containerBuilding(creep) {
    site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (site !== null && site !== undefined) {
        if (creep.pos.getRangeTo(site) <= 1) {
            return site.id;
        }
    }
}
module.exports.containerBuilding = profiler.registerFN(containerBuilding, 'containerBuildingCreepFunctions');

function harvestDepositContainer(creep) {
    let container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (container) {
        if (creep.pos.getRangeTo(container) <= 1) {
            return container.id;
        } else if (creep.pos.getRangeTo(container) <= 3) {
            creep.travelTo(container);
            return container.id;
        }
    }
    return null;
}
module.exports.harvestDepositContainer = profiler.registerFN(harvestDepositContainer, 'harvestDepositContainerCreepFunctions');

function harvestDepositLink(creep) {
    let link = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LINK});
    if (link) {
        if (creep.pos.getRangeTo(link) <= 1) {
            return link.id;
        } else if (creep.pos.getRangeTo(link) <= 3) {
            creep.travelTo(link);
            return link.id;
        }
    }
    return null;
}
module.exports.harvestDepositLink = profiler.registerFN(harvestDepositLink, 'harvestDepositLinkCreepFunctions');

module.exports.harvesterContainerBuild = function (creep) {
    if (creep.pos.createConstructionSite(STRUCTURE_CONTAINER) !== OK) {
        return null;
    }
};

function renewal(creep) {
    if (creep.memory.level === 0) {
        return;
    }
    if (creep.memory.renew === true) {
        creep.say('Renew');
        creep.travelTo(Game.getObjectById(creep.memory.assignedSpawn));
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
}
module.exports.renewal = profiler.registerFN(renewal, 'renewalCreepFunctions');

function recycle(creep) {
    if (!creep.memory.assignedSpawn) {
        let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            creep.memory.assignedSpawn = spawn.id;
        }
    } else {
        if (creep.memory.recycle === true) {
            creep.say('Recycle');
            let home = Game.getObjectById(creep.memory.assignedSpawn);
            creep.travelTo(home);
            return true;
        } else {
            return false;
        }
    }
}
module.exports.recycle = profiler.registerFN(recycle, 'recycleCreepFunctions');

function withdrawEnergy(creep) {
    if (!creep.memory.energyDestination) {
        return null;
    } else {
        let energyItem = Game.getObjectById(creep.memory.energyDestination);
        if (energyItem) {
            if (creep.withdraw(energyItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(energyItem);
            } else {
                creep.memory.energyDestination = null;
            }
        } else {
            creep.memory.energyDestination = undefined;
        }
    }
}
module.exports.withdrawEnergy = profiler.registerFN(withdrawEnergy, 'withdrawEnergyCreepFunctions');

function noHarvesterProtocol(creep) {
    let harvester = _.filter(Game.creeps, (h) => h.memory.assignedSpawn === creep.memory.assignedSpawn && h.memory.role === 'stationaryHarvester');
    if (harvester.length < 2) {
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.travelTo(storageItem);
            } else {
                creep.memory.storageDestination = null;
                creep.memory.path = null;
            }
            return null;
        }
        return true;
    }
}
module.exports.noHarvesterProtocol = profiler.registerFN(noHarvesterProtocol, 'noHarvesterProtocolCreepFunctions');


function findEnergy(creep, hauler = false, range = 50) {
    let energy = [];
    //Container
    let container = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'container'), 'id');
    if (container.length > 0) {
        let containers = [];
        for (i = 0; i < container.length; i++) {
            const object = Game.getObjectById(container[i]);
            if (object) {
                if (object.store[RESOURCE_ENERGY] === 0 || object.pos.getRangeTo(creep) > range) {
                    continue;
                }
                const containerAmountWeighted = (object.store[RESOURCE_ENERGY] / object.storeCapacity);
                const containerDistWeighted = object.pos.getRangeTo(creep) * (1.1 - containerAmountWeighted);
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
    //Links
    if (hauler === false) {
        let link = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'link'), 'id');
        if (link.length > 0) {
            let links = [];
            for (i = 0; i < link.length; i++) {
                const object = Game.getObjectById(link[i]);
                if (object) {
                    if (object.energy === 0 || object.pos.getRangeTo(creep) > range) {
                        continue;
                    }
                    const linkDistWeighted = _.round(object.pos.getRangeTo(creep) * 0.3, 0) + 1;
                    links.push({
                        id: link[i],
                        distWeighted: linkDistWeighted,
                        harvest: false
                    });
                }
            }
            let bestLink = _.min(links, 'distWeighted');
            energy.push({
                id: bestLink.id,
                distWeighted: bestLink.distWeighted,
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
                if (object.store[RESOURCE_ENERGY] < 200 || object.pos.getRangeTo(creep) > range) {
                    continue;
                }
                const storageDistWeighted = _.round(object.pos.getRangeTo(creep) * 0.3, 0) + 1;
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
    //Terminal
    let terminal = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'terminal'), 'id');
    if (terminal.length > 0) {
        let terminals = [];
        for (i = 0; i < terminal.length; i++) {
            const object = Game.getObjectById(terminal[i]);
            if (object) {
                if (object.store[RESOURCE_ENERGY] <= 1000 || object.pos.getRangeTo(creep) > range) {
                    continue;
                }
                const terminalDistWeighted = _.round(object.pos.getRangeTo(creep) * 0.3, 0) + 1;
                terminals.push({
                    id: terminal[i],
                    distWeighted: terminalDistWeighted,
                    harvest: false
                });
            }
        }
        let bestTerminal = _.min(terminals, 'distWeighted');
        energy.push({
            id: bestTerminal.id,
            distWeighted: bestTerminal.distWeighted,
            harvest: false
        });
    }
    /**
    //Dropped Energy
    let dropped = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (e) => e.resourceType === RESOURCE_ENERGY});
    if (dropped.length > 0) {
        let droppedEnergy = [];
        for (let i = 0; i < dropped.length; i++) {
            if (dropped[i]) {
                const droppedDistWeighted = _.round(dropped[i].pos.getRangeTo(creep) * 0.3, 0) + 1;
                droppedEnergy.push({
                    id: dropped[i].id,
                    distWeighted: droppedDistWeighted,
                    harvest: false
                });
            }
        }
        let bestDropped = _.min(droppedEnergy, 'distWeighted');
        energy.push({
            id: bestDropped.id,
            distWeighted: bestDropped.distWeighted,
            harvest: false
        });
    }**/

    let sorted = _.min(energy, 'distWeighted');

    if (sorted) {
        if (sorted.harvest === false) {
            let energyItem = Game.getObjectById(sorted.id);
            if (energyItem) {
                creep.memory.energyDestination = energyItem.id;
            }
        }
    }
}
module.exports.findEnergy = profiler.registerFN(findEnergy, 'findEnergyCreepFunctions');

function findStorage(creep) {
    let storage = [];
    //Container
    let container = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'container'), 'id');
    if (container.length > 0) {
        let containers = [];
        for (i = 0; i < container.length; i++) {
            const object = Game.getObjectById(container[i]);
            if (object) {
                if (object.pos.getRangeTo(creep) > 1) {
                    if (object.store[RESOURCE_ENERGY] === object.storeCapacity) {
                        continue;
                    }
                    const containerDistWeighted = _.round(object.pos.getRangeTo(creep) * 10, 0) + 1;
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
                if (object.energy === object.energyCapacity || _.filter(Game.creeps, (c) => c.memory.storageDestination === object.id).length > 0) {
                    continue;
                }
                const spawnDistWeighted = _.round(object.pos.getRangeTo(creep) * 0.3, 0) + 1;
                spawns.push({
                    id: spawn[i],
                    distWeighted: spawnDistWeighted,
                    harvest: false
                });
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
                if (object.energy === object.energyCapacity || _.filter(Game.creeps, (c) => c.memory.storageDestination === object.id).length > 0) {
                    continue;
                }
                const extensionDistWeighted = _.round(object.pos.getRangeTo(creep) * 0.4, 0) + 1;
                extensions.push({
                    id: extension[i],
                    distWeighted: extensionDistWeighted,
                    harvest: false
                });
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
                if (object.pos.getRangeTo(creep) > 1) {
                    const storageDistWeighted = _.round(object.pos.getRangeTo(creep) * 2, 0) + 1;
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
    let harvester = _.filter(Game.creeps, (h) => h.memory.assignedSpawn === creep.memory.assignedSpawn && h.memory.role === 'stationaryHarvester');
    let closestHostile = creep.pos.findClosestByRange(FIND_CREEPS, {filter: (e) => _.includes(doNotAggress, e.owner['username']) === false});
    if (tower.length > 0 && harvester.length >= 2) {
        let towers = [];
        for (i = 0; i < tower.length; i++) {
            const object = Game.getObjectById(tower[i]);
            if (object) {
                if (object.pos.getRangeTo(creep) > 1) {
                    if (closestHostile) {
                        const towerDistWeighted = _.round(object.pos.getRangeTo(creep) * 0.2, 0);
                        towers.push({
                            id: tower[i],
                            distWeighted: towerDistWeighted,
                            harvest: false
                        });
                    } else {
                        const towerAmountWeighted = 1.01 - (object.energy / object.energyCapacity);
                        const towerDistWeighted = _.round(object.pos.getRangeTo(creep) * 1.2, 0) + 1 - towerAmountWeighted;
                        towers.push({
                            id: tower[i],
                            distWeighted: towerDistWeighted,
                            harvest: false
                        });
                    }
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
    //Terminal
    let terminal = _.pluck(_.filter(creep.room.memory.structureCache, 'type', 'terminal'), 'id');
    if (terminal.length > 0) {
        let terminals = [];
        for (i = 0; i < terminal.length; i++) {
            const object = Game.getObjectById(terminal[i]);
            if (object) {
                if (object.pos.getRangeTo(creep) > 1) {
                    if (object.store[RESOURCE_ENERGY] >= 1000) {
                        continue;
                    }
                    const terminalDistWeighted = _.round(object.pos.getRangeTo(creep) * 0.3, 0) + 1;
                    terminals.push({
                        id: terminal[i],
                        distWeighted: terminalDistWeighted,
                        harvest: false
                    });
                }
            }
        }
        let bestTerminal = _.min(terminals, 'distWeighted');
        storage.push({
            id: bestTerminal.id,
            distWeighted: bestTerminal.distWeighted,
            harvest: false
        });
    }
    //Deliveries
    let deliver = _.filter(Game.creeps, (c) => c.memory.deliveryRequested === true && !c.memory.deliveryIncoming && c.pos.roomName === creep.pos.roomName);
    if (deliver.length > 0) {
        let deliveries = [];
        for (let i = 0; i < deliver.length; i++) {
            if (deliver[i].pos.getRangeTo(creep) > 1) {
                if (creep.carry[RESOURCE_ENERGY] < deliver.carryCapacity - _.sum(deliver.carry)) {
                    continue;
                }
                const deliverDistWeighted = _.round(deliver[i].pos.getRangeTo(creep) * 0.3, 0) + 1;
                deliveries.push({
                    id: deliver[i].id,
                    distWeighted: deliverDistWeighted,
                    harvest: false
                });
            }
        }
        let bestDelivery = _.min(deliveries, 'distWeighted');
        storage.push({
            id: bestDelivery.id,
            distWeighted: bestDelivery.distWeighted,
            harvest: false
        });
    }
    let sorted = _.min(storage, 'distWeighted');
    if (sorted) {
        let storageItem = Game.getObjectById(sorted.id);
        if (storageItem) {
            if (creep.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                if (storageItem.memory) {
                    storageItem.memory.deliveryIncoming = true;
                }
                creep.memory.storageDestination = storageItem.id;
                creep.travelTo(storageItem);
            }
        }
    }
}
module.exports.findStorage = profiler.registerFN(findStorage, 'findStorageCreepFunctions');