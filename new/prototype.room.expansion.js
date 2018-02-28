let shib = require("shibBench");

Room.prototype.claimNewRoom = function () {
    let cpu = Game.cpu.getUsed();
    let avoidRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && _.includes(FRIENDLIES, r.controller.owner['username']));
    let worthyRooms = _.filter(Memory.roomCache, (room) => room.claimWorthy && room.name !== this.name && room.sources.length === 2);
    if (!Memory.lastExpansion) Memory.lastExpansion = Game.time;
    this.memory.claimTarget = undefined;
    if (avoidRooms.length === 0) return;
    if (worthyRooms.length > 0) {
        let possibles = {};
        loop1:
            for (let key in worthyRooms) {
                let worthyName = worthyRooms[key].name;
                if (worthyRooms[key].owner || worthyRooms[key].reservation || 9 < Game.map.findRoute(this.name, worthyName).length || Game.map.getRoomLinearDistance(this.name, worthyName) > 4 || _.filter(Memory.ownedRooms, (room) => room.claimTarget && room.claimTarget === worthyName).length > 0) continue;
                for (let key in avoidRooms) {
                    let name = avoidRooms[key].name;
                    let distance = Game.map.findRoute(worthyName, name).length;
                    if (distance < 3) {
                        continue loop1;
                    }
                }
                possibles[key] = worthyRooms[key];
            }
        this.memory.claimTarget = _.pluck(_.sortBy(possibles, 'claimValue'), 'name')[0];
        if (this.memory.claimTarget) {
            Memory.roomCache[this.memory.claimTarget].claimWorthy = undefined;
            Memory.lastExpansion = Game.time;
            Game.notify(this.memory.claimTarget + ' - Has been marked for claiming by ' + this.name);
            log.i(this.memory.claimTarget + ' - Has been marked for claiming by ' + this.name);
        } else {
            log.i(this.name + ' Could not find any valid expansion rooms.');
        }
    }
    shib.shibBench('roomClaiming', cpu);
};