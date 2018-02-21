/**
 * Created by rober on 5/16/2017.
 */
let _ = require('lodash');
const profiler = require('screeps-profiler');

function highCommand() {
    for (let key in Memory.ownedRooms) {
        let cleaningTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 1000 && r.needsCleaning && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 5);
        if (cleaningTargets.length > 0) {
            Memory.ownedRooms[key].memory.cleaningTargets = cleaningTargets;
        }
        let localTargets = _.filter(Memory.roomCache, (r) => r.cached > Game.time - 1000 && r.owner && !_.includes(RawMemory.segments[2], constructionSite.owner['username']) && Game.map.findRoute(r.name, Memory.ownedRooms[key].name).length <= 3);
        if (localTargets.length > 0) {
            Memory.ownedRooms[key].memory.localTargets = localTargets;
        }
    }
}

module.exports.highCommand = profiler.registerFN(highCommand, 'highCommand');

