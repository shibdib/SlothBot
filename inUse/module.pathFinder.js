
module.exports.Move = function (creep, target) {
    if (creep.memory.pathAge === null || creep.memory.pathAge === undefined) {
        creep.memory.pathAge = 0;
    }
    if (creep.memory.pathAge >= 10) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            maxOps: 20000, serialize: true
        });
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
    }
    creep.memory.pathAge++;
    if (creep.moveByPath(creep.memory.path) !== OK) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            maxOps: 20000, serialize: true
        });
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
    }
};
module.exports.AttackMove = function (creep, target) {
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