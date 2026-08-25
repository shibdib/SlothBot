/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const {getMilitaryCreeps} = require('hcUtils');
const {notifySiegeEnd} = require('module.notifications');
const {SIEGE_REQUIRED_BOOSTS, SIEGE_OPTIONAL_BOOSTS} = require('bodySiegeBoosts');
const {canLaunchNewRoomDenial} = require('hcMilitaryOps');
const {promoteToRoomDenial} = require('hcTargets');

Creep.prototype.scoutRoom = function () {
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
    // Intel was just written by ObserverControl.processPreviousObservation.
    room.invaderCheck();
    if (Memory.targetRooms[room.name] || (Memory.auxiliaryTargets && Memory.auxiliaryTargets[room.name])) {
        return operationPlanner(room);
    }
};

function refreshRoomIntel(room, force = false) {
    if (!room) return;
    const intel = INTEL[room.name];
    if (intel && intel.lastObservation === Game.time) return;
    room.cacheRoomIntel(force);
}

function operationPlanner(room) {
    if (Memory.targetRooms[room.name]) {
        forwardObserver(room);
    } else {
        refreshRoomIntel(room);
    }
}

// Observer tasks
function forwardObserver(room) {
    refreshRoomIntel(room);
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
    const wasSiege = targetRoom.type === 'roomDenial';
    targetRoom = {
        ...targetRoom,
        tick,
        type: 'remoteDenial',
        dDay: tick + room.controller.safeMode
    };
    Memory.targetRooms[room.name] = targetRoom;
    if (wasSiege) notifySiegeEnd(room.name, 'SAFEMODE', targetRoom);
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
        notifySiegeEnd(room.name, 'SUCCESS', Memory.targetRooms[room.name]);
        delete Memory.targetRooms[room.name];
        return;
    }

    const towerCount = (room.towers || []).length;
    if (!towerCount) {
        convertRoomDenialToGuard(room);
        return;
    }

    const armedHostiles = room.hostileCreeps.find((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK));
    if (Memory.targetRooms[room.name].camping) Memory.targetRooms[room.name].camping = undefined;
    if (INTEL[room.name]) INTEL[room.name].activeDefenders = !!armedHostiles;

    updateRoomLevel(room);
    handleCleanerAndClaimAttacker(room);
}

function convertRoomDenialToGuard(room) {
    const op = Memory.targetRooms[room.name];
    if (!op) return;
    notifySiegeEnd(room.name, 'TOWERS DOWN', op);
    op.type = 'guard';
    op.boosts = undefined;
    op.optionalBoosts = undefined;
    op.camping = true;
    op.tick = Game.time;
    const creeps = getMilitaryCreeps();
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (!c || !c.memory || c.memory.destination !== room.name) continue;
        if (c.memory.operation === 'roomDenial') c.memory.operation = 'guard';
    }
    log.a(`Room denial in ${roomLink(room.name)} converted to guard — towers down.`, 'HIGH COMMAND: ');
    updateRoomLevel(room);
    handleCleanerAndClaimAttacker(room);
}

function handleScoutOperation(room) {
    refreshRoomIntel(room, true);
    const towers = room.towers;
    const intel = INTEL[room.name];
    if (!intel) return;
    const owner = intel.owner;
    const isHostile = owner && _.pluck(WAR_TARGETS, 'user').includes(owner);

    if (intel.sk && towers.length) {
        Memory.targetRooms[room.name].type = 'stronghold';
        Memory.targetRooms[room.name].boosts = SIEGE_REQUIRED_BOOSTS.slice();
        Memory.targetRooms[room.name].optionalBoosts = SIEGE_OPTIONAL_BOOSTS.slice();
    } else if (isHostile && canLaunchNewRoomDenial(intel)) {
        promoteToRoomDenial(room.name);
        log.a(`Room ${roomLink(room.name)} converted to room denial operation.`, 'HIGH COMMAND: ');
    } else if (isHostile && (towers.length || intel.towers)) {
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
    if (!targetRoom) return;

    // Towers are structures, not creeps. A dead garrison with live towers
    // would otherwise spawn unboosted WORK cleaners into full tower range.
    const hostileTowers = room.hostileStructures.some(s => s.structureType === STRUCTURE_TOWER);
    if (room.hostileCreeps.length || hostileTowers) {
        targetRoom.claimAttacker = undefined;
        targetRoom.cleaner = undefined;
        return;
    }

    targetRoom.cleaner = room.hostileStructures.length ? true : undefined;
    if (room.controller && (!room.controller.upgradeBlocked || room.controller.upgradeBlocked < CREEP_CLAIM_LIFE_TIME) &&
        room.controller.pos.countOpenTerrainAround()) {
        targetRoom.claimAttacker = true;
    } else {
        targetRoom.claimAttacker = undefined;
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
        const coreAlive = targetRoom.type === 'stronghold' && room.structures.some(s => s.structureType === STRUCTURE_INVADER_CORE);
        targetRoom.level = coreAlive ? 1 : 0;
    }
    // Towerless roomDenial is no longer a siege. Guard/rebuild keep their
    // lab wish-list so HEAL pinning still sees operation.boosts.
    if (!towers.length && targetRoom.type === 'roomDenial') {
        targetRoom.boosts = undefined;
        targetRoom.optionalBoosts = undefined;
    }
}