/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Status emails (Game.notify) plus console alerts. Domain helpers (siege, etc.)
 * live here so a new notification type is one function plus a notify() call.
 */

const {getMilitaryCreeps} = require('hcUtils');

const DEFAULT_GROUP_MINUTES = 30;

function isChannelEnabled(channel) {
    if (channel === 'siege') return typeof SIEGE_NOTIFY === 'undefined' || !!SIEGE_NOTIFY;
    return true;
}

function compactNumber(n) {
    const value = Number(n) || 0;
    if (value >= 1000000) {
        const text = (value / 1000000).toFixed(1);
        return (text.endsWith('.0') ? text.slice(0, -2) : text) + 'M';
    }
    if (value >= 1000) {
        const text = (value / 1000).toFixed(1);
        return (text.endsWith('.0') ? text.slice(0, -2) : text) + 'k';
    }
    return String(Math.round(value));
}

function formatElapsed(ticks) {
    const age = Math.max(0, ticks || 0);
    return `${age} ticks (~${Math.round(age / 60)} min)`;
}

/**
 * Email + console alert.
 * @param {string} message
 * @param {object} [options]
 * @param {string} [options.channel] 'siege' | 'defense' | 'nuke' | ...
 * @param {number} [options.groupMinutes] Game.notify grouping window; ignored if immediate
 * @param {boolean} [options.immediate] send without grouping
 * @param {string} [options.logTag] log.a custom prefix
 * @param {string} [options.logPrefix] prepended to the console line (roomLink, etc.)
 * @param {boolean} [options.email] force-disable email while still logging
 */
function notify(message, options = {}) {
    const emailOn = options.email !== false && isChannelEnabled(options.channel);
    if (emailOn) {
        const group = options.immediate ? 0
            : (options.groupMinutes != null ? options.groupMinutes : DEFAULT_GROUP_MINUTES);
        Game.notify(message, group);
    }
    const display = options.logPrefix ? `${options.logPrefix} ${message}` : message;
    log.a(display, options.logTag);
}

// --- roomDenial siege status ------------------------------------------------

const SIEGE_TERMINAL_REASONS = {
    LAUNCH: true,
    SUCCESS: true,
    ENDED: true,
    SAFEMODE: true,
    NUKE: true,
    UNSUSTAINABLE: true,
    'MAX WAVES': true,
    'NUKE HOLD': true,
};
const SIEGE_END_REASONS = {
    SUCCESS: true,
    ENDED: true,
    SAFEMODE: true,
    UNSUSTAINABLE: true,
    'MAX WAVES': true,
    'NUKE HOLD': true,
};
const SIEGE_QUIET_END = {
    ENDED: true,
    'MAX WAVES': true,
};

function isRoomDenial(op) {
    return !!(op && op.type === 'roomDenial');
}

function countSiegeCreeps(roomName) {
    const creeps = getMilitaryCreeps();
    let onSite = 0;
    let inbound = 0;
    for (let i = 0; i < creeps.length; i++) {
        const creep = creeps[i];
        const memory = creep && creep.memory;
        if (!memory || memory.destination !== roomName) continue;
        if (memory.operation && memory.operation !== 'roomDenial') continue;
        if (creep.room && creep.room.name === roomName) onSite++;
        else inbound++;
    }
    return {onSite, inbound};
}

function visibleTowerCount(roomName, intel) {
    const room = typeof Game !== 'undefined' && Game.rooms[roomName];
    if (room && room.towers) return room.towers.length;
    return intel.towers || 0;
}

function snapshotSiege(roomName, op) {
    const intel = (typeof INTEL !== 'undefined' && INTEL[roomName]) || {};
    const creeps = countSiegeCreeps(roomName);
    let lastKill = 0;
    if (op && op.lastEnemyKilled) {
        lastKill = op.lastEnemyKilled.deathTime || op.lastEnemyKilled || 0;
        if (typeof lastKill !== 'number') lastKill = 0;
    }
    return {
        owner: intel.owner || 'unknown',
        towers: visibleTowerCount(roomName, intel),
        level: intel.level || 0,
        ramparts: intel.rampartMedHP || 0,
        waves: (op && op.waves) || 0,
        waveLimit: (op && op.waveLimit) || 8,
        camping: !!(op && op.camping),
        cleaner: !!(op && op.cleaner),
        claimAttacker: !!(op && op.claimAttacker),
        nukeLaunched: op && op.nukeLaunched,
        dDay: op && op.dDay,
        friendlyDead: (op && op.friendlyDead) || 0,
        enemyDead: (op && op.enemyDead) || 0,
        activeDefenders: !!intel.activeDefenders,
        onSite: creeps.onSite,
        inbound: creeps.inbound,
        lastKill,
        assignedRoom: op && op.assignedRoom,
        manual: !!(op && op.manual),
        tick: (op && op.tick) || Game.time,
        safemode: intel.safemode,
    };
}

function makeSiegeAlert(snap, reason) {
    return {
        firstTick: snap.tick || Game.time,
        lastNotify: Game.time,
        lastReason: reason || 'LAUNCH',
        owner: snap.owner,
        towers: snap.towers,
        level: snap.level,
        waves: snap.waves,
        waveLimit: snap.waveLimit,
        camping: snap.camping,
        cleaner: snap.cleaner,
        claimAttacker: snap.claimAttacker,
        nukeLaunched: snap.nukeLaunched,
        friendlyDead: snap.friendlyDead,
        enemyDead: snap.enemyDead,
        activeDefenders: snap.activeDefenders,
        ramparts: snap.ramparts,
        tick: snap.tick,
    };
}

function applySiegeSnapshot(alert, snap, notified, reason) {
    alert.owner = snap.owner;
    alert.towers = snap.towers;
    alert.level = snap.level;
    alert.waves = snap.waves;
    alert.waveLimit = snap.waveLimit;
    alert.camping = snap.camping;
    alert.cleaner = snap.cleaner;
    alert.claimAttacker = snap.claimAttacker;
    alert.nukeLaunched = snap.nukeLaunched;
    alert.friendlyDead = snap.friendlyDead;
    alert.enemyDead = snap.enemyDead;
    alert.activeDefenders = snap.activeDefenders;
    alert.ramparts = snap.ramparts;
    if (notified) {
        alert.lastNotify = Game.time;
        alert.lastReason = reason;
    }
}

function pickSiegeProgressReason(prev, snap) {
    if (snap.nukeLaunched && !prev.nukeLaunched) return 'NUKE';
    if (snap.camping && !prev.camping) return 'CAMPING';
    if ((prev.towers || 0) > 0 && snap.towers === 0) return 'TOWERS DOWN';
    if (snap.level && prev.level && snap.level < prev.level) return 'RCL DROP';
    return null;
}

function siegeMadeContact(op, prev) {
    if (((op && op.waves) || 0) > 0 || ((prev && prev.waves) || 0) > 0) return true;
    if (((op && op.friendlyDead) || 0) > 0 || ((prev && prev.friendlyDead) || 0) > 0) return true;
    if (((op && op.enemyDead) || 0) > 0 || ((prev && prev.enemyDead) || 0) > 0) return true;
    if ((op && op.nukeLaunched) || (prev && prev.nukeLaunched)) return true;
    return false;
}

function inferSiegeEndReason(roomName, leftoverOp, prev) {
    const intel = (typeof INTEL !== 'undefined' && INTEL[roomName]) || {};
    const owner = intel.owner;
    if (!owner || (typeof FRIENDLIES !== 'undefined' && FRIENDLIES.includes(owner))) return 'SUCCESS';
    if (leftoverOp && leftoverOp.dDay) {
        return leftoverOp.nukeLaunched ? 'NUKE HOLD' : 'SAFEMODE';
    }
    if (prev) {
        if ((prev.waves || 0) >= (prev.waveLimit || 8)) return 'MAX WAVES';
        const ratio = (prev.friendlyDead || 0) / (prev.enemyDead || 100);
        if ((prev.friendlyDead || 0) > 5000 && ratio > 2) return 'UNSUSTAINABLE';
    }
    return 'ENDED';
}

function buildSiegeMessage(roomName, reason, snap, prev) {
    const waveLabel = `${snap.waves || 0}/${snap.waveLimit || 8}`;
    const lines = [`${roomName} [${reason}] roomDenial vs ${snap.owner}`];

    const started = (prev && prev.firstTick) || snap.tick || Game.time;
    lines.push(`elapsed ${formatElapsed(Game.time - started)}`);
    lines.push(`RCL ${snap.level || '?'}, ${snap.towers} tower(s)`);
    if (snap.ramparts) lines.push(`ramparts ${compactNumber(snap.ramparts)}`);

    if (reason === 'TOWERS DOWN' && prev && prev.towers !== snap.towers) {
        lines.push(`towers ${prev.towers} → ${snap.towers}`);
    }
    if (reason === 'RCL DROP' && prev && prev.level !== snap.level) {
        lines.push(`RCL ${prev.level} → ${snap.level}`);
    }

    lines.push(`wave ${waveLabel}`);
    lines.push(`casualties ${compactNumber(snap.friendlyDead)} vs ${compactNumber(snap.enemyDead)} enemy`);

    if (snap.onSite || snap.inbound) {
        lines.push(`forces ${snap.onSite} on site, ${snap.inbound} inbound`);
    } else if (!SIEGE_END_REASONS[reason] && reason !== 'LAUNCH') {
        lines.push('no siege creeps assigned');
    }

    if (snap.camping) lines.push('camping (towers and defenders cleared)');
    if (snap.cleaner) lines.push('cleaner queued');
    if (snap.claimAttacker) lines.push('claim attacker queued');
    if (snap.activeDefenders) lines.push('active defenders present');

    if (snap.nukeLaunched) {
        const eta = snap.dDay ? snap.dDay - Game.time : 0;
        lines.push(eta > 0 ? `nuke inbound (${eta} ticks)` : 'nuke launched');
    }
    if (snap.safemode && snap.safemode > Game.time) {
        lines.push(`target safemode (${snap.safemode - Game.time} ticks remaining)`);
    }
    if (snap.lastKill) lines.push(`last kill ${Game.time - snap.lastKill} ticks ago`);

    if (reason === 'LAUNCH') {
        const nearest = typeof findClosestOwnedRoom === 'function' ? findClosestOwnedRoom(roomName, true) : undefined;
        if (nearest !== undefined && nearest !== Infinity) lines.push(`${nearest} rooms from nearest colony`);
        if (snap.manual) lines.push('manual operation');
    }
    if (snap.assignedRoom) lines.push(`assigned ${snap.assignedRoom}`);

    return lines.join('. ');
}

function sendSiege(roomName, reason, snap, prev) {
    notify(buildSiegeMessage(roomName, reason, snap, prev), {
        channel: 'siege',
        immediate: !!SIEGE_TERMINAL_REASONS[reason],
        logTag: 'HIGH COMMAND: ',
        logPrefix: roomLink(roomName),
    });
}

function siegeAlertStore() {
    if (!Memory._siegeAlerts) Memory._siegeAlerts = {};
    return Memory._siegeAlerts;
}

function notifySiegeLaunch(roomName) {
    const op = Memory.targetRooms && Memory.targetRooms[roomName];
    if (!isRoomDenial(op)) return;
    const alerts = siegeAlertStore();
    if (alerts[roomName]) return;
    const snap = snapshotSiege(roomName, op);
    const alert = makeSiegeAlert(snap, 'LAUNCH');
    alert.pendingLaunch = true;
    alerts[roomName] = alert;
}

function notifySiegeEvent(roomName, reason) {
    const op = Memory.targetRooms && Memory.targetRooms[roomName];
    if (!op) return;
    const alerts = siegeAlertStore();
    const snap = snapshotSiege(roomName, op);
    let prev = alerts[roomName];
    if (!prev) {
        prev = makeSiegeAlert(snap, reason);
        alerts[roomName] = prev;
    }
    prev.pendingLaunch = undefined;
    sendSiege(roomName, reason, snap, prev);
    applySiegeSnapshot(prev, snap, true, reason);
}

function notifySiegeEnd(roomName, reason, op) {
    const alerts = Memory._siegeAlerts || {};
    const prev = alerts[roomName];
    const operation = op || (Memory.targetRooms && Memory.targetRooms[roomName]);
    const resolved = reason || inferSiegeEndReason(roomName, operation, prev);
    if (SIEGE_QUIET_END[resolved] && !siegeMadeContact(operation, prev)) {
        if (alerts[roomName]) delete Memory._siegeAlerts[roomName];
        return;
    }
    if (!prev && !SIEGE_END_REASONS[resolved]) return;
    const snap = snapshotSiege(roomName, operation);
    if (prev) {
        snap.tick = prev.tick || snap.tick;
        snap.waves = Math.max(snap.waves || 0, prev.waves || 0);
        snap.friendlyDead = Math.max(snap.friendlyDead || 0, prev.friendlyDead || 0);
        snap.enemyDead = Math.max(snap.enemyDead || 0, prev.enemyDead || 0);
    }
    sendSiege(roomName, resolved, snap, prev);
    if (alerts[roomName]) delete Memory._siegeAlerts[roomName];
}

function reviewActiveSiege(roomName, op) {
    const alerts = siegeAlertStore();
    const snap = snapshotSiege(roomName, op);
    let prev = alerts[roomName];
    if (!prev) {
        alerts[roomName] = makeSiegeAlert(snap, 'TRACK');
        return;
    }
    if (prev.pendingLaunch) {
        sendSiege(roomName, 'LAUNCH', snap, prev);
        prev.pendingLaunch = undefined;
        applySiegeSnapshot(prev, snap, true, 'LAUNCH');
        return;
    }
    const reason = pickSiegeProgressReason(prev, snap);
    if (reason) sendSiege(roomName, reason, snap, prev);
    applySiegeSnapshot(prev, snap, !!reason, reason);
}

function finishSiege(roomName, leftoverOp) {
    const alerts = Memory._siegeAlerts;
    if (!alerts || !alerts[roomName]) return;
    notifySiegeEnd(roomName, undefined, leftoverOp);
}

function reviewSieges() {
    const targets = Memory.targetRooms || {};
    const alerts = siegeAlertStore();
    const active = {};

    for (const roomName in targets) {
        const op = targets[roomName];
        if (!isRoomDenial(op)) continue;
        active[roomName] = true;
        reviewActiveSiege(roomName, op);
    }

    for (const roomName in alerts) {
        if (active[roomName]) continue;
        finishSiege(roomName, targets[roomName]);
    }
}

module.exports = {
    notify,
    compactNumber,
    formatElapsed,
    DEFAULT_GROUP_MINUTES,
    reviewSieges,
    notifySiegeLaunch,
    notifySiegeEvent,
    notifySiegeEnd,
};
