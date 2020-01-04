/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.segmentManager = function () {
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
    // Set segment as public/active
    RawMemory.setPublicSegments([2, 22, 23]);
    RawMemory.setActiveSegments([2, 22, 23]);
};