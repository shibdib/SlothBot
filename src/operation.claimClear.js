/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
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
            abandonRoom(this.room);
            if (Memory.targetRooms) delete Memory.targetRooms[this.room.name];
            this.suicide();
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23});
    }
};