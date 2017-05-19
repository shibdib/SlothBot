var roleBuilder = {

    /** @param {Creep} creep **/
    run: function (creep) {

        if (creep.memory.building && creep.carry.energy === 0) {
            creep.memory.building = false;
            creep.say('🔄 need energy');
            creep.memory.needEnergy = true;
        }
        if (!creep.memory.building && creep.carry.energy === creep.carryCapacity) {
            creep.memory.building = true;
            creep.memory.needEnergy = false;
        }

        if (creep.memory.building && creep.memory.constructionSite){
            target = Game.getObjectById(creep.memory.constructionSite);
            if (target && target.progress < target.progressTotal) {
                creep.say('🚧 build');
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            }
        }else if (creep.memory.building) {
            var target = findConstruction(creep);
            target = Game.getObjectById(target);
            if (target) {
                creep.say('🚧 build');
                if (creep.build(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                }
            } else {
                var repair = findRepair(creep);
                repair = Game.getObjectById(repair);
                if (repair) {
                    creep.say('🚧 repairing');
                    if (creep.repair(repair) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(repair, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffffff'}});
                    }
                }
            }
        }
        else {
            var spawn = findSpawn(creep);
            spawn = Game.getObjectById(spawn);
            if (spawn) {
                creep.say('🚧 spawn');
                if (creep.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(spawn, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
            if (!spawn) {
                var container = findContainer(creep);
                container = Game.getObjectById(container);
                if (container) {
                    creep.say('🚧 container');
                    if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(container, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
            if (!container && !spawn) {
                var energy = findEnergy(creep);
                energy = Game.getObjectById(energy);
                if (energy) {
                    creep.say('🚧 energy');
                    if (creep.pickup(energy) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(energy, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffaa00'}});
                    }
                }
            }
            if (!container && !energy && !spawn) {
                var source = findSource(creep);
                creep.say('🚧 source');
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(source, {reusePath: 20}, {visualizePathStyle: {stroke: '#ffaa00'}});
                }
            }
        }
    }
};

module.exports = roleBuilder;

function findSource(creep) {
    var source = creep.pos.findClosestByRange(FIND_SOURCES_ACTIVE);
    if (creep.moveTo(source) !== ERR_NO_PATH) {
        return source;
    }
}

function findContainer(creep) {
    var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0});
    if (container) {
        return container.id;
    }
    return null;
}

function findSpawn(creep) {
    var spawn = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_SPAWN && s.energy > 50});
    if (spawn) {
        return spawn.id;
    }
    return null;
}

function findEnergy(creep) {
    var energy = creep.pos.findClosestByRange(FIND_DROPPED_ENERGY);
    if (energy) {
        return energy.id;
    }
}

function findConstruction(creep) {

    site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_CONTAINER
})
    ;
    if (site == null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType === STRUCTURE_EXTENSION
    })
        ;
    }
    if (site == null) {
        site = creep.pos.findClosestByRange(FIND_MY_CONSTRUCTION_SITES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART
    })
        ;
    }
    if (site != null && site != undefined) {
        creep.memory.constructionSite = site.id;
        return site.id;
    }
}