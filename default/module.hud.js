/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

class HUD {
    constructor() {
        if (!Memory.HUD) {
            Memory.HUD = {
                GCL_PROGRESS_ARRAY: [],
                lastTickGCLProgress: 0,
                RCL_PROGRESS: {},
                roomLastTickProgress: {}
            };
        }
        this.GCL_PROGRESS_ARRAY = Memory.HUD.GCL_PROGRESS_ARRAY;
        this.lastTickGCLProgress = Memory.HUD.lastTickGCLProgress;
        this.RCL_PROGRESS = Memory.HUD.RCL_PROGRESS;
        this.roomLastTickProgress = Memory.HUD.roomLastTickProgress;
    }


    run() {
        // Avoid new spawn errors and ensure tick info is available
        if (!Memory.tickInfo) return;

        // Always update the HUD every tick
        let myRooms = _.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner.username === MY_USERNAME);

        for (let room of myRooms) {
            // Skip rooms without a controller or insufficient CPU data
            if (!room || !ROOM_CPU_ARRAY[room.name]) continue;

            this.updateGCLProgress(room);
            this.updateRCLProgress(room);

            // Display HUD based on the last calculated values
            this.displayGCLInfo(room);
            this.displaySafeModeInfo(room);
            this.displayRCLInfo(room);
        }

        // Save the memory after all updates
        this.saveMemory();
    }

    updateGCLProgress(room) {
        let progressPerTick = Game.gcl.progress - this.lastTickGCLProgress;
        this.lastTickGCLProgress = Game.gcl.progress;

        // Only update the array if there's progress made
        if (progressPerTick > 0) {
            if (this.GCL_PROGRESS_ARRAY.length < 25) {
                this.GCL_PROGRESS_ARRAY.push(progressPerTick);
            } else {
                this.GCL_PROGRESS_ARRAY.shift();
                this.GCL_PROGRESS_ARRAY.push(progressPerTick);
            }
        }
    }

    updateRCLProgress(room) {
        if (!room.controller.progressTotal) {
            // If no progress total, show the controller's level without progress info
            this.roomLastTickProgress[room.name] = undefined;
            delete this.RCL_PROGRESS[room.name];
            return;
        }

        let lastTickProgress = this.roomLastTickProgress[room.name] || room.controller.progress;
        this.roomLastTickProgress[room.name] = room.controller.progress;

        let progressPerTick = room.controller.progress - lastTickProgress;
        if (progressPerTick > 0) {
            this.RCL_PROGRESS[room.name] = this.RCL_PROGRESS[room.name] || [];
            if (this.RCL_PROGRESS[room.name].length < 25) {
                this.RCL_PROGRESS[room.name].push(progressPerTick);
            } else {
                this.RCL_PROGRESS[room.name].shift();
                this.RCL_PROGRESS[room.name].push(progressPerTick);
            }
        }
    }

    average(array) {
        if (!array || array.length === 0) {
            return 0;  // Return 0 if the array is empty or undefined
        }
        return array.reduce((sum, value) => sum + value, 0) / array.length;
    }

    displayGCLInfo(room) {
        let progressPerTick = this.average(this.GCL_PROGRESS_ARRAY);
        let remainingProgress = Game.gcl.progressTotal - Game.gcl.progress;

        let secondsToUpgrade = _.round((remainingProgress / progressPerTick) * Memory.tickInfo.tickLength);
        let displayTime = this.secondsToReadable(secondsToUpgrade);

        // Draw a GCL progress bar with a gradient color
        let progressPercent = (Game.gcl.progress / Game.gcl.progressTotal) * 100;
        room.visual.rect(1, 1, 15, 0.5, {fill: '#808080', opacity: 0.5}); // background bar
        room.visual.rect(1, 1, 15 * (progressPercent / 100), 0.5, {fill: '#00FF00'}); // active bar

        // Display GCL info with updated time format
        this.displayText(room, 1, 2, `${ICONS.upgradeController} GCL: ${Game.gcl.level} - ${displayTime} (${_.round(remainingProgress / progressPerTick)} ticks)`);
    }

    displaySafeModeInfo(room) {
        if (room.controller.safeMode) {
            let secondsToNoSafe = room.controller.safeMode * Memory.tickInfo.tickLength;
            let displayTime = this.secondsToReadable(secondsToNoSafe);
            room.controller.say(`${displayTime} / ${room.controller.safeMode} ticks.`);
        }
    }

    displayRCLInfo(room) {
        let progressPerTick = this.average(this.RCL_PROGRESS[room.name]);
        let secondsToUpgrade = _.round(((room.controller.progressTotal - room.controller.progress) / progressPerTick) * Memory.tickInfo.tickLength);
        let ticksToUpgrade = _.round((room.controller.progressTotal - room.controller.progress) / progressPerTick);
        let displayTime = this.secondsToReadable(secondsToUpgrade);

        // Prevent Infinity display by using a fallback
        if (isNaN(ticksToUpgrade) || ticksToUpgrade === Infinity) {
            ticksToUpgrade = 'Calculating...';
        }

        // Draw a RCL progress bar with a gradient color
        let progressPercent = (room.controller.progress / room.controller.progressTotal) * 100;
        room.visual.rect(1, 3, 15, 0.5, {fill: '#808080', opacity: 0.5}); // background bar
        room.visual.rect(1, 3, 15 * (progressPercent / 100), 0.5, {fill: '#00FF00'}); // active bar

        // Display RCL progress or controller level
        this.displayText(room, 1, 4, `${ICONS.upgradeController} RCL: ${room.controller.level} - ${displayTime} / ${ticksToUpgrade} ticks. (${_.round(this.average(ROOM_CPU_ARRAY[room.name]), 2)}/R.CPU)`);
    }

    displayThreatInfo(room, y) {
        if (INTEL[room.name] && INTEL[room.name].threatLevel) {
            this.displayText(room, 1, y, `${ICONS.crossedSword} RESPONSE NEEDED: Threat Level ${INTEL[room.name].threatLevel}`);
            return y + 1;
        }
        return y;
    }

    displayText(room, x, y, text) {
        room.visual.text(text, x, y, {align: 'left', opacity: 0.9, font: 'bold 1.5x'});
    }

    secondsToReadable(seconds) {
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

    saveMemory() {
        Memory.HUD = {
            GCL_PROGRESS_ARRAY: this.GCL_PROGRESS_ARRAY,
            lastTickGCLProgress: this.lastTickGCLProgress,
            RCL_PROGRESS: this.RCL_PROGRESS,
            roomLastTickProgress: this.roomLastTickProgress
        };
    }
}

module.exports = HUD;