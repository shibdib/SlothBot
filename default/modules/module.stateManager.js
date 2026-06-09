/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const energyTracker = require("module.energyTracker");
const LAST_UPDATE = {};
const ENERGY_TRACKER = {};

function ensureAllyRequests() {
    if (!ALLY_HELP_REQUESTS[MY_USERNAME]) ALLY_HELP_REQUESTS[MY_USERNAME] = {requests: {}};
    if (!ALLY_HELP_REQUESTS[MY_USERNAME].requests) ALLY_HELP_REQUESTS[MY_USERNAME].requests = {};
    return ALLY_HELP_REQUESTS[MY_USERNAME].requests;
}

class StateManager {
    constructor() {
        this.myRooms = MY_ROOMS;
    }

    run() {
        // Run every 10 ticks
        const lastRun = LAST_UPDATE.tick || 0;
        if (lastRun + 10 > Game.time) return;
        LAST_UPDATE.tick = Game.time;

        this.pruneEnergyTracker();
        this.myRooms.forEach(roomName => this.roomTracking(roomName));
    }

    pruneEnergyTracker() {
        const alive = new Set(this.myRooms);
        for (const name in ENERGY_TRACKER) {
            if (!alive.has(name) || !Game.rooms[name]) delete ENERGY_TRACKER[name];
        }
    }

    roomTracking(roomName) {
        const room = Game.rooms[roomName];
        if (!room || !room.controller || !room.controller.my) return;

        this.energyTracking(room);
        this.levelingStatTracking(room);
        this.requestBuilders(room);
        this.funnelRequest(room);
    }

    energyTracking(room) {
        // Spawn-fill latency tracker (used to request more haulers).
        if (room.energyCapacityAvailable > room.energyAvailable) {
            if (ENERGY_TRACKER[room.name]) ENERGY_TRACKER[room.name]++; else ENERGY_TRACKER[room.name] = 1;
        } else if (ENERGY_TRACKER[room.name] > 0) ENERGY_TRACKER[room.name]--;
        room.memory.needsHaulers = undefined;

        // Authoritative income/expense from the event-log accumulator — covers the home
        // room plus visible remotes.
        const snap = energyTracker.colonySnapshot(room.name);
        const roomSnap = energyTracker.snapshot(room.name);
        const income = Math.round(snap.income);
        const trend = energyTracker.colonyTrend(room.name);

        // Colony-wide creep scan — spawnExpense must include remotes assigned to this room.
        let upgraderCnt = 0, droneCnt = 0, wallerCnt = 0;
        let upgradeWork = 0, maintenanceWork = 0;
        let totalBodyCost = 0;
        const statHarvesters = [];
        const remoteHarvesters = [];
        for (const creepName in Game.creeps) {
            const c = Game.creeps[creepName];
            if (!c.my || c.memory.colony !== room.name) continue;
            const role = c.memory.role;
            totalBodyCost += global.UNIT_COST(c.body);
            if (role === 'upgrader') {
                upgraderCnt++;
                upgradeWork += c.getActiveBodyparts(WORK);
            } else if (role === 'drone') {
                droneCnt++;
                maintenanceWork += c.getActiveBodyparts(WORK);
            } else if (role === 'waller') {
                wallerCnt++;
                maintenanceWork += c.getActiveBodyparts(WORK);
            } else if (role === 'stationaryHarvester') {
                statHarvesters.push(c);
            } else if (role === 'remoteHarvester' && c.memory.other && c.memory.other.haulingRequired) {
                remoteHarvesters.push(c);
            }
        }
        const upgradeExpense = Math.ceil(upgradeWork);
        const maintenanceExpense = Math.ceil(maintenanceWork);
        const spawnExpense = Math.ceil(totalBodyCost / CREEP_LIFE_TIME);
        const expense = Math.round(snap.expense) + spawnExpense;
        const spareIncome = income - expense;

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
            wallerCnt,
            maintenanceExpense,
            spawnExpense,
            samples: snap.samples || 0,
        };

        // Read energyState once — getter may enqueue ally energy requests.
        const energyState = room.energyState;
        const flowStressed = spareIncome < 0 || trend < -3;

        if (!room.memory.combatReady && energyState >= 1 && room.level === 8 && !flowStressed) room.memory.combatReady = true;
        else if (!room.memory.combatReady && energyState >= 2 && room.level >= 4 && !flowStressed) room.memory.combatReady = true;
        else if (room.memory.combatReady && (!energyState || flowStressed)) room.memory.combatReady = undefined;

        if (!room.memory.auxilaryReady && energyState >= 1 && room.level >= 4) room.memory.auxilaryReady = true;
        else if (room.memory.auxilaryReady && !energyState) room.memory.auxilaryReady = undefined;
    }

    levelingStatTracking(room) {
        let stats = room.memory.stats || {};
        stats.levelInfo = stats.levelInfo || {};
        stats.levelInfo[room.controller.level] = stats.levelInfo[room.controller.level] || Game.time;

        stats.highestRCL = Math.max(stats.highestRCL || 0, room.controller.level);

        room.memory.stats = stats;
    }

    requestBuilders(room) {
        const hasSpawn = room.spawns.find(s => s.isActive() && s.my);
        room.memory.buildersNeeded = !hasSpawn || room.downgraded;
    }

    funnelRequest(room) {
        const requests = ensureAllyRequests();
        if (room.terminal && room.level < 8 && FUNNEL_REQUESTS) {
            let funnelRequests = requests.funnel ? requests.funnel : [];
            funnelRequests = funnelRequests.filter((r) => r.roomName !== room.name);
            const goalType = room.level === 6 ? 1 : room.level === 7 ? 2 : 0;
            funnelRequests.push({
                goalType: goalType,
                maxAmount: Math.min((room.controller.progressTotal - room.controller.progress) - room.energy, 200000),
                timeout: Game.time + CREEP_LIFE_TIME,
                roomName: room.name
            });
            requests.funnel = funnelRequests;
        } else {
            let funnelRequests = requests.funnel ? requests.funnel : [];
            if (funnelRequests.length) {
                requests.funnel = funnelRequests.filter((r) => r.roomName !== room.name);
            }
        }
    }
}

profiler.registerClass(StateManager, 'StateManager');
module.exports = StateManager;
