/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.diplomacyOverlord = function () {
    //Manage threats
    if (Game.time % 5 === 0 && Memory._badBoyList) threatManager();
    //Manage friendlies
    if (Game.time % 1500 === 0) friendlyListManagement();
};

function threatManager() {
    let newRating;
    Memory._badBoyArray = [];
    Memory._enemies = [];
    Memory._threats = [];
    Memory._nuisance = [];
    Memory._threatList = [];
    for (let key in Memory._badBoyList) {
        if (key === MY_USERNAME || !key || key === 'undefined') {
            delete Memory._badBoyList[key];
            continue;
        }
        let threat = Memory._badBoyList[key];
        if (threat.lastAction + 50 < Game.time || threat.lastChange + 250 < Game.time) {
            // Scaled threat decrease
            let currentRating = threat.threatRating;
            let decrease = 0.5;
            //if (currentRating > 1000) decrease = 0.5; else if (currentRating > 25) decrease = 0.75;
            newRating = currentRating - decrease;
            if (newRating <= 0 && (!Memory.ncpArray || !_.includes(Memory.ncpArray, key))) {
                delete Memory._badBoyList[key];
                log.w(key + ' is no longer considered a threat.');
                continue;
            } else {
                Memory._badBoyList[key].threatRating = newRating;
                Memory._badBoyList[key].lastChange = Game.time;
            }
        }
        if (Memory._badBoyList[key].threatRating >= 1) {
            Memory._threats.push(key);
        }
        if (Memory._badBoyList[key].threatRating > 250 || (Memory.ncpArray && _.includes(Memory.ncpArray, key))) {
            Memory._enemies.push(key);
        } else if (Memory._badBoyList[key].threatRating > 25) {
            Memory._nuisance.push(key);
        } else if (Memory._badBoyList[key].threatRating > 5) {
            Memory._threatList.push(key);
        }
        let length = 10 - (Memory._badBoyList[key].threatRating.toString().length + 1);
        let display = key.substring(0, length) + '-' + Memory._badBoyList[key].threatRating;
        Memory._badBoyArray.push(display);
    }
    // Add manual enemies
    Memory._enemies = _.union(Memory._enemies, HOSTILES);
    // If Not Standard/S+ Server everyone except manually specified are hostile
    if (_.includes(COMBAT_SERVER, Game.shard.name)) Memory._enemies = _.filter(_.pluck(Memory.roomCache, 'user'), (p) => !_.includes(MANUAL_FRIENDS, p) && p !== MY_USERNAME && !_.includes(FRIENDLIES, p));
    // NCP's are always hostile (Also clean NCP array)
    if (NCP_HOSTILE && Memory.ncpArray && Memory.ncpArray.length) {
        if (Math.random() > 0.5) _.remove(Memory.ncpArray, (u) => !_.includes(_.pluck(Memory.roomCache, 'user'), u));
        Memory._enemies = _.union(Memory._enemies, Memory.ncpArray);
    }
    // Clean up lists
    Memory._badBoyArray = _.uniq(_.filter(Memory._badBoyArray, (p) => p !== null && p !== undefined));
    Memory._enemies = _.uniq(_.filter(Memory._enemies, (p) => p !== null && p !== undefined));
    Memory._nuisance = _.uniq(_.filter(Memory._nuisance, (p) => p !== null && p !== undefined));
    Memory._threatList = _.uniq(_.filter(Memory._threatList, (p) => p !== null && p !== undefined));
}

module.exports.trackThreat = function (creep) {
    // Handle damage
    if (!creep.memory._lastHits) return creep.memory._lastHits = creep.hits;
    if (creep.hits < creep.memory._lastHits) {
        creep.room.invaderCheck();
        creep.room.cacheRoomIntel();
        if (creep.room.controller && ((creep.room.controller.owner && creep.room.controller.owner.username !== MY_USERNAME) || (creep.room.controller.reservation && creep.room.controller.reservation.username !== MY_USERNAME)) && creep.memory.targetRoom !== creep.room.name) return false;
        let nearbyCreeps = _.uniq(_.pluck(_.filter(creep.room.creeps, (c) => ((c.getActiveBodyparts(RANGED_ATTACK) && c.pos.getRangeTo(creep) <= 3) || (c.getActiveBodyparts(ATTACK) && c.pos.isNearTo(creep))) && c.owner.username !== MY_USERNAME), 'owner.username'));
        if (nearbyCreeps.length) {
            for (let user of nearbyCreeps) {
                if (user === MY_USERNAME || user === 'Source Keeper' || user === 'Invader') continue;
                // Handle taking damage near allies with other hostiles
                if (nearbyCreeps.length > 1 && _.includes(FRIENDLIES, user)) continue;
                let cache = Memory._badBoyList || {};
                let threatRating;
                if (cache[user] && Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].user === MY_USERNAME) {
                    if (cache[user].lastAction + 3 > Game.time) return true;
                    if (Math.random() > 0.8) log.e(creep.name + ' has taken damage in ' + roomLink(creep.room.name) + '. Adjusting threat rating for ' + user);
                    if (_.includes(FRIENDLIES, user)) {
                        threatRating = cache[user]['threatRating'] + 0.1;
                    } else {
                        threatRating = cache[user]['threatRating'] + 2.5;
                    }
                    if (threatRating >= 1500) threatRating = 1500;
                } else if (!cache[user]) {
                    let multiple = 1;
                    if (Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].user === MY_USERNAME) multiple = 10;
                    if (_.includes(FRIENDLIES, user)) {
                        log.e(creep.name + ' has taken damage in ' + roomLink(creep.room.name) + '. ' + user + ' has now temporarily been marked hostile.', 'DIPLOMACY:');
                        threatRating = multiple;
                    } else {
                        log.e(creep.name + ' has taken damage in ' + roomLink(creep.room.name) + '. ' + user + ' has now been marked hostile.', 'DIPLOMACY:');
                        threatRating = 10 * multiple;
                    }
                } else {
                    return;
                }
                cache[user] = {
                    threatRating: threatRating,
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
                if (user === MY_USERNAME || _.includes(FRIENDLIES, user)) continue;
                let cache = Memory._badBoyList || {};
                let threatRating;
                if (cache[user]) {
                    threatRating = cache[user]['threatRating'] + 0.25;
                    if (threatRating >= 1500) threatRating = 1500;
                } else if (!cache[user]) {
                    threatRating = 15;
                    log.e(creep.name + ' has detected a neutral in ' + roomLink(creep.room.name) + '. ' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
                }
                cache[user] = {
                    threatRating: threatRating,
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
    if (!!~['shard0', 'shard1', 'shard2', 'shard3'].indexOf(Game.shard.name)) {
        doNotAggressArray = LOANlist;
        doNotAggressArray = _.union(doNotAggressArray, MANUAL_FRIENDS, [MY_USERNAME], ['Shibdib']);
    } else {
        doNotAggressArray = [MY_USERNAME, 'Shibdib'];
        doNotAggressArray = _.union(doNotAggressArray, MANUAL_FRIENDS);
    }
    global.FRIENDLIES = doNotAggressArray;
}