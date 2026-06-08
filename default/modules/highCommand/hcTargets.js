/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Target room assignment for military and auxiliary ops.

 */


const {getPriority} = require('hcUtils');

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
    // Guard remotes may have no intel (unscanned neighbors are valid targets) â€” guard the access
    if (!INTEL[room]) {
        INTEL[room] = {name: room};
        if (global.updateIntelIndex) global.updateIntelIndex(room, null, INTEL[room]);
    }
    // Always stamp lastOperation so the candidate-pool cooldown applies; sieges also get lastSiege for the per-siege cooldown.
    INTEL[room].lastOperation = Game.time;
    if (operation === 'roomDenial') INTEL[room].lastSiege = Game.time;
    return log.a(`${operation} operation planned for ${roomLink(room)} owned by ${INTEL[room].owner || 'N/A'} (Nearest Friendly Room - ${findClosestOwnedRoom(room, true)} rooms away)`, 'HIGH COMMAND: ');
}

module.exports = {

    setTarget,

};