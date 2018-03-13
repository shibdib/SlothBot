/**
 * Created by Bob on 6/6/2017.
 */

const profiler = require('screeps-profiler');

function linkControl(room) {
    if (room.level < 5) return;
    let links = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LINK);
    let storageLink = Game.getObjectById(room.memory.storageLink);
    let controllerLink = Game.getObjectById(room.memory.controllerLink);
    if (!storageLink) delete room.memory.storageLink;
    if (!controllerLink) delete room.memory.controllerLink;
    for (let link of links) {
        if (link.id !== room.memory.controllerLink && link.id !== room.memory.storageLink && link.cooldown === 0) {
            if (!storageLink || !controllerLink) {
                if (_.filter(link.pos.findInRange(FIND_STRUCTURES, 3), (s) => s.structureType === STRUCTURE_STORAGE).length > 0) {
                    link.room.memory.storageLink = link.id;
                    continue;
                }
                if (_.filter(link.pos.findInRange(FIND_STRUCTURES, 2), (s) => s.structureType === STRUCTURE_CONTROLLER).length > 0) {
                    link.room.memory.controllerLink = link.id;
                    continue;
                }
            }
            if (controllerLink && controllerLink.energy < 250) {
                link.transferEnergy(controllerLink);
            } else if (storageLink && storageLink.energy < 700) {
                link.transferEnergy(storageLink);
            }
        }
    }
    if (storageLink && controllerLink && storageLink.energy > 100 && controllerLink.energy < 250) {
        storageLink.transferEnergy(controllerLink);
    }
}

module.exports.linkControl = profiler.registerFN(linkControl, 'linkControl');