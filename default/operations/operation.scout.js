/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
Creep.prototype.scoutRoom = function () {
    if (!Memory.targetRooms[this.memory.destination] && !Memory.auxiliaryTargets[this.memory.destination]) return this.recycleCreep();
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {
            range: 23,
            offRoad: true
        });
    }
    if (!this.hide()) this.idleFor(10);
    return operationPlanner(this.room, this);
};

Creep.prototype.operationManager = function () {
    return forwardObserver(this.room);
};

StructureObserver.prototype.operationPlanner = function (room) {
    if (!room) return;
    room.invaderCheck();
    room.cacheRoomIntel();
    if (Memory.targetRooms[room.name] || (Memory.auxiliaryTargets && Memory.auxiliaryTargets[room.name])) return operationPlanner(room);
};

function operationPlanner(room, creep = undefined) {
    if (Memory.targetRooms[room.name]) {
        forwardObserver(room);
    } else if (Memory.auxiliaryTargets && Memory.auxiliaryTargets[room.name]) {
        room.cacheRoomIntel(true);
    } else {
        room.cacheRoomIntel();
    }
}

// Observer tasks
function forwardObserver(room) {
    room.cacheRoomIntel();
    const targetRoom = Memory.targetRooms[room.name];
    if (!targetRoom) return false;

    if (room.controller && room.controller.safeMode && room.controller.owner && !FRIENDLIES.includes(room.controller.owner.username)) {
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
        case 'stronghold':
            updateRoomLevel(room);
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
        if (maxStrengthUser) Memory.targetRooms[room.name].maxLevel = userStrength(maxStrengthUser);
    }
}

function handleRoomDenialOperation(room) {
    if (!room.controller || !room.controller.owner || FRIENDLIES.includes(room.controller.owner.username)) {
        log.a(`Canceling room denial operation in ${roomLink(room.name)} as it is no longer owned.`, 'HIGH COMMAND: ');
        delete Memory.targetRooms[room.name];
        return;
    }

    const towers = room.towers[0];
    const armedHostiles = room.hostileCreeps.find((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    Memory.targetRooms[room.name].camping = !towers && !armedHostiles;

    updateRoomLevel(room);
    handleCleanerAndClaimAttacker(room);
}

function handleScoutOperation(room) {
    room.cacheRoomIntel(true)
    const towers = room.towers;
    const intel = INTEL[room.name];
    if (!intel) return;
    const owner = intel.owner;
    const isHostile = owner && _.pluck(WAR_TARGETS, 'user').includes(owner);

    if (intel.sk && towers.length) {
        Memory.targetRooms[room.name].type = 'stronghold';
        Memory.targetRooms[room.name].boosts = [HEAL];
    } else if (isHostile && (!intel.towers || towers.length <= 3)) {
        Memory.targetRooms[room.name].type = 'roomDenial';
        if (towers.length) Memory.targetRooms[room.name].boosts = [HEAL];
        log.a(`Room ${roomLink(room.name)} converted to room denial operation.`, 'HIGH COMMAND: ');
    } else if (isHostile && intel.towers > 3) {
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
        if (room.controller && (!room.controller.upgradeBlocked || room.controller.upgradeBlocked < CREEP_CLAIM_LIFE_TIME) &&
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
    if (!targetRoom) return;
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
    } else if (armedCreeps || (targetRoom.type === 'guard' && room.controller && room.controller.safeMode < CREEP_LIFE_TIME)) {
        targetRoom.level = 2;
    } else if (room.hostileCreeps.length || room.hostileStructures.length) {
        targetRoom.level = 1;
    } else {
        if (targetRoom.type === 'guard') {
            targetRoom.builders = room.controller && room.controller.owner && FRIENDLIES.includes(room.controller.owner.username);
        }
        targetRoom.level = 0;
    }
    if (!towers.length && targetRoom.type !== 'stronghold') targetRoom.boosts = undefined;
}