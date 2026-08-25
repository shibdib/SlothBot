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
 * @param {string} [options.emailPrefix] prepended only to the Game.notify email
 * @param {string} [options.emailExtra] appended only to the Game.notify email
 * @param {boolean} [options.email] force-disable email while still logging
 */
function notify(message, options = {}) {
    const emailOn = options.email !== false && isChannelEnabled(options.channel);
    if (emailOn) {
        const group = options.immediate ? 0
            : (options.groupMinutes != null ? options.groupMinutes : DEFAULT_GROUP_MINUTES);
        let emailMessage = message;
        if (options.emailPrefix) emailMessage = `${options.emailPrefix} ${emailMessage}`;
        if (options.emailExtra) emailMessage = `${emailMessage}. ${options.emailExtra}`;
        Game.notify(emailMessage, group);
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
    'TOWERS DOWN': true,
};
const SIEGE_END_REASONS = {
    SUCCESS: true,
    ENDED: true,
    SAFEMODE: true,
    UNSUSTAINABLE: true,
    'MAX WAVES': true,
    'NUKE HOLD': true,
    'TOWERS DOWN': true,
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

function visibleRoom(roomName) {
    return typeof Game !== 'undefined' && Game.rooms[roomName];
}

function visibleTowerCount(roomName, intel) {
    const room = visibleRoom(roomName);
    if (room && room.towers) return room.towers.length;
    return intel.towers || 0;
}

function visibleSpawnCount(roomName, intel) {
    const room = visibleRoom(roomName);
    if (room && room.spawns) return room.spawns.length;
    return intel.spawns;
}

function visibleSafemodeCharges(roomName) {
    const room = visibleRoom(roomName);
    if (!room || !room.controller) return undefined;
    return room.controller.safeModeAvailable;
}

function extraDefenders(userList, owner) {
    if (!userList || !userList.length) return [];
    const seen = [];
    for (let i = 0; i < userList.length; i++) {
        const user = userList[i];
        if (!user || user === owner) continue;
        if (typeof FRIENDLIES !== 'undefined' && FRIENDLIES.includes(user)) continue;
        if (seen.indexOf(user) !== -1) continue;
        seen.push(user);
    }
    return seen;
}

function snapshotSiege(roomName, op) {
    const intel = (typeof INTEL !== 'undefined' && INTEL[roomName]) || {};
    const creeps = countSiegeCreeps(roomName);
    let lastKill = 0;
    if (op && op.lastEnemyKilled) {
        lastKill = op.lastEnemyKilled.deathTime || op.lastEnemyKilled || 0;
        if (typeof lastKill !== 'number') lastKill = 0;
    }
    const owner = intel.owner || null;
    return {
        owner,
        towers: visibleTowerCount(roomName, intel),
        level: intel.level || 0,
        ramparts: intel.rampartMedHP || 0,
        spawns: visibleSpawnCount(roomName, intel),
        waves: (op && op.waves) || 0,
        waveLimit: (op && op.waveLimit) || 8,
        lastWave: (op && op.lastWave) || 0,
        camping: !!(op && op.camping),
        cleaner: !!(op && op.cleaner),
        claimAttacker: !!(op && op.claimAttacker),
        nukeLaunched: op && op.nukeLaunched,
        nukeTarget: intel.nukeTarget,
        dDay: op && op.dDay,
        friendlyDead: (op && op.friendlyDead) || 0,
        enemyDead: (op && op.enemyDead) || 0,
        activeDefenders: !!intel.activeDefenders,
        otherUsers: extraDefenders(op && op.userList, owner),
        onSite: creeps.onSite,
        inbound: creeps.inbound,
        lastKill,
        assignedRoom: op && op.assignedRoom,
        manual: !!(op && op.manual),
        tick: (op && op.tick) || Game.time,
        safemode: intel.safemode,
        safemodeCharges: visibleSafemodeCharges(roomName),
        ticksToDowngrade: intel.ticksToDowngrade || 0,
        loot: !!intel.loot,
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
        lastWave: snap.lastWave,
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
    if (snap.owner) alert.owner = snap.owner;
    alert.towers = snap.towers;
    alert.level = snap.level;
    alert.waves = snap.waves;
    alert.waveLimit = snap.waveLimit;
    alert.lastWave = snap.lastWave || alert.lastWave;
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
    if ((snap.waves || 0) > (prev.waves || 0)) return 'WAVE';
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

function siegeOwnerLabel(snap, prev, reason) {
    if (reason === 'SUCCESS') return (prev && prev.owner) || snap.owner || 'unknown';
    return snap.owner || (prev && prev.owner) || 'unknown';
}

function isDowngradeRelevant(snap) {
    const ticks = snap.ticksToDowngrade;
    if (!ticks) return false;
    if (snap.camping || !snap.towers) return true;
    const max = typeof CONTROLLER_DOWNGRADE !== 'undefined' && snap.level && CONTROLLER_DOWNGRADE[snap.level];
    return !!(max && ticks < max * 0.5);
}

function safemodeChargeLabel(charges) {
    if (charges === 1) return '1 safemode charge';
    return `${charges} safemode charges`;
}

function countLabel(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function buildSiegeMessage(roomName, reason, snap, prev) {
    const waveLabel = `${snap.waves || 0}/${snap.waveLimit || 8}`;
    const lines = [`[${reason}] roomDenial vs ${siegeOwnerLabel(snap, prev, reason)}`];

    const started = (prev && prev.firstTick) || snap.tick || Game.time;
    const elapsed = Game.time - started;
    if (elapsed > 0 && reason !== 'LAUNCH') lines.push(`elapsed ${formatElapsed(elapsed)}`);

    let structureLine = `RCL ${snap.level || '?'}, ${countLabel(snap.towers || 0, 'tower')}`;
    if (snap.spawns != null) structureLine += `, ${countLabel(snap.spawns, 'spawn')}`;
    lines.push(structureLine);
    if (snap.ramparts) lines.push(`ramparts ${compactNumber(snap.ramparts)}`);

    if (reason === 'TOWERS DOWN' && prev && prev.towers !== snap.towers) {
        lines.push(`towers ${prev.towers}→${snap.towers}`);
    }
    if (reason === 'RCL DROP' && prev && prev.level !== snap.level) {
        lines.push(`RCL ${prev.level}→${snap.level}`);
    }

    lines.push(`wave ${waveLabel}`);
    if (snap.lastWave && reason !== 'WAVE' && reason !== 'LAUNCH') {
        lines.push(`last wave ${Game.time - snap.lastWave} ticks ago`);
    }

    const friendlyDead = snap.friendlyDead || 0;
    const enemyDead = snap.enemyDead || 0;
    if (friendlyDead || enemyDead || SIEGE_END_REASONS[reason]) {
        lines.push(`${compactNumber(friendlyDead)} vs ${compactNumber(enemyDead)} dead`);
    }

    if (snap.onSite || snap.inbound) {
        lines.push(`${snap.onSite} on site, ${snap.inbound} inbound`);
    } else if (!SIEGE_END_REASONS[reason] && reason !== 'LAUNCH') {
        lines.push('no siege creeps');
    }

    if (snap.camping) lines.push('camping');
    if (snap.cleaner) lines.push('cleaner queued');
    if (snap.claimAttacker) lines.push('claim attacker queued');
    if (snap.activeDefenders) lines.push('active defenders');
    if (snap.otherUsers && snap.otherUsers.length) lines.push(`also ${snap.otherUsers.join(', ')}`);

    if (snap.nukeLaunched) {
        const eta = snap.dDay ? snap.dDay - Game.time : 0;
        let nukeLine = eta > 0 ? `nuke in ${eta} ticks` : 'nuke launched';
        if (snap.nukeTarget && snap.nukeTarget.x != null) nukeLine += ` @ ${snap.nukeTarget.x},${snap.nukeTarget.y}`;
        lines.push(nukeLine);
    }
    if (snap.safemode && snap.safemode > Game.time) {
        lines.push(`safemode ${snap.safemode - Game.time} ticks`);
    }
    const charges = snap.safemodeCharges;
    if (charges != null && (reason === 'LAUNCH' || SIEGE_END_REASONS[reason] || charges === 0)) {
        lines.push(charges ? safemodeChargeLabel(charges) : 'no safemode');
    }
    if (isDowngradeRelevant(snap)) {
        lines.push(`downgrade ${formatElapsed(snap.ticksToDowngrade)}`);
    }
    if (snap.lastKill) lines.push(`last kill ${Game.time - snap.lastKill} ticks ago`);
    if ((reason === 'SUCCESS' || snap.camping) && snap.loot) lines.push('loot');

    if (reason === 'SUCCESS') {
        if (!snap.owner) lines.push('unowned');
        else if (prev && prev.owner && snap.owner !== prev.owner) lines.push(`now ${snap.owner}`);
    }

    if (reason === 'LAUNCH') {
        const nearest = typeof findClosestOwnedRoom === 'function' ? findClosestOwnedRoom(roomName, true) : undefined;
        if (nearest !== undefined && nearest !== Infinity) lines.push(`${nearest} rooms from nearest colony`);
        if (snap.manual) lines.push('manual');
    }
    if (snap.assignedRoom) lines.push(`from ${snap.assignedRoom}`);

    return lines.join('. ');
}

function sendSiege(roomName, reason, snap, prev) {
    const historyLink = typeof roomHistoryNotifyLink === 'function' ? roomHistoryNotifyLink(roomName) : undefined;
    const firstContact = reason === 'WAVE' && (snap.waves || 0) === 1;
    notify(buildSiegeMessage(roomName, reason, snap, prev), {
        channel: 'siege',
        immediate: !!SIEGE_TERMINAL_REASONS[reason] || firstContact,
        logTag: 'HIGH COMMAND: ',
        logPrefix: typeof roomHistoryLink === 'function' ? roomHistoryLink(roomName) : roomLink(roomName),
        emailPrefix: historyLink || roomName,
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
    if (!isRoomDenial(op)) return;
    const alerts = siegeAlertStore();
    const snap = snapshotSiege(roomName, op);
    let prev = alerts[roomName];
    if (!prev) {
        prev = makeSiegeAlert(snap, reason);
        alerts[roomName] = prev;
    }
    if (prev.pendingLaunch) {
        sendSiege(roomName, 'LAUNCH', snap, prev);
        prev.pendingLaunch = undefined;
        applySiegeSnapshot(prev, snap, true, 'LAUNCH');
        if (reason === 'LAUNCH') return;
        // First WAVE used to be dropped because launch mail includes the
        // count. That hid the only proof the squad actually left home.
    }
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
        snap.lastWave = snap.lastWave || prev.lastWave || 0;
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
