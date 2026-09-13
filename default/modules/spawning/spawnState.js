/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Module-level mutable state and tick throttles for the spawn system.
 */

const MILITARY_SUSTAIN_OPS = new Set(['roomDenial', 'remoteDenial', 'guard', 'rebuild', 'stronghold', 'borderPatrol', 'harass']);
const GLOBAL_QUEUE_FULL_SCAN_INTERVAL = 50;
const ESSENTIAL_INTERVAL = 10;
const MISC_INTERVAL = 12;
const REMOTE_INTERVAL = 5;

function roomThrottleOffset(roomName) {
    if (!roomName) return 0;
    let h = 0;
    for (let i = 0; i < roomName.length; i++) h = (h + roomName.charCodeAt(i) * (i + 1)) | 0;
    return h >>> 0;
}

function throttleDue(tickMap, roomName, interval) {
    if (!interval || interval < 1) return true;
    const last = tickMap[roomName];
    if (last !== undefined && last + interval > Game.time) return false;
    // First run after global reset: stagger so 24 rooms do not all fire together.
    if (last === undefined && (Game.time % interval) !== (roomThrottleOffset(roomName) % interval)) {
        return false;
    }
    return true;
}

function throttleReady(tickMap, roomName, interval) {
    if (!throttleDue(tickMap, roomName, interval)) return false;
    tickMap[roomName] = Game.time;
    return true;
}

module.exports = {
    MILITARY_SUSTAIN_OPS,
    GLOBAL_QUEUE_FULL_SCAN_INTERVAL,
    ESSENTIAL_INTERVAL,
    MISC_INTERVAL,
    REMOTE_INTERVAL,
    energyOrder: {},
    orderStored: {},
    remoteRoomTargets: {},
    lastBuilt: {},
    buildTick: {},
    essentialTick: {},
    miscTick: {},
    remoteTick: {},
    lastRemoteRefresh: {},
    contestedRemotes: {},
    blockedRemotes: {},
    lastGlobalOpSignature: '',
    waveHud: {},
    throttleDue,
    throttleReady,
};