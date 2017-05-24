module.exports.Move = function (creep, target, checkRate = 10, exempt = false) {
    if (creep.fatigue > 0) {
        return;
    }
    if (creep.memory.pathAge === null || creep.memory.pathAge === undefined) {
        creep.memory.pathAge = 0;
    }
    if (creep.memory.pathAge >= checkRate) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            costCallback: function (roomName, costMatrix) {
                const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
                for (let i = 0; i < roads.length; i++) {
                    costMatrix.set(roads[i].pos.x, roads[i].pos.y, 0.5);
                }
                if (exempt === true) {
                    const source = creep.room.find(FIND_SOURCES);
                    for (let i = 0; i < source.length; i++) {
                        costMatrix.set(source[i].pos.x, source[i].pos.y, 100);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y, 100);
                        costMatrix.set(source[i].pos.x, source[i].pos.y + 1, 100);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y, 100);
                        costMatrix.set(source[i].pos.x, source[i].pos.y - 1, 100);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y - 1, 100);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y + 1, 100);
                        costMatrix.set(source[i].pos.x + 1, source[i].pos.y - 1, 100);
                        costMatrix.set(source[i].pos.x - 1, source[i].pos.y + 1, 100);
                    }
                }
            },
            maxOps: 20000, serialize: true
        });
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
    }
    creep.memory.pathAge++;
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            costCallback: function (roomName, costMatrix) {
                const roads = creep.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_ROAD});
                for (let i = 0; i < roads.length; i++) {
                    costMatrix.set(roads[i].pos.x, roads[i].pos.y, 0.5);
                }
                const source = creep.room.find(FIND_SOURCES);
                for (let i = 0; i < source.length; i++) {
                    costMatrix.set(source[i].pos.x, source[i].pos.y, 100);
                    costMatrix.set(source[i].pos.x + 1, source[i].pos.y, 100);
                    costMatrix.set(source[i].pos.x, source[i].pos.y + 1, 100);
                    costMatrix.set(source[i].pos.x - 1, source[i].pos.y, 100);
                    costMatrix.set(source[i].pos.x, source[i].pos.y - 1, 100);
                    costMatrix.set(source[i].pos.x - 1, source[i].pos.y - 1, 100);
                    costMatrix.set(source[i].pos.x + 1, source[i].pos.y + 1, 100);
                    costMatrix.set(source[i].pos.x + 1, source[i].pos.y - 1, 100);
                    costMatrix.set(source[i].pos.x - 1, source[i].pos.y + 1, 100);
                }
            },
            maxOps: 20000, serialize: true
        });
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
    }
};
module.exports.AttackMove = function (creep, target) {
    if (creep.fatigue > 0) {
        return;
    }
    creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
        maxOps: 20000, serialize: true
    });
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            maxOps: 20000, serialize: true, ignoreDestructibleStructures: true
        });
        creep.moveByPath(creep.memory.path);
    }
};