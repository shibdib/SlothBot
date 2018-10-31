let shib = require("shibBench");

module.exports.claimNewRoom = function (room) {
    let cpu = Game.cpu.getUsed();
    let minLevel = _.min(Memory.ownedRooms, 'controller.level').controller.level;
    // Don't expand if there's a low level room needing to be built up
    if (minLevel < 4) return;
    // Don't expand if attacked recently
    if (room.memory.lastPlayerAttack && room.memory.lastPlayerAttack + 2500 >= Game.time) return;
    let avoidRooms = _.filter(Memory.roomCache, (r) => r.owner && _.includes(FRIENDLIES, r.owner.username));
    let worthyRooms = _.filter(Memory.roomCache, (r) => r.claimWorthy && r.name !== room.name);
    if (!Memory.lastExpansion) Memory.lastExpansion = Game.time;
    delete room.memory.claimTarget;
    if (worthyRooms.length > 0) {
        let possibles = {};
        loop1:
            for (let key in worthyRooms) {
                let worthyName = worthyRooms[key].name;
                for (let key in avoidRooms) {
                    let name = avoidRooms[key].name;
                    let distance = Game.map.findRoute(worthyName, name).length;
                    if (distance < 3 || distance > 10 || (Game.rooms[worthyName] && Game.rooms[worthyName].controller.my) || (Memory.noClaim && _.includes(Memory.noClaim, worthyName))) {
                        continue loop1;
                    }
                }
                possibles[key] = worthyRooms[key];
            }
        room.memory.claimTarget = _.max(possibles, 'claimValue').name;
        if (room.memory.claimTarget) {
            delete Memory.roomCache[room.memory.claimTarget].claimWorthy;
            Memory.lastExpansion = Game.time;
            log.i(room.memory.claimTarget + ' - Has been marked for claiming by ' + room.name);
            Game.notify(room.memory.claimTarget + ' - Has been marked for claiming by ' + room.name)
        }
    }
    shib.shibBench('roomClaiming', cpu);
};