/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.scoutRoom = function () {
    // If room is no longer a target
    if (!Memory.targetRooms[this.memory.destination]) {
        this.memory._shibMove = undefined;
        return this.memory.role = 'explorer';
    }
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {
            range: 23,
            offRoad: true
        });
    }
    return operationPlanner(this.room, this);
};

Creep.prototype.operationManager = function () {
    return operationPlanner(this.room, this);
};

StructureObserver.prototype.operationPlanner = function (room) {
    return operationPlanner(room);
};

function operationPlanner(room, creep = undefined) {
    // Handle forward observer
    if (Memory.targetRooms[room.name]) {
        forwardObserver(room);
        if (creep && !creep.moveToHostileConstructionSites(false, true)) creep.idleFor(25);
        return;
    }
}

// Observer tasks
function forwardObserver(room) {
    if (!Memory.targetRooms[room.name]) return false;
    // Safemode
    if (room.controller && room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + room.controller.safeMode,
        };
        Memory.targetRooms = cache;
        return;
    }
    //Type specific stuff
    switch (Memory.targetRooms[room.name].type) {
        case 'hold':
            let towers = _.filter(room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.store[RESOURCE_ENERGY] > 10 && c.isActive());
            if (towers.length) {
                delete Memory.targetRooms[room.name];
                log.a('Canceling hold operation in ' + roomLink(room.name) + ' as a tower is now detected.', 'HIGH COMMAND: ');
                return room.cacheRoomIntel(true);
            }
            // HOLD - Clear target if room is no longer owned
            if (!room.controller || !room.controller.owner || room.controller.safeMode || !Memory.targetRooms[room.name]) {
                log.a('Canceling hold operation in ' + roomLink(room.name) + ' as it is no longer owned.', 'HIGH COMMAND: ');
                delete Memory.targetRooms[room.name];
                return;
            }
            // Request unClaimer if room level is too high
            if (room.hostileStructures.length) Memory.targetRooms[room.name].cleaner = true;
            Memory.targetRooms[room.name].claimAttacker = undefined;
            if (room.controller && room.controller.owner && (!room.controller.upgradeBlocked || room.controller.upgradeBlocked < CREEP_CLAIM_LIFE_TIME) && room.controller.pos.countOpenTerrainAround()) Memory.targetRooms[room.name].claimAttacker = true;
            else Memory.targetRooms[room.name].claimAttacker = false;
            break;
    }
    let otherRooms = _.filter(Memory.roomCache, (r) => r.name !== room.name && r.owner === Memory.roomCache[room.name].owner)[0]
    let armedEnemies = _.filter(room.hostileCreeps, (c) => (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) && !_.includes(FRIENDLIES, c.owner.username));
    if (armedEnemies.length) {
        Memory.targetRooms[room.name].level = 2;
    } else if (otherRooms || room.hostileCreeps.length) {
        Memory.targetRooms[room.name].level = 1;
    } else {
        Memory.targetRooms[room.name].level = 0;
    }
}