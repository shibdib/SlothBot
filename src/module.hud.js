/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.hud = function () {
    for (let key in Memory.ownedRooms) {
        let name = Memory.ownedRooms[key].name;
        let room = Game.rooms[name];
        if (!room) continue;
        let spawns = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN);
        let activeSpawns = _.filter(spawns, (s) => s.spawning);
        let lowerBoundary = 3;
        if (room.memory.claimTarget) lowerBoundary++;
        if (Memory.roomCache[room.name].responseNeeded) lowerBoundary++;
        room.visual.rect(0, 0, 16, lowerBoundary + activeSpawns.length, {
            fill: '#ffffff',
            opacity: '0.55',
            stroke: 'black'
        });
        //SPAWNING
        if (activeSpawns.length) {
            let i = 0;
            for (let spawn of activeSpawns) {
                let spawningCreep = Game.creeps[spawn.spawning.name];
                displayText(room, 0, lowerBoundary + i, spawn.name + ICONS.build + ' ' + _.capitalize(spawningCreep.name.split("_")[0]) + ' - Ticks: ' + spawn.spawning.remainingTime);
                i++;
            }
        }
        //GCL
        let lastTickProgress = Memory.lastTickProgress || 0;
        Memory.gclProgressArray = Memory.gclProgressArray || [];
        let progressPerTick = Game.gcl.progress - lastTickProgress;
        stats.addSimpleStat('gclTickProgress', _.size(progressPerTick)); // Creep Count
        let paused = '*P* ';
        if (progressPerTick > 0) {
            paused = '';
            if (Memory.gclProgressArray.length < 250) {
                Memory.gclProgressArray.push(progressPerTick)
            } else {
                Memory.gclProgressArray.shift();
                Memory.gclProgressArray.push(progressPerTick)
            }
        }
        progressPerTick = average(Memory.gclProgressArray);
        let secondsToUpgrade = _.round(((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick) * Memory.tickLength);
        let ticksToUpgrade = _.round((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick);
        let displayTime;
        if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
        if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
        if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
        if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
        displayText(room, 0, 1, paused + ICONS.upgradeController + ' GCL: ' + Game.gcl.level + ' - ' + displayTime + ' / ' + ticksToUpgrade + ' ticks.');
        //Controller
        if (room.controller.progressTotal) {
            let lastTickProgress = room.memory.lastTickProgress || room.controller.progress;
            room.memory.lastTickProgress = room.controller.progress;
            let progressPerTick = room.controller.progress - lastTickProgress;
            room.memory.rclProgressArray = room.memory.rclProgressArray || [];
            let paused = '*P* ';
            if (progressPerTick > 0) {
                paused = '';
                if (room.memory.rclProgressArray.length < 250) {
                    room.memory.rclProgressArray.push(progressPerTick)
                } else {
                    room.memory.rclProgressArray.shift();
                    room.memory.rclProgressArray.push(progressPerTick)
                }
            }
            progressPerTick = average(room.memory.rclProgressArray);
            let secondsToUpgrade = _.round(((room.controller.progressTotal - room.controller.progress) / progressPerTick) * Memory.tickLength);
            let ticksToUpgrade = _.round((room.controller.progressTotal - room.controller.progress) / progressPerTick);
            let displayTime;
            if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
            if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
            if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
            if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
            displayText(room, 0, 2, paused + ICONS.upgradeController + ' ' + room.controller.level + ' - ' + displayTime + ' / ' + ticksToUpgrade + ' ticks. (' + room.memory.averageCpu + '/R.CPU)');
        } else {
            delete room.memory.lastTickProgress;
            delete room.memory.rclProgressArray;
            displayText(room, 0, 2, ICONS.upgradeController + ' Controller Level: ' + room.controller.level + ' (' + room.memory.averageCpu + '/R.CPU)');
        }
        let y = lowerBoundary - (activeSpawns.length || 1);
        if (Memory.roomCache[room.name].responseNeeded) {
            displayText(room, 0, y, ICONS.crossedSword + ' RESPONSE NEEDED: Threat Level ' + Memory.roomCache[room.name].threatLevel);
            y++;
        }
        if (room.memory.claimTarget) {
            displayText(room, 0, y, ICONS.claimController + ' Claim Target: ' + room.memory.claimTarget);
            y++;
        }
    }
};