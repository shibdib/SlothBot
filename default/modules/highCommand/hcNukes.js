/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Automated MAD and offensive escalation nuke launches.

 */


const state = require('hcState');

const {checkForNap, scoreTarget} = require('hcUtils');

const {getEmpireReadiness} = require('hcReadiness');


function sanitizeMadList() {
    if (!Memory.MAD) return;
    Memory.MAD = _.compact(_.uniq(Memory.MAD));
}


function addToMad(owner) {
    if (!owner || FRIENDLIES.includes(owner) || checkForNap(owner)) return;
    Memory.MAD = _.compact(_.uniq((Memory.MAD || []).concat(owner)));
}


function getLoadedNukers() {
    const launchers = [];
    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room || room.level < 8 || !room.memory.combatReady) continue;
        const nuker = room.nuker;
        if (!nuker || nuker.cooldown) continue;
        if (nuker.store.getFreeCapacity(RESOURCE_ENERGY) || nuker.store.getFreeCapacity(RESOURCE_GHODIUM)) continue;
        launchers.push(nuker);
    }
    return launchers;
}


function isNukeInbound(intel) {
    return intel?.lastNuke && intel.lastNuke + NUKE_LAND_TIME >= Game.time;
}


function isValidMadTarget(intel, launchers) {
    if (!intel?.name || !intel.owner) return false;
    if (!Memory.MAD.includes(intel.owner)) return false;
    if (FRIENDLIES.includes(intel.owner) || checkForNap(intel.owner)) return false;
    if (Memory.nonCombatRooms && Memory.nonCombatRooms.includes(intel.name)) return false;
    if (Memory.targetRooms[intel.name]) return false;
    if (isNukeInbound(intel)) return false;
    if (intel.safemode && intel.safemode > Game.time) return false;
    return launchers.some(n => Game.map.getRoomLinearDistance(n.room.name, intel.name) <= 10);
}


function isValidOffensiveTarget(intel, launchers, warUsers) {
    if (!intel?.name || !intel.owner) return false;
    if (!warUsers.has(intel.owner)) return false;
    if (FRIENDLIES.includes(intel.owner) || checkForNap(intel.owner)) return false;
    if (NO_DIRECT_ATTACKS.includes(intel.owner)) return false;
    if (Memory.nonCombatRooms && Memory.nonCombatRooms.includes(intel.name)) return false;
    if (isNukeInbound(intel)) return false;
    if (intel.safemode && intel.safemode > Game.time) return false;
    return launchers.some(n => Game.map.getRoomLinearDistance(n.room.name, intel.name) <= 10);
}


function isTowerStalemate(op, intel) {
    if (!intel?.towers || op.camping) return false;
    return op.tick + CREEP_LIFE_TIME < Game.time;
}


function isEscalationCandidate(op, intel) {
    if (!op || op.type !== 'roomDenial' || op.manual || op.nukeLaunched) return false;
    if (op.tick + CREEP_LIFE_TIME >= Game.time) return false;
    if (op.isAtRisk) return true;
    if (isTowerStalemate(op, intel)) return true;
    const ratio = (op.friendlyDead || 0) / (op.enemyDead || 100);
    return ratio > 1.5 && intel?.towers > 0;
}


function resolveNukeTarget(intel) {
    if (intel.nukeTarget) {
        const parsed = RoomPosition.prototype.posFromString(intel.nukeTarget, true);
        if (parsed instanceof RoomPosition) return parsed;
    }
    const room = Game.rooms[intel.name];
    if (room) {
        if (room.controller) return room.controller.pos;
        if (room.terminal) return room.terminal.pos;
        if (room.storage) return room.storage.pos;
        if (room.spawns.length) return room.spawns[0].pos;
    }
    return new RoomPosition(25, 25, intel.name);
}


function pickLauncher(launchers, targetRoom) {
    const inRange = launchers.filter(n => Game.map.getRoomLinearDistance(n.room.name, targetRoom) <= 10);
    if (!inRange.length) return null;
    return _.min(inRange, n => {
        const room = Game.rooms[n.room.name];
        const distance = Game.map.getRoomLinearDistance(n.room.name, targetRoom);
        const energyPenalty = room && room.energyState >= 3 ? 0 : 100;
        return distance + energyPenalty;
    });
}


function executeNukeLaunch(launcher, intel, options = {}) {
    const roomName = intel.name;
    const target = options.targetPos || resolveNukeTarget(intel);
    const result = launcher.launchNuke(target);
    if (result !== OK) {
        log.w(`Nuke launch failed for ${roomLink(roomName)} from ${roomLink(launcher.room.name)}: ${result}`, 'HIGH COMMAND: ');
        return false;
    }

    intel.lastNuke = Game.time;
    INTEL[roomName] = intel;
    if (global.updateIntelIndex) global.updateIntelIndex(roomName, null, intel);

    if (options.removeMadOwner && intel.owner) {
        Memory.MAD = _.filter(Memory.MAD, u => u !== intel.owner);
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
    log.a(`${label} launched at ${roomLink(roomName)} by ${roomLink(launcher.room.name)}`, 'HIGH COMMAND: ');
    return true;
}


function autoNuke() {
    sanitizeMadList();
    if (!Memory.MAD || !Memory.MAD.length) return false;

    const readiness = getEmpireReadiness();
    if (readiness.empireCritical) return false;

    const availableLaunchers = getLoadedNukers();
    if (!availableLaunchers.length) return false;

    const MADTarget = _.min(
        Object.values(INTEL).filter(r => isValidMadTarget(r, availableLaunchers)),
        r => findClosestOwnedRoom(r.name, true)
    );

    if (!MADTarget?.name) return false;

    const launcher = pickLauncher(availableLaunchers, MADTarget.name);
    if (!launcher) return false;

    log.a('MAD Target Acquired — ' + roomLink(MADTarget.name) + ' — LAUNCHING NUKES', 'HIGH COMMAND: ');
    Game.notify('MAD Target Acquired — ' + MADTarget.name + ' — LAUNCHING NUKES');

    if (!executeNukeLaunch(launcher, MADTarget, {
        followUpType: 'remoteDenial',
        logLabel: 'MAD nuke',
        removeMadOwner: true,
    })) return false;

    return true;
}


function offensiveNuke() {
    if (!OFFENSIVE_NUKES || !OFFENSIVE_OPERATIONS || !state.OFFENSIVE_ALLOWED) return false;

    const readiness = getEmpireReadiness();
    if (readiness.empireCritical || readiness.empireStressed) return false;

    if (Memory.MAD?.length) return false;

    const reserve = OFFENSIVE_NUKE_RESERVE ?? 1;
    const cooldown = OFFENSIVE_NUKE_COOLDOWN ?? NUKE_LAND_TIME;
    if (Memory._lastOffensiveNuke && Memory._lastOffensiveNuke + cooldown >= Game.time) return false;

    const availableLaunchers = getLoadedNukers();
    if (availableLaunchers.length <= reserve) return false;

    const warUsers = new Set(_.pluck(WAR_TARGETS, 'user'));
    const warPriorityByUser = {};
    for (const t of WAR_TARGETS) warPriorityByUser[t.user] = t.priority;

    let bestIntel = null;
    let bestScore = Infinity;

    for (const roomName in Memory.targetRooms) {
        const op = Memory.targetRooms[roomName];
        const intel = INTEL[roomName];
        if (!isEscalationCandidate(op, intel)) continue;
        if (!isValidOffensiveTarget(intel, availableLaunchers, warUsers)) continue;

        let score = scoreTarget(roomName, 'roomDenial', null, warPriorityByUser);
        if (op.isAtRisk) score -= 500;
        if (intel.towers >= 4) score -= 100;

        if (score < bestScore) {
            bestScore = score;
            bestIntel = intel;
        }
    }

    if (!bestIntel?.name) return false;

    const launcher = pickLauncher(availableLaunchers, bestIntel.name);
    if (!launcher) return false;

    log.a('Siege escalation — nuke requested for ' + roomLink(bestIntel.name), 'HIGH COMMAND: ');
    Game.notify('Offensive nuke escalation — ' + bestIntel.name);

    if (!executeNukeLaunch(launcher, bestIntel, {
        followUpType: 'roomDenial',
        logLabel: 'Offensive escalation nuke',
    })) return false;

    Memory._lastOffensiveNuke = Game.time;
    return true;
}


module.exports = {

    autoNuke,

    offensiveNuke,

    addToMad,

    sanitizeMadList,

    getLoadedNukers,

    pickLauncher,

    resolveNukeTarget,

    executeNukeLaunch,

};