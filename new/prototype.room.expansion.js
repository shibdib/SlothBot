let profiler = require('screeps-profiler');

claimNewRoom = function () {
    let worthyRooms = _.filter(Memory.roomCache, (room) => room.claimWorthy);
    let possibles = {};
    if (worthyRooms.length > 0) {
        loop1:
            for (let key in worthyRooms) {
                for (let key in Memory.ownedRooms) {
                    let distance = Game.map.getRoomLinearDistance(this.name, key);
                    if (2 > distance) {
                        continue loop1;
                    }
                }
                let distance = Game.map.getRoomLinearDistance(this.name, key);
                if (distance < 5) {
                    possibles = worthyRooms[key];
                }
            }
        this.memory.claimTarget = _.max(possibles, 'claimValue')[0];
        Game.rooms[this.memory.claimTarget].memory.claimWorthy = undefined;
        Game.notify(this.memory.claimTarget + ' - Has been marked for claiming by ' + this.name)
    }
};
Room.prototype.claimNewRoom = profiler.registerFN(claimNewRoom, 'claimNewRoom');