/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.claimClear = function () {
    if (this.room.name === this.memory.destination) {
        if (!this.room.controller.owner) {
            switch (this.claimController(this.room.controller)) {
                case ERR_NOT_IN_RANGE:
                    this.shibMove(this.room.controller);
                    break;
                case ERR_BUSY:
                    break;
                case ERR_NOT_FOUND:
                    break;
                case ERR_INVALID_TARGET:
                    break;
                case OK:
                    this.signController(this.room.controller, 'Cleaning provided by #Overlord-bot');
            }
        } else {
            cleanRoom(this.room, this.room.structures);
            this.room.controller.unclaim();
            this.room.cacheRoomIntel(true);
            if (Memory.targetRooms) delete Memory.targetRooms[this.room.name];
            this.memory.recycle = true;
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
    }
};

function cleanRoom(room, structures) {
    for (let key in structures) {
        if (structures[key] && structures[key].structureType !== STRUCTURE_ROAD) {
            structures[key].destroy();
        }
    }
}