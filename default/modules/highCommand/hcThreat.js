/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Hostile presence threat scoring.
 */

function generateThreat(creep) {
    const user = INTEL[creep.room.name]?.user;
    if (_.includes(FRIENDLIES, user)) return;

    const cache = Memory._userList || {};
    let standing = 50;
    if (cache[user] && (cache[user].standing > 50 || _.includes(FRIENDLIES, user))) {
        standing = cache[user].standing;
    }
    cache[user] = {standing, lastAction: Game.time};
    Memory._userList = cache;
}

module.exports = {
    generateThreat,
};