const profiler = require('screeps-profiler');
borderCheck = function () {
    if (this.pos.x === 0 || this.pos.y === 0 || this.pos.x === 49 || this.pos.y === 49) {
        if (this.pos.x === 0 && this.pos.y === 0) {
            this.move(BOTTOM_RIGHT);
        }
        else if (this.pos.x === 0 && this.pos.y === 49) {
            this.move(TOP_RIGHT);
        }
        else if (this.pos.x === 49 && this.pos.y === 0) {
            this.move(BOTTOM_LEFT);
        }
        else if (this.pos.x === 49 && this.pos.y === 49) {
            this.move(TOP_LEFT);
        }
        else if (this.pos.x === 49) {
            if (Math.random() < .33) {
                this.move(LEFT)
            } else if (Math.random() < .33) {
                this.move(TOP_LEFT)
            } else {
                this.move(BOTTOM_LEFT)
            }
        }
        else if (this.pos.x === 0) {
            if (Math.random() < .33) {
                this.move(RIGHT)
            } else if (Math.random() < .33) {
                this.move(TOP_RIGHT)
            } else {
                this.move(BOTTOM_RIGHT)
            }
        }
        else if (this.pos.y === 0) {
            if (Math.random() < .33) {
                this.move(BOTTOM)
            } else if (Math.random() < .33) {
                this.move(BOTTOM_RIGHT)
            } else {
                this.move(BOTTOM_LEFT)
            }
        }
        else if (this.pos.y === 49) {
            if (Math.random() < .33) {
                this.move(TOP)
            } else if (Math.random() < .33) {
                this.move(TOP_RIGHT)
            } else {
                this.move(TOP_LEFT)
            }
        }
        return true;
    }
};
Creep.prototype.borderCheck = profiler.registerFN(borderCheck, 'borderCheck');

wrongRoom = function () {
    if (this.memory.assignedRoom && this.pos.roomName !== this.memory.assignedRoom) {
        this.shibMove(new RoomPosition(25, 25, this.memory.assignedRoom), {range: 15});
        return true;
    }
};
Creep.prototype.wrongRoom = profiler.registerFN(wrongRoom, 'wrongRoomCheck');

findSource = function () {
    const source = this.room.find(FIND_SOURCES, {filter: (s) => _.filter(Game.creeps, (c) => c.memory.source === s.id).length === 0});
    if (source.length > 0) {
        this.memory.source = this.pos.findClosestByRange(source).id;
        return this.pos.findClosestByRange(source).id;
    }
    return null;
};
Creep.prototype.findSource = profiler.registerFN(findSource, 'findSourceCreepFunctions');

Creep.prototype.findMineral = function () {
    const source = this.room.find(FIND_MINERALS);
    if (source.length > 0) {
        for (let i = 0; i < source.length; i++) {
            if (source[i].pos.findInRange(FIND_CREEPS, 2, {filter: (c) => c.memory && (c.memory.role === 'remoteHarvester' || c.memory.role === 'stationaryHarvester' || c.memory.role === 'SKworker' || c.memory.role === 'mineralHarvester')}).length === 0) {
                if (this.shibMove(source[i]) !== ERR_NO_PATH) {
                    if (source[i].id) {
                        this.memory.source = source[i].id;
                        return source[i];
                    }
                }
            }
        }
    }
    return null;
};

findConstruction = function () {
    let construction = this.room.find(FIND_CONSTRUCTION_SITES);
    let site = _.filter(construction, (s) => s.structureType === STRUCTURE_TOWER);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_EXTENSION);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_WALL);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_RAMPART);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    this.memory.task = undefined;
    return null;
};
Creep.prototype.findConstruction = profiler.registerFN(findConstruction, 'findConstructionCreepFunctions');

findRepair = function (level) {
    let structures = this.room.find(FIND_STRUCTURES, {filter: (s) => s.hits < s.hitsMax});
    let site = _.filter(structures, (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax / 2);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < 75000);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_SPAWN && s.hits < s.hitsMax);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 10000);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_WALL && s.hits < 500000 * level);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 500000 * level);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_EXTENSION && s.hits < s.hitsMax);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    this.memory.task = undefined;
};
Creep.prototype.findRepair = profiler.registerFN(findRepair, 'findRepairCreepFunctions');

containerBuilding = function () {
    let site = this.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (site !== null && site !== undefined) {
        if (this.pos.getRangeTo(site) <= 1) {
            return site.id;
        }
    }
};
Creep.prototype.containerBuilding = profiler.registerFN(containerBuilding, 'containerBuildingCreepFunctions');

harvestDepositContainer = function () {
    let container = this.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (container) {
        if (this.pos.getRangeTo(container) <= 1) {
            return container.id;
        } else if (this.pos.getRangeTo(container) <= 3) {
            this.shibMove(container);
            return container.id;
        }
    }
    return null;
};
Creep.prototype.harvestDepositContainer = profiler.registerFN(harvestDepositContainer, 'harvestDepositContainerCreepFunctions');

harvestDepositLink = function () {
    let link = this.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LINK});
    if (link) {
        if (this.pos.getRangeTo(link) <= 1) {
            return link.id;
        } else if (this.pos.getRangeTo(link) <= 3) {
            this.shibMove(link);
            return link.id;
        }
    }
    return null;
};
Creep.prototype.harvestDepositLink = profiler.registerFN(harvestDepositLink, 'harvestDepositLinkCreepFunctions');

harvesterContainerBuild = function () {
    if (this.pos.createConstructionSite(STRUCTURE_CONTAINER) !== OK) {
        return null;
    }
};
Creep.prototype.harvesterContainerBuild = profiler.registerFN(harvesterContainerBuild, 'harvesterContainerBuildCreepFunctions');

withdrawEnergy = function () {
    if (!this.memory.energyDestination) {
        return null;
    } else {
        let energyItem = Game.getObjectById(this.memory.energyDestination);
        if (energyItem) {
            if (this.withdraw(energyItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                this.shibMove(energyItem);
            } else {
                this.memory.energyDestination = null;
            }
        } else {
            this.memory.energyDestination = undefined;
        }
    }
};
Creep.prototype.withdrawEnergy = profiler.registerFN(withdrawEnergy, 'withdrawEnergyCreepFunctions');

findEnergy = function (range = 250, hauler = false) {
    let energy = [];
    //Container
    let container = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'container'), 'id');
    if (container.length > 0) {
        let containers = [];
        for (let i = 0; i < container.length; i++) {
            const object = Game.getObjectById(container[i]);
            if (object) {
                let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id).length;
                if (object.store[RESOURCE_ENERGY] < 20 || (numberOfUsers >= 4 && this.pos.getRangeTo(object) > 1) || (object.room.controller.level >= 4 && object.store[RESOURCE_ENERGY] < 1200)) {
                    continue;
                }
                const containerAmountWeighted = (object.store[RESOURCE_ENERGY] / object.storeCapacity);
                const containerDistWeighted = object.pos.rangeToTarget(this) * (2 - containerAmountWeighted) + (numberOfUsers / 2);
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
    //storages
    let useStorage = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'storage'), 'id');
    if (useStorage.length > 0) {
        let useStorages = [];
        for (let i = 0; i < useStorage.length; i++) {
            const object = Game.getObjectById(useStorage[i]);
            if (object) {
                if (object.store[RESOURCE_ENERGY] <= 5000) {
                    continue;
                }
                const useStorageDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0) + 1;
                useStorages.push({
                    id: useStorage[i],
                    distWeighted: useStorageDistWeighted,
                    harvest: false
                });
            }
        }
        let bestStorage = _.min(useStorages, 'distWeighted');
        energy.push({
            id: bestStorage.id,
            distWeighted: bestStorage.distWeighted,
            harvest: false
        });
    }
    //Links
    let storageLink = Game.getObjectById(this.room.memory.storageLink);
    if (storageLink) {
        let linkDistWeighted;
        const object = storageLink;
        let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id).length;
        if (object && object.energy > 0 && numberOfUsers.length === 0) {
            linkDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0) + 1;
        }
        energy.push({
            id: storageLink.id,
            distWeighted: linkDistWeighted,
            harvest: false
        });
    }
    //Terminal
    let terminal = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'terminal'), 'id');
    if (terminal.length > 0) {
        let terminals = [];
        for (let i = 0; i < terminal.length; i++) {
            const object = Game.getObjectById(terminal[i]);
            if (object) {
                if (object.store[RESOURCE_ENERGY] <= 5000) {
                    continue;
                }
                const terminalDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0) + 1;
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

    let sorted = _.min(energy, 'distWeighted');

    if (sorted) {
        if (sorted.harvest === false) {
            let energyItem = Game.getObjectById(sorted.id);
            if (energyItem) {
                this.memory.energyDestination = energyItem.id;
            }
        }
    }
};
Creep.prototype.findEnergy = profiler.registerFN(findEnergy, 'findEnergyCreepFunctions');

getEnergy = function (range = 250, hauler = false) {
    let energy = [];
    //Container
    let container = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'container'), 'id');
    if (container.length > 0) {
        let containers = [];
        for (let i = 0; i < container.length; i++) {
            const object = Game.getObjectById(container[i]);
            if (object) {
                let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id).length;
                if (object.store[RESOURCE_ENERGY] < 20 || object.pos.rangeToTarget(this) > range || (numberOfUsers >= 4 && this.pos.getRangeTo(object) > 1)) {
                    continue;
                }
                const containerAmountWeighted = (object.store[RESOURCE_ENERGY] / object.storeCapacity);
                const containerDistWeighted = object.pos.rangeToTarget(this) * (2 - containerAmountWeighted) + (numberOfUsers / 2);
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
    let storageLink = Game.getObjectById(this.room.memory.storageLink);
    if (storageLink) {
        let linkDistWeighted;
        const object = storageLink;
        let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id).length;
        if (object && object.energy > 0 && numberOfUsers === 0) {
            linkDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0) + 1;
        }
        energy.push({
            id: storageLink.id,
            distWeighted: linkDistWeighted,
            harvest: false
        });
    }
    //Terminal
    let terminal = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'terminal'), 'id');
    if (terminal.length > 0) {
        let terminals = [];
        for (let i = 0; i < terminal.length; i++) {
            const object = Game.getObjectById(terminal[i]);
            if (object) {
                let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id).length;
                if (object.store[RESOURCE_ENERGY] <= ENERGY_AMOUNT * 0.5 || object.pos.rangeToTarget(this) > range) {
                    continue;
                }
                const terminalDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0) + 1 + (numberOfUsers / 2);
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
                this.memory.energyDestination = energyItem.id;
            }
        }
        return true;
    } else {
        return undefined;
    }
};
Creep.prototype.getEnergy = profiler.registerFN(getEnergy, 'getEnergyCreepFunctions');

findStorage = function () {
    let storage = [];
    //Storage
    let sStorage = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'storage'), 'id');
    if (sStorage.length > 0) {
        let storages = [];
        for (let i = 0; i < sStorage.length; i++) {
            const object = Game.getObjectById(sStorage[i]);
            if (object) {
                if (object.pos.getRangeTo(this) > 1) {
                    const storageDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.25, 0) + 1;
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
    let tower = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'tower'), 'id');
    let harvester = _.filter(Game.creeps, (h) => h.memory.assignedSpawn === this.memory.assignedSpawn && h.memory.role === 'stationaryHarvester');
    if (tower.length > 0 && harvester.length >= 2) {
        let towers = [];
        for (let i = 0; i < tower.length; i++) {
            const object = Game.getObjectById(tower[i]);
            if (object) {
                if (object.energy === object.energyCapacity) {
                    continue;
                }
                if (object.pos.getRangeTo(this) > 1) {
                    if (object.room.memory.responseNeeded === true) {
                        const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0);
                        towers.push({
                            id: tower[i],
                            distWeighted: towerDistWeighted,
                            harvest: false
                        });
                    } else {
                        const towerAmountWeighted = 1.01 - (object.energy / object.energyCapacity);
                        const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 1.2, 0) + 1 - towerAmountWeighted;
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
    let terminal = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'terminal'), 'id');
    if (terminal.length > 0) {
        let terminals = [];
        for (let i = 0; i < terminal.length; i++) {
            const object = Game.getObjectById(terminal[i]);
            if (object) {
                if (object.pos.getRangeTo(this) > 1) {
                    const terminalDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0) + 1;
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
    let sorted = _.min(storage, 'distWeighted');
    if (sorted) {
        let storageItem = Game.getObjectById(sorted.id);
        if (storageItem) {
            if (this.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                if (storageItem.memory) {
                    storageItem.memory.deliveryIncoming = true;
                }
                this.memory.storageDestination = storageItem.id;
                this.shibMove(storageItem);
            }
        }
        return true;
    }
};
Creep.prototype.findStorage = profiler.registerFN(findStorage, 'findStorageCreepFunctions');

findEssentials = function () {
    let storage = [];
    //Spawn
    let spawn = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'spawn'), 'id');
    if (spawn.length > 0) {
        let spawns = [];
        for (let i = 0; i < spawn.length; i++) {
            const object = Game.getObjectById(spawn[i]);
            if (object) {
                if (object.energy === object.energyCapacity || _.filter(Game.creeps, (c) => c.memory.storageDestination === object.id).length > 0) {
                    continue;
                }
                const spawnDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0) + 1;
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
    let extension = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'extension'), 'id');
    if (extension.length > 0) {
        let extensions = [];
        for (let i = 0; i < extension.length; i++) {
            const object = Game.getObjectById(extension[i]);
            if (object) {
                if (object.energy === object.energyCapacity || _.filter(Game.creeps, (c) => c.memory.storageDestination === object.id).length > 0) {
                    continue;
                }
                const extensionDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.4, 0) + 1;
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
    //Tower
    let tower = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'tower'), 'id');
    let harvester = _.filter(Game.creeps, (h) => h.memory.assignedSpawn === this.memory.assignedSpawn && (h.memory.role === 'stationaryHarvester' || h.memory.role === 'basicHarvester'));
    if (tower.length > 0 && harvester.length >= 2) {
        let towers = [];
        for (let i = 0; i < tower.length; i++) {
            const object = Game.getObjectById(tower[i]);
            if (object) {
                if (object.pos.getRangeTo(this) > 1) {
                    if (object.room.memory.responseNeeded === true) {
                        const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.01, 0);
                        towers.push({
                            id: tower[i],
                            distWeighted: towerDistWeighted,
                            harvest: false
                        });
                    } else if (object.energy < object.energyCapacity / 2) {
                        const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.1, 0);
                        towers.push({
                            id: tower[i],
                            distWeighted: towerDistWeighted,
                            harvest: false
                        });
                    } else {
                        const towerAmountWeighted = 1.01 - (object.energy / object.energyCapacity);
                        const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 1, 0) + 1 - towerAmountWeighted;
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
    //Terminal room.memory.energySurplus
    let terminal = _.pluck(_.filter(this.room.memory.structureCache, 'type', 'terminal'), 'id');
    if (terminal.length > 0) {
        let terminals = [];
        for (let i = 0; i < terminal.length; i++) {
            const object = Game.getObjectById(terminal[i]);
            if (object) {
                if (object.pos.getRangeTo(this) > 1) {
                    if (object.room.memory.energySurplus && object.store[RESOURCE_ENERGY] < ENERGY_AMOUNT * 0.5) {
                        const terminalDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.1, 0) + 1;
                        terminals.push({
                            id: terminal[i],
                            distWeighted: terminalDistWeighted,
                            harvest: false
                        });
                    } else {
                        const terminalDistWeighted = _.round(object.pos.rangeToTarget(this) * 1.1, 0) + 1;
                        terminals.push({
                            id: terminal[i],
                            distWeighted: terminalDistWeighted,
                            harvest: false
                        });
                    }
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
    let sorted = _.min(storage, 'distWeighted');
    if (sorted) {
        let storageItem = Game.getObjectById(sorted.id);
        if (storageItem) {
            if (this.transfer(storageItem, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                if (storageItem.memory) {
                    storageItem.memory.deliveryIncoming = true;
                }
                this.memory.storageDestination = storageItem.id;
                this.shibMove(storageItem);
            }
            return true;
        } else {
            return undefined;
        }
    }
};
Creep.prototype.findEssentials = profiler.registerFN(findEssentials, 'findEssentialsCreepFunctions');

findDeliveries = function () {
    //Deliveries
    let deliver = _.filter(Game.creeps, (c) => c.memory.deliveryRequested === true && !c.memory.deliveryIncoming && c.pos.roomName === this.pos.roomName);
    if (deliver.length > 0) {
        let deliveries = [];
        for (let i = 0; i < deliver.length; i++) {
            if (deliver[i].pos.getRangeTo(this) > 1) {
                if (this.carry[RESOURCE_ENERGY] < deliver.carryCapacity - _.sum(deliver.carry)) {
                    continue;
                }
                const deliverDistWeighted = _.round(deliver[i].pos.rangeToTarget(this) * 0.3, 0) + 1;
                deliveries.push({
                    id: deliver[i].id,
                    distWeighted: deliverDistWeighted,
                    harvest: false
                });
            }
        }
        if (Game.getObjectById(_.min(deliveries, 'distWeighted').id)) {
            this.memory.storageDestination = _.min(deliveries, 'distWeighted').id;
            Game.getObjectById(_.min(deliveries, 'distWeighted').id).memory.deliveryIncoming = true;
            return true;
        }
    }
};
Creep.prototype.findDeliveries = profiler.registerFN(findDeliveries, 'findDeliveriesCreepFunctions');

/**
 * Globally patch creep actions to log error codes.
 */
['attack', 'attackController', 'build', 'claimController', 'dismantle', 'drop',
    'generateSafeMode', 'harvest', 'heal', 'move', 'moveByPath', 'moveTo', 'pickup',
    'rangedAttack', 'rangedHeal', 'rangedMassAttack', 'repair', 'reserveController',
    'signController', 'suicide', 'transfer', 'upgradeController', 'withdraw'].forEach(function (method) {
    let original = Creep.prototype[method];
    // Magic
    Creep.prototype[method] = function () {
        let status = original.apply(this, arguments);
        if (typeof status === 'number' && status < 0 && status !== -9) {
            console.log(`Creep ${this.name} action ${method} failed with status ${status} at ${this.pos}`);
        }
        return status;
    }
});

/**
 * Set the unit to idle-mode until recall tick
 *
 * @type {int}
 */
Object.defineProperty(Creep.prototype, "idle", {
    configurable: true,
    get: function () {
        if (this.memory.idle === undefined) return 0;
        if (this.memory.idle <= Game.time) {
            this.idle = undefined;
            return 0;
        }
        return this.memory.idle;
    },
    set: function (val) {
        if (!val && this.memory.idle) {
            delete(this.memory.idle);
        }
        else {
            this.memory.idle = val;
        }
    }
});

/**
 * Set the unit to idle-mode for ticks given
 *
 * @type {int}
 */
Creep.prototype.idleFor = function (ticks = 0) {
    if (ticks > 0) {
        this.idle = Game.time + ticks;
    }
    else {
        this.idle = undefined;
    }
};

/* Usage:
 In the loop that executes all creeps, add something like:
 if(creep.idle) continue;

 And if you want to idle something, for example between mineral mine actions you just do:
 creep.idleFor(6);
 *///Room intel
Creep.prototype.cacheRoomIntel = function () {
    let room = Game.rooms[this.pos.roomName];
    let owner = undefined;
    let reservation = undefined;
    let reservationTick = undefined;
    let level = undefined;
    let hostiles = undefined;
    let sk = undefined;
    let towers = undefined;
    if (room) {
        let cache = Memory.roomCache || {};
        let sources = room.find(FIND_SOURCES);
        hostiles = room.find(FIND_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false});
        towers = room.find(FIND_STRUCTURES, {filter: (e) => e.structureType === STRUCTURE_TOWER && _.includes(RawMemory.segments[2], e.owner['username']) === false});
        if (room.find(FIND_STRUCTURES, {filter: (e) => e.structureType === STRUCTURE_KEEPER_LAIR}).length > 0) sk = true;
        let minerals = room.find(FIND_MINERALS);
        if (room.controller) {
            owner = room.controller.owner;
            level = room.controller.level;
            if (room.controller.reservation) {
                reservation = room.controller.reservation.username;
                reservationTick = room.controller.reservation.ticksToEnd + Game.time;
            }
        }
        let key = room.name;
        if (Memory.roomCache[key]) delete Memory.roomCache[key];
        cache[key] = {
            cached: Game.time,
            name: room.name,
            sources: sources,
            minerals: minerals,
            owner: owner,
            reservation: reservation,
            reservationTick: reservationTick,
            level: level,
            towers: towers.length,
            hostiles: hostiles.length,
            sk: sk
        };
        Memory.roomCache = cache;
        if ((sk || sources.length > 0) && !owner) {
            for (let key in Game.spawns) {
                if (Game.map.findRoute(Game.spawns[key].pos.roomName, room.name).length <= 2) {
                    if (sk) {
                        if (Game.spawns[key].room.memory.skRooms) {
                            if (_.includes(Game.spawns[key].room.memory.skRooms, room.name) === false) {
                                Game.spawns[key].room.memory.skRooms.push(room.name);
                            }
                        } else {
                            Game.spawns[key].room.memory.skRooms = [];
                        }
                    }
                    if (Game.map.findRoute(Game.spawns[key].pos.roomName, room.name).length <= 3 && !owner && !sk && !reservation) {
                        if (Game.spawns[key].room.memory.remoteRooms) {
                            if (_.includes(Game.spawns[key].room.memory.remoteRooms, room.name) === false) {
                                Game.spawns[key].room.memory.remoteRooms.push(room.name);
                            }
                        } else {
                            Game.spawns[key].room.memory.remoteRooms = [];
                        }
                    } else if (_.includes(Game.spawns[key].room.memory.remoteRooms, room.name) === true) {
                        _.remove(Game.spawns[key].room.memory.remoteRooms, room.name);
                    }
                }
            }
        } else if (owner) {
            for (let key in Game.spawns) {
                if (_.includes(Game.spawns[key].room.memory.remoteRooms, room.name) === true) {
                    let newArray = _.filter(Game.spawns[key].room.memory.remoteRooms, (e) => e !== room.name);
                    delete Game.spawns[key].room.memory.remoteRooms;
                    Game.spawns[key].room.memory.remoteRooms = newArray;
                }
            }
        }
    }
};


Creep.prototype.renewalCheck = function (level = 7) {
    if (Game.time % 10 !== 0) return false;
    let renewers = _.filter(Game.creeps, (c) => c.memory.renewing && c.memory.assignedRoom === this.memory.assignedRoom);
    if (Game.rooms[this.memory.assignedRoom].controller && ((this.memory.renewing && Game.rooms[this.memory.assignedRoom].energyAvailable >= 300) || (Game.rooms[this.memory.assignedRoom].controller.level >= level && Game.rooms[this.memory.assignedRoom].energyAvailable >= 300 && this.ticksToLive < 100 && renewers.length < 2))) {
        if (this.ticksToLive >= 1000) {
            this.memory.boostAttempt = undefined;
            this.memory.boosted = undefined;
            return this.memory.renewing = undefined;
        }
        let spawn = this.pos.findClosestByRange(FIND_MY_SPAWNS);
        if (spawn) {
            if (spawn.pos.getRangeTo(this) === 1) {
                if (!spawn.spawning) spawn.renewCreep(this);
                if (this.carry[RESOURCE_ENERGY] > 0 && !spawn.spawning) this.transfer(spawn, RESOURCE_ENERGY);
                return true;
            }
            this.say(ICONS.tired);
            this.memory.renewing = true;
            return true;
        }
    }
    this.memory.renewing = undefined;
    return false;
};


Creep.prototype.invaderCheck = function () {
    if (this.room.memory.lastInvaderCheck === Game.time) return;
    this.room.memory.lastInvaderCheck = Game.time;
    let creeps = this.room.find(FIND_CREEPS);
    let invader = _.filter(creeps, (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false);
    if (invader.length > 0) {
        this.room.memory.responseNeeded = true;
        this.room.memory.tickDetected = Game.time;
        if (!this.room.memory.numberOfHostiles || this.room.memory.numberOfHostiles < invader.length) {
            this.room.memory.numberOfHostiles = invader.length;
        }
    } else if (this.room.memory.tickDetected < Game.time - 30 || this.room.memory.responseNeeded === false) {
        this.room.memory.numberOfHostiles = undefined;
        this.room.memory.responseNeeded = undefined;
        this.room.memory.alertEmail = undefined;
    }
};