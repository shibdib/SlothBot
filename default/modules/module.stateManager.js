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

        // Track projected income — use colonyCreeps cache to avoid scanning all Game.creeps
        const colonyCreeps = (global.world && global.world.colonyCreeps && global.world.colonyCreeps[room.name]) || room.myCreeps;

        // Split harvesters by type for detailed diagnostics
        const statHarvesters = colonyCreeps.filter(c => c.memory.role === 'stationaryHarvester');
        const remoteHarvesters = colonyCreeps.filter(c => c.memory.role === 'remoteHarvester' && c.memory.other && c.memory.other.haulingRequired);
        const statIncome = Math.floor(statHarvesters.reduce((sum, c) => sum + (c.getActiveBodyparts(WORK) * 0.8), 0));
        const remoteIncome = Math.floor(remoteHarvesters.reduce((sum, c) => sum + (c.getActiveBodyparts(WORK) * 0.8), 0));
        const income = statIncome + remoteIncome;

        // Split expenses by category for diagnostics
        const upgraders = room.myCreeps.filter(c => c.memory.role === 'upgrader');
        const drones = room.myCreeps.filter(c => c.memory.role === 'drone' || c.memory.role === 'waller');
        const upgradeExpense = Math.ceil(upgraders.reduce((sum, c) => sum + c.getActiveBodyparts(WORK), 0));
        const droneExpense = Math.ceil(drones.reduce((sum, c) => sum + c.getActiveBodyparts(WORK), 0));
        // Amortised spawn cost: total energy capacity of all creeps / average lifespan
        const spawnExpense = Math.ceil(room.myCreeps.reduce((sum, c) => sum + global.UNIT_COST(c.body), 0) / CREEP_LIFE_TIME);
        // Tower drain: only counts when towers are actually firing (hostiles present)
        const towerExpense = HOSTILES.length > 0 ? room.towers.filter(s => s.structureType === STRUCTURE_TOWER && s.isActive()).length * 2 : 0;
        const expense = upgradeExpense + droneExpense + spawnExpense + towerExpense;
        const spareIncome = room.energyState > 2 ? 9999999 : income - expense;
        room.memory.energyInfo = {income, expense, spareIncome};
        room.memory.energyDiag = {
            statHarv: statHarvesters.length,
            statIncome,
            remoteHarv: remoteHarvesters.length,
            remoteIncome,
            upgraderCnt: upgraders.length,
            upgradeExpense,
            droneCnt: drones.length,
            droneExpense,
            spawnExpense,
            towerExpense
        };
        room.memory.energyPositive = (average(energyIncomeArray) > 0 && income > expense) || room.energyState > 1 || room.level < 4;

        if (!room.memory.combatReady && room.energyState > 1 && room.level >= 6) room.memory.combatReady = true;
        else if (room.memory.combatReady) room.memory.combatReady = undefined;
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
        const hasSpawn = room.spawns[0];
        const missingStorage = room.level >= 4 && !room.storage;
        const missingTerminal = room.level >= 6 && !room.terminal;
        room.memory.buildersNeeded = !hasSpawn || missingStorage || missingTerminal || room.downgraded;
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
}

profiler.registerClass(StateManager, 'StateManager');
module.exports = StateManager;