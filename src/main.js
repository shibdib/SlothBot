//modules
//Setup globals and prototypes
require("require");
let _ = require('lodash');
let hive = require('main.Hive');
let cleanUp = require('module.Cleanup');
let segments = require('module.segmentManager');
let shib = require("shibBench");
const tickLengthArray = [];
const lastGlobal = Memory.lastGlobalReset || Game.time;
log.e('Global Reset - Last reset occurred ' + (Game.time - lastGlobal) + ' ticks ago.');
Memory.lastGlobalReset = Game.time;

module.exports.loop = function() {
    stats.lastTime = false;
    stats.reset();
    let mainCpu = Game.cpu.getUsed();

    //Logging level
    Memory.loggingLevel = 4; //Set level 1-5 (5 being most info)

    // Set Name
    if (!global.USERNAME) {
        for (let key in Game.spawns) {
            global.USERNAME = Game.spawns[key].owner.username;
            break;
        }
    }

    Memory.ownedRooms = shuffle(_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner.username === USERNAME));

    // Get Tick Length
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

    //Routine status
    if (Game.time % 100 === 0) status();

    //Update allies
    populateLOANlist();

    //Must run modules
    segments.segmentManager();
    cleanUp.cleanup();

    //Bucket Check
    if (Memory.cooldown) {
        if (Memory.cooldown + 25 < Game.time) {
            delete Memory.cooldown;
        } else {
            let countDown = (Memory.cooldown + 25) - Game.time;
            log.e('On CPU Cooldown For ' + countDown + ' more ticks. Current Bucket ' + Game.cpu.bucket);
            return;
        }
    } else if (Game.cpu.bucket < Game.cpu.limit * 10) {
        Memory.cooldown = Game.time;
        log.e('Skipping tick ' + Game.time + ' due to lack of CPU.');
        return;
    }

    //Hive Mind
    if (_.size(Memory.ownedRooms)) {
        hive.hiveMind();
    }

    shib.shibBench('Total', mainCpu);
    shib.processBench();
    // Simple stats
    stats.addSimpleStat('totalCreepCount', _.size(Game.creeps)); // Creep Count
    stats.addSimpleStat('militaryCreepCount', _.size(_.filter(Game.creeps, (r) => r.memory.military))); // Creep Count
    stats.commit();
};

requestBench = function (ticks, notify = false) {
    delete Memory._benchmark;
    Memory.reportBench = Game.time + ticks;
    Memory.reportBenchNotify = notify;
    log.a('Benchmark Queued');
};

currentStats = function (notify = false) {
    let sorted = _.sortBy(Memory._benchmark, 'avg');
    log.e('---------------------------------------------------------------------------');
    log.e('~~~~~BENCHMARK REPORT~~~~~');
    if (notify) Game.notify('~~~~~BENCHMARK REPORT~~~~~');
    let totalTicks;
    let overallAvg;
    let bucketAvg;
    let bucketTotal;
    for (let key in sorted) {
        if (sorted[key]['title'] === 'Total') {
            totalTicks = sorted[key]['tickCount'];
            overallAvg = sorted[key]['avg'];
            continue;
        }
        if (sorted[key]['title'] === 'bucket') {
            bucketAvg = sorted[key]['avg'];
            bucketTotal = sorted[key]['used'];
            continue;
        }
        log.a(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. ||| Average CPU Used: ' + _.round(sorted[key]['avg'], 3) + '. ||| Total CPU Used: ' + _.round(sorted[key]['avg'] * sorted[key]['useCount'], 3) + '. ||| Peak CPU Used: ' + _.round(sorted[key]['max'], 3));
        if (notify) Game.notify(sorted[key]['title'] + ' - Was Used ' + sorted[key]['useCount'] + ' times. ||| Average CPU Used: ' + _.round(sorted[key]['avg'], 3) + '. ||| Total CPU Used: ' + _.round(sorted[key]['avg'] * sorted[key]['useCount'], 3) + '. ||| Peak CPU Used: ' + _.round(sorted[key]['max'], 3));
    }
    log.e('Ticks Covered: ' + totalTicks + '. Average CPU Used: ' + _.round(overallAvg, 3));
    log.e('Total Bucket Used: ' + bucketTotal + '. Current Bucket: ' + Game.cpu.bucket);
    log.e('---------------------------------------------------------------------------');
    if (notify) Game.notify('Ticks Covered: ' + totalTicks + '. Average CPU Used: ' + _.round(overallAvg, 3));
    if (notify) Game.notify('Total Bucket Used: ' + bucketTotal + '. Current Bucket: ' + Game.cpu.bucket);
};

resetBench = function () {
    delete Memory._benchmark;
    delete Memory.reportBench;
    delete Memory.reportBenchNotify;
    log.a('Benchmarks Reset');
};

abandon = function (room) {
    if (!Game.rooms[room] || !Game.rooms[room].memory.extensionHub) return log.e(room + ' does not appear to be owned by you.');
    for (let key in Game.rooms[room].creeps) {
        Game.rooms[room].creeps[key].suicide();
    }
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room);
    for (let key in overlordFor) {
        overlordFor[key].suicide();
    }
    for (let key in Game.rooms[room].structures) {
        Game.rooms[room].structures[key].destroy();
    }
    for (let key in Game.rooms[room].constructionSites) {
        Game.rooms[room].constructionSites[key].remove();
    }
    delete Game.rooms[room].memory;
    Game.rooms[room].controller.unclaim();
};

nukes = function (target) {
    let nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy === s.energyCapacity && s.ghodium === s.ghodiumCapacity && !s.cooldown);
    if (target) nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy === s.energyCapacity && s.ghodium === s.ghodiumCapacity && !s.cooldown && Game.map.getRoomLinearDistance(s.room.name, target) <= 10);
    if (!nukes.length && !target) return log.a('No nukes available');
    if (!nukes.length && target) return log.a('No nukes available in range of ' + target);
    for (let key in nukes) {
        if (target) log.a(nukes[key].room.name + ' has a nuclear missile available that is in range of ' + target);
        if (!target) log.a(nukes[key].room.name + ' has a nuclear missile available.')
    }
};

status = function (roomName = undefined, creep = false) {
    if (!roomName) {
        log.e('---------------------------------------------------------------------------');
        log.e('--GLOBAL INFO--');
        log.e('GCL - ' + Game.gcl.level + ' | GCL Progress - ' + (_.round(Game.gcl.progress, 0)) + '/' + (_.round(Game.gcl.progressTotal, 0)) + ' | Creep Count - ' + _.size(Game.creeps) + ' | Likely Next Claim - ' + _.max(_.filter(Memory.roomCache, (r) => r.claimWorthy), 'claimValue').name);
        log.e('--ROOM INFO--');
        for (let key in Memory.ownedRooms) {
            let activeRoom = Memory.ownedRooms[key];
            if (!activeRoom.controller) continue;
            let averageEnergy = _.round(average(roomEnergyArray[activeRoom.name]), 0) || 'No Data';
            let averageCpu = _.round(average(roomCpuArray[activeRoom.name]), 2) || 'No Data';
            let roomCreeps = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === activeRoom.name);
            log.e(roomLink(activeRoom.name) + ' | RCL - ' + activeRoom.controller.level + ' | CPU Usage - ' + averageCpu + ' | RCL Progress - ' + (activeRoom.controller.progress) + '/' + (activeRoom.controller.progressTotal) + ' | Avg. Energy Available - ' + averageEnergy + ' | Avg. Energy Income - ' + _.round(average(JSON.parse(activeRoom.memory.energyIncomeArray)), 0) + ' | Energy Positive - ' + _.capitalize(activeRoom.memory.energyPositive) + ' | Creep Count: ' + _.size(roomCreeps));
        }
        if (Memory.targetRooms && _.size(Memory.targetRooms)) {
            log.e('--OPERATION INFO--');
            for (let key in Memory.targetRooms) {
                let level = Memory.targetRooms[key].level;
                let type = Memory.targetRooms[key].type;
                if (type === 'poke' || type === 'scout' || type === 'attack') continue;
                let priority = Memory.targetRooms[key].priority || 4;
                if (Memory.targetRooms[key].enemyDead || Memory.targetRooms[key].friendlyDead) {
                    log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + priority + ' | Room ' + global.roomLink(key) + ' | Enemy KIA - ' + Memory.targetRooms[key].trackedEnemy.length + '/' + Memory.targetRooms[key].enemyDead + ' | Friendly KIA - ' + Memory.targetRooms[key].trackedFriendly.length + '/' + Memory.targetRooms[key].friendlyDead);
                } else {
                    log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + priority + ' | Room ' + global.roomLink(key));
                }
            }
            let pokes = _.filter(Memory.targetRooms, (t) => t.type === 'poke');
            if (pokes.length) log.e('Active Poke Count - ' + pokes.length);
            let scouts = _.filter(Memory.targetRooms, (t) => t.type === 'scout' || t.type === 'attack');
            if (scouts.length) log.e('Scout Target Count - ' + scouts.length);
        }
        let borderPatrolLeaders = _.filter(Game.creeps, (c) => c.memory && c.memory.operation === 'borderPatrol' && c.memory.squadLeader);
        if (borderPatrolLeaders.length) {
            log.e('--BORDER PATROL INFO--');
            for (let patrol of borderPatrolLeaders) {
                if (patrol.memory.contactReport) {
                    log.e(global.roomLink(patrol.memory.overlord) + ' Patrol | Location - ' + global.roomLink(patrol.pos.roomName) + ' ~~CONTACT REPORTED~~');
                } else {
                    log.e(global.roomLink(patrol.memory.overlord) + ' Patrol | Location - ' + global.roomLink(patrol.pos.roomName));
                }
            }
        }
        return log.e('---------------------------------------------------------------------------');
    } else if (!creep) {
        let activeRoom = Game.rooms[roomName];
        if (!activeRoom) return log.e('No Data Found');
        log.e('---------------------------------------------------------------------------');
        log.e('--ROOM INFO--');
        let averageEnergy = _.round(average(roomEnergyArray[activeRoom.name]), 0) || 'No Data';
        let averageCpu = _.round(average(roomCpuArray[activeRoom.name]), 2) || 'No Data';
        let roomCreeps = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === activeRoom.name);
        log.e(global.roomLink(activeRoom.name) + ' | RCL - ' + activeRoom.controller.level + ' | CPU Usage - ' + averageCpu + ' | RCL Progress - ' + (activeRoom.controller.progress) + '/' + (activeRoom.controller.progressTotal) + ' | Avg. Energy Available - ' + averageEnergy + ' | Creep Count: ' + _.size(roomCreeps));
        log.e('--TASK CPU INFO--');
        for (let key in taskCpuArray[roomName]) {
            let averageCpu = _.round(average(taskCpuArray[activeRoom.name]), 2) || 'No Data';
            log.e(_.capitalize(key) + ' Avg. CPU - ' + averageCpu);
        }
        log.e('---------------------------------------------------------------------------');
    } else {
        let activeRoom = Game.rooms[roomName];
        if (!activeRoom) return log.e('No Data Found');
        log.e('---------------------------------------------------------------------------');
        log.e('--ROOM INFO--');
        let averageEnergy = _.round(average(roomEnergyArray[activeRoom.name]), 0) || 'No Data';
        let averageCpu = _.round(average(roomCpuArray[activeRoom.name]), 2) || 'No Data';
        let roomCreeps = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === activeRoom.name);
        log.e(global.roomLink(activeRoom.name) + ' | RCL - ' + activeRoom.controller.level + ' | CPU Usage - ' + averageCpu + ' | RCL Progress - ' + (activeRoom.controller.progress) + '/' + (activeRoom.controller.progressTotal) + ' | Avg. Energy Available - ' + averageEnergy + ' | Creep Count: ' + _.size(roomCreeps));
        log.e('--CREEP CPU INFO--');
        for (let key in roomCreepCpuObject[roomName]) {
            let averageCpu = _.round(average(roomCreepCpuObject[activeRoom.name]), 2) || 'No Data';
            log.e(_.capitalize(key) + ' in ' + global.roomLink(Game.creeps[key].room.name) + ' | Avg. CPU - ' + averageCpu);
        }
        log.e('---------------------------------------------------------------------------');
    }
    log.e('Current Enemies: ' + Memory._enemies);
    log.e('Current Nuisances: ' + Memory._nuisance);
    log.e('Current Threats: ' + Memory._threatList);
};