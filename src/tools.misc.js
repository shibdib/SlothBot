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

// Status console
let lastStatus = 0;
module.exports.status = function () {
    if (lastStatus + STATUS_COOLDOWN < _.round(new Date().getTime() / 1000, 2) || (!Memory.lastStatus || Memory.lastStatus + 100 < Game.time)) {
        lastStatus = _.round(new Date().getTime() / 1000, 2)
        log.a('---------------------------------------------------------------------------', ' ');
        log.a('--GLOBAL INFO--', ' ');
        log.e('GCL - ' + Game.gcl.level + ' | GCL Progress - ' + ((_.round(Game.gcl.progress / Game.gcl.progressTotal, 2)) * 100) + '% | Total Creep Count - ' + _.size(Game.creeps), ' ');
        log.e('CPU Bucket - ' + Game.cpu.bucket + ' | CPU Limit - ' + Game.cpu.limit + ' | CPU Available - ' + Game.cpu.tickLimit, ' ');
        try {
            log.a('--ROOM INFO--', ' ');
            for (let name of MY_ROOMS) {
                let activeRoom = Game.rooms[name];
                if (!activeRoom.controller) continue;
                let averageCpu = 'No Data';
                if (ROOM_CPU_ARRAY[activeRoom.name]) averageCpu = _.round(average(ROOM_CPU_ARRAY[activeRoom.name]), 2) || 'No Data';
                let roomCreeps = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === activeRoom.name);
                let lowPowerText = '';
                if (activeRoom.memory.lowPower) lowPowerText = ' [LOW POWER]';
                log.e(roomLink(activeRoom.name) + lowPowerText + ' | RCL - ' + activeRoom.controller.level + ' | CPU Usage - ' + averageCpu + ' | RCL Progress - ' + ((_.round(activeRoom.controller.progress / activeRoom.controller.progressTotal, 2)) * 100) + '% | Energy Available - ' + activeRoom.energy + ' | Avg. Energy Income - ' + activeRoom.energyIncome + ' | Creep Count: ' + _.size(roomCreeps), ' ');
            }
        } catch (e) {
            log.a('--ROOM INFO FAILED--', ' ');
        }
        try {
            let targetRooms = Memory.targetRooms;
            let auxiliaryTargets = Memory.auxiliaryTargets;
            let blank = {};
            let operations = Object.assign(blank, targetRooms, auxiliaryTargets);
            if (operations && _.size(operations)) {
                log.a('--OPERATION INFO--', ' ');
                for (let key in operations) {
                    if (!operations[key] || !key) continue;
                    let level = operations[key].level || 0;
                    let type = operations[key].type;
                    if (operations[key].enemyDead || operations[key].friendlyDead) {
                        log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + operations[key].priority + ' | Room ' + roomLink(key) + ' | Enemy KIA - ' + operations[key].trackedEnemy.length + '/' + operations[key].enemyDead + ' | Friendly KIA - ' + operations[key].trackedFriendly.length + '/' + operations[key].friendlyDead, ' ');
                    } else if (operations[key].type === 'pending') {
                        log.e(_.capitalize(type) + ' | Countdown - ' + (operations[key].dDay - Game.time) + ' ticks | Room ' + roomLink(key), ' ');
                    } else {
                        log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + operations[key].priority + ' | Room ' + roomLink(key), ' ');
                    }
                }
                let scouts = _.filter(operations, (t) => t && (t.type === 'scout' || t.type === 'attack'));
                if (scouts.length) log.e('Scout Target Count - ' + scouts.length, ' ');
            }
        } catch (e) {
            log.a('--OPERATION INFO FAILED--', ' ');
            log.e(e.stack)
        }
        try {
            if (Memory.harassTargets && Memory.harassTargets.length) {
                let activeHarassers = _.filter(Game.creeps, (c) => c.memory && c.memory.operation === 'harass');
                log.a('--HARASSMENT INFO--', ' ');
                log.e('Harass Targets: ' + Memory.harassTargets.join(", "), ' ');
                if (activeHarassers.length) {
                    log.e('Active Harassers: ' + activeHarassers.length, ' ');
                    log.e('Targets: ' + _.pluck(activeHarassers, 'memory.destination').join(", "), ' ');
                }
            }
        } catch (e) {
            log.a('--HARASSMENT INFO FAILED--', ' ');
        }
        try {
            if (Memory._enemies && Memory._enemies.length) {
                log.a('--DIPLOMATIC INFO--', ' ');
                log.e('Enemies: ' + Memory._enemies.join(", "), ' ');
            }
        } catch (e) {
            log.a('--DIPLOMATIC INFO FAILED--', ' ');
        }
        Memory.lastStatus = Game.time;
        getUptime();
        return log.a('---------------------------------------------------------------------------', ' ');
    }
};
