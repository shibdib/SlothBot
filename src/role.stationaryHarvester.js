/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //If source is set harvest
    if (creep.memory.source) {
        let container = Game.getObjectById(creep.memory.containerID);
        //Make sure you're on the container
        if (!creep.memory.onContainer && creep.memory.containerID) {
            if (container && creep.pos.getRangeTo(container) > 0) {
                return creep.shibMove(container, {range: 0});
            } else if (container) {
                creep.memory.onContainer = true;
            }
        }
        let source = Game.getObjectById(creep.memory.source);
        switch (creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(source);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(source.ticksToRegeneration + 1);
                break;
            case OK:
                if (container && container.store[RESOURCE_ENERGY] > 10 && creep.memory.linkID && Game.time % 3 === 0) creep.withdraw(container, RESOURCE_ENERGY);
                if (_.sum(creep.carry) === creep.carryCapacity) return depositEnergy(creep);
                break;
        }
    } else {
        if (!creep.findSource()) {
            let oldestHarvester = _.min(_.filter(creep.room.creeps, (c) => c.memory && c.memory.role === 'stationaryHarvester'), 'ticksToLive');
            creep.shibMove(oldestHarvester);
            if (creep.pos.getRangeTo(oldestHarvester) <= 2) {
                oldestHarvester.memory.recycle = true;
            }
        }
    }
};

function depositEnergy(creep) {
    //Attempt to build extensions
    if (!creep.memory.extensionBuilt || creep.memory.storedLevel !== creep.room.controller.level) extensionBuilder(creep);
    //Find container
    if (!creep.memory.containerAttempt && !creep.memory.containerID) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
    //Check if there is extensions
    if (!creep.memory.extensionsFound) extensionFinder(creep);
    //Fill extensions if you have any stored
    if (creep.memory.extensions && extensionFiller(creep)) return;
    let container = Game.getObjectById(creep.memory.containerID);
    let link = Game.getObjectById(creep.memory.linkID);
    if (link) {
        if (container) {
            if (container.pos.getRangeTo(link) > 1) return link.destroy();
            if (container.hits < container.hitsMax * 0.5) {
                return creep.repair(container);
            }
        }
        if (link.energy < link.energyCapacity) {
            creep.transfer(link, RESOURCE_ENERGY);
        } else if (container && _.sum(container.store) >= 1900) {
            creep.idleFor(20);
        }
    } else if (!creep.memory.linkAttempt) {
        creep.memory.linkID = harvestDepositLink(creep)
    } else if (container) {
        if (container.hits < container.hitsMax * 0.5) {
            return creep.repair(container);
        } else if (_.sum(container.store) >= 1900) {
            creep.idleFor(20);
        }
    } else {
        creep.memory.containerID = undefined;
        creep.memory.linkID = undefined;
    }
}

function extensionFinder(creep) {
    creep.memory.extensionsFound = true;
    let container = Game.getObjectById(creep.memory.containerID);
    let extension = _.pluck(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_EXTENSION && s.pos.getRangeTo(container) === 1), 'id');
    if (extension.length) creep.memory.extensions = JSON.stringify(extension);
}

function extensionFiller(creep) {
    let rawExtension = JSON.parse(creep.memory.extensions);
    for (let id of rawExtension) {
        let extension = Game.getObjectById(id);
        if (extension.energy < extension.energyCapacity) {
            creep.transfer(extension, RESOURCE_ENERGY);
            return true;
        }
    }
    return false;
}

function harvestDepositLink(creep) {
    creep.memory.linkAttempt = true;
    let container = Game.getObjectById(creep.memory.containerID);
    if (!container || (!creep.room.memory.controllerLink && !creep.room.memory.hubLink)) return;
    let source = Game.getObjectById(creep.memory.source);
    let link = _.filter(container.pos.findInRange(creep.room.structures, 1), (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.controllerLink)[0];
    if (link) {
        if (creep.pos.getRangeTo(link) <= 1) {
            return link.id;
        } else if (creep.pos.getRangeTo(link) <= 3) {
            creep.shibMove(link);
            return link.id;
        }
    } else {
        let container = Game.getObjectById(creep.memory.containerID);
        let inBuild = _.filter(source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2), (s) => s.structureType === STRUCTURE_LINK)[0];
        if (!inBuild && container) {
            let otherHarvester = _.filter(creep.room.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester' && !c.memory.linkID && c.memory.containerID && c.id !== creep.id)[0];
            if (otherHarvester) {
                let hub = new RoomPosition(creep.room.memory.bunkerHub.x, creep.room.memory.bunkerHub.y, creep.room.name);
                if (otherHarvester.pos.getRangeTo(hub) > creep.pos.getRangeTo(hub)) return;
            }
            let zoneTerrain = creep.room.lookForAtArea(LOOK_TERRAIN, container.pos.y - 1, container.pos.x - 1, container.pos.y + 1, container.pos.x + 1, true);
            for (let key in zoneTerrain) {
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, creep.room.name);
                if (position.checkForAllStructure().length > 0 || position.getRangeTo(creep.room.controller) < 3) continue;
                try {
                    position.createConstructionSite(STRUCTURE_LINK);
                } catch (e) {
                }
            }
        }
    }
}

function harvestDepositContainer(source, creep) {
    creep.memory.containerAttempt = true;
    let container = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) === 1});
    if (container) {
        return container.id;
    } else {
        let site = source.pos.findClosestByRange(creep.room.constructionSites, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
        if (!site && creep.pos.getRangeTo(source) === 1 && creep.room.controller.level >= 2) creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
    }
}

function extensionBuilder(creep) {
    let container = Game.getObjectById(creep.memory.containerID);
    let inBuild = Game.getObjectById(creep.containerBuilding());
    if ((container && creep.pos.getRangeTo(container) > 0) || (inBuild && creep.pos.getRangeTo(inBuild) > 0)) {
        let moveTo = container || inBuild;
        return creep.shibMove(moveTo, {range: 0});
    } else if (container || inBuild) {
        let count = 0;
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (xOff !== 0 || yOff !== 0) {
                    let pos = new RoomPosition(creep.pos.x + xOff, creep.pos.y + yOff, creep.room.name);
                    if (pos.checkForWall() || pos.checkForConstructionSites() || pos.checkForObstacleStructure()) continue;
                    count++;
                    if ((!creep.memory.linkID && count < 3) || (creep.memory.linkID && count < 2)) continue;
                    pos.createConstructionSite(STRUCTURE_EXTENSION)
                }
            }
        }
        creep.memory.extensionBuilt = true;
        creep.memory.storedLevel = creep.room.controller.level;
    }
}