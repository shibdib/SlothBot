/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Module-level mutable state and tick throttles for the spawn system.
 */

const MILITARY_SUSTAIN_OPS = new Set(['roomDenial', 'remoteDenial', 'guard', 'rebuild', 'stronghold', 'borderPatrol', 'harass']);
const GLOBAL_QUEUE_FULL_SCAN_INTERVAL = 50;

module.exports = {
    MILITARY_SUSTAIN_OPS,
    GLOBAL_QUEUE_FULL_SCAN_INTERVAL,
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
    throttleReady(tickMap, roomName, interval) {
        const last = tickMap[roomName];
        if (last !== undefined && last + interval > Game.time) return false;
        tickMap[roomName] = Game.time;
        return true;
    },
};