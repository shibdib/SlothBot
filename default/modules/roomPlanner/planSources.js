/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Source and controller container construction.

 */


const {
    findBestContainerPos,
    isControllerContainerPos,
    resolveControllerContainer,
    hasControllerContainerSite,
    controllerContainersAdjacent,
} = require('planUtils');

function getControllerPlacementPositions(room) {
    const possibles = [];
    const link = Game.getObjectById(room.memory.controllerLink);
    if (link) {
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (!xOff && !yOff) continue;
                const pos = new RoomPosition(link.pos.x + xOff, link.pos.y + yOff, room.name);
                if (isControllerContainerPos(pos, room) && !pos.checkForImpassible() && !pos.checkIfOutOfBounds()) {
                    possibles.push(pos);
                }
            }
        }
    }
    if (!possibles.length) {
        for (let xOff = -2; xOff <= 2; xOff++) {
            for (let yOff = -2; yOff <= 2; yOff++) {
                if (!xOff && !yOff) continue;
                const pos = new RoomPosition(room.controller.pos.x + xOff, room.controller.pos.y + yOff, room.name);
                if (isControllerContainerPos(pos, room) && !pos.checkForImpassible() && !pos.checkIfOutOfBounds()) {
                    possibles.push(pos);
                }
            }
        }
    }
    return possibles;
}

function pickContainerBuildPos(room, positions) {
    const hub = room.hub;
    const sorted = positions.slice().sort((a, b) => {
        if (!hub) return 0;
        return a.findPathTo(hub).length - b.findPathTo(hub).length;
    });
    for (const pos of sorted) {
        const structures = pos.lookFor(LOOK_STRUCTURES);
        const sites = pos.lookFor(LOOK_CONSTRUCTION_SITES);
        const blocked = structures.some((s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART);
        if (blocked || sites.length) continue;
        return pos;
    }
    return null;
}

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
            let sourceBuild = _.find(
                global.posConstructionSitesInRange
                    ? global.posConstructionSitesInRange(source.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})
                    : source.pos.findInRange(FIND_CONSTRUCTION_SITES, 1),
                (s) => s.structureType === STRUCTURE_CONTAINER
            );
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
    const controllerLink = Game.getObjectById(room.memory.controllerLink);

    if (room.level === 8 && controllerLink) {
        const legacy = resolveControllerContainer(room);
        if (legacy && legacy.store.getUsedCapacity() === 0) {
            legacy.destroy();
            room.memory.controllerContainer = undefined;
        }
        return false;
    }

    if (room.level < 2 || room.level >= 8) return false;

    if (room.memory.controllerLink && !controllerLink) {
        room.memory.controllerLink = undefined;
    }

    if (resolveControllerContainer(room, true)) return false;
    if (hasControllerContainerSite(room)) return false;
    if (controllerContainersAdjacent(room).length) return false;

    const buildPos = pickContainerBuildPos(room, getControllerPlacementPositions(room));
    if (!buildPos) return false;

    return buildPos.createConstructionSite(STRUCTURE_CONTAINER) === OK;
}

module.exports = {

    sourceBuilder,

    controllerBuilder,

};