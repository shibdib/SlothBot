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
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    if (creep.carry.ticksToLive <= 5) {
        depositEnergy(creep);
        creep.suicide();
        return null;
    }
    if (creep.carry.energy === 0) {
        creep.memory.hauling = false;
        if (creep.memory.linkID && creep.memory.containerID && pickupDropped(creep)) return null;
    }
    if (creep.memory.source) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (creep.memory.link && container) {
            if (container.store[RESOURCE_ENERGY] > 0) creep.withdraw(container, RESOURCE_ENERGY);
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
                if (container && creep.pos.getRangeTo(container) > 0) creep.shibMove(container, {range: 0});
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
        creep.findSource();
    }
}
module.exports.role = profiler.registerFN(role, 'harvesterRole');

function depositEnergy(creep) {
    let link;
    if (!creep.memory.containerID || Game.getObjectById(creep.memory.containerID).pos.getRangeTo(creep) > 1) {
        creep.memory.containerID = creep.harvestDepositContainer();
    }
    if (!creep.memory.linkID) {
        creep.memory.linkID = harvestDepositLink(creep);
    } else {
        link = Game.getObjectById(creep.memory.linkID);
    }
    if (creep.memory.containerID) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (container) {
            if (creep.pos.getRangeTo(container) > 0) creep.shibMove(container, {range: 0});
            if (creep.carry[RESOURCE_ENERGY] > 20 && container.hits < container.hitsMax * 0.25) {
                creep.repair(container);
                creep.say('Fixing');
            }
            else if (link && link.energy !== link.energyCapacity) {
                if (link.hits < link.hitsMax * 0.25) {
                    creep.repair(link);
                    creep.say('Fixing');
                } else if (link.energy !== link.energyCapacity) {
                    creep.transfer(link, RESOURCE_ENERGY);
                }
            }
        }
    } else {
        let buildSite = Game.getObjectById(creep.containerBuilding());
        if (buildSite) {
            creep.build(buildSite);
        } else {
            creep.harvesterContainerBuild();
        }
    }
}

function harvestDepositLink(creep) {
    if ((!creep.room.memory.storageLink && !creep.room.memory.controllerLink) || !creep.memory.containerID) return;
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
        if (creep.pos.getRangeTo(storageLink) <= 8) return;
        let container = Game.getObjectById(creep.memory.containerID);
        let inBuild = _.filter(container.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_LINK)[0];
        let level = creep.room.controller.level;
        if (!inBuild && container && (level === 5 || level >= 7)) {
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

function pickupDropped(creep) {
    let link = Game.getObjectById(creep.memory.linkID);
    let container = Game.getObjectById(creep.memory.containerID);
    if (creep.pos.getRangeTo(container) === 0 && link.energy < 700 && container.store[RESOURCE_ENERGY] >= 50) {
        creep.withdraw(container, RESOURCE_ENERGY);
        return true;
    }
    return false;
}