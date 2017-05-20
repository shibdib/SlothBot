let rolePeasantBuilder = {

    /** @param {Creep} creep **/
    run: function (creep) {
        if (creep.carry.energy > 0) {
            var target = findConstruction(creep);
            target = Game.getObjectById(target);
            if (target) {
                if (creep.build(target) === ERR_INVALID_TARGET) {
                    creep.moveTo(Game.flags.haulers);
                } else {
                    if (creep.build(target) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
        }else {
            if (creep.withdraw(Game.spawns['Spawn1'], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(Game.spawns['Spawn1'], {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
            }
        }
    }
};

module.exports = rolePeasantBuilder;

function findConstruction(creep) {

    site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART});
    }
    if (site === null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_RAMPART});
    }
    if (site !== null && site !== undefined) {
        creep.memory.constructionSite = site.id;
        return site.id;
    }
}