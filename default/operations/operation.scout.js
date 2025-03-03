/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
Creep.prototype.scoutRoom = function () {
    if (!Memory.targetRooms[this.memory.destination]) return this.recycleCreep();
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {
            range: 23,
            offRoad: true
        });
    }
    if (!this.shibKite()) {
        this.moveToHostileConstructionSites();
    }
    return operationPlanner(this.room, this);
};

Creep.prototype.operationManager = function () {
    return forwardObserver(this.room);
};

StructureObserver.prototype.operationPlanner = function (room) {
    if (!room) return;
    room.invaderCheck();
    room.cacheRoomIntel();
    if (Memory.targetRooms[room.name]) return operationPlanner(room);
};

function operationPlanner(room, creep = undefined) {
    // Handle forward observer
    if (Memory.targetRooms[room.name]) {
        forwardObserver(room);
        if (creep && !creep.moveToHostileConstructionSites(false, true)) creep.idleFor(25);
    } else {
        room.cacheRoomIntel();
    }
}

// Observer tasks
function forwardObserver(room) {
    room.cacheRoomIntel();
    const targetRoom = Memory.targetRooms[room.name];
    if (!targetRoom) return false;

    if (room.controller && room.controller.safeMode) {
        updateRoomSafemode(room);
        return;
    }

    updateHostileUsers(room);

    switch (targetRoom.type) {
        case 'roomDenial':
            handleRoomDenialOperation(room);
            break;
        case 'scout':
            handleScoutOperation(room);
            break;
        case 'remoteDenial':
            handleRemoteDenialOperation(room);
            break;
        default:
            updateRoomLevel(room);
            break;
    }
}

function updateRoomSafemode(room) {
    const tick = Game.time;
    let targetRoom = Memory.targetRooms[room.name] || {};
    targetRoom = {
        ...targetRoom,
        tick,
        type: 'remoteDenial',
        dDay: tick + room.controller.safeMode
    };
    Memory.targetRooms[room.name] = targetRoom;
}

function updateHostileUsers(room) {
    if (room.hostileCreeps.length) {
        let userList = Memory.targetRooms[room.name].userList || [];
        let users = _.uniq(_.map(room.hostileCreeps, 'owner.username'));
        Memory.targetRooms[room.name].userList = _.union(userList, users);

        let maxStrengthUser = _.max(Memory.targetRooms[room.name].userList, userStrength);
        Memory.targetRooms[room.name].maxLevel = userStrength(maxStrengthUser);
    }
}

function handleRoomDenialOperation(room) {
    if (!room.controller || !room.controller.owner) {
        log.a(`Canceling room denial operation in ${roomLink(room.name)} as it is no longer owned.`, 'HIGH COMMAND: ');
        delete Memory.targetRooms[room.name];
        return;
    }

    const towers = room.structures.find((s) => s.structureType === STRUCTURE_TOWER);
    Memory.targetRooms[room.name].camping = !!towers;

    updateRoomLevel(room);
    handleCleanerAndClaimAttacker(room);
}

function handleScoutOperation(room) {
    room.cacheRoomIntel(true)
    const towers = room.structures.filter((s) => s.structureType === STRUCTURE_TOWER);
    if (INTEL[room.name].sk && towers.length) {
        Memory.targetRooms[room.name].type = 'stronghold';
        Memory.targetRooms[room.name].boosts = [HEAL];
    } else if (INTEL[room.name].owner && (!INTEL[room.name].towers || towers.length <= 3)) {
        Memory.targetRooms[room.name].type = 'roomDenial';
        if (towers.length) Memory.targetRooms[room.name].boosts = [HEAL];
        log.a(`Room ${roomLink(room.name)} converted to room denial operation.`, 'HIGH COMMAND: ');
    } else if (INTEL[room.name].owner && INTEL[room.name].towers > 3) {
        Memory.targetRooms[room.name].type = 'remoteDenial';
        log.a(`Room ${roomLink(room.name)} converted to remote denial operation.`, 'HIGH COMMAND: ');
    } else {
        Memory.targetRooms[room.name].type = 'guard';
        log.a(`Room ${roomLink(room.name)} converted to guard operation.`, 'HIGH COMMAND: ');
    }
    updateRoomLevel(room);
}

function handleRemoteDenialOperation(room) {
    const armedHostiles = room.hostileCreeps.find((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    if (armedHostiles) {
        Memory.targetRooms[room.name].level = 2;
    } else {
        Memory.targetRooms[room.name].level = 1;
    }
}

function handleCleanerAndClaimAttacker(room) {
    const targetRoom = Memory.targetRooms[room.name];
    if (!room.hostileCreeps.length) {
        // If no hostile creeps, request cleaner and claim attacker if possible
        if (room.hostileStructures.length) targetRoom.cleaner = true;
        if ((!room.controller.upgradeBlocked || room.controller.upgradeBlocked < CREEP_CLAIM_LIFE_TIME) &&
            room.controller.pos.countOpenTerrainAround()) {
            targetRoom.claimAttacker = true;
        } else {
            targetRoom.claimAttacker = undefined;
        }
    } else {
        targetRoom.claimAttacker = undefined;
        targetRoom.cleaner = undefined;
    }
}

function updateRoomLevel(room) {
    const targetRoom = Memory.targetRooms[room.name];
    const towers = room.hostileStructures.filter((s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST);
    const armedCreeps = room.hostileCreeps.find((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    if (towers.length) {
        if (towers.length === 1) {
            targetRoom.level = 2;
        } else if (towers.length === 2) {
            targetRoom.level = 3;
        } else {
            targetRoom.level = 4;
        }
    } else if (armedCreeps) {
        targetRoom.level = 3;
    } else if (room.hostileCreeps.length || room.hostileStructures.length) {
        targetRoom.level = 2;
    } else if (Memory.targetRooms[room.name] && Memory.targetRooms[room.name].type === 'guard') {
        targetRoom.level = 1;
    } else {
        targetRoom.level = 0;
    }
    if (!towers.length) targetRoom.boosts = undefined;
}