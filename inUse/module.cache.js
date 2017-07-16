//Path Cache
//Credit - https://gist.github.com/derofim/72b7a5e1a57b77877892
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];


function getPath(from, to) {
    let cache = Memory.pathCache;
    if (cache) {
        let cachedPath = cache[getPathKey(from, to)];
        if (cachedPath) {
            cachedPath.uses += 1;
            Memory.pathCache = cache;
            return cachedPath.path;
        }
    } else {
        return null;
    }
}
module.exports.getPath = profiler.registerFN(getPath, 'getPath');

module.exports.cleanPathCache = function () {
    let counter = 0;
    let tick = Game.time;
    for (let key in Memory.pathCache) {
        let cached = Memory.pathCache[key];
        if (cached.tick + EST_TICKS_PER_DAY < tick || cached.tick === undefined) {
            Memory.pathCache[key] = undefined;
            counter += 1;
        }
    }
};


function getPathKey(from, to) {
    return getPosKey(from) + '$' + getPosKey(to);
}

function getPosKey(pos) {
    return pos.x + 'x' + pos.y + pos.roomName;
}





