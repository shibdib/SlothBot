/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let tempHostiles = {};

module.exports.diplomacyManager = function () {
    if (!Memory._userList) Memory._userList = {};
    // Manage friendlies
    global.FRIENDLIES = _.union(LOAN_LIST, [MY_USERNAME], ['Shibdib'], MANUAL_FRIENDS).filter((u) => !_.find(tempHostiles, (h) => h.user === u && h.tick > Game.time));
    // Manage threats
    if (Game.time % 5 === 0 && Memory._userList) threatManager();
    // Diplomacy recap
};

function threatManager() {
    // Reset relevant memory arrays
    Memory._badBoyArray = undefined;
    Memory._badBoyList = undefined;
    Memory._nuisance = undefined;

    Memory._enemies = [];
    Memory._threats = [];

    // Process user standings
    for (const name in Memory._userList) {
        if (!name || name === MY_USERNAME || name === 'undefined') continue;

        const user = Memory._userList[name];
        let currentRating = user.standing;

        // Mark NCP-hostile users as highly hostile
        if (NCP_HOSTILE && Memory.ncpArray.includes(name)) {
            currentRating = -1000;
        }

        // Skip neutral users
        if (currentRating === 0) continue;

        // Routine drift adjustments
        if (user.lastAction + 25 < Game.time && user.lastChange + 100 < Game.time) {
            currentRating = Math.max(-1000, Math.min(100, currentRating)); // Clamp rating between -1000 and 100

            if (currentRating > 5) {
                currentRating -= 0.25;
            } else {
                currentRating += 0.25;
            }

            user.standing = currentRating;
            user.lastChange = Game.time;
        }

        // Categorize users based on their rating
        if (currentRating < -500) Memory._enemies.push(name);
        if (currentRating < -5) Memory._threats.push(name);
    }

    // Include manual enemies
    Memory._enemies = _.union(Memory._enemies, HOSTILES);
    Memory._threats = _.union(Memory._threats, HOSTILES);

    // Handle combat server cases
    if (COMBAT_SERVER) {
        Memory._enemies = Object.keys(Memory._userList).filter(
            p => p && !FRIENDLIES.includes(p)
        );
        Memory._threats = [...Memory._enemies];
    }

    // Randomly clean NCP array
    if (!Memory.ncpArray) Memory.ncpArray = [];
    if (Memory.ncpArray.length && Math.random() > 0.9) {
        Memory.ncpArray = Memory.ncpArray.filter(u => _.pluck(INTEL, 'user').includes(u));
    }

    // Deduplicate and clean up threats and enemies lists
    Memory._threats = _.uniq(Memory._threats.filter(Boolean));
    Memory._enemies = _.uniq(Memory._enemies.filter(Boolean));

    // Clean old threats and enemies
    Memory._threats = _.filter(Memory._threats, (t) => _.find(INTEL, (i) => i && i.owner === t));
    Memory._enemies = _.filter(Memory._enemies, (e) => _.find(INTEL, (i) => i && i.owner === e));

    // Update global variables
    global.THREATS = Memory._threats;
    global.ENEMIES = Memory._enemies;
}


module.exports.trackThreat = function (creep) {
    const {room, hits, hitsMax, memory} = creep;

    // Process hostile creeps in the room
    if (room.hostileCreeps.length) {
        const newUsers = _.filter(
            _.uniq(_.pluck(room.creeps, 'owner.username')),
            function (u) {
                return (
                    u !== "Invader" &&
                    u !== "Source Keeper" &&
                    u !== undefined &&
                    !Memory._userList[u]
                );
            }
        );

        for (let i = 0; i < newUsers.length; i++) {
            const user = newUsers[i];
            if (!Memory._userList) Memory._userList = {};
            Memory._userList[user] = {standing: 0, lastAction: Game.time, lastChange: Game.time};
        }

        const enemyAttacks = _.filter(
            room.getEventLog(),
            function (e) {
                const attacker = Game.getObjectById(e.objectId);
                const target = Game.getObjectById(e.targetId);
                return (
                    e.event === EVENT_ATTACK &&
                    attacker &&
                    !Memory._threats.includes(attacker.owner.username) &&
                    target &&
                    Memory._threats.includes(target.owner.username)
                );
            }
        );

        for (let i = 0; i < enemyAttacks.length; i++) {
            const attack = enemyAttacks[i];
            const coopUser = Game.getObjectById(attack.objectId).owner.username;
            if (!Memory._userList) Memory._userList = {};
            const userEntry = Memory._userList[coopUser] || {standing: 0};
            userEntry.standing = Math.min(userEntry.standing + 1, 50);
            userEntry.lastAction = Game.time;
            userEntry.lastChange = Game.time;
            Memory._userList[coopUser] = userEntry;
        }
    }
    // Handle updating rooms with towers
    const tower = creep.room.structures.find((s) => !s.my && s.structureType === STRUCTURE_TOWER);
    if (tower && !INTEL[creep.room.name].towers) {
        creep.room.cacheRoomIntel(true);
        purgeBadRoute(creep.room.name);
    }

    // Ignore scouts and explorers
    if (memory.role === "scout" || memory.role === "explorer") return;

    // Process damage detection
    if (hits < memory._lastHits || hitsMax) {
        if (!INTEL[room.name]) return room.cacheRoomIntel();

        INTEL[room.name].lastCombat = Game.time;
        INTEL[room.name].pathingPenalty = Game.time;
        INTEL[room.name].armedHostile = Game.time;

        const isHostileRoom =
            room.controller &&
            ((room.controller.owner && room.controller.owner.username !== MY_USERNAME) ||
                (room.controller.reservation && room.controller.reservation.username !== MY_USERNAME));
        if (isHostileRoom) purgeBadRoute(creep.room.name);
        if (isHostileRoom && memory.destination !== room.name) return;

        const nearbyHostiles = _.uniq(
            _.pluck(
                _.filter(
                    room.creeps,
                    function (c) {
                        return (
                            ((c.hasActiveBodyparts(RANGED_ATTACK) && c.pos.inRangeTo(creep, 3)) ||
                                (c.hasActiveBodyparts(ATTACK) && c.pos.isNearTo(creep))) &&
                            c.owner.username !== MY_USERNAME
                        );
                    }
                ),
                "owner.username"
            )
        );

        for (let i = 0; i < nearbyHostiles.length; i++) {
            const user = nearbyHostiles[i];
            if (user === MY_USERNAME || user === "Invader" || user === "Source Keeper") continue;

            if (!Memory._userList) Memory._userList = {};
            const cache = Memory._userList;
            const userEntry = cache[user] || {};
            let standing = userEntry.standing || 0;

            const multiplier = INTEL[room.name] && INTEL[room.name].user === MY_USERNAME ? 10 : 5;

            if (FRIENDLIES.includes(user)) {
                standing -= multiplier;
            } else {
                standing -= 2.5 * multiplier;
            }

            standing = Math.max(standing, -5004);
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

