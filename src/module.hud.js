/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let constructionSiteInfo = {};
let GCL_PROGRESS_ARRAY = [];
let lastTickGCLProgress;
let RCL_PROGRESS = {};
let roomLastTickProgress = {};

module.exports.hud = function () {
    //GCL
    GCL_PROGRESS_ARRAY = GCL_PROGRESS_ARRAY || [];
    let progressPerTick = Game.gcl.progress - (lastTickGCLProgress || 0);
    lastTickGCLProgress = Game.gcl.progress;
    if (progressPerTick > 0) {
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
        let lowerBoundary = 4;
        if (!INTEL[room.name]) room.cacheRoomIntel();
        if (INTEL[room.name].threatLevel) lowerBoundary++;
        room.visual.rect(0, 0, 17, lowerBoundary, {
            fill: '#ffffff',
            opacity: '0.55',
            stroke: 'black'
        });
        //GCL Display
        displayText(room, 1, 1, ICONS.upgradeController + ' GCL: ' + Game.gcl.level + ' - ' + displayTime + ' / ' + ticksToUpgrade + ' ticks.');
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
            if (progressPerTick > 0) {
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
            displayText(room, 1, 2, ICONS.upgradeController + ' ' + room.controller.level + ' - ' + displayTime + ' / ' + ticksToUpgrade + ' ticks. (' + room.memory.averageCpu + '/R.CPU)');
        } else {
            delete roomLastTickProgress[room.name];
            delete RCL_PROGRESS[room.name];
            displayText(room, 1, 2, ICONS.upgradeController + ' Controller Level: ' + room.controller.level + ' (' + room.memory.averageCpu + '/R.CPU)');
        }
        let y = lowerBoundary;
        if (INTEL[room.name].threatLevel) {
            displayText(room, 1, y, ICONS.crossedSword + ' RESPONSE NEEDED: Threat Level ' + INTEL[room.name].threatLevel);
            y++;
        }
    }
    // Map Hud
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
    }
};

function secondsToReadable(seconds) {
    if (seconds < 60) return seconds + ' Seconds';
    else if (seconds >= 86400) return _.round(seconds / 86400, 2) + ' Days';
    else if (seconds < 86400 && seconds >= 3600) return _.round(seconds / 3600, 2) + ' Hours';
    else if (seconds > 60 && seconds < 3600) return _.round(seconds / 60, 2) + ' Minutes';
}