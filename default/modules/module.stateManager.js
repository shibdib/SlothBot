/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const energyTracker = require("module.energyTracker");
const {isLiveCombatReady, isRoomStruggling} = require('hcReadiness');
const LAST_UPDATE = {};
const ENERGY_TRACKER = {};
const COMBAT_READY_STRESS_CLEAR = 40;

function ensureAllyRequests() {
    if (!ALLY_HELP_REQUESTS[MY_USERNAME]) ALLY_HELP_REQUESTS[MY_USERNAME] = {requests: {}};
    if (!ALLY_HELP_REQUESTS[MY_USERNAME].requests) ALLY_HELP_REQUESTS[MY_USERNAME].requests = {};
    return ALLY_HELP_REQUESTS[MY_USERNAME].requests;
}

function isMilitaryCreep(creep) {
    return !!(creep.memory.military || (typeof COMBAT_ROLES !== 'undefined' && COMBAT_ROLES.includes(creep.memory.role)));
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

        // Colony-wide creep scan — spawnExpense counts economic creeps only; military
        // amortization is tracked separately and excluded from flow stress.
        let upgraderCnt = 0, droneCnt = 0, wallerCnt = 0;
        let upgradeWork = 0, maintenanceWork = 0;
        let economicBodyCost = 0;
        let militaryBodyCost = 0;
        const statHarvesters = [];
        const remoteHarvesters = [];
        for (const creepName in Game.creeps) {
            const c = Game.creeps[creepName];
            if (!c.my || c.memory.colony !== room.name) continue;
            const role = c.memory.role;
            const bodyCost = global.UNIT_COST(c.body);
            if (isMilitaryCreep(c)) militaryBodyCost += bodyCost;
            else economicBodyCost += bodyCost;
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
        const spawnExpense = Math.ceil(economicBodyCost / CREEP_LIFE_TIME);
        const militarySpawnExpense = Math.ceil(militaryBodyCost / CREEP_LIFE_TIME);
        // Add previously untracked sinks:
        // - terminal export (sends for balancing + tx fees for deals/sells/buys)
        // - renewal energy (spawn.renewCreep to extend economy creep life)
        // These are real ongoing expenses not fully in event log.
        const termExp = global.prevTickTerminalEnergyExpense ? (global.prevTickTerminalEnergyExpense[room.name] || 0) : 0;
        const renewalExp = global.prevTickRenewalEnergyExpense ? (global.prevTickRenewalEnergyExpense[room.name] || 0) : 0;
        const nukeExp = global.prevTickNukeEnergyExpense ? (global.prevTickNukeEnergyExpense[room.name] || 0) : 0;
        const factoryExp = global.prevTickFactoryEnergyExpense ? (global.prevTickFactoryEnergyExpense[room.name] || 0) : 0;
        const expense = Math.round(snap.expense) + spawnExpense + termExp + renewalExp + nukeExp + factoryExp;
        const spareIncome = income - expense;
        const flowStressed = spareIncome < 0 || trend < -3;

        // Upgrader duty cycle = avg actual upgrade energy / avg theoretical WORK, both over
        // the same 50-tick window so a recent body resize doesn't skew the ratio. < 1 means
        // the body was bigger than what the controller link could feed (or the upgrader was
        // idle for other reasons). Anti-waste scaling in bodyGenerator uses this.
        const upgraderDuty = roomSnap.upgradeWork > 0
            ? Math.min(1.0, roomSnap.upgrade / roomSnap.upgradeWork)
            : 1.0;

        room.memory.energyInfo = {income, expense, spareIncome, trend, upgraderDuty, flowStressed};

        room.memory.energyDiag = {
            statHarv: statHarvesters.length,
            remoteHarv: remoteHarvesters.length,
            upgraderCnt,
            upgradeExpense,
            droneCnt,
            wallerCnt,
            maintenanceExpense,
            spawnExpense,
            renewalExpense: renewalExp,
            nukeExpense: nukeExp,
            factoryExpense: factoryExp,
            militarySpawnExpense,
            samples: snap.samples || 0,
        };

        // Read energyState once — getter may enqueue ally energy requests.
        const energyState = room.energyState;
        // For RCL8, combatReady is gated primarily on !flowStressed (good net income/trend) rather than
        // strict bulk energyState, because a healthy high-level room should be able to participate in ops
        // as long as income is positive (sustained by remotes etc.). This prevents the stockpiling
        // threshold from blocking combatReady. Lower levels still require higher energyState buffer.
        const canGainCombatReady = !flowStressed &&
            (room.level === 8 || (energyState >= 2 && room.level >= 4 && room.level < 8));
        const wouldLoseCombatReady = room.memory.combatReady && flowStressed;  // RCL8 doesn't lose just from low energyState if income ok

        if (!room.memory.combatReady && canGainCombatReady) {
            room.memory.combatReady = true;
            room.memory.combatReadyStress = 0;
        } else if (wouldLoseCombatReady) {
            room.memory.combatReadyStress = (room.memory.combatReadyStress || 0) + 10;
            if (room.memory.combatReadyStress >= COMBAT_READY_STRESS_CLEAR) {
                room.memory.combatReady = undefined;
                room.memory.combatReadyStress = undefined;
            }
        } else if (room.memory.combatReady) {
            room.memory.combatReadyStress = Math.max(0, (room.memory.combatReadyStress || 0) - 10);
        }

        if (!room.memory.auxilaryReady && (room.level === 8 || energyState >= 1) && room.level >= 4) room.memory.auxilaryReady = true;
        else if (room.memory.auxilaryReady && room.level !== 8 && !energyState) room.memory.auxilaryReady = undefined;

        const batteryEquiv = Math.floor((room.store(RESOURCE_BATTERY) / 50) * 600 * 0.9);
        const stockEnergy = room.rawEnergy + batteryEquiv;
        const upgradeCost = room.level === 8 ? 500000
            : constructionCost(room.controller.level + 1) - constructionCost(room.controller.level);
        const progressFraction = room.controller.progress / room.controller.progressTotal;
        const stockTarget = room.level === 8 ? 500000
            : Math.max(room.level * 31250, Math.min(Math.round(upgradeCost * progressFraction) * 0.7, STORAGE_CAPACITY * 0.5));

        Object.assign(room.memory.energyDiag, {
            stockEnergy,
            stockTarget,
            stockpilePct: stockTarget > 0 ? Math.min(150, Math.round((stockEnergy / stockTarget) * 100)) : 0,
            liveCombatReady: isLiveCombatReady(room),
            auxReady: !!(room.memory.auxilaryReady && energyState >= 1),
            struggling: isRoomStruggling(room),
            combatReadyStress: room.memory.combatReadyStress || 0,
        });
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
        room.memory.buildersNeeded = !hasSpawn || room.downgraded || (room.level < MAX_LEVEL * 0.5);
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