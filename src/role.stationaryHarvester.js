/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');


function role(creep) {
    if (creep.tryToBoost(['harvest'])) return;
    //If source is set harvest
    if (creep.memory.source) {
        //Make sure you're on the container
        if (!creep.memory.onContainer && creep.memory.containerID) {
            let container = Game.getObjectById(creep.memory.containerID);
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
                if (creep.memory.containerID && creep.memory.linkID && Game.time % 3 === 0 && Game.getObjectById(creep.memory.containerID).store[RESOURCE_ENERGY] > 10) creep.withdraw(Game.getObjectById(creep.memory.containerID), RESOURCE_ENERGY);
                if (creep.carry.energy === creep.carryCapacity) return depositEnergy(creep);
                break;
        }
    } else {
        if (!creep.findSource()) {
            let oldestHarvester = _.min(_.filter(creep.room.creeps, (c) => c.memory && c.memory.role === 'stationaryHarvester'), 'ticksToLive');
            creep.shibMove(oldestHarvester);
            if (creep.pos.getRangeTo(oldestHarvester) <= 2) {
                if (oldestHarvester.ticksToLive < 50) {
                    oldestHarvester.suicide()
                } else {
                    oldestHarvester.memory.role = 'worker';
                }
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'harvesterRole');

function depositEnergy(creep) {
    //Attempt to build extensions
    if (!creep.memory.extensionBuilt || creep.memory.storedLevel !== creep.room.controller.level) extensionBuilder(creep);
    //Find container
    if (!creep.memory.containerAttempt && !creep.memory.containerID) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
    //Check if there is extensions
    if (!creep.memory.extensionsFound) extensionFinder(creep);
    //Fill extensions if you have any stored
    if (creep.memory.extensions && extensionFiller(creep)) {
        return;
    } else if (creep.memory.linkID) {
        let link = Game.getObjectById(creep.memory.linkID);
        creep.transfer(link, RESOURCE_ENERGY);
    } else if (!creep.memory.linkAttempt) {
        creep.memory.linkID = harvestDepositLink(creep)
    } else if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (_.sum(container.store) !== container.storeCapacity) {
            creep.transfer(container, RESOURCE_ENERGY);
            creep.memory.linkDrop = true;
        } else {
            creep.idleFor(15);
        }
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
    if (!creep.room.memory.controllerLink && !creep.room.memory.storageLink) return;
    let source = Game.getObjectById(creep.memory.source);
    let link = _.filter(source.pos.findInRange(creep.room.structures, 2), (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.controllerLink)[0];
    if (link) {
        if (creep.pos.getRangeTo(link) <= 1) {
            return link.id;
        } else if (creep.pos.getRangeTo(link) <= 3) {
            creep.shibMove(link);
            return link.id;
        }
    } else {
        let storageLink = Game.getObjectById(creep.room.memory.storageLink);
        if (creep.pos.getRangeTo(storageLink) <= 6 && (!creep.room.memory.storageLink || !creep.room.memory.controllerLink)) return;
        let container = Game.getObjectById(creep.memory.containerID);
        let inBuild = _.filter(source.pos.findInRange(FIND_CONSTRUCTION_SITES, 2), (s) => s.structureType === STRUCTURE_LINK)[0];
        if (!inBuild && container) {
            let zoneTerrain = creep.room.lookForAtArea(LOOK_TERRAIN, container.pos.y - 1, container.pos.x - 1, container.pos.y + 1, container.pos.x + 1, true);
            for (let key in zoneTerrain) {
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, creep.room.name);
                if (position.checkForAllStructure().length > 0) continue;
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
        if (!site && creep.pos.rangeToTarget(source) === 1) creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
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