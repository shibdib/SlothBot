/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const energyTracker = require("module.energyTracker");
const {isLiveCombatReady, isLiveAuxReady, isRoomStruggling} = require('hcReadiness');
const {energyTarget, getColonyRole} = require('module.colonyProfile');
const LAST_UPDATE = {};
const ENERGY_TRACKER = {};


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
        const sinceReset = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
        if (global.isPostResetDangerWindow && global.isPostResetDangerWindow()) return;

        // Run every 10 ticks
        const lastRun = LAST_UPDATE.tick || 0;
        if (lastRun + 10 > Game.time) return;
        LAST_UPDATE.tick = Game.time;

        this.pruneEnergyTracker();
        const census = this.censusAllColonies();
        this.myRooms.forEach(roomName => this.roomTracking(roomName, census));
    }

    emptyCensus() {
        return {
            upgraderCnt: 0,
            droneCnt: 0,
            wallerCnt: 0,
            upgradeWork: 0,
            maintenanceWork: 0,
            economicBodyCost: 0,
            militaryBodyCost: 0,
            statHarvesters: [],
            remoteHarvesters: []
        };
    }

    // One pass over World.colonyCreeps + militaryCreeps instead of Game.creeps × owned rooms.
    censusAllColonies() {
        const byColony = Object.create(null);
        const acc = (c) => {
            if (!c || !c.my || !c.memory) return;
            const colony = c.memory.colony;
            if (!colony) return;
            let bucket = byColony[colony];
            if (!bucket) bucket = byColony[colony] = this.emptyCensus();
            const role = c.memory.role;
            const bodyCost = global.UNIT_COST(c.body);
            if (isMilitaryCreep(c)) bucket.militaryBodyCost += bodyCost;
            else bucket.economicBodyCost += bodyCost;
            if (role === 'upgrader') {
                bucket.upgraderCnt++;
                bucket.upgradeWork += c.getActiveBodyparts(WORK);
            } else if (role === 'drone') {
                bucket.droneCnt++;
                bucket.maintenanceWork += c.getActiveBodyparts(WORK);
            } else if (role === 'waller') {
                bucket.wallerCnt++;
                bucket.maintenanceWork += c.getActiveBodyparts(WORK);
            } else if (role === 'stationaryHarvester') {
                bucket.statHarvesters.push(c);
            } else if (role === 'remoteHarvester' && c.memory.other && c.memory.other.haulingRequired) {
                bucket.remoteHarvesters.push(c);
            }
        };

        const world = global.world;
        if (world && world.colonyCreeps) {
            for (const name in world.colonyCreeps) {
                const list = world.colonyCreeps[name];
                for (let i = 0; i < list.length; i++) acc(list[i]);
            }
        }
        if (world && world.militaryCreeps) {
            for (let i = 0; i < world.militaryCreeps.length; i++) acc(world.militaryCreeps[i]);
        }
        if (!world) {
            for (const name in Game.creeps) acc(Game.creeps[name]);
        }
        return byColony;
    }

    pruneEnergyTracker() {
        const alive = new Set(this.myRooms);
        for (const name in ENERGY_TRACKER) {
            if (!alive.has(name) || !Game.rooms[name]) delete ENERGY_TRACKER[name];
        }
    }

    roomTracking(roomName, census) {
        const room = Game.rooms[roomName];
        let controllerMy = false;
        try {
            controllerMy = !!(room && room.controller && room.controller.my);
        } catch (e) {
            controllerMy = false;
        }
        if (!room || !room.controller || !controllerMy) return;

        this.energyTracking(room, census && census[roomName]);
        this.levelingStatTracking(room);
        this.requestBuilders(room);
        this.funnelRequest(room);
    }

    energyTracking(room, counts) {
        // Spawn-fill latency tracker (used to request more haulers).
        if (room.energyCapacityAvailable > room.energyAvailable) {
            if (ENERGY_TRACKER[room.name]) ENERGY_TRACKER[room.name]++; else ENERGY_TRACKER[room.name] = 1;
        } else if (ENERGY_TRACKER[room.name] > 0) ENERGY_TRACKER[room.name]--;
        if (room.memory.needsHaulers !== undefined) room.memory.needsHaulers = undefined;

        // Authoritative income/expense from the event-log accumulator — covers the home
        // room plus visible remotes.
        const snap = energyTracker.colonySnapshot(room.name);
        const roomSnap = energyTracker.snapshot(room.name);
        const income = Math.round(snap.income);
        const trend = energyTracker.colonyTrend(room.name);

        // Pre-bucketed by censusAllColonies — no Game.creeps walk here.
        if (!counts) counts = this.emptyCensus();
        const {
            upgraderCnt, droneCnt, wallerCnt, upgradeWork, maintenanceWork,
            economicBodyCost, militaryBodyCost, statHarvesters, remoteHarvesters
        } = counts;
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
        const flowSpare = spareIncome + militarySpawnExpense;
        const flowStressed = flowSpare < 0 || trend < -2;

        // Upgrader duty cycle = avg actual upgrade energy / avg theoretical WORK, both over
        // the same 50-tick window so a recent body resize doesn't skew the ratio. < 1 means
        // the body was bigger than what the controller link could feed (or the upgrader was
        // idle for other reasons). Anti-waste scaling in bodyGenerator uses this.
        const upgraderDuty = roomSnap.upgradeWork > 0
            ? Math.min(1.0, roomSnap.upgrade / roomSnap.upgradeWork)
            : 1.0;

        room.energyInfo = {
            income, expense, spareIncome, flowSpare, trend, upgraderDuty, flowStressed, militarySpawnExpense,
        };

        room.energyDiag = {
            statHarv: statHarvesters.length,
            statHarvWork: _.sum(statHarvesters, c => c.getActiveBodyparts(WORK)) || 0,
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
        const combatReady = isLiveCombatReady(room);
        if (combatReady) {
            if (room.memory.combatReady !== true) room.memory.combatReady = true;
        } else if (room.memory.combatReady !== undefined) {
            room.memory.combatReady = undefined;
        }
        if (room.memory.combatReadyStress !== undefined) delete room.memory.combatReadyStress;

        const auxReady = isLiveAuxReady(room);
        if (auxReady) {
            if (room.memory.auxilaryReady !== true) room.memory.auxilaryReady = true;
        } else if (room.memory.auxilaryReady !== undefined) {
            room.memory.auxilaryReady = undefined;
        }

        const batteryEquiv = Math.floor((room.store(RESOURCE_BATTERY) / 50) * 600 * 0.9);
        const stockEnergy = room.rawEnergy + batteryEquiv;
        const stockTarget = energyTarget(room);

        Object.assign(room.energyDiag, {
            stockEnergy,
            stockTarget,
            stockpilePct: stockTarget > 0 ? Math.min(150, Math.round((stockEnergy / stockTarget) * 100)) : 0,
            liveCombatReady: combatReady,
            auxReady,
            struggling: isRoomStruggling(room),
            colonyRole: getColonyRole(room),
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
        const hasSpawn = room.spawns.find(s => {
            try {
                const mine = s.safeIsMy ? s.safeIsMy() : s.my;
                return mine && s.isActive();
            } catch (e) {
                return false;
            }
        });
        // `room.downgraded` is "any structure isActive() === false". An RCL 8→7
        // dip leaves nuker/observer/extra extensions inactive even though
        // nothing was destroyed and the room can still spawn — that is not a
        // rebuild. Empire drones only when there is no active spawn, or the
        // room is still a baby vs empire max.
        room.memory.buildersNeeded = !hasSpawn || (room.level < 3);
    }

    funnelRequest(room) {
        const requests = ensureAllyRequests();
        const isMarketHub = Memory._banker && Memory._banker.marketHub === room.name;
        if (isMarketHub && room.terminal && room.level < 8 && FUNNEL_REQUESTS) {
            let funnelRequests = requests.funnel ? requests.funnel : [];
            funnelRequests = funnelRequests.filter((r) => r.roomName !== room.name);
            const goalType = room.level === 6 ? 1 : room.level === 7 ? 2 : 0;
            funnelRequests.push({
                goalType: goalType,
                maxAmount: Math.min((room.controller.progressTotal - room.controller.progress) - room.energy, 200000),
                timeout: Game.time + CREEP_LIFE_TIME,
                roomName: room.name,
                terminal: true
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