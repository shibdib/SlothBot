/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let tempHostiles = {};

module.exports.diplomacyOverlord = function () {
    if (!Memory._userList) Memory._userList = {};
    // Manage friendlies
    global.FRIENDLIES = _.union(LOANlist, [MY_USERNAME], ['Shibdib'], MANUAL_FRIENDS).filter((u) => !_.find(tempHostiles, (h) => h.user === u && h.tick > Game.time));
    // Manage threats
    if (Game.time % 5 === 0 && Memory._userList) threatManager();
    // Diplomacy recap
};

function threatManager() {
    // Clean old arrays
    Memory._badBoyArray = undefined;
    Memory._badBoyList = undefined;
    Memory._nuisance = undefined;
    Memory._threatList = undefined;
    // Redeclare every time
    Memory._enemies = [];
    Memory._threats = [];
    // Process known users
    for (let name in Memory._userList) {
        if (name === MY_USERNAME || !name || name === 'undefined') continue;
        let user = Memory._userList[name];
        // Handle routine drift
        let currentRating = user.standing;
        // If NCP's are always hostile
        if (NCP_HOSTILE && Memory.ncpArray && Memory.ncpArray.includes(name)) {
            currentRating = -1000;
        }
        if (currentRating === 0) continue;
        if (user.lastAction + 25 < Game.time && user.lastChange + 100 < Game.time) {
            // Set limits
            if (currentRating > 100) currentRating = 100; else if (currentRating < -1000) currentRating = -1000;
            // If user is friendly decrease to 5 else increase enemies to 0
            if (currentRating > 5) {
                currentRating -= 0.25;
                if (currentRating === 0) log.w(name + ' is no longer considered a friend.');
            } else {
                currentRating += 0.25;
                if (currentRating === 0) log.w(name + ' is no longer considered a threat.');
            }
            Memory._userList[name].standing = currentRating;
            Memory._userList[name].lastChange = Game.time;
        }
        // Enemies are very bad
        if (currentRating < -500) {
            Memory._enemies.push(name);
        }
        // _threats is the master list of baddies
        if (currentRating < -5) {
            Memory._threats.push(name);
        }
    }
    // Add manual enemies
    Memory._enemies = _.union(Memory._enemies, HOSTILES);
    global.ENEMIES = Memory._enemies;
    Memory._threats = _.union(Memory._threats, HOSTILES);
    global.THREATS = Memory._threats;
    // Check shard name for a combat server
    if (COMBAT_SERVER.includes(Game.shard.name)) {
        Memory._enemies = _.filter(Object.keys(Memory._userList), (p) => p !== '' && p !== 'undefined' && !_.includes(FRIENDLIES, p));
        Memory._threats = Memory._enemies;
    }
    // Randomly clean NCP array
    if (Memory.ncpArray && Memory.ncpArray.length && Math.random() > 0.9) _.remove(Memory.ncpArray, (u) => !_.includes(_.pluck(INTEL, 'user'), u));
    // Clean up lists
    Memory._threats = _.uniq(_.filter(Memory._threats, (p) => p !== null && p !== undefined && p !== 'undefined'));
    Memory._enemies = _.uniq(_.filter(Memory._enemies, (p) => p !== null && p !== undefined && p !== 'undefined'));
}

module.exports.trackThreat = function (creep) {
    // Handle enemies being attacked
    if (creep.room.hostileCreeps.length) {
        // Store usernames
        let newUsers = _.filter(_.uniq(_.pluck(creep.room.creeps, 'owner.username')), (u) => u !== 'Invader' && u !== 'Source Keeper' && !Memory._userList[u]);
        for (let user of newUsers) {
            let cache = Memory._userList || {};
            cache[user] = {};
            cache[user]['standing'] = 0;
            cache[user]['lastAction'] = Game.time;
            cache[user]['lastChange'] = Game.time;
            Memory._userList = cache;
        }
        let enemiesAttacked = _.filter(creep.room.getEventLog(), (e) => e.event === EVENT_ATTACK && Game.getObjectById(e.objectId) && !_.includes(Memory._threats, Game.getObjectById(e.objectId).owner.username) && Game.getObjectById(e.targetId) && _.includes(Memory._threatList, Game.getObjectById(e.targetId).owner.username));
        for (let attack of enemiesAttacked) {
            let coopUser = Game.getObjectById(attack.objectId).owner.username;
            let cache = Memory._userList || {};
            if (cache[coopUser]) {
                cache[coopUser]['standing']++;
                if (cache[coopUser]['standing'] > 50) cache[coopUser]['standing'] = 50;
            } else {
                cache[coopUser] = {};
                cache[coopUser]['standing'] = 1;
            }
            cache[coopUser]['lastAction'] = Game.time;
            cache[coopUser]['lastChange'] = Game.time;
            Memory._userList = cache;
        }
    }
    // Scouts/Explorers don't generate threat
    if (creep.memory.role === 'scout' || creep.memory.role === 'explorer') return;
    // Handle damage
    if (creep.hits < creep.memory._lastHits || creep.hitsMax) {
        if (!INTEL[creep.room.name]) return creep.room.cacheRoomIntel();
        INTEL[creep.room.name].lastCombat = Game.time;
        if (creep.room.controller && ((creep.room.controller.owner && creep.room.controller.owner.username !== MY_USERNAME) || (creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME)) && creep.memory.destination !== creep.room.name) return false;
        let nearbyCreeps = _.uniq(_.pluck(_.filter(creep.room.creeps, (c) => ((c.hasActiveBodyparts(RANGED_ATTACK) && c.pos.inRangeTo(creep, 3)) || (c.hasActiveBodyparts(ATTACK) && c.pos.isNearTo(creep))) && c.owner.username !== MY_USERNAME), 'owner.username'));
        if (nearbyCreeps.length) {
            for (let user of nearbyCreeps) {
                INTEL[creep.room.name].pathingPenalty = Game.time;
                if (user === MY_USERNAME || user === 'Invader' || user === 'Source Keeper') continue;
                // Handle taking damage near allies with other hostiles
                if (nearbyCreeps.length > 1 && _.includes(FRIENDLIES, user)) continue;
                let cache = Memory._userList || {};
                let standing;
                if (cache[user] && INTEL[creep.room.name] && INTEL[creep.room.name].user === MY_USERNAME) {
                    if (cache[user].lastAction + 3 > Game.time) continue;
                    let multiple = 5;
                    if (INTEL[creep.room.name].user === MY_USERNAME) multiple = 10;
                    if (INTEL[creep.room.name].user === user) multiple = 1;
                    // Handle a friendly attacking you
                    if (_.includes(FRIENDLIES, user)) {
                        standing = cache[user]['standing'] - multiple;
                        if (!tempHostiles[user]) {
                            tempHostiles[user] = {user: user, tick: Game.time + CREEP_LIFE_TIME, infractionCount: 1};
                            log.e(creep.name + ' has taken damage in ' + roomLink(creep.room.name) + '. ' + user + ' has now temporarily been marked hostile. (Now At - ' + standing + ')', 'DIPLOMACY:');
                        } else {
                            tempHostiles[user].tick = Game.time + CREEP_LIFE_TIME;
                            tempHostiles[user].infractionCount++;
                            if (tempHostiles[user].infractionCount > 5) {
                                log.e(user + ' has attacked us ' + tempHostiles[user].infractionCount + ' times. (Now At - ' + standing + ')', 'DIPLOMACY:');
                                Game.notify(user + ' has attacked us ' + tempHostiles[user].infractionCount + ' times. (Now At - ' + standing + ')', 60);
                            }
                        }
                    } else {
                        standing = cache[user]['standing'] - (2.5 * multiple);
                        if (standing % 5 === 0) log.e(user + ' has attacked us in ' + roomLink(creep.room.name) + '. (Now At - ' + standing + ')', 'DIPLOMACY:');
                    }
                    if (standing < -1500) standing = -1500;
                } else if (!cache[user]) {
                    let multiple = -5;
                    if (INTEL[creep.room.name] && INTEL[creep.room.name].user === MY_USERNAME) multiple = -10;
                    if (INTEL[creep.room.name] && INTEL[creep.room.name].user === user) multiple = -1;
                    standing = 10 * multiple;
                    log.e(creep.name + ' has taken damage in ' + roomLink(creep.room.name) + '. ' + user + ' has now been marked hostile. (Now At - ' + standing + ')', 'DIPLOMACY:');
                    let sentence = [user, 'now', 'marked', 'hostile'];
                    let word = Game.time % sentence.length;
                    creep.say(sentence[word], true);
                } else {
                    return;
                }
                cache[user] = {
                    standing: standing,
                    lastAction: Game.time,
                    lastChange: Game.time
                };
                Memory._userList = cache;
            }
        }
    }
    creep.memory._lastHits = creep.hits;
    // Handle trespassing
    if (creep.room.hostileCreeps.length && INTEL[creep.room.name] && INTEL[creep.room.name].user === MY_USERNAME) {
        let neutrals = _.uniq(_.pluck(creep.room.hostileCreeps, 'owner.username'));
        if (neutrals.length) {
            for (let user of neutrals) {
                if ([MY_USERNAME, 'Invader', 'Source Keeper'].includes(user) || FRIENDLIES.includes(user) || INTEL[creep.room.name].isHighway) continue;
                let cache = Memory._userList || {};
                if (cache[user] && cache[user].lastAction + 50 > Game.time) continue;
                let standing;
                if (cache[user]) {
                    standing = cache[user]['standing'] - 0.5;
                    if (standing % 10 === 0) log.e(creep.name + ' has detected a neutral in ' + roomLink(creep.room.name) + '. ' + user + ' and now has a standing of ' + standing + '.', 'DIPLOMACY:');
                    if (standing < -1500) standing = -1500;
                } else if (!cache[user]) {
                    standing = -10;
                    log.e(creep.name + ' has detected a neutral in ' + roomLink(creep.room.name) + '. ' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
                }
                cache[user] = {
                    standing: standing,
                    lastAction: Game.time,
                    lastChange: Game.time
                };
                Memory._userList = cache;
            }
        }
    }
};