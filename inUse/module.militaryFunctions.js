const profiler = require('screeps-profiler');

function kite(creep, fleeRange = 5) {
    let avoid = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0});

    let avoidance = _.map(creep.pos.findInRange(avoid, fleeRange + 1),
        (c) => {
            return {pos: c.pos, range: 10};
        });
    let ret = PathFinder.search(creep.pos, avoidance, {
        flee: true,
        swampCost: 50,
    });

    if (ret.path.length > 0) {
        return creep.move(creep.pos.getDirectionTo(ret.path[0]));
    } else {
        return OK;
    }
}
module.exports.kite = profiler.registerFN(kite, 'kiteMilitaryFunction');

function retreat(creep, fleeRange = 5) {
    let avoid = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0});
    let avoidance = _.map(creep.pos.findInRange(avoid, fleeRange + 1),
        (c) => {
            return {pos: c.pos, range: 20};
        });
    let ret = PathFinder.search(creep.pos, avoidance, {
        flee: true,
    });
    if (ret.path.length > 0) {
        return creep.move(creep.pos.getDirectionTo(ret.path[0]));
    } else {
        return OK;
    }
}
module.exports.retreat = profiler.registerFN(retreat, 'retreatMilitaryFunction');