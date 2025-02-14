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
const profiler = require('tools.profiler');
const planner = require('module.roomPlanner');
let buildingNotifications;
let tickTracker = {};

class World {
    constructor() {
        // General housekeeping
        this.houseKeeping();

        // Manage segments
        this.segmentManager();

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
            buildingNotifications = true;
            const structures = Object.values(Game.structures);
            structures.forEach((building) => building.notifyWhenAttacked(false));
        }

        // Track mined minerals
        if (!_.size(MY_MINERALS) || MY_MINERALS.roomCount !== MY_ROOMS.length || Math.random() > 0.95) {
            MY_ROOMS.forEach(function (r) {
                if (Game.rooms[r].level >= 6) {
                    const mineral = Game.rooms[r].mineral;
                    if (!mineral.ticksToRegeneration && !MY_MINERALS[mineral.mineralType]) {
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
        const creeps = shuffle(Object.values(Game.creeps).filter((creep) =>
            (creep.memory.military || !creep.memory.colony)
        ));

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
                const roomLimit = (CPU_TASK_LIMITS['roomLimit'] * 0.9) / MY_ROOMS.length;
                new colony(room, roomLimit);
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

let errorCount = {};

function minionController(minion) {
    // Disable notifications
    if (!minion.memory.notifyDisabled) {
        minion.notifyWhenAttacked(false);
        minion.memory.notifyDisabled = true;
    }
    // Handle idle
    if (minion.idle) {
        minion.attackInRange();
        minion.healInRange();
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
    // Report intel chance
    if (!MY_ROOMS.includes(minion.room.name)) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel(false, minion);
    }
    // Run role
    if (!minion.memory.role) return minion.suicide();

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
