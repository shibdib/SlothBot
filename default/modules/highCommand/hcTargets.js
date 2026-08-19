/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Target room assignment for military and auxiliary ops.
 */

const {getPriority} = require('hcUtils');
const {notifySiegeLaunch} = require('module.notifications');

function setTarget(room, operation, level = 1, military = true) {
    let cache = Memory.targetRooms || {};
    if (!military) cache = Memory.auxiliaryTargets || {};
    cache[room] = {
        tick: Game.time,
        type: operation,
        level: level,
        priority: getPriority(room),
        // Sieges need more waves to break fortified rooms; harassment ops can cancel sooner
        waveLimit: operation === 'roomDenial' ? 8 : 4
    };
    if (military) Memory.targetRooms = cache; else Memory.auxiliaryTargets = cache;
    // Guard remotes may have no intel (unscanned neighbors are valid targets)
    if (!INTEL[room]) {
        INTEL[room] = {name: room};
        if (global.updateIntelIndex) global.updateIntelIndex(room, null, INTEL[room]);
    }
    if (operation === 'roomDenial') notifySiegeLaunch(room);
    return log.a(`${operation} operation planned for ${roomLink(room)} owned by ${INTEL[room].owner || 'N/A'} (Nearest Friendly Room - ${findClosestOwnedRoom(room, true)} rooms away)`, 'HIGH COMMAND: ');
}

function operationRan(target) {
    if (!target) return false;
    if (target.waves || target.lastEnemyKilled) return true;
    if ((target.friendlyDead || 0) > 0 || (target.enemyDead || 0) > 0) return true;
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
    operationRan,
    stampOperationCooldown,
};
