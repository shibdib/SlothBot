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
    if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 22});
    levelManager(creep);
    if (creep.room.controller.upgradeBlocked > creep.ticksToLive) creep.memory.recycle = true;
    if (creep.room.controller && (creep.room.controller.owner || creep.room.controller.reservation)) {
        switch (creep.attackController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    creep.signController(creep.room.controller, _.sample(ATTACK_ROOM_SIGNS));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller, {range: 1});
                break;
        }
    } else if (creep.room.controller) {
        switch (creep.reserveController(creep.room.controller)) {
            case OK:
                if (!creep.memory.signed) {
                    creep.signController(creep.room.controller, _.sample(ATTACK_ROOM_SIGNS));
                    creep.memory.signed = true;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(creep.room.controller, {range: 1});
                break;
        }
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.destination] || creep.room.name !== creep.memory.destination) return;
    if (!creep.room.controller || (!creep.room.controller.owner && !creep.room.controller.reservation) || (!creep.room.creeps.length && !creep.room.structures.length)) return delete Memory.targetRooms[creep.memory.destination];
    // Safemode
    if (creep.room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[creep.room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + creep.room.controller.safeMode,
        };
        Memory.targetRooms = cache;
        creep.memory.recycle = true;
        return;
    }
    let otherRooms = _.filter(Memory.roomCache, (r) => r.name !== creep.room.name && r.owner === Memory.roomCache[creep.room.name].owner)[0]
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10 && c.isActive());
    let armedEnemies = _.filter(creep.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)) && !_.includes(FRIENDLIES, c.owner.username));
    let armedOwners = _.filter(_.union(_.pluck(armedEnemies, 'owner.username'), [Memory.roomCache[creep.room.name].user]), (o) => !_.includes(FRIENDLIES, o) && o !== 'Invader');
    Memory.targetRooms[creep.memory.destination].claimAttacker = undefined;
    if (armedOwners.length > 1) {
        delete Memory.targetRooms[creep.memory.destination];
        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as there is a 3rd party present.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
    } else if (towers.length) {
        delete Memory.targetRooms[creep.memory.destination];
        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot hold it due to towers.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
    } else if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.destination].level = 2;
    } else if (otherRooms) {
        Memory.targetRooms[creep.memory.destination].level = 1;
        Memory.targetRooms[creep.memory.destination].claimAttacker = true;
    } else {
        Memory.targetRooms[creep.memory.destination].level = 0;
    }
}