/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    if (creep.tryToBoost(['harvest'])) return;
    if (creep.wrongRoom()) return null;
    // Check if mineral depleted
    if (creep.memory.assignedMineral && Game.getObjectById(creep.memory.assignedMineral).mineralAmount === 0) {
        log.a(creep.room.name + ' supply of ' + Game.getObjectById(creep.memory.assignedMineral).mineralType + ' has been depleted.');
        return creep.memory.recycle = true;
    }
    if (creep.memory.extractor) {
        if (!creep.memory.onContainer) {
            let container = Game.getObjectById(creep.room.memory.extractorContainer);
            if (container) {
                if (!container.pos.checkForCreep() && creep.pos.getRangeTo(container) > 0) return creep.shibMove(container, {range: 0}); else creep.memory.onContainer = true;
            } else {
                creep.memory.onContainer = true;
            }
        }
        let extractor = Game.getObjectById(creep.memory.extractor);
        if (!extractor) return creep.memory.recycle = true;
        if (Game.getObjectById(creep.room.memory.extractorContainer) && _.sum(Game.getObjectById(creep.room.memory.extractorContainer).store) === 2000) return creep.idleFor(25);
        if (extractor.cooldown && extractor.pos.getRangeTo(creep) < 2) {
            creep.idleFor(extractor.cooldown - 1)
        } else {
            let mineral = Game.getObjectById(creep.memory.assignedMineral);
            switch (creep.harvest(mineral)) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(mineral);
                    break;
                case ERR_NOT_FOUND:
                    mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
                    break;
            }
        }
    } else {
        creep.memory.extractor = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_EXTRACTOR}).id;
    }
};