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
    CPU_TASK_LIMITS['roomLimit'] = adjustedCPULimit(totalLimit * 0.9, Game.cpu.bucket, 2500);
    CPU_TASK_LIMITS['military'] = adjustedCPULimit(totalLimit * 0.02, Game.cpu.bucket, 2000);
    CPU_TASK_LIMITS['hiveTasks'] = adjustedCPULimit(totalLimit * 0.08, Game.cpu.bucket, 2500);
}

// CPU Limit Tool
adjustedCPULimit = function adjustedCPULimit(limit, bucket, target = BUCKET_MAX * 0.8, maxCpuPerTick = Game.cpu.limit * 2) {
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
    if (lastStatus + STATUS_COOLDOWN < _.round(new Date().getTime() / 1000, 2) || (!Memory.lastStatus || Memory.lastStatus + 100 < Game.time)) {
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
                log.e(roomLink(activeRoom.name) + lowPowerText + ' | RCL - ' + activeRoom.controller.level + ' | CPU Usage - ' + averageCpu + ' | RCL Progress - ' + ((_.round(activeRoom.controller.progress / activeRoom.controller.progressTotal, 2)) * 100) + '% | Energy Available - ' + activeRoom.energy + ' | Avg. Energy Income - ' + activeRoom.energyIncome + ' ' + marauderText + '| Creep Count: ' + _.size(roomCreeps), ' ');
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
                    if (type === 'scout' || type === 'attack') continue;
                    let priority = 'Routine';
                    if (operations[key].priority === 11) priority = 'Secondary'; else if (operations[key].priority === 2) priority = 'High'; else if (operations[key].priority === 1) priority = 'Urgent';
                    if (operations[key].enemyDead || operations[key].friendlyDead) {
                        log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + priority + ' | Room ' + roomLink(key) + ' | Enemy KIA - ' + operations[key].trackedEnemy.length + '/' + operations[key].enemyDead + ' | Friendly KIA - ' + operations[key].trackedFriendly.length + '/' + operations[key].friendlyDead, ' ');
                    } else if (operations[key].type === 'pending') {
                        log.e(_.capitalize(type) + ' | Countdown - ' + (operations[key].dDay - Game.time) + ' ticks | Room ' + roomLink(key), ' ');
                    } else {
                        log.e(_.capitalize(type) + ' | Level - ' + level + ' | Priority - ' + priority + ' | Room ' + roomLink(key), ' ');
                    }
                }
                let scouts = _.filter(operations, (t) => t && (t.type === 'scout' || t.type === 'attack'));
                if (scouts.length) log.e('Scout Target Count - ' + scouts.length, ' ');
            }
        } catch (e) {
            log.a('--OPERATION INFO FAILED--', ' ');
            console.log(e.stack)
        }
        try {
            if (Memory._enemies && Memory._enemies.length) {
                log.a('--DIPLOMATIC INFO--', ' ');
                if (Memory._enemies && Memory._enemies.length) log.e('Current Enemies: ' + Memory._enemies.join(", "), ' ');
            }
        } catch (e) {
            log.a('--DIPLOMATIC INFO FAILED--', ' ');
        }
        Memory.lastStatus = Game.time;
        return log.a('---------------------------------------------------------------------------', ' ');
    }
};

// Gankdalf 7 December 2016 at 22:35
function calculateCostOfaMine(distance, swampCount, mineCapacity) {
    //Get the number of WORK parts needed
    const energy_generated = mineCapacity / ENERGY_REGEN_TIME;
    const work_needed = energy_generated / HARVEST_POWER;

    //Get the travel time for the creeps
    //(will be used more with non-one-to-one creeps)
    const miner_travel_time = distance;
    const carry_travel_time = distance * 2;

    //Get the number of carry parts needed to move the generated energy in one trip
    //(can in theory be split between multiple creeps)
    const carry_needed = Math.ceil(
        carry_travel_time * (energy_generated / CARRY_CAPACITY)
    );

    //Get the number of move parts needed to move the work and carry parts at 1:1 on roads
    //(including a single work part for the carry creep)
    const work_move_needed = Math.ceil(work_needed / 2);
    const carry_move_needed = Math.ceil((carry_needed + 1) / 2);

    //Get the cost per tick for a container
    const container_cost =
        CONTAINER_DECAY / CONTAINER_DECAY_TIME_OWNED / REPAIR_POWER;

    //Get the one-time energy cost to create the needed needed creeps
    const miner_cost =
        work_needed * BODYPART_COST["work"] +
        work_move_needed * BODYPART_COST["move"];
    const carry_cost =
        carry_needed * BODYPART_COST["carry"] +
        carry_move_needed * BODYPART_COST["move"] +
        BODYPART_COST["work"];

    //Get the cost per-tick to create the needed creeps
    const carry_cost_per_tick =
        carry_cost / (CREEP_LIFE_TIME - carry_travel_time);
    const miner_cost_per_tick =
        miner_cost / (CREEP_LIFE_TIME - miner_travel_time);

    //Get the number of ticks required in a normal creep life cycle required to spawn the needed creeps
    //(This accounts for the time when two miners will exist at the same time for a single source)
    const miner_tick_cost_per_cycle =
        (((work_needed + work_move_needed) * 3) /
            (CREEP_LIFE_TIME - miner_travel_time)) *
        CREEP_LIFE_TIME;
    const carry_tick_cost_per_cycle =
        (((carry_needed + carry_move_needed) * 3) /
            (CREEP_LIFE_TIME - carry_travel_time)) *
        CREEP_LIFE_TIME;

    //Get the repair cost to maintain the roads
    const plain_road_cost =
        ((distance - swampCount) * (ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME)) /
        REPAIR_POWER;
    const swamp_road_cost =
        (swampCount *
            (ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME) *
            CONSTRUCTION_COST_ROAD_SWAMP_RATIO) /
        REPAIR_POWER;

    return {
        totalEnergyCostPerTick:
            Math.round(
                (carry_cost_per_tick +
                    miner_cost_per_tick +
                    swamp_road_cost +
                    plain_road_cost +
                    container_cost) *
                100
            ) / 100,
        spawnTicksPerCycle: Math.ceil(
            miner_tick_cost_per_cycle + carry_tick_cost_per_cycle
        ),
        spawnEnergyCapacityRequired: Math.max(miner_cost, carry_cost),
        initialStructureCost:
            (distance - swampCount) * CONSTRUCTION_COST["road"] +
            swampCount *
            CONSTRUCTION_COST["road"] *
            CONSTRUCTION_COST_ROAD_SWAMP_RATIO +
            CONSTRUCTION_COST["container"]
    };
}
