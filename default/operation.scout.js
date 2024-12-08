/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const highCommand = require('military.highCommand');
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
    return forwardObserver(room);
};

function operationPlanner(room, creep = undefined) {
    // Handle forward observer
    if (Memory.targetRooms[room.name]) {
        forwardObserver(room);
        if (creep && !creep.moveToHostileConstructionSites(false, true)) creep.idleFor(25);
    }
}

// Observer tasks
function forwardObserver(room) {
    const targetRoom = Memory.targetRooms[room.name];
    if (!targetRoom) return false;

    // Handle safemode in the target room
    if (room.controller && room.controller.safeMode) {
        updateRoomSafemode(room);
        return;
    }

    // Update hostile users in the room and determine the overall threat level
    updateHostileUsers(room);

    // Make strategic decision based on room type and threat level
    switch (targetRoom.type) {
        case 'hold':
            handleHoldOperation(room);
            break;
        case 'scout':
            handleScoutOperation(room);
            break;
        case 'denial':
            handleDenialOperation(room);
            break;
        default:
            break;
    }

    // Dynamically update room priority based on enemy presence, upgrades, and strategic importance
    updateRoomPriority(room);

    // Update room level based on hostile creeps or structures
    updateRoomLevel(room);
}

// Helper function to handle safemode in the target room
function updateRoomSafemode(room) {
    const tick = Game.time;
    let targetRoom = Memory.targetRooms[room.name] || {};
    targetRoom = {
        ...targetRoom,
        tick,
        type: 'pending',
        dDay: tick + room.controller.safeMode,
        observerCheck: tick
    };
    Memory.targetRooms[room.name] = targetRoom;
}

// Helper function to update hostile users and assess the threat level in the room
function updateHostileUsers(room) {
    if (room.hostileCreeps.length) {
        let userList = Memory.targetRooms[room.name].userList || [];
        let users = _.uniq(_.map(room.hostileCreeps, 'owner.username'));
        Memory.targetRooms[room.name].userList = _.union(userList, users);

        // Calculate threat level based on user strength
        let maxStrengthUser = _.max(Memory.targetRooms[room.name].userList, userStrength);
        Memory.targetRooms[room.name].maxLevel = userStrength(maxStrengthUser);

        // Automatically escalate room level if high threat detected
        if (room.hostileCreeps.length > 5) {  // Threshold for escalation (can be adjusted)
            Memory.targetRooms[room.name].level = 3;
        }
    }
}

// Handle the "hold" operation type for the room
function handleHoldOperation(room) {
    if (INTEL[room.name].towers) {
        // Convert to denial if towers are detected
        Memory.targetRooms[room.name].type = 'denial';
        Memory.targetRooms[room.name].level = 1;
        log.a(`Converting hold operation in ${roomLink(room.name)} to remote denial due to tower detection.`, 'HIGH COMMAND: ');
        return;
    }

    if (!room.controller || !room.controller.owner) {
        // Cancel hold if room is no longer owned
        log.a(`Canceling hold operation in ${roomLink(room.name)} as it is no longer owned.`, 'HIGH COMMAND: ');
        delete Memory.targetRooms[room.name];
        return;
    }

    // Request cleaner and claim attacker if conditions are met
    handleCleanerAndClaimAttacker(room);

    // Adjust room priority dynamically based on tower progress or controller upgrade
    adjustPriorityForHoldOperation(room);
}

// Handle the "scout" operation type for the room
function handleScoutOperation(room) {
    if (INTEL[room.name].towers) {
        // Convert to denial if towers are detected
        Memory.targetRooms[room.name].type = 'denial';
        log.a(`Room ${roomLink(room.name)} converted to denial operation.`, 'HIGH COMMAND: ');
    } else if (INTEL[room.name].owner) {
        // Convert to hold if room is owned
        Memory.targetRooms[room.name].type = 'hold';
        log.a(`Room ${roomLink(room.name)} converted to hold operation.`, 'HIGH COMMAND: ');
    } else {
        // Default to guard operation if no owner
        Memory.targetRooms[room.name].type = 'guard';
        log.a(`Room ${roomLink(room.name)} converted to guard operation.`, 'HIGH COMMAND: ');
    }
}

// Handle the "denial" operation type for the room
function handleDenialOperation(room) {
    if (!room.controller || room.controller.safeMode) {
        log.a(`Room ${roomLink(room.name)} is in safe mode, cannot perform denial operation.`, 'HIGH COMMAND: ');
        return;
    }

    // Actively deny remotes by maintaining control or escalating operation
    if (room.hostileCreeps.length || room.hostileStructures.length) {
        Memory.targetRooms[room.name].level = 2; // Level 2 for high threat areas
    } else {
        Memory.targetRooms[room.name].level = 1; // Moderate threat or clear
    }

    // Adjust operational priority for denial based on enemy presence
    if (room.controller && room.controller.progress < room.controller.progressTotal * 0.2) {
        // Priority for denial operation when controller is under-progressed
        Memory.targetRooms[room.name].priority = PRIORITIES.high;
    }
}

// Handle the cleaner and claim attacker logic for the "hold" operation
function handleCleanerAndClaimAttacker(room) {
    const targetRoom = Memory.targetRooms[room.name];

    if (!room.hostileCreeps.length) {
        // If no hostile creeps, request cleaner and claim attacker if possible
        if (room.hostileStructures.length) targetRoom.cleaner = true;
        if (
            (!room.controller.upgradeBlocked || room.controller.upgradeBlocked < CREEP_CLAIM_LIFE_TIME) &&
            room.controller.pos.countOpenTerrainAround()
        ) {
            targetRoom.claimAttacker = true;
        } else {
            targetRoom.claimAttacker = undefined;
        }
    } else {
        targetRoom.claimAttacker = undefined;
        targetRoom.cleaner = undefined;
    }
}

// Adjust priority for hold operations dynamically
function adjustPriorityForHoldOperation(room) {
    const targetRoom = Memory.targetRooms[room.name];
    const inBuildTower = _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_TOWER && s.progress);

    if (inBuildTower || (room.controller.level === 2 && room.controller.progress >= room.controller.progressTotal * 0.25)) {
        if (!targetRoom.level) targetRoom.level = 1;
        targetRoom.priority = PRIORITIES.high;
    } else {
        targetRoom.priority = PRIORITIES.medium;
    }
}

// Update the level of the room based on hostile presence or structural damage
function updateRoomLevel(room) {
    const targetRoom = Memory.targetRooms[room.name];

    if (room.hostileCreeps.length || room.hostileStructures.length) {
        targetRoom.level = 2; // Major threat level
    } else if (room.hostileStructures.length) {
        targetRoom.level = 1; // Moderate threat
    } else {
        targetRoom.level = 0; // Low or no threat
    }
}

// Dynamically adjust room priority based on various factors
function updateRoomPriority(room) {
    const targetRoom = Memory.targetRooms[room.name];

    // Elevate priority if room is near valuable resources or key infrastructure
    if (INTEL[room.name] && INTEL[room.name].important) {
        targetRoom.priority = PRIORITIES.high;
    } else if (targetRoom.level === 2) {
        targetRoom.priority = PRIORITIES.urgent;
    } else if (targetRoom.level === 1) {
        targetRoom.priority = PRIORITIES.medium;
    } else {
        targetRoom.priority = PRIORITIES.low;
    }
}