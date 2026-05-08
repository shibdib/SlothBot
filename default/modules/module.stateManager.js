/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const LAST_UPDATE = {};
const ENERGY_TRACKER = {};

class StateManager {
    constructor() {
        this.myRooms = MY_ROOMS;
    }

    run() {
        // Run every 10 ticks
        const lastRun = LAST_UPDATE.tick || 0;
        if (lastRun + 10 > Game.time) return;
        LAST_UPDATE.tick = Game.time;

        this.myRooms.forEach(room => this.roomTracking(room));
    }

    roomTracking(room) {
        room = Game.rooms[room];

        // Track energy
        this.energyTracking(room);

        // Track leveling stats
        this.levelingStatTracking(room);

        // Request builders only if certain conditions are met
        this.requestBuilders(room);

        // Funnel requests
        this.funnelRequest(room);

        // Barrier tracking
        this.barrierTracking(room);

        room.memory.stateInformation = undefined;
    }

    energyTracking(room) {
        // Energy tracking
        const lastEnergy = room.memory.lastEnergyAmount || 0;
        room.memory.lastEnergyAmount = room.energy;
        const energyIncomeArray = ROOM_ENERGY_INCOME_ARRAY[room.name] || [];
        energyIncomeArray.push(room.energy - lastEnergy);

        if (energyIncomeArray.length > 50) {
            energyIncomeArray.shift();
        }

        ROOM_ENERGY_INCOME_ARRAY[room.name] = energyIncomeArray;

        // Track if the room is filling extensions/spawns fast enough
        if (room.energyCapacityAvailable > room.energyAvailable) {
            if (ENERGY_TRACKER[room.name]) ENERGY_TRACKER[room.name]++; else ENERGY_TRACKER[room.name] = 1;
        } else if (ENERGY_TRACKER[room.name] > 0) ENERGY_TRACKER[room.name]--;
        room.memory.needsHaulers = ENERGY_TRACKER[room.name] > 10;

        // Track projected income based off harvester count. 10 for in room and 8 for remote
        const harvesters = room.myCreeps.filter((c) => c.memory.role === 'stationaryHarvester').concat(_.filter(Game.creeps, ((c) => c.my && c.memory.colony === room.name && c.memory.role === 'remoteHarvester' && c.memory.other && c.memory.other.haulingRequired)));
        const income = Math.floor(harvesters.reduce((sum, creep) => sum + (creep.getActiveBodyparts(WORK) * 0.8), 0));
        const energyUsers = room.myCreeps.filter((c) => ['drone', 'upgrader'].includes(c.memory.role));
        const workExpense = Math.ceil(energyUsers.reduce((sum, creep) => sum + creep.getActiveBodyparts(WORK), 0));
        // Amortised spawn cost: total energy capacity of all creeps / average lifespan
        const spawnExpense = Math.ceil(room.myCreeps.reduce((sum, c) => sum + global.UNIT_COST(c.body), 0) / CREEP_LIFE_TIME);
        // Tower drain: towers fire every tick, estimate 200 energy/tick per active tower as a conservative overhead
        const towerExpense = room.impassibleStructures.filter(s => s.structureType === STRUCTURE_TOWER && s.isActive()).length * 2;
        const expense = workExpense + spawnExpense + towerExpense;
        const spareIncome = room.energyState > 2 ? 9999999 : room.energyState < 2 ? (income - expense) * 0.5 : income - expense;
        room.memory.energyInfo = {income: income, expense: expense, spareIncome: spareIncome};
        room.memory.energyPositive = (average(energyIncomeArray) > 0 && income > expense) || room.energyState > 1 || room.level < 4;

        if (!room.memory.combatReady && room.energyState >= 1 && room.level >= 6) room.memory.combatReady = true;
        else if (room.memory.combatReady && !room.energyState) room.memory.combatReady = undefined;
    }

    levelingStatTracking(room) {
        // Stats tracking
        let stats = room.memory.stats || {};
        stats.levelInfo = stats.levelInfo || {};
        stats.levelInfo[room.controller.level] = stats.levelInfo[room.controller.level] || Game.time;

        stats.highestRCL = Math.max(stats.highestRCL || 0, room.controller.level);

        room.memory.stats = stats;
    }

    requestBuilders(room) {
        const impassibleStructures = room.impassibleStructures || [];
        let hasSpawn = false;
        let hasTower = false;

        // Iterate once over the impassible structures and check for spawns and towers
        for (let structure of impassibleStructures) {
            if (structure.structureType === STRUCTURE_SPAWN) {
                hasSpawn = true;
            } else if (structure.structureType === STRUCTURE_TOWER) {
                hasTower = true;
            }

            // Early exit if both spawns and towers are found
            if (hasSpawn && hasTower) {
                break;
            }
        }

        room.memory.buildersNeeded = !hasSpawn || !hasTower || room.level < room.controller.level - 1;
    }

    funnelRequest(room) {
        const requests = ALLY_HELP_REQUESTS[MY_USERNAME] ? ALLY_HELP_REQUESTS[MY_USERNAME].requests : {};
        if (room.terminal && room.level < 8 && FUNNEL_REQUESTS) {
            let funnelRequests = requests.funnel ? requests.funnel : [];
            if (funnelRequests) {
                funnelRequests = funnelRequests.filter((r) => r.roomName !== room.name);
                const goalType = room.level === 6 ? 1 : room.level === 7 ? 2 : 0;
                funnelRequests.push({
                    goalType: goalType,
                    maxAmount: Math.min((room.controller.progressTotal - room.controller.progress) - room.energy, 200000),
                    timeout: Game.time + CREEP_LIFE_TIME,
                    roomName: room.name
                });
                ALLY_HELP_REQUESTS[MY_USERNAME].requests.funnel = funnelRequests;
            }
        } else {
            let funnelRequests = requests.funnel ? requests.funnel : [];
            if (funnelRequests && ALLY_HELP_REQUESTS[MY_USERNAME]) {
                funnelRequests = funnelRequests.filter((r) => r.roomName !== room.name);
                ALLY_HELP_REQUESTS[MY_USERNAME].requests.funnel = funnelRequests;
            }
        }
    }

    barrierTracking(room) {
        const lowestBarrier = _.min(room.structures.filter((s) => [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType)), (s) => s.hits);
        if (!lowestBarrier) return;
        const hostileMulti = HOSTILES.length ? 1 : 0.5;
        const targetHits = Math.max(Math.min((BARRIER_TARGET * (room.level / 8)) * hostileMulti, lowestBarrier.hitsMax), 25000);
        room.memory.barrierHitsTarget = targetHits;
        room.memory.barrierBuilding = lowestBarrier.hits < targetHits;
    }
}

profiler.registerClass(StateManager, 'StateManager');
module.exports = StateManager;