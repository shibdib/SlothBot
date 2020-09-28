/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //If source is set harvest
    if (creep.memory.source) {
        //Find container
        if (!creep.memory.containerAttempt && !creep.memory.containerID) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
        let container = Game.getObjectById(creep.memory.containerID);
        //Make sure you're on the container
        if (!creep.memory.onContainer && (container || Game.getObjectById(creep.memory.source).memory.containerPos)) {
            let spot = container || new RoomPosition(JSON.parse(Game.getObjectById(creep.memory.source).memory.containerPos).x, JSON.parse(Game.getObjectById(creep.memory.source).memory.containerPos).y, creep.room.name);
            if (spot && creep.pos.getRangeTo(spot)) {
                return creep.shibMove(spot, {range: 0});
            } else {
                creep.memory.onContainer = true;
            }
        }
        // Build container
        if (!creep.memory.containerID && !extensionFiller(creep) && _.sum(creep.store) === creep.store.getCapacity()) {
            let dropped = creep.pos.lookFor(LOOK_RESOURCES)[0];
            if (dropped && dropped.amount >= 500) {
                let site = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
                if (site) {
                    return creep.build(site);
                } else {
                    creep.idleFor(5);
                }
            }
        }
        let source = Game.getObjectById(creep.memory.source);
        switch (creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                if (container) creep.shibMove(container, {range: 0});
                else creep.shibMove(source);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(source.ticksToRegeneration + 1);
                break;
            case OK:
                if (container && container.store[RESOURCE_ENERGY] > 10 && (creep.memory.linkID || creep.memory.extensions) && Game.time % 3 === 0)
                    creep.withdraw(container, RESOURCE_ENERGY);
                if (_.sum(creep.store) === creep.store.getCapacity())
                    return depositEnergy(creep);
                break;
        }
    } else {
        if (!creep.findSource()) {
            let oldestHarvester = _.min(_.filter(creep.room.creeps, (c) => c.memory && c.memory.role === "stationaryHarvester"), "ticksToLive") || _.filter(creep.room.creeps, (c) => c.memory && c.memory.role === "stationaryHarvester" && c.memory.other.reboot)[0];
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
            if (container.hits < container.hitsMax) creep.repair(container); else creep.idleFor(20);
        }
    } else {
        creep.memory.containerID = undefined;
        creep.memory.linkID = undefined;
    }
}

function extensionFinder(creep) {
    creep.memory.extensionsFound = true;
    let container = Game.getObjectById(creep.memory.containerID) || creep;
    if (container) {
        let extension = container.pos.findInRange(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION), 1);
        if (extension.length) {
            for (let s of extension) {
                if (creep.room.controller.level >= 4 && !s.pos.checkForRampart() && !s.pos.checkForConstructionSites()) s.pos.createConstructionSite(STRUCTURE_RAMPART);
            }
            let sourceExtensions = creep.room.memory.sourceExtension || '[]';
            creep.room.memory.sourceExtension = JSON.stringify(_.union(JSON.parse(sourceExtensions), _.pluck(extension, 'id')));
            creep.memory.extensions = JSON.stringify(_.pluck(extension, 'id'));
        }
    }
}

function extensionFiller(creep) {
    if (!creep.memory.extensions) return false;
    let rawExtension = JSON.parse(creep.memory.extensions);
    for (let id of rawExtension) {
        let extension = Game.getObjectById(id);
        if (!extension) {
            creep.memory.extensionsFound = undefined;
            return creep.memory.extensions = undefined;
        }
        if (extension.energy < extension.energyCapacity) {
            creep.transfer(extension, RESOURCE_ENERGY);
            return true;
        }
    }
    return false;
}

function harvestDepositLink(creep) {
    creep.memory.linkAttempt = true;
    if (creep.room.memory.praiseRoom) return;
    let container = Game.getObjectById(creep.memory.containerID);
    if (!container || (!creep.room.memory.controllerLink && !creep.room.memory.hubLink)) return;
    let source = Game.getObjectById(creep.memory.source);
    let link = _.filter(container.pos.findInRange(creep.room.structures, 1), (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.controllerLink)[0] || _.filter(creep.pos.findInRange(creep.room.structures, 1), (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.controllerLink)[0];
    if (link) {
        if (!link.isActive()) return link.destroy();
        if (!link.pos.checkForRampart() && !link.pos.checkForConstructionSites()) link.pos.createConstructionSite(STRUCTURE_RAMPART);
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
    let container = source.pos.findInRange(creep.room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && !s.pos.isNearTo(s.room.controller)})[0];
    if (container) {
        if (!container.pos.checkForRampart() && !container.pos.checkForConstructionSites()) container.pos.createConstructionSite(STRUCTURE_RAMPART);
        if (!source.memory.containerPos) source.memory.containerPos = JSON.stringify(container.pos);
        creep.memory.containerAttempt = true;
        return container.id;
    } else {
        if (!source.memory.containerPos) {
            let site = source.pos.findInRange(creep.room.constructionSites, 1, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && !s.pos.isNearTo(s.room.controller)})[0];
            if (!site && creep.pos.getRangeTo(source) === 1 && creep.room.controller.level >= 2 && !creep.pos.isNearTo(creep.room.controller)) {
                source.memory.containerPos = JSON.stringify(findBestContainerPos(source));
            } else if (site) {
                if (creep.pos.getRangeTo(site) > 0) creep.shibMove(site, {range: 0});
                source.memory.containerPos = JSON.stringify(site.pos);
                creep.memory.containerAttempt = true;
            }
        } else if (creep.room.controller.level >= 3) {
            let storedSite = JSON.parse(source.memory.containerPos);
            let containerSite = new RoomPosition(storedSite.x, storedSite.y, storedSite.roomName);
            if (!containerSite.checkForConstructionSites()) containerSite.createConstructionSite(STRUCTURE_CONTAINER);
            creep.memory.containerAttempt = true;
        }
    }
}

function extensionBuilder(creep) {
    let source = Game.getObjectById(creep.memory.source);
    if (!source.memory.containerPos) return;
    let storedSite = JSON.parse(source.memory.containerPos);
    let container = new RoomPosition(storedSite.x, storedSite.y, storedSite.roomName);
    if (creep.pos.getRangeTo(container) > 0) {
        return creep.shibMove(container, {range: 0});
    } else {
        let count = 0;
        let otherSource = _.filter(creep.room.sources, (s) => s.id !== creep.memory.source)[0];
        if (!otherSource.memory.dominant) source.memory.dominant = true;
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (xOff !== 0 || yOff !== 0) {
                    let pos = new RoomPosition(container.x + xOff, container.y + yOff, container.roomName);
                    if (pos.checkForWall() || pos.checkForConstructionSites() || pos.checkForObstacleStructure()
                        || pos.isExit() || pos.isNearTo(creep.room.controller) || (!source.memory.dominant && pos.getRangeTo(otherSource) <= 2)) continue;
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

function findBestContainerPos(source) {
    let bestPos, bestCount;
    let otherSource = _.filter(source.room.sources, (s) => s.id !== source.id)[0];
    if (!otherSource.memory.dominant) source.memory.dominant = true;
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(source.pos.x + xOff, source.pos.y + yOff, source.pos.roomName);
                if (pos.checkForWall()) continue;
                if (!bestCount || pos.countOpenTerrainAround() > bestCount) {
                    bestCount = pos.countOpenTerrainAround();
                    bestPos = pos;
                }
            }
        }
    }
    return bestPos;
}