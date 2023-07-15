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
    let secondsToUpgrade = _.round(((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick) * Memory.tickInfo.tickLength);
    let ticksToUpgrade = _.round((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick);
    let displayTime = secondsToReadable(secondsToUpgrade);
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
            let secondsToNoSafe = room.controller.safeMode * Memory.tickInfo.tickLength;
            let displayTime = secondsToReadable(secondsToNoSafe);
            if (displayTime) room.controller.say(displayTime + ' / ' + room.controller.safeMode + ' ticks.');
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
            let secondsToUpgrade = _.round(((room.controller.progressTotal - room.controller.progress) / progressPerTick) * Memory.tickInfo.tickLength);
            let ticksToUpgrade = _.round((room.controller.progressTotal - room.controller.progress) / progressPerTick);
            let displayTime = secondsToReadable(secondsToUpgrade);
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
    // Map Hud
    if (3 > 2) {
        try {
            if (VISUAL_CACHE['map'] && Game.time % 25 !== 0) return Game.map.visual.import(VISUAL_CACHE['map']);
            // Target Rooms
            if (Memory.targetRooms) {
                for (let room of Object.keys(Memory.targetRooms)) {
                    if (!Memory.targetRooms[room]) continue;
                    if (room === 'undefined') {
                        delete Memory.targetRooms[room];
                        return;
                    }
                    Game.map.visual.text(_.capitalize(Memory.targetRooms[room].type), new RoomPosition(2, 47, room), {
                        color: '#ff0000',
                        fontSize: 4,
                        align: 'left'
                    });
                }
            }
            // Claim Target
            if (Memory.nextClaim) {
                Game.map.visual.text('Next Claim', new RoomPosition(5, 25, Memory.nextClaim), {
                    color: '#989212',
                    fontSize: 9,
                    align: 'left'
                });
            }
            // My rooms
            for (let room of Memory.myRooms) {
                Game.map.visual.text(_.capitalize(Game.rooms[room].mineral.mineralType), new RoomPosition(48, 48, room), {
                    color: '#01a218',
                    fontSize: 4
                });
                Game.map.visual.text('Energy: ' + Game.rooms[room].energy, new RoomPosition(2, 2, room), {
                    color: '#989212',
                    fontSize: 3,
                    align: 'left'
                });
                Game.map.visual.text('Creeps: ' + Game.rooms[room].creeps.length, new RoomPosition(2, 5, room), {
                    color: '#989212',
                    fontSize: 3,
                    align: 'left'
                });
                Game.map.visual.text('Threat Level: ' + (Memory.roomCache[room].threatLevel || 0), new RoomPosition(2, 8, room), {
                    color: '#989212',
                    fontSize: 3,
                    align: 'left'
                });
            }
            // Intel Cache
            for (let intel of _.filter(Memory.roomCache)) {
                if (!intel || !intel.name || intel.cached + 10000 < Game.time || intel.owner === MY_USERNAME) continue;
                Game.map.visual.text(ICONS.testFinished, new RoomPosition(44, 47, intel.name), {
                    color: '#989212',
                    fontSize: 3,
                    align: 'left'
                });
                if (intel.threatLevel) {
                    Game.map.visual.text('Threat Level: ' + intel.threatLevel || 0, new RoomPosition(2, 2, intel.name), {
                        color: '#ff0000',
                        fontSize: 3,
                        align: 'left'
                    });
                }
                if (intel.user) {
                    Game.map.visual.text('User: ' + intel.user || 'None', new RoomPosition(2, 5, intel.name), {
                        color: '#989212',
                        fontSize: 3,
                        align: 'left'
                    });
                }
                if (intel.power) {
                    Game.map.visual.text('Power Detected', new RoomPosition(2, 33, intel.name), {
                        color: '#989212',
                        fontSize: 3,
                        align: 'left'
                    });
                }
                if (intel.commodity) {
                    Game.map.visual.text('Commodity Detected', new RoomPosition(2, 36, intel.name), {
                        color: '#989212',
                        fontSize: 3,
                        align: 'left'
                    });
                }
                if (intel.seasonResource) {
                    Game.map.visual.text('Score Detected', new RoomPosition(2, 36, intel.name), {
                        color: '#989212',
                        fontSize: 3,
                        align: 'left'
                    });
                }
                if (intel.portal) {
                    Game.map.visual.text('Portal Detected', new RoomPosition(2, 39, intel.name), {
                        color: '#989212',
                        fontSize: 3,
                        align: 'left'
                    });
                }
            }
            VISUAL_CACHE['map'] = Game.map.visual.export();
            Memory.MapVisualData = undefined;
        } catch (e) {
            console.log(e)
            console.log(e.stack)
        }
    }
};

function secondsToReadable(seconds) {
    if (seconds < 60) return seconds + ' Seconds';
    else if (seconds >= 86400) return _.round(seconds / 86400, 2) + ' Days';
    else if (seconds < 86400 && seconds >= 3600) return _.round(seconds / 3600, 2) + ' Hours';
    else if (seconds > 60 && seconds < 3600) return _.round(seconds / 60, 2) + ' Minutes';
}