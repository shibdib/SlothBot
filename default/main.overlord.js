/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const observers = require('module.observerController');
const factory = require('module.factoryController');
const defense = require('military.defense');
const links = require('module.linkController');
const terminals = require('module.terminalController');
const spawning = require('module.creepSpawning');
const state = require('module.roomState');
const planner = require('module.roomPlanner');
const diplomacy = require('module.diplomacy');
const profiler = require('tools.profiler');
let tickTracker = {};

class Overlord {
    constructor(room, CPULimit) {
        let overlordStart = Game.cpu.getUsed();
        this.room = room;
        this.CPULimit = CPULimit;
        // Set tick tracker
        let tracker = {};
        if (tickTracker[this.room.name]) tracker = tickTracker[this.room.name];
        // Handle room creeps
        this.creepManager();
        // Handle creep spawning
        this.creepSpawningController();
        // Defense Controller
        this.defenseController();
        // Handle links
        if (this.room.level >= 5) this.linkController();
        // Handle terminal
        if (this.room.terminal && !this.room.terminal.cooldown && (tracker['terminalController'] || 0) + 100 < Game.time) {
            this.terminalController();
            tracker['terminalController'] = Game.time;
        }
        // Handle room building
        if ((tracker['roomBuilding'] || 0) + 25 < Game.time) {
            this.constructionController();
            tracker['roomBuilding'] = Game.time;
        }
        // Observer controller
        if (this.room.level >= 8) this.observerController();
        // Factory controller
        if (this.room.factory) this.factoryController();
        // State controller
        if ((tracker['stateController'] || 0) + 100 < Game.time) {
            this.stateController();
            tracker['stateController'] = Game.time;
        }
        // Store tick tracker
        tickTracker[this.room.name] = tracker;
        // Store cpu usage
        this.storeCpuData(Game.cpu.getUsed() - overlordStart)
    }

    creepManager() {
        let roomCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.overlord === this.room.name && !r.memory.military && !r.spawning));
        for (let creep of roomCreeps) {
            try {
                minionController(creep);
            } catch (e) {
                if (!errorCount[creep.name]) {
                    errorCount[creep.name] = 1;
                    log.e(creep.name + ' experienced an error in room ' + roomLink(creep.room.name));
                    log.e(e);
                    log.e(e.stack);
                    Game.notify(e);
                    Game.notify(e.stack);
                } else errorCount[creep.name] += 1;
                if (errorCount[creep.name] >= 50) {
                    log.e(e);
                    log.e(e.stack);
                    log.e(creep.name + ' experienced an error in room ' + roomLink(creep.room.name) + ' and has been killed.');
                    creep.suicide();
                }
            }
        }
    }

    linkController() {
        links.linkControl(this.room);
    }

    terminalController() {
        terminals.terminalControl(this.room);
    }

    constructionController() {
        planner.buildRoom(this.room);
    }

    observerController() {
        observers.observerControl(this.room);
    }

    factoryController() {
        factory.factoryControl(this.room);
    }

    defenseController() {
        defense.controller(this.room);
    }

    stateController() {
        state.setRoomState(this.room);
    }

    creepSpawningController() {
        spawning.processBuildQueue(this.room);
        let spawnFunctions = [{name: 'essentialSpawning', f: spawning.essentialCreepQueue},
            {name: 'miscSpawning', f: spawning.miscCreepQueue},
            {name: 'remoteSpawning', f: spawning.remoteCreepQueue}];
        try {
            for (let task of spawnFunctions) {
                task.f(this.room);
            }
        } catch (e) {
            log.e(spawnFunctions[0].name + ' for room ' + this.room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }

    storeCpuData(used) {
        let cpuUsageArray = ROOM_CPU_ARRAY[this.room.name] || [];
        if (cpuUsageArray.length < 100) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
            if (average(cpuUsageArray) > this.CPULimit) {
                let cpuOverCount = this.room.memory.cpuOverage || 0;
                this.room.memory.cpuOverage = cpuOverCount + 1;
                log.e(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
                if (cpuOverCount >= 50) {
                    this.room.memory.cpuOverage = undefined;
                    this.room.memory.noRemote = Game.time + 5000;
                    _.filter(Game.creeps, (c) => c.my && c.memory.overlord === room.name && c.room.name !== room.name && !c.memory.military).forEach((k) => k.suicide());
                    //Game.notify(room.name + ' remote spawning has been disabled.');
                    log.e(roomLink(room.name) + ' remote spawning has been disabled.');
                }
            } else {
                if (this.room.memory.cpuOverage) this.room.memory.cpuOverage--;
                if (this.room.memory.noRemote) {
                    if (this.room.memory.noRemote <= Game.time) this.room.memory.noRemote = undefined;
                    else this.room.memory.noRemote *= 0.9;
                }
            }
        }
        ROOM_CPU_ARRAY[this.room.name] = cpuUsageArray;
    }
}

profiler.registerClass(Overlord, 'Overlord');
module.exports = Overlord;

let errorCount = {};
// Global cache for roles
const ROLE_CACHE = {};

function minionController(minion) {
    // Disable notifications if not already disabled
    if (!minion.memory.notifyDisabled) {
        minion.notifyWhenAttacked(false);
        minion.memory.notifyDisabled = true;
    }

    // Return if idle
    if (minion.idle) return;

    // Track Threat
    diplomacy.trackThreat(minion);

    // Combat Actions
    minion.attackInRange();
    minion.healInRange();

    // Handle edge cases (border or nuke flee)
    if (minion.borderCheck() || (minion.memory.fleeNukeTime && minion.fleeNukeRoom())) {
        return;
    }

    // Report intel if outside MY_ROOMS
    if (!MY_ROOMS.includes(minion.room.name)) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel(false, minion);
    }

    // If no role, the minion should suicide
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

    // Handle converted roles
    if (['drone', 'hauler', 'shuttle', 'roadBuilder'].includes(minion.memory.role)) {
        new Role(minion);
    } else {
        Role.role(minion);
    }
}
