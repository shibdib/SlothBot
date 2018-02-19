let profiler = require('screeps-profiler');

claimNewRoom = function () {
    let worthyRooms = _.filter(Memory.roomCache, (room) => room.claimWorthy && room.name !== this.name && room.sources.length === 2);
    if (worthyRooms.length > 0) {
        let possibles = {};
        loop1:
            for (let key in worthyRooms) {
                if (worthyRooms[key].owner || worthyRooms[key].reservation) continue;
                let worthyName = worthyRooms[key].name;
                for (let key in Memory.ownedRooms) {
                    let distance = Game.map.getRoomLinearDistance(worthyName, key);
                    if (distance < 2) {
                        continue loop1;
                    }
                }
                let distance = Game.map.getRoomLinearDistance(this.name, worthyName);
                if (2 <= distance < 5) {
                    possibles[key] = worthyRooms[key];
                }
            }
        this.memory.claimTarget = _.pluck(_.sortBy(possibles, 'claimValue'), 'name')[0];
        if (this.memory.claimTarget) {
            Memory.roomCache[this.memory.claimTarget].claimWorthy = undefined;
            Game.notify(this.memory.claimTarget + ' - Has been marked for claiming by ' + this.name);
            console.log(this.memory.claimTarget + ' - Has been marked for claiming by ' + this.name);
        }
    }
};
Room.prototype.claimNewRoom = profiler.registerFN(claimNewRoom, 'claimNewRoom');