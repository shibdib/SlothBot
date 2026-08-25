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
    Memory.tickInfo.tickLength = _.round(average(tickLengthArray), 3);
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
    CPU_TASK_LIMITS['worldTasks'] = adjustedCPULimit(totalLimit * 0.08, Game.cpu.bucket, 2500);
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

    if (timeSinceLastStatus >= STATUS_COOLDOWN) {
        lastStatus = currentTime;

        log.a('===========================================================================', ' ');
        log.a('------------------------------- GLOBAL INFO -------------------------------', ' ');
        const gclProgress = ((Game.gcl.progress / Game.gcl.progressTotal) * 100).toFixed(2);
        log.a(`🏆 GCL: ${Game.gcl.level} <font color="#888888">(${gclProgress}%)</font> | 💻 CPU Bucket: <font color="#00B7EB">${Game.cpu.bucket}</font> | 👾 Creeps: <font color="#4CAF50">${_.size(Game.creeps)}</font>`, ' ');
        const center = Memory.empireCenter;
        if (center && center.room) {
            const age = Game.time - (center.tick || Game.time);
            log.a(`📍 Empire center: ${roomLink(center.room)} <font color="#888888">(world ${center.x}, ${center.y} · ${age} ticks)</font>`, ' ');
        }

        log.a('------------------------------- COLONY INFO -------------------------------', ' ');

        // Table Header
        let header = "Room".padEnd(14) + "RCL".padEnd(16) + "Energy".padEnd(10) + "Income".padEnd(10) + "CPU".padEnd(8) + "Creeps".padEnd(8) + "Mineral";
        log.a(header, ' ');
        log.a("-".repeat(70), ' ');

        // Helper to pad string based on its visible length (ignoring HTML tags)
        const padVisible = (str, targetLength) => {
            const visibleLength = str.replace(/<[^>]*>/g, '').length;
            if (visibleLength < targetLength) {
                return str + ' '.repeat(targetLength - visibleLength);
            }
            return str;
        };

        (global.MY_ROOMS || []).forEach(roomName => {
            const room = Game.rooms[roomName];
            if (!room || !room.controller) return;

            const roomCreeps = _.filter(Game.creeps, c => c.memory && c.memory.colony === room.name).length;
            const cpuArr = global.ROOM_CPU_ARRAY || {};
            const avgCpu = cpuArr[room.name] ? (_.round(average(cpuArr[room.name]), 1) || '0.0') : '0.0';
            const lowPowerText = room.memory.noRemote ? '<font color="#FF4500">*</font>' : ' ';

            let progress = ((room.controller.progress / room.controller.progressTotal) * 100).toFixed(1) + "%";
            if (room.controller.level === 8) progress = "MAX";

            const rclStr = `${room.controller.level} <font color="#888888">(${progress})</font>`;
            const energyAmt = room.energy >= 1000 ? (room.energy / 1000).toFixed(1) + 'k' : room.energy;
            const energyStr = `<font color="#FFD700">${energyAmt}</font>`;

            const income = room.energyIncome || 0;
            const incColor = income > 0 ? '#4CAF50' : income < 0 ? '#FF4500' : '#888888';
            const incStr = `<font color="${incColor}">${income > 0 ? '+' + income : income}</font>`;

            const resource = room.mineral ? room.mineral.mineralType : 'N/A';
            const resourceActive = (room.mineral && !room.mineral.ticksToRegeneration) ? `<font color="#00B7EB">${resource}</font>` : `<font color="#555555">${resource}</font>`;

            let row = padVisible(`${roomLink(room.name)}${lowPowerText}`, 14);
            row += padVisible(rclStr, 16);
            row += padVisible(energyStr, 10);
            row += padVisible(incStr, 10);
            row += padVisible(`${avgCpu}`, 8);
            row += padVisible(`${roomCreeps}`, 8);
            row += resourceActive;

            log.a(row, ' ');
        });

        // -------------------------
        // OPERATIONS INFO
        // -------------------------
        const operations = {...Memory.targetRooms, ...Memory.auxiliaryTargets};
        const activeOps = Object.keys(operations).filter(k => operations[k]);

        if (activeOps.length > 0) {
            log.a('----------------------------- ACTIVE OPERATIONS ---------------------------', ' ');

            let scoutCount = 0;
            activeOps.forEach(key => {
                const op = operations[key];
                if (op.type === 'scout' || op.type === 'attack') {
                    scoutCount++;
                    return;
                }

                const typeColor = op.type.toLowerCase().includes('denial') ? '#FF4500' : '#00B7EB';
                let opStr = `🔹 <font color="${typeColor}">${_.capitalize(op.type)}</font> | Room: ${roomLink(key)} | Lvl: ${op.level || 0} | Priority: ${op.priority || 0}`;
                if (op.assignedRoom) opStr += ` | From: ${roomLink(op.assignedRoom)}`;

                if (op.enemyDead || op.friendlyDead) {
                    opStr += ` | <font color="#FF4500">Hostile KIA: ${(op.trackedEnemy || []).length}/${op.enemyDead}</font> | <font color="#4CAF50">Ally KIA: ${(op.trackedFriendly || []).length}/${op.friendlyDead}</font>`;
                } else if (op.type === 'pending' && op.dDay) {
                    opStr += ` | <font color="#FFD700">T-Minus: ${op.dDay - Game.time} ticks</font>`;
                }
                log.a(opStr, ' ');
            });

            if (scoutCount > 0) {
                log.a(`<font color="#888888">... plus ${scoutCount} active scouting missions.</font>`, ' ');
            }
        }

        // -------------------------
        // DIPLOMACY & HARASSMENT
        // -------------------------
        const activeHarassers = _.filter(Game.creeps, c => c.memory && c.memory.operation === 'harass');
        const enemies = global.ENEMIES || [];
        const warTargets = global.WAR_TARGETS || [];
        if (activeHarassers.length > 0 || (enemies.length > 0)) {
            log.a('---------------------------- DIPLOMACY & COMBAT ---------------------------', ' ');
            if (warTargets.length > 0) {
                log.a(`⚔️ War Targets: <font color="#FF4500">${warTargets.map(t => t.user).join(", ")}</font>`, ' ');
            } else if (enemies.length > 0) {
                log.a(`⚔️ Hostile Empires: <font color="#FF4500">${enemies.join(", ")}</font>`, ' ');
            }
            if (activeHarassers.length > 0) {
                const targetRooms = _.uniq(activeHarassers.map(c => c.memory.targetRoom || c.memory.destination).filter(Boolean)).join(", ");
                log.a(`🎯 Harassment: ${activeHarassers.length} units raiding ${targetRooms || 'threat remotes'}`, ' ');
            }
        }

        log.a('===========================================================================', ' ');

        getUptime();
    }
};

