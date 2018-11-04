let shib = require("shibBench");

module.exports.claimNewRoom = function () {
    let cpu = Game.cpu.getUsed();
    let avoidRooms = _.filter(Memory.roomCache, (r) => r.owner && _.includes(FRIENDLIES, r.owner.username));
    let worthyRooms = _.filter(Memory.roomCache, (r) => r.claimWorthy && !r.owner);
    if (!Memory.lastExpansion) Memory.lastExpansion = Game.time;
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
        let claimTarget = _.max(possibles, 'claimValue').name;
        if (claimTarget) {
            delete Memory.roomCache[claimTarget].claimWorthy;
            let closestRoom = Game.rooms[claimTarget].findClosestOwnedRoom();
            Game.rooms[closestRoom].memory.claimTarget = claimTarget;
            Memory.lastExpansion = Game.time;
            log.i(claimTarget + ' - Has been marked for claiming');
            Game.notify(claimTarget + ' - Has been marked for claiming');
        }
    }
    shib.shibBench('roomClaiming', cpu);
};