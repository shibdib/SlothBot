/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Automated MAD nuke launches.

 */


const {checkForNap} = require('hcUtils');

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


function isValidMadTarget(intel, launchers) {
    if (!intel?.name || !intel.owner) return false;
    if (!Memory.MAD.includes(intel.owner)) return false;
    if (FRIENDLIES.includes(intel.owner) || checkForNap(intel.owner)) return false;
    if (Memory.nonCombatRooms && Memory.nonCombatRooms.includes(intel.name)) return false;
    if (Memory.targetRooms[intel.name]) return false;
    if (intel.lastNuke && intel.lastNuke + NUKE_LAND_TIME >= Game.time) return false;
    if (intel.safemode && intel.safemode > Game.time) return false;
    return launchers.some(n => Game.map.getRoomLinearDistance(n.room.name, intel.name) <= 10);
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

    const target = resolveNukeTarget(MADTarget);
    const result = launcher.launchNuke(target);
    if (result !== OK) {
        log.w(`MAD nuke launch failed for ${roomLink(MADTarget.name)} from ${roomLink(launcher.room.name)}: ${result}`, 'HIGH COMMAND: ');
        return false;
    }

    log.a('MAD Target Acquired — ' + roomLink(MADTarget.name) + ' — LAUNCHING NUKES', 'HIGH COMMAND: ');
    Game.notify('MAD Target Acquired — ' + MADTarget.name + ' — LAUNCHING NUKES');

    MADTarget.lastNuke = Game.time;
    INTEL[MADTarget.name] = MADTarget;
    if (global.updateIntelIndex) global.updateIntelIndex(MADTarget.name, null, MADTarget);

    // Drop this owner only after a successful launch; re-queue if they nuke us again.
    Memory.MAD = _.filter(Memory.MAD, u => u !== MADTarget.owner);
    sanitizeMadList();

    Memory.targetRooms[MADTarget.name] = {
        tick: Game.time,
        type: 'remoteDenial',
        dDay: Game.time + NUKE_LAND_TIME
    };

    log.a('Nuke launched at ' + roomLink(MADTarget.name) + ' by ' + roomLink(launcher.room.name), 'HIGH COMMAND: ');
    return true;
}


module.exports = {

    autoNuke,

    addToMad,

    sanitizeMadList,

    getLoadedNukers,

    pickLauncher,

    resolveNukeTarget,

};