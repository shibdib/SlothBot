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

        // Check last state change
        if (!room.memory.stateInformation) room.memory.stateInformation = {};
        const stateInformation = room.memory.stateInformation;
        const lastStateChange = stateInformation.lastChange || 0;
        const currentState = stateInformation.roomState || 'unset';

        // If we're under attack, set state to defending regardless of cooldown
        if (room.memory.dangerousAttack) {
            stateInformation.roomState = ROOM_STATES.DEFENDING;
            stateInformation.lastChange = Game.time;
            return room.memory.stateInformation = stateInformation;
        }

        // If we have important things to build, building state. Otherwise, default to stockpiling.
        const importantBuilds = _.some(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
        if (importantBuilds) {
            if (currentState !== ROOM_STATES.BUILDING) {
                stateInformation.roomState = ROOM_STATES.BUILDING;
                stateInformation.lastChange = Game.time;
            }
            return room.memory.stateInformation = stateInformation;
        } else if (!importantBuilds && currentState === ROOM_STATES.BUILDING) {
            stateInformation.roomState = ROOM_STATES.UNSET;
            stateInformation.lastChange = 0;
            return room.memory.stateInformation = stateInformation;
        }

        // Check if we're in cooldown period and not unset
        if (lastStateChange + STATE_COOLDOWN > Game.time && currentState !== ROOM_STATES.UNSET) return;

        // If we have no energy, set state to stockpiling
        if (!room.energyState) {
            stateInformation.roomState = ROOM_STATES.STOCKPILING;
            stateInformation.lastChange = Game.time;
            return room.memory.stateInformation = stateInformation;
        }

        // If we're rich and not attacking, upgrade
        if (room.energyState && room.level < 8) {
            stateInformation.roomState = ROOM_STATES.UPGRADING;
            stateInformation.lastChange = Game.time;
            return room.memory.stateInformation = stateInformation;
        }

        if (room.level === 8 && room.energyState > 2) {
            stateInformation.roomState = ROOM_STATES.IDLE;
            stateInformation.lastChange = Game.time;
            return room.memory.stateInformation = stateInformation;
        }

        // Default to stockpiling
        stateInformation.roomState = ROOM_STATES.STOCKPILING;
        stateInformation.lastChange = Game.time;
        return room.memory.stateInformation = stateInformation;
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
}

profiler.registerClass(StateManager, 'StateManager');
module.exports = StateManager;