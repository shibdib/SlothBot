/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let GCL_PROGRESS_ARRAY = [];
let lastTickGCLProgress = 0;
let RCL_PROGRESS = {};
let roomLastTickProgress = {};

module.exports.hud = function () {
    // Avoid new spawn errors and ensure tick info is available
    if (!Memory.tickInfo) return;

    // Always update the HUD every tick
    let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner.username === MY_USERNAME);

    for (let room of myRooms) {
        // Skip rooms without a controller or insufficient CPU data
        if (!room || !ROOM_CPU_ARRAY[room.name]) continue;

        updateGCLProgress(room);
        updateRCLProgress(room);

        // Display HUD based on the last calculated values
        displayGCLInfo(room);
        displaySafeModeInfo(room);
        displayRCLInfo(room);
    }

    // Helper function to update the GCL progress and store data for the next tick
    function updateGCLProgress(room) {
        let progressPerTick = Game.gcl.progress - lastTickGCLProgress;
        lastTickGCLProgress = Game.gcl.progress;

        // Only update the array if there's progress made
        if (progressPerTick > 0) {
            if (GCL_PROGRESS_ARRAY.length < 25) {
                GCL_PROGRESS_ARRAY.push(progressPerTick);
            } else {
                GCL_PROGRESS_ARRAY.shift();
                GCL_PROGRESS_ARRAY.push(progressPerTick);
            }
        }
    }

    // Helper function to update RCL progress for a given room
    function updateRCLProgress(room) {
        if (!room.controller.progressTotal) {
            // If no progress total, show the controller's level without progress info
            roomLastTickProgress[room.name] = undefined;
            delete RCL_PROGRESS[room.name];
            return;
        }

        let lastTickProgress = roomLastTickProgress[room.name] || room.controller.progress;
        roomLastTickProgress[room.name] = room.controller.progress;

        let progressPerTick = room.controller.progress - lastTickProgress;
        if (progressPerTick > 0) {
            RCL_PROGRESS[room.name] = RCL_PROGRESS[room.name] || [];
            if (RCL_PROGRESS[room.name].length < 25) {
                RCL_PROGRESS[room.name].push(progressPerTick);
            } else {
                RCL_PROGRESS[room.name].shift();
                RCL_PROGRESS[room.name].push(progressPerTick);
            }
        }
    }

    // Helper function to calculate the average of an array, safely handling empty arrays
    function average(array) {
        if (!array || array.length === 0) {
            return 0;  // Return 0 if the array is empty or undefined
        }
        return array.reduce((sum, value) => sum + value, 0) / array.length;
    }

    // Helper function to display GCL information (progress, time to upgrade)
    function displayGCLInfo(room) {
        let progressPerTick = average(GCL_PROGRESS_ARRAY);
        let remainingProgress = Game.gcl.progressTotal - Game.gcl.progress;

        let secondsToUpgrade = _.round((remainingProgress / progressPerTick) * Memory.tickInfo.tickLength);
        let displayTime = secondsToReadable(secondsToUpgrade);

        // Draw a GCL progress bar with a gradient color
        let progressPercent = (Game.gcl.progress / Game.gcl.progressTotal) * 100;
        room.visual.rect(1, 1, 15, 0.5, {fill: '#808080', opacity: 0.5}); // background bar
        room.visual.rect(1, 1, 15 * (progressPercent / 100), 0.5, {fill: '#00FF00'}); // active bar

        // Display GCL info with updated time format
        displayText(room, 1, 2, `${ICONS.upgradeController} GCL: ${Game.gcl.level} - ${displayTime} (${_.round(remainingProgress / progressPerTick)} ticks)`);
    }

    // Helper function to display Safe Mode info, if applicable
    function displaySafeModeInfo(room) {
        if (room.controller.safeMode) {
            let secondsToNoSafe = room.controller.safeMode * Memory.tickInfo.tickLength;
            let displayTime = secondsToReadable(secondsToNoSafe);
            room.controller.say(`${displayTime} / ${room.controller.safeMode} ticks.`);
        }
    }

    // Helper function to display RCL information
    function displayRCLInfo(room) {
        let progressPerTick = average(RCL_PROGRESS[room.name]);
        let secondsToUpgrade = _.round(((room.controller.progressTotal - room.controller.progress) / progressPerTick) * Memory.tickInfo.tickLength);
        let ticksToUpgrade = _.round((room.controller.progressTotal - room.controller.progress) / progressPerTick);
        let displayTime = secondsToReadable(secondsToUpgrade);

        // Prevent Infinity display by using a fallback
        if (isNaN(ticksToUpgrade) || ticksToUpgrade === Infinity) {
            ticksToUpgrade = 'Calculating...';
        }

        // Draw a RCL progress bar with a gradient color
        let progressPercent = (room.controller.progress / room.controller.progressTotal) * 100;
        room.visual.rect(1, 3, 15, 0.5, {fill: '#808080', opacity: 0.5}); // background bar
        room.visual.rect(1, 3, 15 * (progressPercent / 100), 0.5, {fill: '#00FF00'}); // active bar

        // Display RCL progress or controller level
        displayText(room, 1, 4, `${ICONS.upgradeController} RCL: ${room.controller.level} - ${displayTime} / ${ticksToUpgrade} ticks. (${_.round(average(ROOM_CPU_ARRAY[room.name]), 2)}/R.CPU)`);
    }

    // Helper function to handle threat level info
    function displayThreatInfo(room, y) {
        if (INTEL[room.name] && INTEL[room.name].threatLevel) {
            displayText(room, 1, y, `${ICONS.crossedSword} RESPONSE NEEDED: Threat Level ${INTEL[room.name].threatLevel}`);
            return y + 1;
        }
        return y;
    }

    // Helper function to display formatted text on the room's visual
    function displayText(room, x, y, text) {
        room.visual.text(text, x, y, {align: 'left', opacity: 0.9, font: 'bold 1.5x'});
    }

    // Function to convert seconds to readable format (days, hours, minutes, seconds)
    function secondsToReadable(seconds) {
        if (seconds === Infinity || seconds < 0) return 'Calculating...';

        let days = Math.floor(seconds / (24 * 60 * 60));
        let hours = Math.floor((seconds % (24 * 60 * 60)) / 3600);
        let minutes = Math.floor((seconds % 3600) / 60);
        let remainingSeconds = Math.floor(seconds % 60);

        let timeString = '';
        if (days > 0) timeString += `${days}d `;
        if (hours > 0 || days > 0) timeString += `${hours}h `;
        if (minutes > 0 || hours > 0 || days > 0) timeString += `${minutes}m `;
        timeString += `${remainingSeconds}s`;

        return timeString;
    }
};

// Map Hud
    /**
    try {
        if (CACHE.VISUAL_CACHE && CACHE.VISUAL_CACHE['map'] && Game.time % 25 !== 0) return Game.map.visual.import(CACHE.VISUAL_CACHE['map']);
        // Target Rooms
        if (Memory.targetRooms && _.size(Memory.targetRooms)) {
            for (let room of Object.keys(Memory.targetRooms)) {
                Game.map.visual.text(_.capitalize(Memory.targetRooms[room].type), new RoomPosition(2, 47, room), {
                    color: '#da0122',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 6,
                    fontFamily: 'monospace',
                    align: 'left'
                });
            }
        }
        // Auxiliary Rooms
        if (Memory.auxiliaryTargets && _.size(Memory.auxiliaryTargets)) {
            for (let room of Object.keys(Memory.auxiliaryTargets)) {
                Game.map.visual.text(_.capitalize(Memory.auxiliaryTargets[room].type), new RoomPosition(2, 47, room), {
                    color: '#01c1da',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 6,
                    fontFamily: 'monospace',
                    align: 'left'
                });
            }
        }
        // Claim Target
        if (Memory.nextClaim && !MY_ROOMS.includes(Memory.nextClaim)) {
            Game.map.visual.text('Next Claim', new RoomPosition(5, 25, Memory.nextClaim), {
                color: '#13ff39',
                backgroundColor: '#000000',
                stroke: '#000000',
                fontSize: 7,
                fontFamily: 'monospace',
                align: 'left'
            });
        }
        // My rooms
        for (let room of MY_ROOMS) {
            Game.map.visual.text(_.capitalize(Game.rooms[room].mineral.mineralType), new RoomPosition(48, 48, room), {
                color: '#ffffff',
                backgroundColor: '#000000',
                stroke: '#000000',
                fontSize: 7,
                fontFamily: 'monospace',
            });
            Game.map.visual.text('Energy: ' + Game.rooms[room].energy, new RoomPosition(0, 2, room), {
                color: '#e3ce96',
                backgroundColor: '#000000',
                backgroundPadding: 0,
                stroke: '#000000',
                fontSize: 5,
                fontFamily: 'monospace',
                align: 'left'
            });
            Game.map.visual.text('Creeps: ' + Game.rooms[room].creeps.length, new RoomPosition(0, 7, room), {
                color: '#e3ce96',
                backgroundColor: '#000000',
                backgroundPadding: 0,
                stroke: '#000000',
                fontSize: 5,
                fontFamily: 'monospace',
                align: 'left'
            });
            if (INTEL[room].threatLevel) {
                Game.map.visual.text('Threat Level: ' + (INTEL[room].threatLevel || 0), new RoomPosition(2, 30, room), {
                    color: '#da0101',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 5,
                    fontFamily: 'monospace',
                    align: 'left'
                });
            }
        }
        // Intel Cache
        for (let intel of _.filter(INTEL)) {
            if (!intel || !intel.name || MY_ROOMS.includes(intel.name)) continue;
            Game.map.visual.text(Game.time - intel.cached + "", new RoomPosition(49, 48, intel.name), {
                color: '#13ff39',
                backgroundColor: '#000000',
                stroke: '#000000',
                fontSize: 3,
                fontFamily: 'monospace',
                align: 'right',
                fontStyle: 'italic',
                opacity: 0.2
            });
            if (intel.threatLevel) {
                Game.map.visual.text('Threat Level: ' + intel.threatLevel || 0, new RoomPosition(0, 2, intel.name), {
                    color: '#da0101',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 5,
                    fontFamily: 'monospace',
                    align: 'left'
                });
                Game.map.visual.text('Enemy/Ally Power: ' + (intel.hostilePower || 0) + '/' + (intel.friendlyPower || 0), new RoomPosition(0, 7, intel.name), {
                    color: '#da0101',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 4,
                    fontFamily: 'monospace',
                    align: 'left'
                });
            }
            if (intel.owner) {
                let color = '#ffffff';
                if (intel.owner === MY_USERNAME) color = '#01da05';
                else if (ENEMIES.includes(intel.owner)) color = '#da0101';
                else if (THREATS.includes(intel.owner)) color = '#da5b01';
                else if (FRIENDLIES.includes(intel.owner)) color = '#01b9da';
                Game.map.visual.text(intel.owner, new RoomPosition(1, 2, intel.name), {
                    color: color,
                    fontStyle: 'oblique',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 5,
                    fontVariant: 'small-caps',
                    align: 'left'
                });
            }
            if (intel.power) {
                Game.map.visual.text('Power Detected', new RoomPosition(2, 33, intel.name), {
                    color: '#982b12',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 5,
                    fontFamily: 'monospace',
                    align: 'left'
                });
            }
            if (intel.commodity) {
                Game.map.visual.text('Commodity Detected', new RoomPosition(2, 36, intel.name), {
                    color: '#6ce15e',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 5,
                    fontFamily: 'monospace',
                    align: 'left'
                });
            }
            if (intel.seasonResource) {
                Game.map.visual.text('Score Detected', new RoomPosition(2, 36, intel.name), {
                    color: '#989212',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 5,
                    fontFamily: 'monospace',
                    align: 'left'
                });
            }
            if (intel.portal) {
                Game.map.visual.text('Portal to ' + intel.portal, new RoomPosition(25, 33, intel.name), {
                    color: '#b90bf5',
                    backgroundColor: '#000000',
                    stroke: '#000000',
                    fontSize: 4,
                    fontFamily: 'monospace',
                    align: 'center'
                });
            }
        }
        if (!CACHE.VISUAL_CACHE) CACHE.VISUAL_CACHE = {}
        CACHE.VISUAL_CACHE['map'] = Game.map.visual.export();
    } catch (e) {
        console.log(e)
        console.log(e.stack)
    }**/

function secondsToReadable(seconds) {
    if (seconds < 60) return seconds + ' Seconds';
    else if (seconds >= 86400) return _.round(seconds / 86400, 2) + ' Days';
    else if (seconds < 86400 && seconds >= 3600) return _.round(seconds / 3600, 2) + ' Hours';
    else if (seconds > 60 && seconds < 3600) return _.round(seconds / 60, 2) + ' Minutes';
}