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

        room.memory.energyPositive = average(energyIncomeArray) > 0;
        ROOM_ENERGY_INCOME_ARRAY[room.name] = energyIncomeArray;

        // Track if the room is filling extensions/spawns fast enough
        if (room.energyCapacityAvailable > room.energyAvailable) {
            if (ENERGY_TRACKER[room.name]) ENERGY_TRACKER[room.name]++; else ENERGY_TRACKER[room.name] = 1;
        } else if (ENERGY_TRACKER[room.name] > 0) ENERGY_TRACKER[room.name]--;
        room.memory.needsHaulers = ENERGY_TRACKER[room.name] > 10;
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

        // Set buildersNeeded flag only if one or both structures are missing
        const buildersNeeded = !(hasSpawn && hasTower);
        if (room.memory.buildersNeeded !== buildersNeeded) {
            room.memory.buildersNeeded = buildersNeeded;
        }
    }

    funnelRequest(room) {
        const requests = ALLY_HELP_REQUESTS[MY_USERNAME] ? ALLY_HELP_REQUESTS[MY_USERNAME].requests : {};
        if (room.terminal && room.level < 8) {
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
            if (funnelRequests) {
                funnelRequests = funnelRequests.filter((r) => r.roomName !== room.name);
                ALLY_HELP_REQUESTS[MY_USERNAME].requests.funnel = funnelRequests;
            }
        }
    }
}

profiler.registerClass(StateManager, 'StateManager');
module.exports = StateManager;