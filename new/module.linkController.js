/**
 * Created by Bob on 6/6/2017.
 */

const profiler = require('screeps-profiler');

function linkControl(room) {
    if (room.level < 5) return;
    let links = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LINK);
    for (let link of links) {
        if (link.id !== room.memory.controllerLink && link.id !== room.memory.storageLink && link.cooldown === 0) {
            let energyPercentage = link.room.energyAvailable / link.room.energyCapacityAvailable;
            if (_.filter(link.pos.findInRange(FIND_STRUCTURES, 3), (s) => s.structureType === STRUCTURE_STORAGE).length > 0 && !Game.getObjectById(link.room.memory.storageLink)) {
                link.room.memory.storageLink = link.id;
                return;
            }
            if (_.filter(link.pos.findInRange(FIND_STRUCTURES, 2), (s) => s.structureType === STRUCTURE_CONTROLLER).length > 0 && !Game.getObjectById(link.room.memory.controllerLink)) {
                link.room.memory.controllerLink = link.id;
                return;
            }
            if ((Game.getObjectById(link.room.memory.storageLink) || Game.getObjectById(link.room.memory.controllerLink)) && link.energy > 100) {
                let storageLink = Game.getObjectById(link.room.memory.storageLink);
                if (!storageLink) link.room.memory.storageLink = undefined;
                let controllerLink = Game.getObjectById(link.room.memory.controllerLink);
                if (!controllerLink) link.room.memory.storageLink = undefined;
                if (storageLink && storageLink.energy < 700 && ((controllerLink && controllerLink.energy > 250) || (energyPercentage < 0.5))) {
                    link.transferEnergy(storageLink);
                } else if (controllerLink && controllerLink.energy < 250) {
                    link.transferEnergy(controllerLink);
                } else if (storageLink && storageLink.energy < 700) {
                    link.transferEnergy(storageLink);
                } else if (controllerLink && controllerLink.energy < 700) {
                    link.transferEnergy(controllerLink);
                }
            }
        }
    }
}

module.exports.linkControl = profiler.registerFN(linkControl, 'linkControl');