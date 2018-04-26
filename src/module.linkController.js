/**
 * Created by Bob on 6/6/2017.
 */

const profiler = require('screeps-profiler');

function linkControl(room) {
    let links = _.filter(room.structures, (s) => s.structureType === STRUCTURE_LINK && s.id !== s.room.memory.storageLink && s.id !== s.room.memory.controllerLink && s.cooldown === 0);
    let storageLink = Game.getObjectById(room.memory.storageLink);
    let controllerLink = Game.getObjectById(room.memory.controllerLink);
    if (!storageLink) delete room.memory.storageLink;
    if (!controllerLink) delete room.memory.controllerLink;
    for (let link of links) {
        if (!storageLink || !controllerLink) {
            if (_.filter(link.pos.findInRange(room.structures, 3), (s) => s.structureType === STRUCTURE_STORAGE).length > 0) {
                link.room.memory.storageLink = link.id;
                continue;
            }
            if (_.filter(link.pos.findInRange(room.structures, 2), (s) => s.structureType === STRUCTURE_CONTROLLER).length > 0) {
                link.room.memory.controllerLink = link.id;
                continue;
            }
        }
        if (link.energy < 50) continue;
        let upgrader = _.filter(link.room.creeps, (c) => c.memory && c.memory.role === 'upgrader')[0];
        if (upgrader && controllerLink && controllerLink.energy < 500) {
            link.transferEnergy(controllerLink);
        } else if (storageLink && storageLink.energy < 300) {
            link.transferEnergy(storageLink);
        } else if (controllerLink && controllerLink.energy < 700) {
            link.transferEnergy(controllerLink);
        } else if (storageLink && storageLink.energy < 800) {
            link.transferEnergy(storageLink);
        }
    }
    if (storageLink && controllerLink && storageLink.energy > 100 && controllerLink.energy < 250 && storageLink.room.energyAvailable > storageLink.room.energyCapacityAvailable * 0.50) {
        storageLink.transferEnergy(controllerLink);
    }
}

module.exports.linkControl = profiler.registerFN(linkControl, 'linkControl');