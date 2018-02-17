let profiler = require('screeps-profiler');

claimNewRoom = function () {
    let worthyRooms = _.filter(Memory.roomCache, (room) => room.claimWorthy);
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
                    this.memory.claimTarget = key;
                }
            }
    }
};
Room.prototype.claimNewRoom = profiler.registerFN(claimNewRoom, 'claimNewRoom');