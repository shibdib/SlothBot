/**
 * Created by Bob on 7/4/2017.
 */
const profiler = require('screeps-profiler');

function controller() {

}

//Cache attack requests
for (let name in Game.flags) {
    if (_.startsWith(name, 'attack')) {
        let cache = Memory.warControl || {};
        let tick = Game.time;
        cache[Game.flags[name].pos.roomName] = {
            tick: tick
        };
        Memory.warControl = cache;
        Game.flags[name].remove();
    }
}
module.exports.controller = profiler.registerFN(controller, 'attackController');