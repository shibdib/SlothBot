/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// Get Tick Length
const tickLengthArray = [];
module.exports.tickLength = function () {
    if (!Memory.tickInfo) {
        Memory.tickInfo = {};
        Memory.lastTick = undefined;
        Memory.tickLength = undefined;
    }
    let d = new Date();
    let seconds = _.round(d.getTime() / 1000, 2);
    let lastTick = Memory.tickInfo.lastTick || seconds;
    Memory.tickInfo.lastTick = seconds;
    let tickLength = seconds - lastTick;
    if (tickLengthArray.length < 50) {
        tickLengthArray.push(tickLength)
    } else {
        tickLengthArray.shift();
        tickLengthArray.push(tickLength)
    }
    Memory.tickInfo.tickLength = average(tickLengthArray);
}

// Handle cleaning memory for respawn
let memCleaned;
module.exports.cleanMemory = function () {
    if (!memCleaned && !_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my && (r.memory.bunkerHub || r.memory.praiseRoom)).length) {
        for (let key in Memory) delete Memory[key];
        Memory.spawnIn = Game.time;
    }
    if (!Memory.spawnIn) Memory.spawnIn = Game.time - 5000;
    memCleaned = true;
}

// Set Task CPU Limits
module.exports.CPULimits = function () {
    let totalLimit = Game.cpu.limit;
    CPU_TASK_LIMITS['roomLimit'] = adjustedCPULimit(totalLimit * 0.9, Game.cpu.bucket, 2500);
    CPU_TASK_LIMITS['military'] = adjustedCPULimit(totalLimit * 0.02, Game.cpu.bucket, 2000);
    CPU_TASK_LIMITS['hiveTasks'] = adjustedCPULimit(totalLimit * 0.08, Game.cpu.bucket, 2500);
}

// CPU Limit Tool
function adjustedCPULimit(limit, bucket, target = BUCKET_MAX * 0.8, maxCpuPerTick = Game.cpu.limit * 2) {
    var multiplier = 1;
    if (bucket < target) {
        multiplier = Math.sin(Math.PI * bucket / (2 * target));
    }
    if (bucket > target) {
        // Thanks @Deign for support with the sine function below
        multiplier = 2 + Math.sin((Math.PI * (bucket - BUCKET_MAX)) / (2 * (BUCKET_MAX - target)));
        // take care of our 10 CPU folks, to dip into their bucket reserves more...
        // help them burn through excess bucket above the target.
        if (limit === 10 && multiplier > 1.5)
            multiplier += 1;
    }

    return clamp(Math.round(limit * 0.2), Math.round(limit * multiplier), maxCpuPerTick);
}

// Status console with cache expiration and enhanced output formatting
let lastStatus = 0;
module.exports.status = function () {
    const currentTime = _.round(new Date().getTime() / 1000, 2);
    const timeSinceLastStatus = currentTime - lastStatus;

    // Check if the status cooldown has expired or if we need to refresh the status
    if (timeSinceLastStatus >= STATUS_COOLDOWN) {
        lastStatus = currentTime;

        log.a('===========================================================================', ' ');
        log.a('------------------------------- GLOBAL INFO -------------------------------', ' ');
        log.e(`🏆 GCL: ${Game.gcl.level} | Progress: ${(Game.gcl.progress / Game.gcl.progressTotal * 100).toFixed(2)}%`, ' ');
        log.e(`💻 CPU Bucket: ${Game.cpu.bucket} | CPU Limit: ${Game.cpu.limit} | Available: ${Game.cpu.tickLimit}`, ' ');
        log.e(`👾 Total Creeps: ${_.size(Game.creeps)}`, ' ');

        log.a('------------------------------- ROOM INFO -------------------------------', ' ');
        MY_ROOMS.forEach(roomName => {
            const room = Game.rooms[roomName];
            if (!room || !room.controller) return;

            const roomCreeps = _.filter(Game.creeps, c => c.memory && c.memory.overlord === room.name);
            const avgCpu = ROOM_CPU_ARRAY[room.name] ? (_.round(average(ROOM_CPU_ARRAY[room.name])) || 'No Data') : 'No Data';
            const lowPowerText = room.memory.lowPower ? ' 🔋[LOW POWER]' : '';
            let progress = ((room.controller.progress / room.controller.progressTotal) * 100).toFixed(2) + "%";
            if (room.controller.level === 8) progress = "Max Level";
            const energyInfo = `Energy: ${room.energy} | Income: ${room.energyIncome}`;

            // Create a progress bar string (use '=' for progress, '-' for empty space)
            const progressBarLength = 20;  // Length of the progress bar
            const progressRatio = room.controller.progress / room.controller.progressTotal;  // Calculate progress ratio
            const filledLength = Math.floor(progressBarLength * progressRatio);  // Calculate how many characters to fill
            const emptyLength = progressBarLength - filledLength;  // Calculate remaining empty space
            let progressBar = `[${'X'.repeat(filledLength)}${'-'.repeat(emptyLength)}]`;  // Build the progress bar
            if (room.controller.level === 8) progressBar = "";

            // Log general info along with the progress bar
            log.e(`${roomLink(room.name)}${lowPowerText} | RCL: ${room.controller.level} | CPU Usage: ${avgCpu} | RCL Progress: ${progress} ${progressBar}`, ' ');
            log.e(`${energyInfo} | Creeps: ${_.size(roomCreeps)}`, ' ');
        });

        // OPERATION INFO
        displayOperationsInfo();

        // HARASSMENT INFO
        displayHarassmentInfo();

        // DIPLOMATIC INFO
        displayDiplomaticInfo();

        // Update the last status time
        Memory.lastStatus = undefined;
        getUptime();

        log.a('===========================================================================', ' ');
    }

    // Helper function to display operation information
    function displayOperationsInfo() {
        const operations = {...Memory.targetRooms, ...Memory.auxiliaryTargets};

        if (_.size(operations)) {
            log.a('------------------------------ OPERATION INFO -----------------------------', ' ');

            Object.entries(operations).forEach(([key, op]) => {
                if (!op) return;

                const {
                    level = 0,
                    type,
                    priority,
                    dDay,
                    enemyDead,
                    friendlyDead,
                    trackedEnemy = [],
                    trackedFriendly = []
                } = op;
                const roomLinkText = roomLink(key);

                let logText = `${_.capitalize(type)} | Level: ${level} | Priority: ${priority} | Room: ${roomLinkText}`;

                if (enemyDead || friendlyDead) {
                    logText += ` | 💥 Enemy KIA: ${trackedEnemy.length}/${enemyDead} | 🤝 Friendly KIA: ${trackedFriendly.length}/${friendlyDead}`;
                } else if (type === 'pending') {
                    logText += ` | ⏳ Countdown: ${dDay - Game.time} ticks`;
                }

                log.e(logText, ' ');
            });

            const scouts = _.filter(operations, t => t && (t.type === 'scout' || t.type === 'attack'));
            if (scouts.length) {
                log.e(`🔍 Scout Target Count: ${scouts.length}`, ' ');
            }
        }
    }

    // Helper function to display harassment info
    function displayHarassmentInfo() {
        const activeHarassers = _.filter(Game.creeps, c => c.memory && c.memory.operation === 'harass');
        if (activeHarassers.length) {
            log.a('----------------------------- HARASSMENT INFO ----------------------------', ' ');
            log.e(`🎯 Harass Targets: ${Memory._threats.join(", ")}`, ' ');
            log.e(`⚔️ Active Harassers: ${activeHarassers.length}`, ' ');
            log.e(`📍 Targets: ${_.pluck(activeHarassers, 'memory.destination').join(", ")}`, ' ');
        }
    }

    // Helper function to display diplomatic info
    function displayDiplomaticInfo() {
        if (Memory._enemies && Memory._enemies.length) {
            log.a('------------------------------ DIPLOMATIC INFO ----------------------------', ' ');
            log.e(`⚔️ Enemies: ${Memory._enemies.join(", ")}`, ' ');
        }
    }
};

