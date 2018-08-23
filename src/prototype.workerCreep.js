const profiler = require('screeps-profiler');

wrongRoom = function () {
    if (this.memory.overlord && this.pos.roomName !== this.memory.overlord) {
        this.shibMove(new RoomPosition(25, 25, this.memory.overlord), {range: 15});
        return true;
    }
};
Creep.prototype.wrongRoom = profiler.registerFN(wrongRoom, 'wrongRoomCheck');

Creep.prototype.findSource = function (ignoreOthers = false) {
    let source = shuffle(this.room.sources);
    if (this.memory.role === 'stationaryHarvester') source = _.filter(this.room.sources, (s) => _.filter(Game.creeps, (c) => c.id !== this.id && c.memory.role === 'stationaryHarvester' && c.memory.source === s.id).length === 0);
    if (this.memory.role === 'remoteHarvester') source = _.filter(this.room.sources, (s) => _.filter(Game.creeps, (c) => c.id !== this.id && c.memory.role === 'remoteHarvester' && c.memory.source === s.id).length === 0);
    if (ignoreOthers) source = this.room.sources;
    if (source.length > 0) {
        this.memory.source = this.pos.findClosestByRange(source).id;
        return this.pos.findClosestByRange(source).id;
    }
    return null;
};

Creep.prototype.findMineral = function () {
    const mineral = this.room.mineral;
    if (mineral.length > 0) {
        for (let i = 0; i < mineral.length; i++) {
            if (_.filter(mineral[i].pos.findInRange(FIND_CREEPS, 2), (c) => c.memory && (c.memory.role === 'remoteHarvester' || c.memory.role === 'stationaryHarvester' || c.memory.role === 'SKworker' || c.memory.role === 'mineralHarvester')).length === 0) {
                if (this.shibMove(mineral[i]) !== ERR_NO_PATH) {
                    if (mineral[i].id) {
                        this.memory.source = mineral[i].id;
                        return mineral[i];
                    }
                }
            }
        }
    }
    return null;
};

Creep.prototype.findConstruction = function () {
    let construction = this.room.constructionSites;
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax);
    let site = _.filter(construction, (s) => s.structureType === STRUCTURE_TOWER);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_SPAWN);
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
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_STORAGE);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_CONTAINER);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    site = shuffle(_.filter(construction, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART));
    if (site.length > 0) {
        this.memory.constructionSite = site[0].id;
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
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 10000);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(construction, (s) => s.structureType === STRUCTURE_RAMPART);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'build';
        return true;
    }
    this.memory.constructionSite = undefined;
    this.memory.task = undefined;
    return null;
};

findRepair = function (level) {
    let structures = _.filter(this.room.structures, (s) => s.hits < s.hitsMax);
    let site = _.filter(structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.hits < 75000);
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
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_EXTENSION && s.hits < s.hitsMax);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_ROAD && s.hits < s.hitsMax / 2);
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
    site = _.filter(structures, (s) => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_RAMPART && s.hits < s.hitsMax);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_WALL && s.hits < 100000 * level);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    site = _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 100000 * level);
    if (site.length > 0) {
        site = this.pos.findClosestByRange(site);
        this.memory.constructionSite = site.id;
        this.memory.task = 'repair';
        return;
    }
    this.memory.constructionSite = undefined;
    this.memory.task = undefined;
};
Creep.prototype.findRepair = profiler.registerFN(findRepair, 'findRepairCreepFunctions');

containerBuilding = function () {
    let site = this.pos.findClosestByRange(this.room.constructionSites, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (site !== null && site !== undefined) {
        if (this.pos.getRangeTo(site) <= 1) {
            return site.id;
        }
    }
};
Creep.prototype.containerBuilding = profiler.registerFN(containerBuilding, 'containerBuildingCreepFunctions');

harvestDepositContainer = function () {
    let container = this.pos.findClosestByRange(this.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (container) {
        if (this.pos.getRangeTo(container) <= 1) {
            return container.id;
        } else if (this.pos.getRangeTo(container) <= 3) {
            this.shibMove(container);
            return container.id;
        }
    } else {
        this.harvesterContainerBuild();
    }
};
Creep.prototype.harvestDepositContainer = profiler.registerFN(harvestDepositContainer, 'harvestDepositContainerCreepFunctions');

harvesterContainerBuild = function () {
    if (this.memory.source && this.pos.getRangeTo(Game.getObjectById(this.memory.source)) <= 1) {
        if (Game.getObjectById(this.memory.source).pos.findInRange(FIND_CONSTRUCTION_SITES, 1).length) return;
        if (this.pos.createConstructionSite(STRUCTURE_CONTAINER) !== OK) {
            return null;
        }
    }
};
Creep.prototype.harvesterContainerBuild = profiler.registerFN(harvesterContainerBuild, 'harvesterContainerBuildCreepFunctions');

Creep.prototype.withdrawEnergy = function () {
    if (!this.memory.energyDestination) {
        return null;
    } else {
        let energyItem = Game.getObjectById(this.memory.energyDestination);
        if (energyItem) {
            switch (this.withdraw(energyItem, RESOURCE_ENERGY)) {
                case OK:
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    break;
                case ERR_INVALID_TARGET:
                    switch (this.pickup(energyItem)) {
                        case OK:
                            this.memory.energyDestination = undefined;
                            this.memory._shibMove = undefined;
                            break;
                        case ERR_NOT_IN_RANGE:
                            this.shibMove(energyItem);
                            break;
                        case ERR_FULL:
                            this.memory.energyDestination = undefined;
                            this.memory._shibMove = undefined;
                            break;
                        case ERR_INVALID_TARGET:
                            switch (energyItem.transfer(this, RESOURCE_ENERGY)) {
                                case OK:
                                    this.memory.energyDestination = undefined;
                                    this.memory._shibMove = undefined;
                                    break;
                                case ERR_NOT_IN_RANGE:
                                    this.shibMove(energyItem);
                                    break;
                                case ERR_FULL:
                                    this.memory.energyDestination = undefined;
                                    this.memory._shibMove = undefined;
                                    break;
                            }
                            break;
                    }
                    break;
                case ERR_NOT_IN_RANGE:
                    this.shibMove(energyItem);
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    break;
                case ERR_FULL:
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    break;
                case ERR_INVALID_ARGS:
                    this.memory.energyDestination = undefined;
                    this.memory._shibMove = undefined;
                    break;
            }
        } else {
            delete this.memory.energyDestination;
        }
    }
};

Creep.prototype.findEnergy = function (range = 250, hauler = false) {
    let energy = [];
    //Container
    let container = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= 100);
    if (container.length > 0) {
        let containers = [];
        for (let i = 0; i < container.length; i++) {
            const object = container[i];
            if (object && object.pos.rangeToTarget(this) <= range) {
                let weight = 0.3;
                if (object.id === this.room.memory.controllerContainer) weight = 25;
                let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id && c.id !== this.id).length;
                if (numberOfUsers > object.store[RESOURCE_ENERGY] / 150) continue;
                if (object.store[RESOURCE_ENERGY] > 1500) weight = 0.1;
                const containerDistWeighted = _.round(object.pos.rangeToTarget(this) * weight, 0) + 1;
                containers.push({
                    id: container[i].id,
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
    //Storage
    let sStorage = this.room.storage;
    if (sStorage && sStorage.store[RESOURCE_ENERGY] > ENERGY_AMOUNT * 0.5 && sStorage.pos.rangeToTarget(this) <= range) {
        let weight;
        weight = 0.3;
        if (sStorage.store[RESOURCE_ENERGY] < 1000) {
            weight = 0.1;
        }
        if (this.room.memory.responseNeeded) {
            weight = 0.8;
        }
        const storageDistWeighted = _.round(sStorage.pos.rangeToTarget(this) * weight, 0) + 1;
        energy.push({
            id: sStorage.id,
            distWeighted: storageDistWeighted,
            harvest: false
        });
    }
    //Terminal
    let terminal = this.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] >= 20000 && terminal.pos.rangeToTarget(this) <= range) {
        let weight = 0.3;
        let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === terminal.id && c.id !== this.id).length;
        if (terminal.store[RESOURCE_ENERGY] <= ENERGY_AMOUNT * 0.5) weight = 0.2;
        const terminalDistWeighted = _.round(terminal.pos.rangeToTarget(this) * weight, 0) + 1 + (numberOfUsers / 2);
        energy.push({
            id: terminal.id,
            distWeighted: terminalDistWeighted,
            harvest: false
        });
    }
    //Take straight from harvesters at low level
    if (this.room.controller.level < 5) {
        let harvester = shuffle(_.filter(this.room.creeps, (c) => c.memory && c.memory.role === 'stationaryHarvester' && c.carry[RESOURCE_ENERGY] > 25))[0];
        if (harvester) {
            let weight = 0.3;
            const harvesterDistWeighted = _.round(harvester.pos.rangeToTarget(this) * weight, 0) + 1;
            energy.push({
                id: harvester.id,
                distWeighted: harvesterDistWeighted,
                harvest: false
            });
        }
    }
    //Dropped
    let dropped = shuffle(this.room.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= 50}))[0];
    if (dropped) {
        let weight = 0.5;
        let droppedDistWeighted = _.round(dropped.pos.rangeToTarget(this) * weight, 0) + 1;
        energy.push({
            id: dropped.id,
            distWeighted: droppedDistWeighted,
            harvest: false
        });
    }

    let sorted = _.min(energy, 'distWeighted');

    if (sorted) {
        if (sorted.harvest === false) {
            let energyItem = Game.getObjectById(sorted.id);
            if (energyItem) {
                this.memory.energyDestination = energyItem.id;
            } else {
                this.memory.energyDestination = undefined;
                return null;
            }
        }
    } else {
        this.memory.energyDestination = undefined;
    }
};

Creep.prototype.getEnergy = function (range = 250, hauler = false) {
    let energy = [];
    //Container
    let container = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] >= 100);
    if (container.length > 0) {
        let containers = [];
        for (let i = 0; i < container.length; i++) {
            const object = container[i];
            if (object && object.pos.rangeToTarget(this) <= range) {
                let weight = 0.3;
                if (object.id === this.room.memory.controllerContainer) weight = 25;
                let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id && c.id !== this.id).length;
                if (numberOfUsers > object.store[RESOURCE_ENERGY] / 150) continue;
                if (object.store[RESOURCE_ENERGY] > 1500) weight = 0.3;
                const containerDistWeighted = _.round(object.pos.rangeToTarget(this) * weight, 0) + 1;
                containers.push({
                    id: container[i].id,
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
    if (storageLink && storageLink.energy > 0) {
        let weight = 0.3;
        if (storageLink.energy > 500) weight = 0.05;
        const storageLinkDistWeighted = _.round(storageLink.pos.rangeToTarget(this) * weight, 0) + 1;
        energy.push({
            id: storageLink.id,
            distWeighted: storageLinkDistWeighted,
            harvest: false
        });
    }
    //Terminal
    let terminal = this.room.terminal;
    if (terminal && terminal.store[RESOURCE_ENERGY] && (terminal.store[RESOURCE_ENERGY] >= 10000 || this.room.memory.responseNeeded)) {
        let weight = 0.3;
        let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === terminal.id && c.id !== this.id).length;
        const terminalDistWeighted = _.round(terminal.pos.rangeToTarget(this) * weight, 0) + 1 + (numberOfUsers / 2);
        energy.push({
            id: terminal.id,
            distWeighted: terminalDistWeighted,
            harvest: false
        });
    }
    //Storage
    let sStorage = this.room.storage;
    if (sStorage && sStorage.store[RESOURCE_ENERGY] && (this.room.memory.energySurplus || this.room.memory.responseNeeded)) {
        let weight = 0.5;
        if (this.room.memory.responseNeeded) weight = 0.2;
        const storageDistWeighted = _.round(sStorage.pos.rangeToTarget(this) * weight, 0) + 1;
        energy.push({
            id: sStorage.id,
            distWeighted: storageDistWeighted,
            harvest: false
        });
    }
    //Take straight from harvesters at low level
    if (this.room.controller.level < 5) {
        let harvester = shuffle(_.filter(this.room.creeps, (c) => c.memory && c.memory.role === 'stationaryHarvester' && c.carry[RESOURCE_ENERGY] > 25))[0];
        if (harvester) {
            let weight = 0.6;
            const harvesterDistWeighted = _.round(harvester.pos.rangeToTarget(this) * weight, 0) + 1;
            energy.push({
                id: harvester.id,
                distWeighted: harvesterDistWeighted,
                harvest: false
            });
        }
    }
    //Dropped
    let dropped = shuffle(this.room.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType === RESOURCE_ENERGY && r.amount >= 50}))[0];
    if (dropped) {
        let weight = 0.5;
        let droppedDistWeighted = _.round(dropped.pos.rangeToTarget(this) * weight, 0) + 1;
        energy.push({
            id: dropped.id,
            distWeighted: droppedDistWeighted,
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
        return true;
    } else {
        return undefined;
    }
};

Creep.prototype.findStorage = function () {
    let storage = [];
    let haulingEnergy;
    if (this.carry[RESOURCE_ENERGY] === _.sum(this.carry)) haulingEnergy = true;
    //Storage
    let sStorage = this.room.storage;
    if (sStorage) {
        let weight;
        weight = 0.05;
        if (sStorage.store[RESOURCE_ENERGY] < ENERGY_AMOUNT) weight = 0.3;
        const storageDistWeighted = _.round(sStorage.pos.rangeToTarget(this) * weight, 0) + 1;
        storage.push({
            id: sStorage.id,
            distWeighted: storageDistWeighted,
            harvest: false
        });
    }
    //Tower
    let tower = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    let harvester = _.filter(this.room.creeps, (h) => h.my && h.memory.assignedSpawn === this.memory.assignedSpawn && h.memory.role === 'stationaryHarvester');
    if (tower.length > 0 && harvester.length >= 2 && haulingEnergy) {
        let towers = [];
        for (let i = 0; i < tower.length; i++) {
            const object = tower[i];
            if (object && object.energy < object.energyCapacity && object.pos.getRangeTo(this) > 1) {
                if (object.room.memory.responseNeeded === true) {
                    const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.3, 0);
                    towers.push({
                        id: tower[i].id,
                        distWeighted: towerDistWeighted,
                        harvest: false
                    });
                } else {
                    const towerAmountWeighted = 1.01 - (object.energy / object.energyCapacity);
                    const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 1.2, 0) + 1 - towerAmountWeighted;
                    towers.push({
                        id: tower[i].id,
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
    //Links
    let controllerLink = Game.getObjectById(this.room.memory.controllerLink);
    if (controllerLink && haulingEnergy && !this.room.memory.responseNeeded) {
        let linkDistWeighted;
        const object = controllerLink;
        let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id).length;
        if (object && object.energy < object.energyCapacity / 2 && numberOfUsers === 0) {
            linkDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.4, 0) + 1;
        }
        storage.push({
            id: controllerLink.id,
            distWeighted: linkDistWeighted,
            harvest: false
        });
    }
    //Terminal
    let terminal = this.room.terminal;
    if (terminal && !this.room.memory.responseNeeded) {
        const terminalDistWeighted = _.round(terminal.pos.rangeToTarget(this) * 0.9, 0) + 1;
        storage.push({
            id: terminal.id,
            distWeighted: terminalDistWeighted,
            harvest: false
        });
    }
    //Worker Deliveries
    let workers = _.filter(this.room.creeps, (h) => h.my && h.memory.overlord === this.room.name && (h.memory.role === 'worker' && h.memory.deliveryRequestTime > Game.time - 10 && !h.memory.deliveryIncoming));
    if (workers.length > 0 && this.ticksToLive > 30 && !this.room.memory.responseNeeded && haulingEnergy) {
        let workerWeighted;
        const object = workers[0];
        if (object) {
            workerWeighted = _.round(object.pos.rangeToTarget(this) * 0.2, 0) + 1;
        }
        storage.push({
            id: object.id,
            distWeighted: workerWeighted,
            harvest: false
        });
    }
    //Sort
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
                return true;
            }
        }
        return false;
    }
    return false;
};

Creep.prototype.findEssentials = function () {
    let storage = [];
    let roomSpawnQueue = this.room.memory.creepBuildQueue;
    //Spawn
    let spawn = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_SPAWN);
    if (spawn.length > 0) {
        let spawns = [];
        for (let i = 0; i < spawn.length; i++) {
            const object = spawn[i];
            if (object) {
                if (object.energy === object.energyCapacity || _.filter(Game.creeps, (c) => c.memory.storageDestination === object.id).length > 0) {
                    continue;
                }
                const spawnDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.4, 0) + 1;
                spawns.push({
                    id: spawn[i].id,
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
    let extension = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_EXTENSION);
    if (extension.length > 0) {
        let extensions = [];
        for (let i = 0; i < extension.length; i++) {
            const object = extension[i];
            if (object) {
                if (object.energy === object.energyCapacity || _.filter(Game.creeps, (c) => c.memory.storageDestination === object.id).length > 0) {
                    continue;
                }
                const extensionDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.4, 0) + 1;
                extensions.push({
                    id: extension[i].id,
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
    /**
     //Storage
     let sStorage = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
     if (sStorage) {
        if (sStorage.store[RESOURCE_ENERGY] < ENERGY_AMOUNT) {
            let weight = 0.05;
            const storageDistWeighted = _.round(sStorage.pos.rangeToTarget(this) * weight, 0) + 1;
            storage.push({
                id: sStorage.id,
                distWeighted: storageDistWeighted,
                harvest: false
            });
        }
    }
     **/
        //Tower
    let tower = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    if (tower.length > 0 && !_.includes(roomSpawnQueue, 'responder') && !_.includes(roomSpawnQueue, 'longbow')) {
        let towers = [];
        for (let i = 0; i < tower.length; i++) {
            const object = tower[i];
            if (object && object.energy < object.energyCapacity && object.pos.getRangeTo(this) > 1) {
                if (object.room.memory.responseNeeded === true && object.energy < object.energyCapacity * 0.85) {
                    const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.1, 0);
                    towers.push({
                        id: tower[i].id,
                        distWeighted: towerDistWeighted,
                        harvest: false
                    });
                } else if (object.energy < object.energyCapacity / 2) {
                    const towerDistWeighted = _.round(object.pos.rangeToTarget(this) * 0.25, 0);
                    towers.push({
                        id: tower[i].id,
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
    /**
     //Terminal
     let terminal = this.room.terminal;
     if (terminal && terminal.store[RESOURCE_ENERGY] < 5000) {
        const terminalDistWeighted = _.round(terminal.pos.rangeToTarget(this) * 0.5, 0) + 1;
        storage.push({
            id: terminal.id,
            distWeighted: terminalDistWeighted,
            harvest: false
        });
    }**/
        //Controller Container
    let controllerContainer = Game.getObjectById(this.room.memory.controllerContainer);
    if (controllerContainer && controllerContainer.pos.rangeToTarget(this) > 1) {
        let containerDistWeighted;
        const object = controllerContainer;
        let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id).length;
        if (object && !numberOfUsers) {
            let weight = 0.75;
            if (this.room.energyAvailable > this.room.energyCapacityAvailable * 0.95 && !this.room.memory.responseNeeded) weight = 0.3;
            containerDistWeighted = _.round(object.pos.rangeToTarget(this) * weight, 0) + 1;
        }
        storage.push({
            id: controllerContainer.id,
            distWeighted: containerDistWeighted,
            harvest: false
        });
    }
    /**
     //Storage Link
     let storageLink = Game.getObjectById(this.room.memory.storageLink);
     let controllerLink = Game.getObjectById(this.room.memory.controllerLink);
     if (storageLink && controllerLink && !this.room.memory.responseNeeded && controllerLink.energy < 250) {
        let storageLinkDistWeighted;
        const object = storageLink;
        let numberOfUsers = _.filter(Game.creeps, (c) => c.memory.energyDestination === object.id).length;
        if (object && numberOfUsers === 0) {
            let weight = 0.5;
            storageLinkDistWeighted = _.round(object.pos.rangeToTarget(this) * weight, 0) + 1;
        }
        storage.push({
            id: storageLink.id,
            distWeighted: storageLinkDistWeighted,
            harvest: false
        });
    }**/
        //Nuker
    let nuker = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_NUKER)[0];
    if (nuker) {
        if (nuker.pos.getRangeTo(this) > 1) {
            const nukerDistWeighted = _.round(nuker.pos.rangeToTarget(this) * 0.1, 0) + 1;
            storage.push({
                id: nuker.id,
                distWeighted: nukerDistWeighted,
                harvest: false
            });
        }
    }
    //Sort
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
            return false;
        }
    } else {
        return false;
    }
};

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
 */
