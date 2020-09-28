// Get Tick Length
const tickLengthArray = [];
module.exports.tickLength = function () {
    let d = new Date();
    let seconds = _.round(d.getTime() / 1000, 2);
    let lastTick = Memory.lastTick || seconds;
    Memory.lastTick = seconds;
    let tickLength = seconds - lastTick;
    if (tickLengthArray.length < 50) {
        tickLengthArray.push(tickLength)
    } else {
        tickLengthArray.shift();
        tickLengthArray.push(tickLength)
    }
    Memory.tickLength = average(tickLengthArray);
}

// Handle cleaning memory for respawn
let memCleaned;
module.exports.cleanMemory = function () {
    if (!memCleaned && !_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.my && (r.memory.bunkerHub || r.memory.praiseRoom)).length) {
        for (let key in Memory) delete Memory[key];
    }
    memCleaned = true;
}

// Mem Hack
let LAST_MEMORY_TICK;
module.exports.memHack = function () {
    if (LAST_MEMORY_TICK && global.LastMemory && Game.time === (LAST_MEMORY_TICK + 1)) {
        delete global.Memory;
        global.Memory = global.LastMemory;
        RawMemory._parsed = global.LastMemory;
    } else {
        Memory;
        global.LastMemory = RawMemory._parsed;
    }
    LAST_MEMORY_TICK = Game.time;
}

// Set Task CPU Limits
module.exports.CPULimits = function () {
    let totalLimit = Game.cpu.limit;
    CPU_TASK_LIMITS['roomLimit'] = adjustedCPULimit(totalLimit * 0.85, Game.cpu.bucket, 7000);
    if (Memory._threatList && Memory._threatList.length) {
        CPU_TASK_LIMITS['military'] = adjustedCPULimit(totalLimit * 0.05, Game.cpu.bucket, 5000);
        CPU_TASK_LIMITS['hiveTasks'] = adjustedCPULimit(totalLimit * 0.10, Game.cpu.bucket, BUCKET_MAX);
    } else {
        CPU_TASK_LIMITS['military'] = adjustedCPULimit(totalLimit * 0.02, Game.cpu.bucket, 5000);
        CPU_TASK_LIMITS['hiveTasks'] = adjustedCPULimit(totalLimit * 0.13, Game.cpu.bucket, BUCKET_MAX);
    }
}

// CPU Limit Tool
adjustedCPULimit = function adjustedCPULimit(limit, bucket, target = BUCKET_MAX * 0.7, maxCpuPerTick = Game.cpu.limit * 1.5) {
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
};

// Status console
let lastStatus = _.round(new Date().getTime() / 1000, 2);
module.exports.status = function () {
    if (lastStatus + STATUS_COOLDOWN < _.round(new Date().getTime() / 1000, 2)) {
        lastStatus = _.round(new Date().getTime() / 1000, 2)
        log.a('---------------------------------------------------------------------------', ' ');
        log.a('--GLOBAL INFO--', ' ');
        log.e('GCL - ' + Game.gcl.level + ' | GCL Progress - ' + ((_.round(Game.gcl.progress / Game.gcl.progressTotal, 2)) * 100) + '% | Creep Count - ' + _.size(Game.creeps), ' ');
        try {
            log.a('--ROOM INFO--', ' ');
            let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
            for (let activeRoom of myRooms) {
                if (!activeRoom.controller) continue;
                let marauder, averageCpu = 'No Data';
                if (ROOM_CPU_ARRAY[activeRoom.name]) averageCpu = _.round(average(ROOM_CPU_ARRAY[activeRoom.name]), 2) || 'No Data';
                let roomCreeps = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === activeRoom.name);
                let marauderText = '';
                let marauderCreep = _.filter(roomCreeps, (c) => c.memory.operation === 'marauding')[0];
                if (marauderCreep) {
                    marauder = roomLink(marauderCreep.pos.roomName);
                    marauderText = '| Marauder Location - ' + marauder + ' ';
                }
                let lowPowerText = '';
                if (activeRoom.memory.lowPower) lowPowerText = ' [LOW POWER]';
                log.e(roomLink(activeRoom.name) + lowPowerText + ' | RCL - ' + activeRoom.controller.level + ' | CPU Usage - ' + averageCpu + ' | RCL Progress - ' + ((_.round(activeRoom.controller.progress / activeRoom.controller.progressTotal, 2)) * 100) + '% | Energy Available - ' + activeRoom.energy + ' | Avg. Energy Income - ' + _.round(average(JSON.parse(ROOM_ENERGY_INCOME_ARRAY[activeRoom.name])), 0) + ' ' + marauderText + '| Creep Count: ' + _.size(roomCreeps), ' ');
            }
        } catch (e) {
            log.a('--ROOM INFO FAILED--', ' ');
        }
        try {
            let targetRooms = Memory.targetRooms;
            let auxiliaryTargets = Memory.auxiliaryTargets;
            let operations = Object.assign(targetRooms, auxiliaryTargets);
            if (operations && _.size(operations)) {
                log.a('--OPERATION INFO--', ' ');
                for (let key in operations) {
                    if (!operations[key] || !key) continue;
                    let level = operations[key].level || 0;
                    let type = operations[key].type;
                    if (type === 'scout' || type === 'attack') continue;
                    let priority = 'Routine';
                    if (operations[key].priority === 3) priority = 'Increased'; else if (operations[key].priority === 2) priority = 'High'; else if (operations[key].priority === 1) priority = 'Urgent';
                    if (operations[key].enemyDead || operations[key].friendlyDead) {
                        log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + priority + ' | Room ' + roomLink(key) + ' | Enemy KIA - ' + operations[key].trackedEnemy.length + '/' + operations[key].enemyDead + ' | Friendly KIA - ' + operations[key].trackedFriendly.length + '/' + operations[key].friendlyDead, ' ');
                    } else if (operations[key].type === 'pending') {
                        log.e(_.capitalize(type) + ' | Countdown - ' + (operations[key].dDay - Game.time) + ' ticks | Room ' + roomLink(key), ' ');
                    } else {
                        log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + priority + ' | Room ' + roomLink(key), ' ');
                    }
                }
                let scouts = _.filter(operations, (t) => t.type === 'scout' || t.type === 'attack');
                if (scouts.length) log.e('Scout Target Count - ' + scouts.length, ' ');
            }
        } catch (e) {
            log.a('--OPERATION INFO FAILED--', ' ');
        }
        try {
            if (Memory._badBoyArray && Memory._badBoyArray.length) {
                log.a('--DIPLOMATIC INFO--', ' ');
                if (Memory._enemies && Memory._enemies.length) log.e('Current Enemies: ' + Memory._enemies.join(", "), ' ');
                if (Memory._nuisance && Memory._nuisance.length) log.e('Current Nuisances: ' + Memory._nuisance.join(", "), ' ');
            }
        } catch (e) {
            log.a('--DIPLOMATIC INFO FAILED--', ' ');
        }
        return log.a('---------------------------------------------------------------------------', ' ');
    }
};