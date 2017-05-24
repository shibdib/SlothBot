
let functions = require('module.functions');
module.exports.Move = function (creep, target) {
    return creep.room.findPath(creep.pos, target.pos, {
        maxOps: 20000, serialize: true
    });
};