/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let constructionSiteInfo = {};
let GCL_PROGRESS_ARRAY = [];
let lastTickGCLProgress;
let RCL_PROGRESS = {};
let roomLastTickProgress = {};

module.exports.hud = function () {
    // Delete old memory
    Memory.lastTickGCLProgress = undefined;
    Memory.gclProgressArray = undefined;
    //GCL
    GCL_PROGRESS_ARRAY = GCL_PROGRESS_ARRAY || [];
    let progressPerTick = Game.gcl.progress - (lastTickGCLProgress || 0);
    lastTickGCLProgress = Game.gcl.progress;
    let paused = '*P* ';
    if (progressPerTick > 0) {
        paused = '';
        if (GCL_PROGRESS_ARRAY < 250) {
            GCL_PROGRESS_ARRAY.push(progressPerTick)
        } else {
            GCL_PROGRESS_ARRAY.shift();
            GCL_PROGRESS_ARRAY.push(progressPerTick)
        }
    }
    progressPerTick = average(GCL_PROGRESS_ARRAY);
    let secondsToUpgrade = _.round(((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick) * Memory.tickLength);
    let ticksToUpgrade = _.round((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick);
    let displayTime;
    if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
    if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
    if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
    if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
    let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner.username === MY_USERNAME);
    for (let room of myRooms) {
        if (!room) continue;
        // Delete old memory
        room.memory.lastTickProgress = undefined;
        room.memory.rclProgressArray = undefined;
        room.memory.lastTickProgress = undefined;
        let lowerBoundary = 4;
        if (!Memory.roomCache) Memory.roomCache = {};
        if (!Memory.roomCache[room.name]) room.cacheRoomIntel(true);
        if (Memory.roomCache[room.name].threatLevel) lowerBoundary++;
        room.visual.rect(0, 0, 16, lowerBoundary, {
            fill: '#ffffff',
            opacity: '0.55',
            stroke: 'black'
        });
        //GCL Display
        displayText(room, 0, 1, paused + ICONS.upgradeController + ' GCL: ' + Game.gcl.level + ' - ' + displayTime + ' / ' + ticksToUpgrade + ' ticks. Bucket- ' + Game.cpu.bucket);
        //Safemode
        if (room.controller.safeMode) {
            let secondsToNoSafe = room.controller.safeMode * Memory.tickLength;
            let displayTime;
            if (secondsToNoSafe < 60) displayTime = secondsToNoSafe + ' Seconds';
            if (secondsToNoSafe >= 86400) displayTime = _.round(secondsToNoSafe / 86400, 2) + ' Days';
            if (secondsToNoSafe < 86400 && secondsToNoSafe >= 3600) displayTime = _.round(secondsToNoSafe / 3600, 2) + ' Hours';
            if (secondsToNoSafe > 60 && secondsToNoSafe < 3600) displayTime = _.round(secondsToNoSafe / 60, 2) + ' Minutes';
            if (displayTime) room.controller.say(displayTime + ' / ' + room.controller.safeMode + ' ticks.');
        }
        //Construction
        if (room.constructionSites.length) {
            for (let site of room.constructionSites) {
                let roomSites = constructionSiteInfo[room.name] || {};
                let siteInfo = roomSites[site.id] || {};
                let lastTickProgress = siteInfo['lastTickProgress'] || site.progress;
                siteInfo['lastTickProgress'] = site.progress;
                let progressPerTick = site.progress - lastTickProgress;
                siteInfo['progressArray'] = siteInfo['progressArray'] || [];
                if (progressPerTick > 0) {
                    if (siteInfo['progressArray'].length < 25) {
                        siteInfo['progressArray'].push(progressPerTick)
                    } else {
                        siteInfo['progressArray'].shift();
                        siteInfo['progressArray'].push(progressPerTick)
                    }
                }
                progressPerTick = average(siteInfo['progressArray']);
                let secondsToUpgrade = _.round(((site.progressTotal - site.progress) / progressPerTick) * Memory.tickLength);
                let ticksToUpgrade = _.round((site.progressTotal - site.progress) / progressPerTick);
                let displayTime;
                if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
                if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
                if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
                if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
                if (displayTime) site.say(displayTime + ' / ' + ticksToUpgrade + ' ticks.');
                roomSites[site.id] = siteInfo;
                constructionSiteInfo[room.name] = roomSites;
            }
        } else {
            constructionSiteInfo[room.name] = {};
        }
        //Controller
        if (room.controller.progressTotal) {
            let lastTickProgress = roomLastTickProgress[room.name] || room.controller.progress;
            roomLastTickProgress[room.name] = room.controller.progress;
            let progressPerTick = room.controller.progress - lastTickProgress;
            RCL_PROGRESS[room.name] = RCL_PROGRESS[room.name] || [];
            let paused = '*P* ';
            if (progressPerTick > 0) {
                paused = '';
                if (RCL_PROGRESS[room.name].length < 250) {
                    RCL_PROGRESS[room.name].push(progressPerTick)
                } else {
                    RCL_PROGRESS[room.name].shift();
                    RCL_PROGRESS[room.name].push(progressPerTick)
                }
            }
            progressPerTick = average(RCL_PROGRESS[room.name]);
            let secondsToUpgrade = _.round(((room.controller.progressTotal - room.controller.progress) / progressPerTick) * Memory.tickLength);
            let ticksToUpgrade = _.round((room.controller.progressTotal - room.controller.progress) / progressPerTick);
            let displayTime;
            if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
            if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
            if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
            if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
            displayText(room, 0, 2, paused + ICONS.upgradeController + ' ' + room.controller.level + ' - ' + displayTime + ' / ' + ticksToUpgrade + ' ticks. (' + room.memory.averageCpu + '/R.CPU)');
        } else {
            delete roomLastTickProgress[room.name];
            delete RCL_PROGRESS[room.name];
            displayText(room, 0, 2, ICONS.upgradeController + ' Controller Level: ' + room.controller.level + ' (' + room.memory.averageCpu + '/R.CPU)');
        }
        let y = lowerBoundary;
        if (Memory.roomCache[room.name].threatLevel) {
            displayText(room, 0, y, ICONS.crossedSword + ' RESPONSE NEEDED: Threat Level ' + Memory.roomCache[room.name].threatLevel);
            y++;
        }
    }
};