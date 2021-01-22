/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.diplomacyOverlord = function () {
    if (!Memory._userList) Memory._userList = {};
    //Manage friendlies
    friendlyListManagement();
    //Manage threats
    if (Game.time % 5 === 0 && Memory._userList) threatManager();
};

function threatManager() {
    Memory._badBoyArray = [];
    Memory._enemies = [];
    Memory._threats = [];
    Memory._nuisance = [];
    Memory._threatList = [];
    for (let key in Memory._userList) {
        if (key === MY_USERNAME || !key || key === 'undefined') continue;
        let user = Memory._userList[key];
        // Handle routine drift
        let currentRating = user.standing;
        if (user.lastAction + 50 < Game.time || user.lastChange + 250 < Game.time) {
            // If at 0 continue
            if (currentRating === 0) continue;
            // Set limits
            if (currentRating > 50) currentRating = 50; else if (currentRating < -1500) currentRating = -1500;
            // If user is friendly decrease to 0 else increase enemies to 0
            if (currentRating > 0) {
                currentRating -= 0.25;
                if (currentRating === 0) log.w(key + ' is no longer considered a friend.');
            } else {
                currentRating += 0.25;
                if (currentRating === 0) log.w(key + ' is no longer considered a threat.');
            }
            Memory._userList[key].standing = currentRating;
            Memory._userList[key].lastChange = Game.time;
        }
        if (currentRating < 0) {
            Memory._threats.push(key);
        }
        if (currentRating < -500 || (Memory.ncpArray && _.includes(Memory.ncpArray, key))) {
            Memory._enemies.push(key);
        } else if (currentRating < -25) {
            Memory._nuisance.push(key);
        }
        if (currentRating < -5) {
            Memory._threatList.push(key);
        }
    }
    // Add manual enemies
    Memory._enemies = _.union(Memory._enemies, HOSTILES);
    Memory._threatList = _.union(Memory._threatList, HOSTILES);
    // If Not Standard/S+ Server everyone except manually specified are hostile
    if (_.includes(COMBAT_SERVER, Game.shard.name)) Memory._enemies = _.filter(Object.keys(Memory._userList), (p) => p !== '' && p !== 'undefined' && !_.includes(MANUAL_FRIENDS, p) && p !== MY_USERNAME && !_.includes(FRIENDLIES, p));
    // NCP's are always hostile (Also clean NCP array)
    if (NCP_HOSTILE && Memory.ncpArray && Memory.ncpArray.length) {
        if (Math.random() > 0.5) _.remove(Memory.ncpArray, (u) => !_.includes(_.pluck(Memory.roomCache, 'user'), u));
        Memory._enemies = _.union(Memory._enemies, Memory.ncpArray);
        Memory._threatList = _.union(Memory._threatList, Memory.ncpArray);
    }
    // Clean up lists
    Memory._badBoyArray = _.uniq(_.filter(Memory._badBoyArray, (p) => p !== null && p !== undefined && p !== 'undefined'));
    Memory._enemies = _.uniq(_.filter(Memory._enemies, (p) => p !== null && p !== undefined && p !== 'undefined'));
    Memory._nuisance = _.uniq(_.filter(Memory._nuisance, (p) => p !== null && p !== undefined && p !== 'undefined'));
    Memory._threatList = _.uniq(_.filter(Memory._threatList, (p) => p !== null && p !== undefined && p !== 'undefined'));
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
            cache[user]['lastChange'] = Game.time;
            Memory._userList = cache;
        }
        let enemiesAttacked = _.filter(creep.room.getEventLog(), (e) => e.event === EVENT_ATTACK && Game.getObjectById(e.objectId) && !_.includes(Memory._threatList, Game.getObjectById(e.objectId).owner.username) && Game.getObjectById(e.targetId) && _.includes(Memory._threatList, Game.getObjectById(e.targetId).owner.username));
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
            cache[coopUser]['lastChange'] = Game.time;
            Memory._userList = cache;
        }
    }
    // Scouts/Explorers don't generate threat
    if (creep.memory.role === 'scout' || creep.memory.role === 'explorer') return;
    // Handle damage
    if (!creep.memory._lastHits) return creep.memory._lastHits = creep.hits;
    if (creep.hits < creep.memory._lastHits) {
        Memory.roomCache[creep.room.name].lastCombat = Game.time;
        if (creep.room.controller && ((creep.room.controller.owner && creep.room.controller.owner.username !== MY_USERNAME) || (creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME)) && creep.memory.destination !== creep.room.name) return false;
        let nearbyCreeps = _.uniq(_.pluck(_.filter(creep.room.creeps, (c) => ((c.getActiveBodyparts(RANGED_ATTACK) && c.pos.getRangeTo(creep) <= 3) || (c.getActiveBodyparts(ATTACK) && c.pos.isNearTo(creep))) && c.owner.username !== MY_USERNAME), 'owner.username'));
        if (nearbyCreeps.length) {
            for (let user of nearbyCreeps) {
                if (user === MY_USERNAME || user === 'Source Keeper' || user === 'Invader') continue;
                // Handle taking damage near allies with other hostiles
                if (nearbyCreeps.length > 1 && _.includes(FRIENDLIES, user)) continue;
                let cache = Memory._userList || {};
                let standing;
                if (cache[user] && Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].user === MY_USERNAME) {
                    if (cache[user].lastAction + 3 > Game.time) continue;
                    let multiple = 5;
                    if (Memory.roomCache[creep.room.name].user === MY_USERNAME) multiple = 10;
                    if (Memory.roomCache[creep.room.name].user === user) multiple = 1;
                    if (_.includes(FRIENDLIES, user)) {
                        standing = cache[user]['standing'] - 1;
                    } else {
                        standing = cache[user]['standing'] - (2.5 * multiple);
                    }
                    if (standing < -1500) standing = -1500;
                } else if (!cache[user]) {
                    let multiple = -5;
                    if (Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].user === MY_USERNAME) multiple = -10;
                    if (Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].user === user) multiple = -1;
                    if (_.includes(FRIENDLIES, user)) {
                        standing = multiple;
                        log.e(creep.name + ' has taken damage in ' + roomLink(creep.room.name) + '. ' + user + ' has now temporarily been marked hostile. (Now At - ' + standing + ')', 'DIPLOMACY:');
                    } else {
                        standing = 10 * multiple;
                        log.e(creep.name + ' has taken damage in ' + roomLink(creep.room.name) + '. ' + user + ' has now been marked hostile. (Now At - ' + standing + ')', 'DIPLOMACY:');
                    }
                    let sentence = [user, 'now', 'marked', 'hostile'];
                    let word = Game.time % sentence.length;
                    creep.say(sentence[word], true);
                } else {
                    return;
                }
                cache[user] = {
                    standing: standing,
                    lastAction: Game.time,
                };
                Memory._badBoyList = cache;
            }
        }
    }
    creep.memory._lastHits = creep.hits;
    // Handle hostile creeps in owned rooms
    if (Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].user === MY_USERNAME) {
        let neutrals = _.uniq(_.pluck(_.filter(creep.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper'), 'owner.username'));
        if (neutrals.length) {
            for (let user of neutrals) {
                if (user === MY_USERNAME || _.includes(FRIENDLIES, user) || Memory.roomCache[creep.room.name].isHighway) continue;
                let cache = Memory._userList || {};
                if (cache[user] && cache[user].lastAction + 50 > Game.time) continue;
                let standing;
                if (cache[user]) {
                    standing = cache[user]['standing'] - 0.5;
                    if (standing < -1500) standing = -1500;
                } else if (!cache[user]) {
                    standing = -10;
                    log.e(creep.name + ' has detected a neutral in ' + roomLink(creep.room.name) + '. ' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
                }
                cache[user] = {
                    standing: standing,
                    lastAction: Game.time,
                };
                Memory._badBoyList = cache;
            }
        }
    }
};

function friendlyListManagement() {
//Alliance List Management
    let doNotAggressArray;
    let earnedFriends = [];
    if (Memory._userList && _.filter(Memory._userList, (u) => u.standing > 0)) {
        for (let user in _.filter(Memory._userList, (u) => u.standing > 0)) {
            earnedFriends.push(user);
        }
    }
    if (!!~['shard0', 'shard1', 'shard2', 'shard3'].indexOf(Game.shard.name)) {
        doNotAggressArray = LOANlist;
        doNotAggressArray = _.union(doNotAggressArray, MANUAL_FRIENDS, [MY_USERNAME], ['Shibdib'], earnedFriends);
    } else {
        doNotAggressArray = [MY_USERNAME, 'Shibdib'];
        doNotAggressArray = _.union(doNotAggressArray, MANUAL_FRIENDS, earnedFriends);
    }
    global.FRIENDLIES = doNotAggressArray;
}