/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const colony = require('main.colony');
const highCommand = require('module.highCommand');
const segments = require('module.segmentManager');
const power = require('module.powerManager');
const spawning = require('module.creepSpawning');
const ExpansionControl = require('module.expansion');
const diplomacy = require('module.diplomacy');
const HudControl = require('module.hud');
const StateManager = require('module.stateManager');
const profiler = require('tools.profiler');
const planner = require('module.roomPlanner');
let tickTracker = {};
let errorCount = {};

class World {
    constructor() {
        global.world = this;
        // Group creeps once per tick to save CPU
        this.militaryCreeps = [];
        this.colonyCreeps = {};
        for (const name in Game.creeps) {
            const creep = Game.creeps[name];
            if (creep.memory.military || !creep.memory.colony) {
                this.militaryCreeps.push(creep);
            } else {
                const colonyName = creep.memory.colony;
                if (!this.colonyCreeps[colonyName]) this.colonyCreeps[colonyName] = [];
                this.colonyCreeps[colonyName].push(creep);
            }
        }

        // General housekeeping
        this.houseKeeping();

        // Manage segments
        this.segmentManager();

        // Manage room states
        this.stateManager();

        // Manage rooms
        this.colonyManager();

        // Manage military creeps
        this.militaryCreepManager();

        // Manage Power Creeps
        this.powerCreepManager();

        // Update HUD
        this.hudManager();

        // Handle room building
        this.constructionController();

        // Global Queue (Every 10 Ticks)
        if ((tickTracker['globalQueue'] || 0) + 10 < Game.time) {
            this.globalQueue();
            tickTracker['globalQueue'] = Game.time;
        }

        // High Command
        this.highCommand();

        // Expansion Manager
        if ((tickTracker['expansionManager'] || 0) + 1000 < Game.time) {
            this.expansionManager();
            tickTracker['expansionManager'] = Game.time;
        }
    }

    houseKeeping() {
        // Timing
        Memory.tickCooldowns = undefined;

        // Silence Alerts (Every 2500 Ticks)
        if (Game.time % 2500 === 0) {
            const structures = Object.values(Game.structures);
            structures.forEach((building) => building.notifyWhenAttacked(false));
        }

        // Track mined minerals
        if (MY_MINERALS.roomCount !== MY_ROOMS.length || Game.time % 20 === 0) {
            MY_ROOMS.forEach(function (r) {
                if (Game.rooms[r].level >= 6) {
                    const mineral = Game.rooms[r].mineral;
                    if (!MY_MINERALS[mineral.mineralType]) {
                        MY_MINERALS[mineral.mineralType] = true;
                    }
                }
            })
            MY_MINERALS.roomCount = MY_ROOMS.length;
        }

        // Diplomacy Manager
        diplomacy.diplomacyManager();
    }

    hudManager() {
        new HudControl().run();
    }

    stateManager() {
        new StateManager().run();
    }

    highCommand() {
        highCommand.highCommand();
    }

    constructionController() {
        planner.buildRoom();
    }

    expansionManager() {
        new ExpansionControl().run();
    }

    globalQueue() {
        spawning.globalCreepQueue();
    }

    powerCreepManager() {
        power.powerControl();
    }

    segmentManager() {
        segments.init();
    }

    militaryCreepManager() {
        const creeps = shuffle(this.militaryCreeps);

        for (const creep of creeps) {
            try {
                minionController(creep);
            } catch (e) {
                this.handleCreepError(creep, e);
            }
        }
    }

    colonyManager() {
        const rooms = shuffle([...MY_ROOMS]); // Cache rooms to avoid global lookups

        for (const roomName of rooms) {
            const room = Game.rooms[roomName];
            if (!room) {
                global.MY_ROOMS = global.MY_ROOMS.filter((r) => r !== roomName);
                continue;
            }

            try {
                room.invaderCheck();
                room.cacheRoomIntel();
                new colony(room, this.colonyCreeps[roomName] || []);
            } catch (e) {
                log.e(`Colony Module experienced an error in room ${roomLink(roomName)}`);
                log.e(e.stack);
                Game.notify(e.stack);
            }
        }
    }

    handleCreepError(creep, error) {
        if (!errorCount[creep.name]) {
            errorCount[creep.name] = 1;
            log.e(`${creep.name} encountered an error in room ${roomLink(creep.room.name)}`);
            log.e(error);
            log.e(error.stack);
            Game.notify(`${error}\n${error.stack}`);
        } else {
            errorCount[creep.name]++;
        }

        if (errorCount[creep.name] >= 50) {
            log.e(`${creep.name} encountered repeated errors and has been terminated.`);
            log.e(error.stack);
            creep.suicide();
        }
    }
}

profiler.registerClass(World, 'World');
module.exports = World;

function minionController(minion) {
    // Disable notifications
    if (!minion.memory.notifyDisabled) {
        minion.notifyWhenAttacked(false);
        minion.memory.notifyDisabled = true;
    }
    // Handle idle
    if (minion.idle) {
        return;
    }
    // Track Threat
    diplomacy.trackThreat(minion);
    // Handle edge cases
    if (minion.memory.fleeNukeTime && minion.fleeNukeRoom()) {
        return;
    }
    // Border
    minion.borderCheck();
    // Report intel if outside MY_ROOMS — skip if micro-update is still fresh
    if (!MY_ROOMS.includes(minion.room.name)) {
        const _ri = INTEL[minion.room.name];
        if (!_ri || _ri.microUpdate + 150 < Game.time || !_ri.cached) {
            minion.room.invaderCheck();
            minion.room.cacheRoomIntel(false, minion);
        }
    }
    // Run role
    if (!minion.memory.role) return minion.suicide();

    // If being recycled do that
    if (minion.memory.recycling) return minion.recycleCreep();

    // Check if the role is cached
    let Role;
    if (ROLE_CACHE[minion.memory.role]) {
        Role = ROLE_CACHE[minion.memory.role];
    } else {
        // Load the role and cache it
        Role = require('role.' + minion.memory.role);
        ROLE_CACHE[minion.memory.role] = Role;
    }

    new Role(minion);
}