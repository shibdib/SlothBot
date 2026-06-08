/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Automated MAD nuke launches.

 */


function autoNuke() {
    if (!Memory.MAD) return false;

    const availableLaunchers = MY_ROOMS
        .map(r => Game.rooms[r]?.nuker)
        .filter(n => n && !n.store.getFreeCapacity(RESOURCE_ENERGY) && !n.store.getFreeCapacity(RESOURCE_GHODIUM) && !n.cooldown);

    if (!availableLaunchers.length) return;

    const MADTarget = _.min(Object.values(INTEL).filter(r =>
        Memory.MAD.includes(r.owner) &&
        !Memory.targetRooms[r.name] &&
        (!r.lastNuke || r.lastNuke + NUKE_LAND_TIME < Game.time) &&
        r.nukeTarget &&
        _.find(availableLaunchers, s => Game.map.getRoomLinearDistance(s.room.name, r.name) <= 10)
    ), r => findClosestOwnedRoom(r.name, true));

    if (!MADTarget?.name) return;

    log.a('MAD Target Acquired â€” ' + roomLink(MADTarget.name) + ' â€” LAUNCHING NUKES', 'HIGH COMMAND: ');
    Game.notify('MAD Target Acquired â€” ' + MADTarget.name + ' â€” LAUNCHING NUKES');

    const launcher = _.find(availableLaunchers, s => Game.map.getRoomLinearDistance(s.room.name, MADTarget.name) <= 10);
    if (!launcher) return;

    const target = new RoomPosition(1, 1, MADTarget.name).posFromString(MADTarget.nukeTarget);
    launcher.launchNuke(target);

    MADTarget.lastNuke = Game.time;
    INTEL[MADTarget.name] = MADTarget;
    if (global.updateIntelIndex) global.updateIntelIndex(MADTarget.name, null, MADTarget);
    Memory.MAD = _.filter(Memory.MAD, u => u !== MADTarget.owner);

    Memory.targetRooms[MADTarget.name] = {
        tick: Game.time,
        type: 'remoteDenial',
        dDay: Game.time + NUKE_LAND_TIME
    };

    log.a('Nuke launched at ' + roomLink(MADTarget.name) + ' by ' + launcher.room.name);
}

module.exports = {

    autoNuke,

};