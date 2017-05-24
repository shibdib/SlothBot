
module.exports.Move = function (creep, target) {
    if (creep.memory.pathAge === null || undefined) {
        creep.memory.pathAge = 0;
    }
    if (creep.memory.pathAge > 10) {
        creep.memory.path = creep.room.findPath(creep.pos, target.pos, {
            maxOps: 20000, serialize: true
        });
        creep.moveByPath(creep.memory.path);
        creep.memory.pathAge = 0;
    }
    creep.moveByPath(creep.memory.path);
};