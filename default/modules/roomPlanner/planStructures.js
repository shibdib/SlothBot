/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Lab and mineral structure construction.

 */


const {labTemplate} = require('planTemplates');
const {canPlaceConstructionSite, tryCreateConstructionSite} = require('planUtils');

function labBuilder(room) {
    let builtLabs = room.labs.length;
    let labInBuild = _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_LAB);

    if (CONTROLLER_STRUCTURES[STRUCTURE_LAB][room.level] <= builtLabs || labInBuild) return;

    if (!room.memory.labHub) return;

    const labHub = new RoomPosition(room.memory.labHub.x, room.memory.labHub.y, room.name);
    const partial = room.memory.labHubPartial;

    for (const structure of labTemplate) {
        const pos = new RoomPosition(labHub.x + structure.x, labHub.y + structure.y, room.name);
        if (pos.x < 1 || pos.x > 48 || pos.y < 1 || pos.y > 48) continue;
        if (partial && pos.checkForImpassible() && !pos.checkForBuiltWall()) continue;
        const wall = pos.checkForBuiltWall();
        if (wall) wall.destroy();
        if (pos.checkForConstructionSites() || pos.checkForAllStructure()) continue;
        if (!canPlaceConstructionSite(room)) return;
        if (tryCreateConstructionSite(pos, STRUCTURE_LAB) === OK) return;
    }
}

function mineralBuilder(room) {
    let extractor = room.extractor;

    if (extractor) {
        let extractorContainer = Game.getObjectById(room.memory.extractorContainer);
        if (!extractorContainer) {
            extractorContainer = (global.posStructuresInRange
                    ? global.posStructuresInRange(extractor.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})
                    : extractor.pos.findInRange(FIND_STRUCTURES, 1)
            ).find(s => s.structureType === STRUCTURE_CONTAINER);
            if (!extractorContainer) {
                room.memory.extractorContainer = undefined;
                const extractorSites = global.posConstructionSitesInRange
                    ? global.posConstructionSitesInRange(extractor.pos, 1, {filter: {structureType: STRUCTURE_CONTAINER}})
                    : extractor.pos.findInRange(FIND_CONSTRUCTION_SITES, 1);
                if (!extractorSites.find((s) => s.structureType === STRUCTURE_CONTAINER)) {
                    createExtractorContainerSite(extractor, room);
                }
            } else {
                room.memory.extractorContainer = extractorContainer.id;
            }
        }
    } else {
        handleMineralExtractorCreation(room);
    }

    function createExtractorContainerSite(extractor, room) {
        let containerSpots = room.lookForAtArea(LOOK_TERRAIN, extractor.pos.y - 1, extractor.pos.x - 1, extractor.pos.y + 1, extractor.pos.x + 1, true);
        for (let key in containerSpots) {
            let position = new RoomPosition(containerSpots[key].x, containerSpots[key].y, room.name);
            if (position && position.getRangeTo(extractor) === 1 && !position.checkForImpassible()) {
                if (!canPlaceConstructionSite(room)) break;
                tryCreateConstructionSite(position, STRUCTURE_CONTAINER);
                break;
            }
        }
    }

    function handleMineralExtractorCreation(room) {
        if (!room.mineral.pos.checkForAllStructure() && !room.mineral.pos.checkForConstructionSites()) {
            if (!canPlaceConstructionSite(room)) return;
            tryCreateConstructionSite(room.mineral.pos, STRUCTURE_EXTRACTOR);
        }
    }
}

module.exports = {

    labBuilder,

    mineralBuilder,

};