/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Operation casualty tracking and sustainability checks.

 */


function operationSustainability(room, operationRoom = room.name) {
    let operation = Memory.targetRooms[operationRoom] || Memory.auxiliaryTargets[operationRoom]
        || Memory.targetRooms[room.name] || Memory.auxiliaryTargets[room.name];

    if (!operation) return;

    if (room.controller?.safeMode) {
        markAsPending(operationRoom, room);
        return true;
    }

    if (operation.sustainabilityCheck === Game.time) return;

    let friendlyDead = operation.friendlyDead || 0;
    let trackedFriendly = operation.trackedFriendly || [];
    let enemyDead = operation.enemyDead || 0;
    let trackedEnemy = operation.trackedEnemy || [];
    let isAtRisk = false;

    friendlyDead = processTombstones(room.tombstones, FRIENDLIES, friendlyDead, trackedFriendly);
    enemyDead = processTombstones(room.tombstones, null, enemyDead, trackedEnemy);

    operation.friendlyDead = friendlyDead;
    operation.trackedFriendly = trackedFriendly;
    operation.enemyDead = enemyDead;
    operation.trackedEnemy = trackedEnemy;
    operation.sustainabilityCheck = Game.time;

    if (operation.tick + CREEP_LIFE_TIME < Game.time && friendlyDead > 5000) {
        const ratio = friendlyDead / (enemyDead || 100);
        if (ratio > 2) isAtRisk = true;
    }

    operation.isAtRisk = isAtRisk;

    if (room.tombstones.length) {
        const deadEnemy = _.filter(room.tombstones, t => !FRIENDLIES.includes(t.creep.owner.username));
        operation.lastEnemyKilled = _.max(deadEnemy, 'deathTime');
    }

    if (isAtRisk && Memory.targetRooms[operationRoom]) {
        const ratio = friendlyDead / (enemyDead || 100);
        log.a(`Canceling operation in ${roomLink(operationRoom)} â€” unsustainable casualties (${ratio.toFixed(2)}).`, 'HIGH COMMAND: ');
        delete Memory.targetRooms[operationRoom];
        if (INTEL[operationRoom]) {
            INTEL[operationRoom].lastOperation = Game.time;
            INTEL[operationRoom].lastSiege = Game.time;
        }
        return true;
    }

    saveOperation(operationRoom, operation);

    if (isAtRisk) {
        log.w(`Operation in ${room.name} is at risk.`, 'OPERATION PLANNER: ');
    }
}

function markAsPending(operationRoom, room) {
    Memory.targetRooms[operationRoom] = {
        tick: Game.time,
        type: 'remoteDenial',
        level: 1,
        dDay: Game.time + room.controller.safeMode
    };
    log.a(`${room.name} marked as Remote Denial due to safemode.`, 'OPERATION PLANNER: ');
}

function processTombstones(tombstones, friendlyList, deadCount, trackedList) {
    const relevant = _.filter(tombstones, s => s.creep.ticksToLive > 5 && friendlyList
        ? _.includes(friendlyList, s.creep.owner.username)
        : !_.includes(FRIENDLIES, s.creep.owner.username));

    for (const tomb of relevant) {
        if (_.includes(trackedList, tomb.id)) continue;
        deadCount += UNIT_COST(tomb.creep.body);
        trackedList.push(tomb.id);
    }
    return deadCount;
}

function saveOperation(operationRoom, operation) {
    if (Memory.targetRooms[operationRoom]) Memory.targetRooms[operationRoom] = operation;
    else if (Memory.auxiliaryTargets[operationRoom]) Memory.auxiliaryTargets[operationRoom] = operation;
}

module.exports = {

    operationSustainability,

    markAsPending,

    processTombstones,

    saveOperation,

};