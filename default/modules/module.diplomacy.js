/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Refactored & Deep-Dived by Grok (xAI) - May 2026
 *
 * Version 2.3 - diplomacyReport() now uses clean direct console.log for best HTML rendering
 */

'use strict';

let tempHostiles = {};
let diplomacyCache = {};

module.exports.diplomacyManager = function () {
    if (!Memory._userList || !(Memory._userList instanceof Object)) Memory._userList = {};

    const currentTime = Game.time;

    if (!diplomacyCache.tick || diplomacyCache.tick !== currentTime) {
        if (!global.LOAN_LIST) global.LOAN_LIST = [];
        if (!global.MANUAL_FRIENDS) global.MANUAL_FRIENDS = [];

        global.FRIENDLIES = _.union(LOAN_LIST, [MY_USERNAME], ['Shibdib'], MANUAL_FRIENDS)
            .filter(u => !tempHostiles[u] || tempHostiles[u].tick <= currentTime);

        threatManager();
        diplomacyCache = {tick: currentTime};
    }
};

function threatManager() {
    const currentTime = Game.time;
    global.ENEMIES = [];
    global.THREATS = [];
    global.WAR_TARGETS = [];

    let changed = false;

    for (const name in Memory._userList) {
        if (!name || name === MY_USERNAME || name === 'undefined' || name.length < 2) continue;

        const user = Memory._userList[name];
        if (user.lastChange + 25 > currentTime) continue;

        let currentRating = user.standing || 0;

        if (user.lastAction + 25 < currentTime && user.lastChange + 25 < currentTime) {
            const isAtWar = ENEMIES.length > 0 || THREATS.length > 0;
            const decayRate = isAtWar ? 0.1 : 0.3;
            currentRating = (currentRating > 5)
                ? currentRating - decayRate
                : currentRating + (isAtWar ? 0.5 : 1.0);
            currentRating = Math.max(-1500, Math.min(100, currentRating));
            user.lastChange = currentTime;
            changed = true;
        }

        const offenses = user.offenses || 0;
        if (currentRating < -250 || (COMBAT_SERVER && !FRIENDLIES.includes(name)) || offenses >= 3) {
            ENEMIES.push(name);
        }
        if (currentRating < -5 && !FRIENDLIES.includes(name)) {
            THREATS.push(name);
        }

        const intelScore = scoreUserFromIntel(name, currentTime);
        if (intelScore < -50) {
            currentRating = Math.max(currentRating - 20, -1500);
            user.lastAction = currentTime;
            changed = true;
        }

        user.standing = Math.round(currentRating * 100) / 100;
        Memory._userList[name] = user;
    }

    global.ENEMIES = _.union(ENEMIES, HOSTILES || []);
    global.THREATS = _.union(THREATS, HOSTILES || []);
    buildWarTargets(currentTime);
}

function scoreUserFromIntel(username, currentTime) {
    let score = 0;
    for (const roomName in INTEL) {
        const intel = INTEL[roomName];
        if (!intel || intel.owner !== username) continue;

        const distance = findClosestOwnedRoom(roomName, true) || 99;

        if (intel.lastCombat && intel.lastCombat + 500 > currentTime) score -= 80;
        if (intel.armedHostile && intel.armedHostile + 300 > currentTime && distance < 4) score -= 120;
        if (intel.threatLevel && intel.threatLevel >= 3 && distance < 5) score -= 60;
        if ((intel.power && intel.power > currentTime) || intel.commodity) score -= 40;
        if (distance <= 2 && (intel.towers || intel.sk)) score -= 100;
    }
    return score;
}

function buildWarTargets(currentTime) {
    const targets = [];

    for (const name in Memory._userList) {
        if (!name || name === MY_USERNAME || name === 'undefined' || name.length < 2) continue;

        const user = Memory._userList[name];
        if (!ENEMIES.includes(name) && !THREATS.includes(name)) continue;

        let priority = Math.abs(user.standing || 0) / 10;
        const offenses = user.offenses || 0;

        if (user.lastAction && user.lastAction + 500 > currentTime) priority += 50;
        priority += offenses * 15;

        for (const roomName in INTEL) {
            const intel = INTEL[roomName];
            if (intel.owner !== name) continue;

            const dist = findClosestOwnedRoom(roomName, true) || 99;
            if (intel.lastCombat && intel.lastCombat + 300 > currentTime) priority += 80;
            if (intel.armedHostile && intel.armedHostile + 200 > currentTime) priority += 60;
            if (intel.threatLevel >= 3) priority += 40;
            if (dist <= 3) priority += 70;
            if (intel.towers) priority += 30;
        }

        targets.push({user: name, priority: Math.round(priority)});
    }

    targets.sort((a, b) => b.priority - a.priority);
    global.WAR_TARGETS = targets.slice(0, 8);
}

module.exports.trackThreat = function (creep) {
    const {room, hits, hitsMax, memory} = creep;
    const currentTime = Game.time;

    if (!INTEL[room.name]) return room.cacheRoomIntel();

    if (room.towers[0] && !INTEL[room.name].towers) {
        room.cacheRoomIntel(true);
        purgeBadRoute(room.name);
    }

    if (hits < (memory._lastHits || hitsMax)) {
        if (!INTEL[room.name]) return;

        INTEL[room.name].lastCombat = currentTime;
        INTEL[room.name].pathingPenalty = currentTime;
        INTEL[room.name].armedHostile = currentTime;

        const isHostileRoom = INTEL[room.name].user && !FRIENDLIES.includes(INTEL[room.name].user);
        if (isHostileRoom) purgeBadRoute(room.name);
        if (isHostileRoom && memory.destination !== room.name) return;

        const nearbyHostiles = _.uniq(
            room.creeps
                .filter(c =>
                    c.owner &&
                    c.owner.username !== MY_USERNAME &&
                    ((c.hasActiveBodyparts(RANGED_ATTACK) && c.pos.inRangeTo(creep, 3)) ||
                        (c.hasActiveBodyparts(ATTACK) && c.pos.isNearTo(creep)))
                )
                .map(c => c.owner.username)
        );

        for (const user of nearbyHostiles) {
            if (user === MY_USERNAME || user === 'Invader' || user === 'Source Keeper') continue;

            if (!Memory._userList) Memory._userList = {};
            const cache = Memory._userList;
            const userEntry = cache[user] || {standing: 0, offenses: 0};

            const multiplier = (INTEL[room.name].user === MY_USERNAME) ? 3 : 1.0;
            let standing = userEntry.standing || 0;

            standing -= (FRIENDLIES.includes(user) ? 1.5 : 3.5) * multiplier;
            standing = Math.max(standing, -1500);

            userEntry.standing = standing;
            userEntry.lastAction = currentTime;
            userEntry.lastChange = currentTime;
            userEntry.offenses = (userEntry.offenses || 0) + 1;
            cache[user] = userEntry;
            Memory._userList = cache;
        }
    }

    memory._lastHits = hits;

    if (room.hostileCreeps.length && INTEL[room.name] && INTEL[room.name].user === MY_USERNAME) {
        const neutrals = _.uniq(room.hostileCreeps.map(c => c.owner.username));

        for (const user of neutrals) {
            if (user === MY_USERNAME || user === 'Invader' || user === 'Source Keeper' ||
                FRIENDLIES.includes(user) || (INTEL[room.name] && INTEL[room.name].isHighway)) continue;

            if (!Memory._userList) Memory._userList = {};
            const cache = Memory._userList;
            const userEntry = cache[user] || {standing: 0, offenses: 0};

            if ((userEntry.lastAction || 0) + 50 > currentTime) continue;

            userEntry.standing = Math.max((userEntry.standing || 0) - 0.75, -5004);
            userEntry.lastAction = currentTime;
            userEntry.lastChange = currentTime;
            userEntry.offenses = (userEntry.offenses || 0) + 1;
            cache[user] = userEntry;
            Memory._userList = cache;
        }
    }
};

// ============================================================
//                    CONSOLE COMMAND
// ============================================================

global.diplomacyReport = function () {
    const currentTime = Game.time;
    const users = Memory._userList || {};

    console.log(`\n========== DIPLOMACY REPORT — Tick ${currentTime} ==========`);

    console.log(`<font color="#00ff00">FRIENDLIES:</font> ${FRIENDLIES.length} | ` +
        `<font color="#ffaa00">THREATS:</font> ${THREATS.length} | ` +
        `<font color="#ff0000">ENEMIES:</font> ${ENEMIES.length}`);

    const sortedUsers = Object.keys(users)
        .filter(name => name && name !== MY_USERNAME && name !== 'undefined' && name.length > 1)
        .sort((a, b) => users[b].standing - users[a].standing)
        .slice(0, 12);

    console.log(`\n<font color="#ffff00">TOP STANDINGS (showing 12):</font>`);

    for (const name of sortedUsers) {
        const u = users[name];
        const color = u.standing > 10 ? '#00ff00' :
            u.standing > 0 ? '#aaffaa' :
                u.standing > -50 ? '#ffaa00' : '#ff4444';

        const offenses = u.offenses || 0;
        const lastActionText = u.lastAction
            ? ` (last action: ${currentTime - u.lastAction} ticks ago)`
            : '';

        console.log(` <font color="${color}">${name.padEnd(18)}</font> standing: ${u.standing.toFixed(1).padStart(7)} offenses: ${offenses}${lastActionText}`);
    }

    if (global.WAR_TARGETS && global.WAR_TARGETS.length) {
        console.log(`\n<font color="#ff4444">CURRENT WAR TARGETS (top ${global.WAR_TARGETS.length}):</font>`);
        for (const t of global.WAR_TARGETS) {
            console.log(` <font color="#ff0000">${t.user}</font> — priority: <font color="#ffaa00">${t.priority}</font>`);
        }
    } else {
        console.log(`\n<font color="#00ff00">No active war targets.</font>`);
    }

    let recentOffenders = 0;
    let totalOffenses = 0;
    for (const name in users) {
        if (!name || name === MY_USERNAME || name === 'undefined' || name.length < 2) continue;
        const u = users[name];
        if (u.lastAction && currentTime - u.lastAction < 500) recentOffenders++;
        totalOffenses += u.offenses || 0;
    }

    console.log(`\n<font color="#aaaaaa">Recent activity:</font> ${recentOffenders} users acted in last 500 ticks | Total offenses tracked: ${totalOffenses}`);
    console.log(`========================================================\n`);
};

module.exports.getWarTargets = function () {
    return global.WAR_TARGETS || [];
};

module.exports.isEnemy = function (username) {
    return ENEMIES.includes(username) || THREATS.includes(username);
};