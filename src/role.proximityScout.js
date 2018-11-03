/*
 * Copyright (c) 2018.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.room.cacheRoomIntel();
    creep.room.invaderCheck();
    let sayings = [creep.memory.overlord, 'PROXIMITY', 'INTRUSION', 'SENSOR'];
    let word = Game.time % sayings.length;
    creep.say(sayings[word], true);
    if (!creep.memory.destination) {
        let remotes = Game.rooms[creep.memory.overlord].memory.remoteRooms;
        creep.memory.destination = _.sample(remotes);
    }
    if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === creep.memory.destination) {
            urgentMilitary(creep);
            if (creep.room.controller && (!creep.room.controller.sign || creep.room.controller.sign.username !== USERNAME) &&
                !creep.room.controller.owner && (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                let signs = EXPLORED_ROOM_SIGNS;
                switch (creep.signController(creep.room.controller, _.sample(signs))) {
                    case OK:
                        creep.memory.destinationReached = true;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.controller, {offRoad: true});
                }
            } else if (!creep.moveToHostileConstructionSites()) {
                creep.memory.destinationReached = true;
            }
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {
                offRoad: true,
                range: 23
            });
        }
    } else {
        creep.memory.destination = undefined;
        creep.memory.destinationReached = undefined;
    }
};

function urgentMilitary(creep) {
    let sendScout;
    let range = creep.room.findClosestOwnedRoom(true);
    // Operation cooldown per room
    if (Memory.roomCache[creep.room.name] && !Memory.roomCache[creep.room.name].manual && Memory.roomCache[creep.room.name].lastOperation && Memory.roomCache[creep.room.name].lastOperation + ATTACK_COOLDOWN > Game.time) {
        return
    }
    // Already a target or too far
    if (Memory.targetRooms[creep.room.name] || range > 10) return;
    let otherCreeps = _.filter(creep.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper' && c.body.length > 1);
    let lootStructures = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.structureType === STRUCTURE_TERMINAL && s.structureType === STRUCTURE_STORAGE && _.sum(s.store) > 0);
    if (creep.room.controller) {
        // If neutral/hostile owned room
        if (creep.room.controller.owner && !_.includes(FRIENDLIES, creep.room.controller.owner.username) && (creep.room.controller.level < 3 || !_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER).length)) {
            sendScout = true;
        }
        // If unowned but lootable
        if (!creep.room.controller.owner && lootStructures.length) {
            sendScout = true;
        }
    }
    // If other creeps and nearby
    if (otherCreeps.length && range <= LOCAL_SPHERE + 2) {
        sendScout = true;
    }
    if (sendScout) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[creep.room.name] = {
            tick: tick,
            type: 'scout',
        };
        Memory.targetRooms = cache;
    }
}
