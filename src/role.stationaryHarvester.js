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
        // If in place harvest
        if (creep.memory.onContainer) {
            if (Math.random() > 0.98) return creep.memory.onContainer = undefined;
            let container = Game.getObjectById(creep.memory.containerID);
            let source = Game.getObjectById(creep.memory.source);
            switch (creep.harvest(source)) {
                case ERR_NOT_IN_RANGE:
                    if (container) creep.shibMove(Game.getObjectById(creep.memory.containerID), {range: 0});
                    else creep.shibMove(source);
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    if (container && creep.store[RESOURCE_ENERGY]) {
                        creep.repair(Game.getObjectById(creep.memory.containerID));
                    } else if (!source.effects) {
                        creep.idleFor(source.ticksToRegeneration + 1);
                    }
                    break;
                case OK:
                    let harvestPower = creep.memory.harvestPower || _.filter(creep.body, (b) => b.type === WORK).length * HARVEST_POWER;
                    if (Game.time % (creep.store.getCapacity() / harvestPower)) {
                        if (container && container.store[RESOURCE_ENERGY] && (creep.memory.linkID || creep.memory.extensions))
                            creep.withdraw(container, RESOURCE_ENERGY);
                        creep.memory.harvestPower = harvestPower;
                        if (_.sum(creep.store) === creep.store.getCapacity())
                            return depositEnergy(creep);
                    }
                    break;
            }
        } else {
            //Find container
            if (!creep.memory.containerAttempt && !creep.memory.containerID) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
            let container = Game.getObjectById(creep.memory.containerID);
            //Make sure you're on the container
            if (container || Game.getObjectById(creep.memory.source).memory.containerPos) {
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
                if (dropped && dropped.amount >= 700) {
                    let site = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
                    if (site) {
                        return creep.build(site);
                    } else {
                        creep.memory.needHauler = true;
                    }
                } else {
                    creep.memory.needHauler = undefined;
                }
            }
        }
    } else {
        if (!creep.findSource()) {
            let oldestHarvester = _.min(_.filter(creep.room.creeps, (c) => c.memory && c.ticksToLive < 500 && c.memory.role === "stationaryHarvester"), "ticksToLive") || _.find(creep.room.creeps, (c) => c.memory && c.memory.role === "stationaryHarvester" && c.memory.other.reboot);
            if (!oldestHarvester || !oldestHarvester.id) return creep.suicide();
            else {
                creep.memory.source = oldestHarvester.memory.source;
                oldestHarvester.suicide();
            }
        }
    }
};

// Rotate between link and container if we don't have a hub and controller link
function depositEnergy(creep) {
    // Attempt to build extensions
    if (!creep.memory.extensionBuilt || creep.memory.storedLevel !== creep.room.controller.level) extensionBuilder(creep);
    // Fill nearby
    if (extensionFiller(creep)) return;
    let container = Game.getObjectById(creep.memory.containerID);
    if (container && container.hits < container.hitsMax * 0.5) return creep.repair(container);
    if (creep.memory.linkID) {
        let link = Game.getObjectById(creep.memory.linkID);
        if (link.store[RESOURCE_ENERGY] < LINK_CAPACITY) {
            creep.transfer(link, RESOURCE_ENERGY);
        } else if (container && _.sum(container.store) >= 1900) {
            creep.idleFor(20);
        }
    } else if (!creep.memory.linkAttempt) {
        creep.memory.linkID = harvestDepositLink(creep)
    } else if (creep.memory.linkTest) {
        linkTest(creep);
    } else if (container) {
        creep.memory.needHauler = undefined;
        if (_.sum(container.store) >= 1900) {
            if (container.hits < container.hitsMax) creep.repair(container); else {
                creep.memory.needHauler = true;
                creep.idleFor(20);
            }
        }
    } else {
        creep.memory.containerID = undefined;
        creep.memory.linkID = undefined;
    }
}

function extensionFiller(creep) {
    if (!ROOM_HARVESTER_EXTENSTIONS[creep.room.name] || !creep.memory.extensionsFound) {
        creep.memory.extensionsFound = true;
        let container = Game.getObjectById(creep.memory.containerID) || creep;
        let extension = container.pos.findInRange(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION), 1);
        let sourceExtensions = ROOM_HARVESTER_EXTENSTIONS[creep.room.name] || [];
        ROOM_HARVESTER_EXTENSTIONS[creep.room.name] = _.union(sourceExtensions, _.pluck(extension, 'id'));
    } else {
        if (creep.opportunisticFill()) return true;
    }
}

function harvestDepositLink(creep) {
    creep.memory.linkAttempt = true;
    let source = Game.getObjectById(creep.memory.source);
    if (!source.memory.containerPos || (!Game.getObjectById(creep.room.memory.controllerLink) && !Game.getObjectById(creep.room.memory.hubLink))) return;
    let link = _.filter(source.pos.findInRange(FIND_MY_STRUCTURES, 2), (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.controllerLink)[0] || _.filter(creep.pos.findInRange(FIND_MY_STRUCTURES, 1), (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.controllerLink)[0];
    if (link) {
        if (!link.isActive()) return link.destroy();
        if (!link.pos.checkForRampart() && !link.pos.checkForConstructionSites() && !link.pos.isInBunker()) link.pos.createConstructionSite(STRUCTURE_RAMPART);
        if (creep.pos.getRangeTo(link) <= 1) {
            return link.id;
        } else if (creep.pos.getRangeTo(link) <= 3) {
            creep.shibMove(link);
            return link.id;
        }
    } else {
        let inBuild = _.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_LINK)[0];
        if (!inBuild && source.memory.containerPos) {
            let otherHarvester = _.filter(creep.room.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester' && !c.memory.linkID && c.memory.containerID && c.id !== creep.id)[0];
            if (otherHarvester) {
                let hub = new RoomPosition(creep.room.memory.bunkerHub.x, creep.room.memory.bunkerHub.y, creep.room.name);
                if (otherHarvester.pos.getRangeTo(hub) > creep.pos.getRangeTo(hub)) return;
            }
            let storedSite = JSON.parse(source.memory.containerPos);
            let zoneTerrain = creep.room.lookForAtArea(LOOK_TERRAIN, storedSite.y - 1, storedSite.x - 1, storedSite.y + 1, storedSite.x + 1, true);
            for (let key in zoneTerrain) {
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, creep.room.name);
                if (source.memory.badLink && JSON.parse(source.memory.badLink).x === position.x && JSON.parse(source.memory.badLink).y === position.y) continue;
                if (position.checkForAllStructure().length > 0 || position.getRangeTo(creep.room.controller) < 3) continue;
                if (position.createConstructionSite(STRUCTURE_LINK) === OK) return creep.memory.linkTest = true;
            }
        }
    }
}

function linkTest(creep) {
    creep.memory.linkTest = undefined;
    if (!creep.pos.findClosestByPath(FIND_MY_SPAWNS)) {
        let inBuild = _.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_LINK && s.pos.isNearTo(creep))[0];
        let source = Game.getObjectById(creep.memory.source);
        if (inBuild) {
            creep.memory.linkAttempt = undefined;
            creep.memory.linkID = undefined;
            source.memory.badLink = JSON.stringify(inBuild.pos);
            inBuild.remove();
        }
    }
}

function harvestDepositContainer(source, creep) {
    creep.memory.containerAttempt = true;
    let container = source.pos.findInRange(creep.room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && !s.pos.isNearTo(s.room.controller)})[0];
    if (container) {
        if (!container.pos.checkForRampart() && !container.pos.checkForConstructionSites() && !container.pos.isInBunker()) container.pos.createConstructionSite(STRUCTURE_RAMPART);
        if (!source.memory.containerPos) source.memory.containerPos = JSON.stringify(container.pos);
        return container.id;
    } else {
        if (!source.memory.containerPos) {
            let site = source.pos.findInRange(creep.room.constructionSites, 1, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && !s.pos.isNearTo(s.room.controller)})[0];
            if (!site) {
                source.memory.containerPos = JSON.stringify(findBestContainerPos(source));
            } else if (site) {
                if (creep.pos.getRangeTo(site) > 0) creep.shibMove(site, {range: 0});
                source.memory.containerPos = JSON.stringify(site.pos);
            } else if (!creep.pos.isNearTo(source)) {
                creep.shibMove(source);
            }
        } else if (creep.room.memory.controllerContainer && creep.room.level >= 2) {
            let storedSite = JSON.parse(source.memory.containerPos);
            let containerSite = new RoomPosition(storedSite.x, storedSite.y, storedSite.roomName);
            if (!containerSite.checkForConstructionSites()) containerSite.createConstructionSite(STRUCTURE_CONTAINER);
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
        creep.memory.storedLevel = creep.room.level;
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
                if (!bestCount || pos.countOpenTerrainAround(true, true) > bestCount) {
                    bestCount = pos.countOpenTerrainAround(true, true);
                    bestPos = pos;
                }
            }
        }
    }
    return bestPos;
}