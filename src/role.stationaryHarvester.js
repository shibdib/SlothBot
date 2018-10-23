/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');


function role(creep) {
    //if (creep.renewalCheck(4)) return creep.shibMove(creep.pos.findClosestByRange(FIND_MY_SPAWNS));
    if (creep.tryToBoost(['harvest'])) return;
    let source;
    if (creep.carry.ticksToLive <= 5) {
        depositEnergy(creep);
        creep.suicide();
        return;
    }
    //Attempt to build extensions
    if (!creep.memory.extensionBuilt || creep.memory.storedLevel !== creep.room.controller.level) extensionBuilder(creep);
    //If source is set harvest
    if (creep.memory.source) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container && creep.pos.getRangeTo(container) > 0) return creep.shibMove(container, {range: 0});
        source = Game.getObjectById(creep.memory.source);
        switch (creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(source);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(source.ticksToRegeneration + 1);
                break;
            case OK:
                if (container && Game.getObjectById(creep.memory.linkID) && creep.room.memory.storageLink && container.store[RESOURCE_ENERGY] > 10) creep.withdraw(container, RESOURCE_ENERGY);
                if (creep.carry.energy === creep.carryCapacity) {
                    if (creep.memory.upgrade || (creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username === USERNAME && creep.room.controller.ticksToDowngrade < 1000)) {
                        creep.memory.upgrade = true;
                        if (creep.room.controller.ticksToDowngrade >= 2000) {
                            delete creep.memory.upgrade;
                            delete creep.memory.hauling;
                        }
                        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(creep.room.controller);
                        }
                        return;
                    }
                    return depositEnergy(creep);
                }
                break;
        }
    } else {
        if (!creep.findSource()) {
            let oldestHarvester = _.min(_.filter(creep.room.creeps, (c) => c.memory && c.memory.role === 'stationaryHarvester'), 'ticksToLive');
            creep.shibMove(oldestHarvester);
        }
    }
}

module.exports.role = profiler.registerFN(role, 'harvesterRole');

function depositEnergy(creep) {
    let link;
    if (!creep.memory.containerID) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
    //Check if there is extensions
    if (creep.memory.containerID) {
        let extension = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_EXTENSION && s.pos.getRangeTo(creep) === 1 && s.energy < s.energyCapacity)[0];
        if (extension) {
            switch (creep.transfer(extension, RESOURCE_ENERGY)) {
                case OK:
                    return;
            }
        }
        //Make sure you're on the container
        if (creep.memory.containerID && !creep.memory.onContainer) {
            let container = Game.getObjectById(creep.memory.containerID);
            if (container && creep.pos.getRangeTo(container) > 0) {
                return creep.shibMove(container, {range: 0});
            } else if (container) {
                creep.memory.onContainer = true;
            }
        }
        //Find link
        if (!creep.memory.linkID) {
            creep.memory.linkID = harvestDepositLink(creep);
        } else {
            link = Game.getObjectById(creep.memory.linkID);
        }
        //Drop in container
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            let controllerLink = Game.getObjectById(creep.room.memory.controllerLink);
            if (creep.carry[RESOURCE_ENERGY] > 20 && container.hits < container.hitsMax * 0.25) {
                creep.repair(container);
                creep.say('Fixing');
            } else if (link && link.energy !== link.energyCapacity && controllerLink && controllerLink.energy < 400 && (creep.memory.linkDrop || creep.room.memory.storageLink || _.sum(container.store) === container.storeCapacity)) {
                creep.transfer(link, RESOURCE_ENERGY);
                creep.memory.linkDrop = undefined;
            } else if (_.sum(container.store) !== container.storeCapacity) {
                creep.transfer(container, RESOURCE_ENERGY);
                creep.memory.linkDrop = true;
            } else {
                creep.idleFor(15);
            }
        }
    }
}

function harvestDepositLink(creep) {
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
        let storageLink = Game.getObjectById(creep.memory.storageLink);
        if (creep.pos.getRangeTo(storageLink) <= 6) return;
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