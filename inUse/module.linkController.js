/**
 * Created by Bob on 6/6/2017.
 */


module.exports.linkControl = function () {
    for (let link of _.values(Game.structures)) {
        if (link.structureType === STRUCTURE_LINK) {
            if (link.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_STORAGE})) {
                link.room.memory.storageLink = link.id;
                continue;
            }
            if (link.pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_SPAWN})) {
                link.room.memory.spawnLink = link.id;
                continue;
            }
            if (link.room.memory.storageLink) {
                let storageLink = Game.getObjectById(link.room.memory.storageLink);
                link.transfer(storageLink);
                if (link.energy === 0) {
                    continue;
                }
            }
            if (link.room.memory.spawnLink) {
                let spawnLink = Game.getObjectById(link.room.memory.spawnLink);
                link.transfer(spawnLink);
            }
        }
    }
};