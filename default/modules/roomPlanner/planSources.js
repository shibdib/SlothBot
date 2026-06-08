/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Source and controller container construction.

 */


const {findBestContainerPos} = require('planUtils');

function sourceBuilder(room) {
    if (room.controller.level >= 3) {
        for (let source of room.sources) {
            if (buildSourceContainer(source, room)) return true;
        }
    }

    // Helper function to handle the creation of source containers
    function buildSourceContainer(source, room) {
        const containerId = source.memory.container || source.memory.containerID;
        let sourceContainer = Game.getObjectById(containerId) || source.pos.findInRange(room.containers, 1)[0];
        if (!sourceContainer) {
            source.memory.container = undefined;
            delete source.memory.containerID;
            let sourceBuild = _.find(source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), (s) => s.structureType === STRUCTURE_CONTAINER);
            if (!sourceBuild) {
                let containerSite = findBestContainerPos(source);
                if (containerSite && !containerSite.checkForConstructionSites()) {
                    if (containerSite.createConstructionSite(STRUCTURE_CONTAINER) === OK) return true;
                }
            }
        } else {
            if (!source.memory.distanceToHub) {
                source.memory.distanceToHub = source.pos.findPathTo(room.hub).length;
            }
            source.memory.container = sourceContainer.id;
            delete source.memory.containerID;
        }
    }
}

function controllerBuilder(room) {
    let controllerContainer = Game.getObjectById(room.memory.controllerContainer);
    let controllerLink = Game.getObjectById(room.memory.controllerLink);
    if (!controllerContainer && room.level >= 2 && room.level < 8) {
        controllerContainer = room.controller.pos.findInRange(room.containers, 3, {
            filter: (s) => !s.pos.isNearTo(s.pos.findClosestByRange(FIND_SOURCES)) &&
                !s.pos.isNearTo(s.pos.findClosestByRange(FIND_MINERALS))
        })[0];
        if (!controllerContainer) {
            let controllerBuild = room.controller.pos.findInRange(FIND_CONSTRUCTION_SITES, 3, {
                filter: (s) => s.structureType === STRUCTURE_CONTAINER
            })[0];
            if (!controllerBuild) {
                // If we have a link, build next to that but in range of the controller
                let possibles = [];
                if (room.memory.controllerLink) {
                    let link = Game.getObjectById(room.memory.controllerLink);
                    if (!link) return room.memory.controllerLink = undefined;
                    for (let xOff = -1; xOff <= 1; xOff++) {
                        for (let yOff = -1; yOff <= 1; yOff++) {
                            if (xOff !== 0 || yOff !== 0) {
                                let pos = new RoomPosition(link.pos.x + xOff, link.pos.y + yOff, room.name);
                                if (pos.getRangeTo(room.controller) <= 2 && !pos.checkForImpassible() && !pos.checkIfOutOfBounds() &&
                                    !pos.isNearTo(pos.findClosestByRange(FIND_SOURCES)) &&
                                    !pos.isNearTo(pos.findClosestByRange(FIND_MINERALS))) {
                                    possibles.push({x: pos.x, y: pos.y});
                                }
                            }
                        }
                    }
                } else {
                    for (let xOff = -2; xOff <= 2; xOff++) {
                        for (let yOff = -2; yOff <= 2; yOff++) {
                            if (xOff !== 0 || yOff !== 0) {
                                let pos = new RoomPosition(room.controller.pos.x + xOff, room.controller.pos.y + yOff, room.name);
                                if (!pos.checkForImpassible() && !pos.checkIfOutOfBounds() &&
                                    !pos.isNearTo(pos.findClosestByRange(FIND_SOURCES)) &&
                                    !pos.isNearTo(pos.findClosestByRange(FIND_MINERALS))) {
                                    possibles.push({x: pos.x, y: pos.y});
                                }
                            }
                        }
                    }
                }
                let closestPos = getClosestPosition(possibles, room.hub);
                if (closestPos) {
                    if (closestPos.createConstructionSite(STRUCTURE_CONTAINER) === OK) return true;
                }
            }
        } else {
            room.memory.controllerContainer = controllerContainer.id;
        }
    } else if (controllerContainer && controllerLink && room.level === 8) {
        // If the controller container is empty destroy it
        if (controllerContainer.store.getUsedCapacity() === 0) {
            controllerContainer.destroy();
            room.memory.controllerContainer = undefined;
        }
    }

    function getClosestPosition(positions, hub) {
        let closestPos = null;
        let closestRange = Infinity;
        for (let pos of positions) {
            pos = new RoomPosition(pos.x, pos.y, room.name);
            const range = pos.findPathTo(hub).length;
            if (range < closestRange) {
                closestPos = pos;
                closestRange = range;
            }
        }
        return closestPos;
    }
}

module.exports = {

    sourceBuilder,

    controllerBuilder,

};