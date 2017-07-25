/**
 * Created by Bob on 6/6/2017.
 */

const profiler = require('screeps-profiler');

function linkControl() {
    for (let link of _.values(Game.structures)) {
        if (link.structureType === STRUCTURE_LINK) {
            if (link.pos.findInRange(FIND_STRUCTURES, 3, {filter: (s) => s.structureType === STRUCTURE_STORAGE}).length > 0) {
                link.room.memory.storageLink = link.id;
                continue;
            }
            if (link.room.memory.storageLink) {
                let storageLink = Game.getObjectById(link.room.memory.storageLink);
                if (link.room.memory.storageLink !== link.id && storageLink.energy < 700) {
                    link.transferEnergy(storageLink);
                }
            }
        }
    }
}
module.exports.linkControl = profiler.registerFN(linkControl, 'linkControl');