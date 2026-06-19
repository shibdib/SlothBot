/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Post-layout auxiliary structure pass.

 */


const {bunkerTemplate, coreTemplate} = require('planTemplates');

const {safeStructureOwner} = require('planUtils');

const {sourceBuilder, controllerBuilder} = require('planSources');

const {linkBuilder} = require('planLinks');

const {rampartBuilder} = require('planRamparts');

const {labBuilder, mineralBuilder} = require('planStructures');

function auxiliaryBuilding(room) {
    performCleanup(room);

    if (room.memory.controllerLink && !Game.getObjectById(room.memory.controllerLink)) room.memory.controllerLink = undefined;
    if (room.memory.hubLink && !Game.getObjectById(room.memory.hubLink)) room.memory.hubLink = undefined;

    sourceBuilder(room);
    controllerBuilder(room);
    const layoutForAux = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;

    rampartBuilder(room, layoutForAux);

    if (room.storage) {
        if (room.level >= 6) {
            mineralBuilder(room);
            labBuilder(room);
        }
        linkBuilder(room);
    }

    function performCleanup(room) {
        if (Math.random() > 0.9) {
            removeBadStructures(room);
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