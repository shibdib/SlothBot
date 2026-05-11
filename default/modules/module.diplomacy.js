/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let tempHostiles = {};

module.exports.diplomacyManager = function () {
    if (!Memory._userList || !(Memory._userList instanceof Object)) Memory._userList = {};
    // Manage friendlies
    if (!global.LOAN_LIST) global.LOAN_LIST = [];
    if (!global.MANUAL_FRIENDS) global.MANUAL_FRIENDS = [];
    global.FRIENDLIES = _.union(LOAN_LIST, [MY_USERNAME], ['Shibdib'], MANUAL_FRIENDS).filter((u) => !_.find(tempHostiles, (h) => h.user === u && h.tick > Game.time));
    // Manage threats
    threatManager();
    // Diplomacy recap
};

function threatManager() {
    global.ENEMIES = [];
    global.THREATS = [];
    // Process user standings
    for (const name in Memory._userList) {
        // Sanity checks
        if (!name || name === MY_USERNAME || name === 'undefined') continue;
        const user = Memory._userList[name];

        // These update every 25 ticks
        if (user.lastChange + 25 > Game.time) continue;

        let currentRating = user.standing;
        if (user.lastAction + 25 < Game.time && user.lastChange + 25 < Game.time) {
            currentRating = Math.max(-1000, Math.min(100, currentRating));
            currentRating = (currentRating > 5) ? currentRating - 0.2 : currentRating + 1;
            user.lastChange = Game.time;
        }

        if (currentRating < -250 || (COMBAT_SERVER && !FRIENDLIES.includes(name))) {
            ENEMIES.push(name);
        }
        if (currentRating < -5 && !FRIENDLIES.includes(name)) THREATS.push(name);

        user.standing = Math.round(currentRating * 100) / 100;
        Memory._userList[name] = user;
    }

    // Include manual enemies
    global.ENEMIES = _.union(ENEMIES, HOSTILES);
    global.THREATS = _.union(THREATS, HOSTILES);
}

module.exports.trackThreat = function (creep) {
    const {room, hits, hitsMax, memory} = creep;

    if (!INTEL[creep.room.name]) return creep.room.cacheRoomIntel();

    // Handle updating rooms with towers
    const tower = creep.room.structures.find((s) => !s.my && s.structureType === STRUCTURE_TOWER);
    if (tower && !INTEL[creep.room.name].towers) {
        creep.room.cacheRoomIntel(true);
        purgeBadRoute(creep.room.name);
    }

    // Process damage detection
    if (hits < memory._lastHits) {
        if (!INTEL[room.name]) return room.cacheRoomIntel();

        INTEL[room.name].lastCombat = Game.time;
        INTEL[room.name].pathingPenalty = Game.time;
        INTEL[room.name].armedHostile = Game.time;

        const isHostileRoom = INTEL[creep.room.name] && INTEL[creep.room.name].user && !FRIENDLIES.includes(INTEL[creep.room.name].user);
        if (isHostileRoom) purgeBadRoute(creep.room.name);
        if (isHostileRoom && memory.destination !== room.name) return;

        const nearbyHostiles = _.uniq(_.pluck(_.filter(room.creeps,
                    function (c) {
                        return (((c.hasActiveBodyparts(RANGED_ATTACK) && c.pos.inRangeTo(creep, 3)) || (c.hasActiveBodyparts(ATTACK) && c.pos.isNearTo(creep))) && c.owner && c.owner.username !== MY_USERNAME);
                    }
        ), "owner.username"));

        for (let i = 0; i < nearbyHostiles.length; i++) {
            const user = nearbyHostiles[i];
            if (user === MY_USERNAME || user === "Invader" || user === "Source Keeper") continue;

            if (!Memory._userList) Memory._userList = {};
            const cache = Memory._userList;
            const userEntry = cache[user] || {};
            let standing = userEntry.standing || 0;

            const multiplier = INTEL[room.name] && INTEL[room.name].user === MY_USERNAME ? 3 : 0.25;

            if (FRIENDLIES.includes(user)) {
                standing -= multiplier;
            } else {
                standing -= 2.5 * multiplier;
            }

            standing = Math.max(standing, -1500);
            cache[user] = {standing: standing, lastAction: Game.time, lastChange: Game.time};
            Memory._userList = cache;
        }
    }

    memory._lastHits = hits;

    // Handle trespassing
    if (room.hostileCreeps.length && INTEL[room.name] && INTEL[room.name].user === MY_USERNAME) {
        const neutrals = _.uniq(_.pluck(room.hostileCreeps, "owner.username"));

        for (let i = 0; i < neutrals.length; i++) {
            const user = neutrals[i];
            if (
                user === MY_USERNAME ||
                user === "Invader" ||
                user === "Source Keeper" ||
                FRIENDLIES.includes(user) ||
                (INTEL[room.name] && INTEL[room.name].isHighway)
            )
                continue;

            if (!Memory._userList) Memory._userList = {};
            const cache = Memory._userList;
            const userEntry = cache[user] || {};
            const lastAction = userEntry.lastAction || 0;
            if (lastAction + 50 > Game.time) continue;

            let standing = userEntry.standing || 0;
            standing -= 0.5;

            standing = Math.max(standing, -5004);
            cache[user] = {standing: standing, lastAction: Game.time, lastChange: Game.time};
            Memory._userList = cache;
        }
    }
};

