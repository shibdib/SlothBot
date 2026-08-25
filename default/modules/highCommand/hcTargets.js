/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Target room assignment for military and auxiliary ops.
 */

const {getPriority, scoreOriginDistance, siegeOpLevel} = require('hcUtils');
const {notifySiegeLaunch} = require('module.notifications');
const {SIEGE_REQUIRED_BOOSTS, SIEGE_OPTIONAL_BOOSTS} = require('bodySiegeBoosts');

function setTarget(room, operation, level = 1, military = true) {
    let cache = Memory.targetRooms || {};
    if (!military) cache = Memory.auxiliaryTargets || {};
    cache[room] = {
        tick: Game.time,
        type: operation,
        level: level,
        priority: getPriority(room, operation),
        // Sieges need more waves to break fortified rooms; harassment ops can cancel sooner
        waveLimit: (operation === 'roomDenial' || operation === 'stronghold') ? 8 : 4
    };
    if (military) Memory.targetRooms = cache; else Memory.auxiliaryTargets = cache;
    // Guard remotes may have no intel (unscanned neighbors are valid targets)
    if (!INTEL[room]) {
        INTEL[room] = {name: room};
        if (global.updateIntelIndex) global.updateIntelIndex(room, null, INTEL[room]);
    }
    if (operation === 'roomDenial') notifySiegeLaunch(room);
    return log.a(`${operation} operation planned for ${roomLink(room)} owned by ${INTEL[room].owner || 'N/A'} (Nearest capable room - ${scoreOriginDistance(room, operation)} rooms away)`, 'HIGH COMMAND: ');
}

/**
 * Turn an existing op (usually scout) into a roomDenial without wiping
 * assignedRoom / userList. Resets tick so siege stale uses a full lifetime.
 */
function promoteToRoomDenial(roomName) {
    const intel = INTEL[roomName] || {};
    const existing = Memory.targetRooms && Memory.targetRooms[roomName];
    if (!existing) {
        setTarget(roomName, 'roomDenial', siegeOpLevel(intel.towers));
        return;
    }
    existing.type = 'roomDenial';
    existing.level = siegeOpLevel(intel.towers);
    existing.waveLimit = 8;
    existing.priority = getPriority(roomName, 'roomDenial');
    existing.tick = Game.time;
    if (intel.towers) {
        existing.boosts = SIEGE_REQUIRED_BOOSTS.slice();
        existing.optionalBoosts = SIEGE_OPTIONAL_BOOSTS.slice();
    } else {
        existing.boosts = undefined;
        existing.optionalBoosts = undefined;
    }
    notifySiegeLaunch(roomName);
}

function recordSiegeWave(destination) {
    if (!destination) return;
    const op = Memory.targetRooms[destination];
    if (!op || (op.type !== 'roomDenial' && op.type !== 'stronghold')) return;
    if (op.waveRecordTick === Game.time) return;
    op.waveRecordTick = Game.time;
    op.waves = (op.waves || 0) + 1;
    op.lastWave = Game.time;
    try {
        require('module.notifications').notifySiegeEvent(destination, 'WAVE');
    } catch (e) { /* notifications optional at boot */
    }
}

function operationRan(target) {
    if (!target) return false;
    if (target.waves || target.lastEnemyKilled) return true;
    if ((target.friendlyDead || 0) > 0 || (target.enemyDead || 0) > 0) return true;
    const siege = target.type === 'roomDenial' || !!target.dDay;
    // Sieges must actually wave or fight before lastSiege locks the room.
    // Assignment-only (labs empty, never spawned) used to stamp a 3000-tick lock.
    if (siege) return false;
    if (target.assignedAt && target.assignedAt + 200 < Game.time) return true;
    return false;
}

/**
 * Stamp lastOperation / lastSiege only after an op actually ran (or force).
 * Planning and capacity cancels must not lock the room for ATTACK_COOLDOWN.
 */
function stampOperationCooldown(roomName, target, force) {
    if (!target) return;
    if (!force && !operationRan(target)) return;
    const rooms = [roomName];
    if (target.ownerRoom && target.ownerRoom !== roomName) rooms.push(target.ownerRoom);
    const siege = target.type === 'roomDenial' || !!target.dDay;
    for (let i = 0; i < rooms.length; i++) {
        const intel = INTEL[rooms[i]];
        if (!intel) continue;
        intel.lastOperation = Game.time;
        if (siege) intel.lastSiege = Game.time;
    }
}

module.exports = {
    setTarget,
    promoteToRoomDenial,
    recordSiegeWave,
    operationRan,
    stampOperationCooldown,
};
