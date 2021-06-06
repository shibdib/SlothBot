/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    // If you lost your claim part... die
    if (!creep.hasActiveBodyparts(CLAIM)) creep.suicide();
    //Check if claim clear op
    if (creep.memory.operation === 'claimClear') return creep.claimClear();
    //Initial move
    if (creep.pos.roomName !== creep.memory.destination) {
        if (Game.gcl.level <= Memory.myRooms.length) {
            delete Memory.auxiliaryTargets[creep.room.name];
            return creep.suicide();
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        if (creep.room.controller) {
            if (creep.room.controller.owner) {
                cleanRoom(creep.room, creep.room.structures);
                creep.room.cacheRoomIntel(true, creep);
                return creep.suicide();
            }
            if (!creep.pos.findClosestByPath(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTROLLER))) {
                Memory.roomCache[creep.room.name].obstructions = true;
                Memory.auxiliaryTargets[creep.room.name] = undefined;
                return creep.suicide();
            }
            if (!creep.memory.signed) {
                switch (creep.signController(creep.room.controller, _.sample(OWNED_ROOM_SIGNS))) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.controller);
                        break;
                    case OK:
                        creep.room.memory = undefined;
                        creep.room.cacheRoomIntel(true, creep);
                        creep.memory.signed = true;
                }
            } else {
                switch (creep.claimController(creep.room.controller)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.controller);
                        break;
                    case ERR_BUSY:
                        break;
                    case ERR_NOT_FOUND:
                        break;
                    case ERR_INVALID_TARGET:
                        break;
                    case OK:
                        Memory.auxiliaryTargets[creep.room.name] = undefined;
                        Memory.targetRooms[creep.room.name] = undefined;
                        Memory.myRooms.push(creep.room.name);
                }
            }
        }
    }
};

function cleanRoom(room, structures) {
    _.filter(structures, (s) => s.structureType !== STRUCTURE_CONTROLLER).forEach((s) => s.destroy());
}
