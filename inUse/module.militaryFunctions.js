const profiler = require('screeps-profiler');

function kite(creep, fleeRange = 3) {
    let avoid = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (c) => c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0});

    let avoidance = _.map(creep.pos.findInRange(avoid, fleeRange + 1),
        (c) => {
            return {pos: c.pos, range: 10};
        });
    let ret = PathFinder.search(creep.pos, avoidance, {
        flee: true,
        swampCost: 50,
        maxRooms: 1,

        roomCallback: function (roomName) {
            let costs = new PathFinder.CostMatrix;
            addBorderToMatrix(creep.room, costs);
            return costs;
        }

    });

    if (ret.path.length > 0) {
        if (creep.memory.squadLeader === true) {
            creep.memory.squadKite = creep.pos.getDirectionTo(ret.path[0]);
        }
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

function addBorderToMatrix(room, matrix) {
    let exits = Game.map.describeExits(room.name);
    if (exits === undefined) {
        return matrix;
    }
    let top = ((_.get(exits, TOP, undefined) === undefined) ? 1 : 0);
    let right = ((_.get(exits, RIGHT, undefined) === undefined) ? 48 : 49);
    let bottom = ((_.get(exits, BOTTOM, undefined) === undefined) ? 48 : 49);
    let left = ((_.get(exits, LEFT, undefined) === undefined) ? 1 : 0);
    for (let y = top; y <= bottom; ++y) {
        for (let x = left; x <= right; x += ((y % 49 === 0) ? 1 : 49)) {
            if (matrix.get(x, y) < 0x03 && Game.map.getTerrainAt(x, y, room.name) !== "wall") {
                matrix.set(x, y, 0x03);
            }
        }
    }
    return matrix;
}