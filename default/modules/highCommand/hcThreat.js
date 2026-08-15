/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Hostile presence threat scoring.
 */

function generateThreat(creep) {
    const user = INTEL[creep.room.name] && INTEL[creep.room.name].user;
    if (!user || user === MY_USERNAME || user === 'Invader' || user === 'Source Keeper') return;
    if (FRIENDLIES.includes(user)) return;

    if (!Memory._userList) Memory._userList = {};
    const cache = Memory._userList;
    const entry = cache[user] || {standing: 0};
    // Mark activity so prune/decay see them. Do not reset standing or classification
    // flags, and do not stamp lastAggression — our raid is not them attacking us.
    entry.lastAction = Game.time;
    cache[user] = entry;
}

module.exports = {
    generateThreat,
};
