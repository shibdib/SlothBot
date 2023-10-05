/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
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
        if (Game.gcl.level <= MY_ROOMS.length) {
            delete Memory.auxiliaryTargets[creep.room.name];
            return creep.suicide();
        }
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        if (!creep.memory.intelLogged) {
            creep.memory.intelLogged = true;
        } else if (creep.room.controller.owner) {
            cleanRoom(creep.room);
            return creep.suicide();
        } else if (!creep.pos.findClosestByPath(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTROLLER))) {
            INTEL[creep.room.name].obstructions = true;
            Memory.auxiliaryTargets[creep.room.name] = undefined;
            return creep.suicide();
        } else if (!creep.memory.signed) {
            switch (creep.signController(creep.room.controller, _.sample(OWNED_ROOM_SIGNS))) {
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(creep.room.controller);
                    break;
                case OK:
                    creep.room.memory = undefined;
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
                    MY_ROOMS.push(creep.room.name);
            }
        }
    }
};

function cleanRoom(room) {
    _.filter(room.structures, (s) => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_ROAD).forEach((s) => s.destroy());
    _.filter(room.constructionSites, (s) => s.owner.username !== MY_USERNAME).forEach((s) => s.remove());
}
