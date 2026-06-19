/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Post-layout auxiliary structure pass.

 */


const {bunkerTemplate, coreTemplate} = require('planTemplates');

const {setRoadsBuiltFlag, safeStructureOwner} = require('planUtils');

const {sourceBuilder, controllerBuilder} = require('planSources');

const {linkBuilder} = require('planLinks');

const {rampartBuilder} = require('planRamparts');

const {roadBuilder} = require('planRoads');

const {labBuilder, mineralBuilder} = require('planStructures');

function auxiliaryBuilding(room) {
    // Perform cleanup tasks
    performCleanup(room);

    // Sanity check if hub and controller links exist and clear them from memory if not
    if (room.memory.controllerLink && !Game.getObjectById(room.memory.controllerLink)) room.memory.controllerLink = undefined;
    if (room.memory.hubLink && !Game.getObjectById(room.memory.hubLink)) room.memory.hubLink = undefined;

    // Build necessary structures for sources, controller, ramparts, roads, etc.
    sourceBuilder(room);
    controllerBuilder(room);
    const layoutForAux = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;

    rampartBuilder(room, layoutForAux);

    if (room.storage) {
        if (room.level >= 6) {
            mineralBuilder(room);
            labBuilder(room);
        }
        buildRoads(room, room.memory.dynamicLayout ? null : bunkerTemplate);
        linkBuilder(room);
    }

    function buildRoads(room, bunkerTemplate) {
        if (Memory.pauseOwnedRoads && Memory.pauseOwnedRoads > Game.time) return false;
        if (room.level < ROAD_LEVEL) {
            setRoadsBuiltFlag(room, undefined);
            return false;
        }
        if (roadBuilder(room, bunkerTemplate)) {
            setRoadsBuiltFlag(room, undefined);
            return true;
        }
        setRoadsBuiltFlag(room, true);
        return false;
    }

    function performCleanup(room) {
        if (Math.random() > 0.9) {
            removeExcessRoads(room);
            removeBadStructures(room);
        }
    }

    function removeExcessRoads(room) {
        let noRoad = _.filter(room.impassibleStructures, (s) => s.pos.checkForRoad());
        if (noRoad.length) {
            ROAD_CACHE[room.name] = undefined;
            noRoad.forEach((s) => s.pos.checkForRoad().destroy());
        }
    }

    function removeBadStructures(room) {
        let badStructure = _.filter(room.structures, (s) => isBadStructure(s, room));
        if (badStructure.length) {
            badStructure.forEach((s) => s.destroy());
        }
    }

    function isBadStructure(structure, room) {
        const owner = safeStructureOwner(structure);
        if (!owner) return false;
        if (room.controller.level >= 6) {
            return owner !== MY_USERNAME;
        } else if (room.controller.level >= 4) {
            return owner !== MY_USERNAME && structure.structureType !== STRUCTURE_TERMINAL;
        }
        return false;
    }
}

module.exports = {

    auxiliaryBuilding,

};