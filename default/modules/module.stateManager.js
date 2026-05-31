/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const energyTracker = require("module.energyTracker");
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
        // Spawn-fill latency tracker (used to request more haulers).
        if (room.energyCapacityAvailable > room.energyAvailable) {
            if (ENERGY_TRACKER[room.name]) ENERGY_TRACKER[room.name]++; else ENERGY_TRACKER[room.name] = 1;
        } else if (ENERGY_TRACKER[room.name] > 0) ENERGY_TRACKER[room.name]--;
        room.memory.needsHaulers = ENERGY_TRACKER[room.name] > 10;

        // Authoritative income/expense from the event-log accumulator — covers the home
        // room plus visible remotes.
        const snap = energyTracker.colonySnapshot(room.name);
        const roomSnap = energyTracker.snapshot(room.name);
        const income = Math.round(snap.income);
        const expense = Math.round(snap.expense);
        const spareIncome = income - expense;
        const trend = energyTracker.colonyTrend(room.name);

        // Single pass over myCreeps — gathers everything energyDiag needs.
        let upgraderCnt = 0, droneCnt = 0;
        let upgradeWork = 0, droneWork = 0;
        let totalBodyCost = 0;
        const statHarvesters = [];
        const remoteHarvesters = [];
        for (let i = 0; i < room.myCreeps.length; i++) {
            const c = room.myCreeps[i];
            const role = c.memory.role;
            totalBodyCost += global.UNIT_COST(c.body);
            if (role === 'upgrader') {
                upgraderCnt++;
                upgradeWork += c.getActiveBodyparts(WORK);
            } else if (role === 'drone' || role === 'waller') {
                droneCnt++;
                droneWork += c.getActiveBodyparts(WORK);
            } else if (role === 'stationaryHarvester') {
                statHarvesters.push(c);
            } else if (role === 'remoteHarvester' && c.memory.other && c.memory.other.haulingRequired) {
                remoteHarvesters.push(c);
            }
        }
        const upgradeExpense = Math.ceil(upgradeWork);
        const droneExpense = Math.ceil(droneWork);
        const spawnExpense = Math.ceil(totalBodyCost / CREEP_LIFE_TIME);

        // Upgrader duty cycle = avg actual upgrade energy / avg theoretical WORK, both over
        // the same 50-tick window so a recent body resize doesn't skew the ratio. < 1 means
        // the body was bigger than what the controller link could feed (or the upgrader was
        // idle for other reasons). Anti-waste scaling in bodyGenerator uses this.
        const upgraderDuty = roomSnap.upgradeWork > 0
            ? Math.min(1.0, roomSnap.upgrade / roomSnap.upgradeWork)
            : 1.0;

        room.memory.energyInfo = {income, expense, spareIncome, trend, upgraderDuty};

        room.memory.energyDiag = {
            statHarv: statHarvesters.length,
            remoteHarv: remoteHarvesters.length,
            upgraderCnt,
            upgradeExpense,
            droneCnt,
            droneExpense,
            spawnExpense,
            samples: snap.samples || 0,
        };

        const combatReadyEnergyState = room.level >= 7 ? 1 : 2;
        if (!room.memory.combatReady && room.energyState >= combatReadyEnergyState && room.level >= 4) room.memory.combatReady = true;
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