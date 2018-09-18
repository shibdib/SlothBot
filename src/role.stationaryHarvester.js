/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    //if (creep.renewalCheck(4)) return creep.shibMove(creep.pos.findClosestByRange(FIND_MY_SPAWNS));
    let source;
//INITIAL CHECKS
    if (creep.carry.ticksToLive <= 5) {
        depositEnergy(creep);
        creep.suicide();
        return null;
    }
    if (creep.memory.source) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (!creep.memory.onContainer) {
            if (container && creep.pos.getRangeTo(container) > 0) {
                creep.shibMove(container, {range: 0});
            } else if (container) {
                creep.memory.onContainer = true;
            }
        }
        source = Game.getObjectById(creep.memory.source);
        switch (creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(source);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(source.ticksToRegeneration + 1);
                break;
            case OK:
                break;
        }
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
                return null;
            }
            depositEnergy(creep);
        }
    } else {
        if (!creep.findSource()) {
            let oldestHarvester = _.min(_.filter(creep.room.creeps, (c) => c.memory && c.memory.role === 'stationaryHarvester'), 'ticksToLive');
            creep.memory.source = oldestHarvester.memory.source;
        }
    }
}
module.exports.role = profiler.registerFN(role, 'harvesterRole');

function depositEnergy(creep) {
    if (creep.room.controller.level === 1 && creep.room.creeps.length < 3) {
        let storageItem = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my)[0];
        switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
            case OK:
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(storageItem);
                break;
            case ERR_FULL:
                break;
        }
    }
    if (creep.room.controller.level < 3) return;
    let link;
    if (!creep.memory.containerID) creep.memory.containerID = creep.harvestDepositContainer();
    if (!creep.memory.linkID) {
        creep.memory.linkID = harvestDepositLink(creep);
    } else {
        link = Game.getObjectById(creep.memory.linkID);
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (!container.pos.checkForRampart()) {
                container.pos.createConstructionSite(STRUCTURE_RAMPART);
            }
            let controllerLink = Game.getObjectById(creep.room.memory.controllerLink);
            if (creep.carry[RESOURCE_ENERGY] > 20 && container.hits < container.hitsMax * 0.25) {
                creep.repair(container);
                creep.say('Fixing');
            } else if (link && link.energy !== link.energyCapacity && controllerLink && controllerLink.energy < 400 && (creep.memory.linkDrop || creep.room.memory.storageLink)) {
                creep.transfer(link, RESOURCE_ENERGY);
                creep.memory.linkDrop = undefined;
            } else {
                creep.transfer(container, RESOURCE_ENERGY);
                creep.memory.linkDrop = true;
            }
        }
    } else {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (!buildSite) {
            creep.harvesterContainerBuild();
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