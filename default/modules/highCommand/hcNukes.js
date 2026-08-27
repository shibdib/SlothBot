/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Automated MAD and offensive escalation nuke launches.
 */

const state = require('hcState');
const {checkForNap, empireDistance, warPriorityMap} = require('hcUtils');
const {getEmpireReadiness} = require('hcReadiness');
const {notify, notifySiegeEvent} = require('module.notifications');

const NUKE_FOLLOWUP_LEAD = CREEP_LIFE_TIME;
const NUKER_RANGE = 10;

function empireReadiness() {
    return state.EMPIRE_READINESS || getEmpireReadiness();
}

function minOffensiveNukeWaves(op) {
    const configured = typeof OFFENSIVE_NUKE_MIN_WAVES === 'number' ? OFFENSIVE_NUKE_MIN_WAVES : 12;
    const limit = (op && op.waveLimit) || 12;
    return Math.max(configured, limit);
}

function liveTowerCount(roomName, intel) {
    const room = Game.rooms[roomName];
    if (room && room.towers) return room.towers.length;
    return (intel && intel.towers) || 0;
}

function isInSafemode(intel) {
    if (!intel || !intel.name) return false;
    const room = Game.rooms[intel.name];
    if (room && room.controller) return !!room.controller.safeMode;
    return !!(intel.safemode && intel.safemode > Game.time);
}

function inNukerRange(fromRoom, toRoom) {
    return Game.map.getRoomLinearDistance(fromRoom, toRoom) <= NUKER_RANGE;
}

function hasPendingNuke(op) {
    return !!(op && op.nukeLaunched && op.dDay && op.dDay > Game.time);
}

function isNukeHold(op) {
    return !!(op && op.nukeLaunched && op.dDay && op.dDay - NUKE_FOLLOWUP_LEAD > Game.time);
}

function beginNukeFollowUp(op) {
    if (!op || op.nukeFollowUp) return false;
    op.nukeFollowUp = Game.time;
    op.waves = 0;
    op.lastWave = undefined;
    op.waveLimit = op.waveLimit || 12;
    op.tick = Game.time;
    op.friendlyDead = 0;
    op.enemyDead = 0;
    op.trackedFriendly = [];
    op.trackedEnemy = [];
    op.isAtRisk = false;
    return true;
}

function sanitizeMadList() {
    if (!Memory.MAD) return;
    Memory.MAD = _.compact(_.uniq(Memory.MAD));
    const idx = global.getIntelIndexes ? global.getIntelIndexes() : {byOwner: {}};
    Memory.MAD = Memory.MAD.filter(owner => {
        if (!owner || FRIENDLIES.includes(owner) || checkForNap(owner)) return false;
        const rooms = idx.byOwner && idx.byOwner[owner];
        return rooms && rooms.length;
    });
    if (!Memory.MAD.length) Memory.MAD = undefined;
}

function addToMad(owner) {
    if (!owner || FRIENDLIES.includes(owner) || checkForNap(owner)) return;
    Memory.MAD = _.compact(_.uniq((Memory.MAD || []).concat(owner)));
}

function getLoadedNukers() {
    const launchers = [];
    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room || room.level < 8) continue;
        const nuker = room.nuker;
        if (!nuker || nuker.cooldown) continue;
        if (nuker.store.getFreeCapacity(RESOURCE_ENERGY) || nuker.store.getFreeCapacity(RESOURCE_GHODIUM)) continue;
        launchers.push(nuker);
    }
    return launchers;
}

function isNukeInbound(intel) {
    if (!intel || !intel.name) return false;
    const room = Game.rooms[intel.name];
    if (room && room.nukes && room.nukes.length) return true;
    return !!(intel.lastNuke && intel.lastNuke + NUKE_LAND_TIME >= Game.time);
}

function isValidMadTarget(intel, launchers) {
    if (!intel?.name || !intel.owner) return false;
    if (!Memory.MAD || !Memory.MAD.includes(intel.owner)) return false;
    if (FRIENDLIES.includes(intel.owner) || checkForNap(intel.owner)) return false;
    if (Memory.nonCombatRooms && Memory.nonCombatRooms.includes(intel.name)) return false;
    if (isNukeInbound(intel)) return false;
    return launchers.some(n => inNukerRange(n.room.name, intel.name));
}

function isValidOffensiveTarget(intel, launchers, warUsers) {
    if (!intel?.name || !intel.owner) return false;
    if (!warUsers.has(intel.owner)) return false;
    if (FRIENDLIES.includes(intel.owner) || checkForNap(intel.owner)) return false;
    if (NO_DIRECT_ATTACKS.includes(intel.owner)) return false;
    if (Memory.nonCombatRooms && Memory.nonCombatRooms.includes(intel.name)) return false;
    if (isNukeInbound(intel)) return false;
    return launchers.some(n => inNukerRange(n.room.name, intel.name));
}

function isEscalationCandidate(op, intel) {
    if (!op || op.type !== 'roomDenial' || op.manual || op.nukeLaunched) return false;
    if (op.camping) return false;
    if (!intel || liveTowerCount(intel.name, intel) < 1) return false;
    return (op.waves || 0) >= minOffensiveNukeWaves(op);
}

function parseStoredNukeTarget(stored, roomName) {
    if (!stored || !roomName) return null;
    if (stored instanceof RoomPosition) {
        return stored.roomName === roomName ? stored : new RoomPosition(stored.x, stored.y, roomName);
    }
    if (typeof stored === 'object' && stored.x !== undefined && stored.y !== undefined) {
        const x = +stored.x;
        const y = +stored.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return new RoomPosition(x, y, stored.roomName || roomName);
    }
    if (typeof stored === 'string') {
        const parsed = RoomPosition.prototype.posFromString(stored, true);
        if (parsed instanceof RoomPosition) {
            return parsed.roomName === roomName ? parsed : new RoomPosition(parsed.x, parsed.y, roomName);
        }
        const compact = stored.match(/^(\d+),(\d+)$/);
        if (compact) return new RoomPosition(+compact[1], +compact[2], roomName);
    }
    return null;
}

function resolveNukeTarget(intel) {
    if (!intel?.name) return null;
    const room = Game.rooms[intel.name];
    if (room) {
        const live = room.pickNukeImpact && room.pickNukeImpact();
        if (live) return live;
    }
    return parseStoredNukeTarget(intel.nukeTarget, intel.name);
}

function pickLauncher(launchers, targetRoom) {
    const inRange = launchers.filter(n => inNukerRange(n.room.name, targetRoom));
    if (!inRange.length) return null;
    return _.min(inRange, n => Game.map.getRoomLinearDistance(n.room.name, targetRoom));
}

function executeNukeLaunch(launcher, intel, options = {}) {
    const roomName = intel.name;
    const target = options.targetPos || resolveNukeTarget(intel);
    if (!(target instanceof RoomPosition) || target.roomName !== roomName) {
        Memory.observeRoom = roomName;
        log.w(`Nuke launch aborted for ${roomLink(roomName)} — no useful impact tile (refusing room-center fallback).`, 'HIGH COMMAND: ');
        return false;
    }
    const nukeEnergySunk = launcher.store[RESOURCE_ENERGY] || 0;
    const result = launcher.launchNuke(target);
    if (result !== OK) {
        log.w(`Nuke launch failed for ${roomLink(roomName)} from ${roomLink(launcher.room.name)}: ${result} @ ${target.x},${target.y}`, 'HIGH COMMAND: ');
        return false;
    }

    if (nukeEnergySunk > 0) {
        Memory.nukeEnergyExpense = Memory.nukeEnergyExpense || {};
        const rn = launcher.room.name;
        Memory.nukeEnergyExpense[rn] = (Memory.nukeEnergyExpense[rn] || 0) + nukeEnergySunk;
    }

    intel.lastNuke = Game.time;
    INTEL[roomName] = intel;
    if (global.updateIntelIndex) global.updateIntelIndex(roomName, null, intel);

    if (options.removeMadOwner && intel.owner) {
        Memory.MAD = _.filter(Memory.MAD || [], u => u !== intel.owner);
        sanitizeMadList();
    }

    const existing = Memory.targetRooms[roomName] || {};
    Memory.targetRooms[roomName] = Object.assign({}, existing, {
        tick: Game.time,
        type: options.followUpType || existing.type || 'remoteDenial',
        dDay: Game.time + NUKE_LAND_TIME,
        nukeLaunched: Game.time,
    });

    const label = options.logLabel || 'Nuke';
    log.a(`${label} launched at ${roomLink(roomName)} ${target.x},${target.y} by ${roomLink(launcher.room.name)}`, 'HIGH COMMAND: ');
    if ((Memory.targetRooms[roomName] || {}).type === 'roomDenial') {
        notifySiegeEvent(roomName, 'NUKE');
    }
    return true;
}

function autoNuke() {
    sanitizeMadList();
    if (!Memory.MAD || !Memory.MAD.length) return false;

    const readiness = empireReadiness();
    if (readiness.empireCritical) return false;

    const availableLaunchers = getLoadedNukers();
    if (!availableLaunchers.length) return false;

    const idx = global.getIntelIndexes ? global.getIntelIndexes() : {byOwner: {}};
    const madCandidates = [];
    for (let i = 0; i < Memory.MAD.length; i++) {
        const owner = Memory.MAD[i];
        const rooms = idx.byOwner[owner];
        if (!rooms) continue;
        for (let j = 0; j < rooms.length; j++) {
            const r = rooms[j];
            if (isValidMadTarget(r, availableLaunchers)) madCandidates.push(r);
        }
    }

    const MADTarget = _.min(madCandidates, r => empireDistance(r.name));
    if (!MADTarget?.name) return false;

    const launcher = pickLauncher(availableLaunchers, MADTarget.name);
    if (!launcher) return false;

    notify('MAD Target Acquired — ' + MADTarget.name + ' — LAUNCHING NUKES', {
        channel: 'nuke',
        immediate: true,
        logTag: 'HIGH COMMAND: ',
        logPrefix: roomLink(MADTarget.name),
    });

    const existing = Memory.targetRooms[MADTarget.name];
    if (!executeNukeLaunch(launcher, MADTarget, {
        followUpType: (existing && existing.type) || 'remoteDenial',
        logLabel: 'MAD nuke',
        removeMadOwner: true,
    })) return false;

    return true;
}

function offensiveNukeGates() {
    if (!OFFENSIVE_NUKES || !OFFENSIVE_OPERATIONS || !state.OFFENSIVE_ALLOWED) return null;
    const readiness = empireReadiness();
    if (readiness.empireCritical || readiness.empireStressed) return null;
    const cooldown = OFFENSIVE_NUKE_COOLDOWN ?? NUKE_LAND_TIME;
    if (Memory._lastOffensiveNuke && Memory._lastOffensiveNuke + cooldown >= Game.time) return null;
    const availableLaunchers = getLoadedNukers();
    const reserve = (Memory.MAD && Memory.MAD.length) ? (OFFENSIVE_NUKE_RESERVE ?? 1) : 0;
    if (availableLaunchers.length <= reserve) return null;
    return {
        availableLaunchers,
        warUsers: new Set(_.pluck(WAR_TARGETS, 'user')),
        warPriorityByUser: warPriorityMap(),
    };
}

function scoreOffensiveNuke(roomName, op, intel, warPriorityByUser) {
    let score = empireDistance(roomName) * 200;
    const prio = warPriorityByUser && intel.owner ? warPriorityByUser[intel.owner] : 0;
    if (prio) score -= prio;
    score -= liveTowerCount(roomName, intel) * 100;
    if (intel.rampartMedHP) score -= Math.min(intel.rampartMedHP / 10000000, 30) * 3;
    if (op.isAtRisk) score -= 500;
    if (isInSafemode(intel)) score -= 300;
    return score;
}

function tryOffensiveNuke(roomName, ctx) {
    ctx = ctx || offensiveNukeGates();
    if (!ctx) return false;
    const op = Memory.targetRooms[roomName];
    const intel = INTEL[roomName];
    if (!isEscalationCandidate(op, intel)) return false;
    if (!isValidOffensiveTarget(intel, ctx.availableLaunchers, ctx.warUsers)) return false;
    const launcher = pickLauncher(ctx.availableLaunchers, roomName);
    if (!launcher) return false;
    if (!resolveNukeTarget(intel)) {
        Memory.observeRoom = roomName;
        log.w(`Siege escalation — observing ${roomLink(roomName)} for a nuke impact tile.`, 'HIGH COMMAND: ');
        return 'pending';
    }
    log.a('Siege escalation — nuke requested for ' + roomLink(intel.name), 'HIGH COMMAND: ');
    if (!executeNukeLaunch(launcher, intel, {
        followUpType: 'roomDenial',
        logLabel: 'Offensive escalation nuke',
    })) return false;
    Memory._lastOffensiveNuke = Game.time;
    return true;
}

function offensiveNuke() {
    const ctx = offensiveNukeGates();
    if (!ctx) return false;

    let bestName = null;
    let bestScore = Infinity;
    for (const roomName in Memory.targetRooms) {
        const op = Memory.targetRooms[roomName];
        const intel = INTEL[roomName];
        if (!isEscalationCandidate(op, intel)) continue;
        if (!isValidOffensiveTarget(intel, ctx.availableLaunchers, ctx.warUsers)) continue;
        const score = scoreOffensiveNuke(roomName, op, intel, ctx.warPriorityByUser);
        if (score < bestScore) {
            bestScore = score;
            bestName = roomName;
        }
    }
    if (!bestName) return false;
    return tryOffensiveNuke(bestName, ctx) === true;
}

module.exports = {
    autoNuke,
    offensiveNuke,
    tryOffensiveNuke,
    addToMad,
    sanitizeMadList,
    getLoadedNukers,
    pickLauncher,
    resolveNukeTarget,
    executeNukeLaunch,
    isNukeHold,
    hasPendingNuke,
    beginNukeFollowUp,
};
