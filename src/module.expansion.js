let shib = require("shibBench");

module.exports.claimNewRoom = function (room) {
    let cpu = Game.cpu.getUsed();
    let avoidRooms = _.filter(Memory.roomCache, (r) => r.owner && _.includes(FRIENDLIES, r.owner.username));
    let worthyRooms = _.filter(Memory.roomCache, (r) => r.claimWorthy && r.name !== room.name);
    if (!Memory.lastExpansion) Memory.lastExpansion = Game.time;
    delete room.memory.claimTarget;
    if (avoidRooms.length === 0) return;
    if (worthyRooms.length > 0) {
        let possibles = {};
        loop1:
            for (let key in worthyRooms) {
                let worthyName = worthyRooms[key].name;
                for (let key in avoidRooms) {
                    let name = avoidRooms[key].name;
                    let distance = Game.map.findRoute(worthyName, name).length;
                    if (distance < 4) {
                        continue loop1;
                    }
                }
                possibles[key] = worthyRooms[key];
            }
        room.memory.claimTarget = _.max(possibles, 'claimValue').name;
        if (room.memory.claimTarget) {
            delete Memory.roomCache[room.memory.claimTarget].claimWorthy;
            Memory.lastExpansion = Game.time;
            Game.notify(room.memory.claimTarget + ' - Has been marked for claiming by ' + room.name);
            log.i(room.memory.claimTarget + ' - Has been marked for claiming by ' + room.name);
        } else {
            log.i(room.name + ' Could not find any valid expansion rooms.');
        }
    }
    shib.shibBench('roomClaiming', cpu);
};