/**
 * Created by Bob on 6/6/2017.
 */

const profiler = require('screeps-profiler');

function linkControl() {
    for (let link of _.values(Game.structures)) {
        if (link.structureType === STRUCTURE_LINK && link.id !== link.room.memory.controllerLink && link.id !== link.room.memory.storageLink) {
            if (link.pos.findInRange(FIND_STRUCTURES, 3, {filter: (s) => s.structureType === STRUCTURE_STORAGE}).length > 0) {
                link.room.memory.storageLink = link.id;
                continue;
            }
            if (link.pos.findInRange(FIND_STRUCTURES, 2, {filter: (s) => s.structureType === STRUCTURE_CONTROLLER}).length > 0) {
                link.room.memory.controllerLink = link.id;
                continue;
            }
            if (Game.getObjectById(link.room.memory.storageLink) || Game.getObjectById(link.room.memory.controllerLink)) {
                let storageLink = Game.getObjectById(link.room.memory.storageLink);
                let controllerLink = Game.getObjectById(link.room.memory.controllerLink);
                if (storageLink.energy < 700 && controllerLink.energy > 250) {
                    link.transferEnergy(storageLink);
                } else if (controllerLink.energy > 250) {
                    link.transferEnergy(controllerLink);
                } else if (storageLink.energy < 700) {
                    link.transferEnergy(storageLink);
                }
            }
        }
    }
}
module.exports.linkControl = profiler.registerFN(linkControl, 'linkControl');