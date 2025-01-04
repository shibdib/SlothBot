/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const ObserverControl = require('module.observerController');
const LabControl = require('module.labController');
const FactoryControl = require('module.factoryController');
const defense = require('military.defense');
const LinkControl = require('module.linkController');
const TerminalControl = require('module.terminalController');
const spawning = require('module.creepSpawning');
const state = require('module.roomState');
const planner = require('module.roomPlanner');
const diplomacy = require('module.diplomacy');
const profiler = require('tools.profiler');
let tickTracker = {};

class Overlord {
    constructor(room, CPULimit) {
        const overlordStart = Game.cpu.getUsed();
        this.room = room;
        this.CPULimit = CPULimit;

        let tracker = tickTracker[this.room.name] || {};

        // Handle room creeps
        this.creepManager();

        // Handle creep spawning
        this.creepSpawningController();

        // Defense Controller
        this.defenseController();

        // Lab Controller
        this.labController();

        // Handle links if room level >= 5
        if (this.room.level >= 5) this.linkController();

        // Handle terminal with cooldown check
        if (this.room.terminal && !this.room.terminal.cooldown && (tracker['terminalController'] || 0) + 100 < Game.time) {
            this.terminalController();
            tracker['terminalController'] = Game.time;
        }

        // Handle room building with throttle
        if ((tracker['roomBuilding'] || 0) + 25 < Game.time) {
            this.constructionController();
            tracker['roomBuilding'] = Game.time;
        }

        // Observer controller for room level >= 8
        if (this.room.level >= 8) this.observerController();

        // Factory controller
        if (this.room.factory) this.factoryController();

        // State controller
        if ((tracker['stateController'] || 0) + 100 < Game.time) {
            this.stateController();
            tracker['stateController'] = Game.time;
        }

        // Store tick tracker and cpu usage data
        tickTracker[this.room.name] = tracker;
        this.storeCpuData(Game.cpu.getUsed() - overlordStart);
    }

    creepManager() {
        const roomCreeps = Object.values(Game.creeps).filter(creep => creep.memory.overlord === this.room.name && !creep.memory.military && !creep.spawning);

        for (const creep of roomCreeps) {
            try {
                minionController(creep);
            } catch (e) {
                this.handleCreepError(creep, e);
            }
        }
    }

    handleCreepError(creep, e) {
        errorCount[creep.name] = (errorCount[creep.name] || 0) + 1;

        if (errorCount[creep.name] >= 10) {
            log.e(`${creep.name} encountered repeated errors and has been terminated.`);
            log.e(e.stack);
            log.e(JSON.stringify(creep.memory));
            creep.suicide();
        } else if (errorCount[creep.name] === 1) {
            log.e(`${creep.name} encountered an error in room ${roomLink(creep.room.name)}`);
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }

    linkController() {
        new LinkControl().run(this.room);
    }

    labController() {
        new LabControl().run(this.room);
    }

    terminalController() {
        new TerminalControl().run(this.room);
    }

    constructionController() {
        planner.buildRoom(this.room);
    }

    observerController() {
        new ObserverControl().run(this.room);
    }

    factoryController() {
        new FactoryControl().run(this.room);
    }

    defenseController() {
        defense.controller(this.room);
    }

    stateController() {
        state.setRoomState(this.room);
    }

    creepSpawningController() {
        spawning.processBuildQueue(this.room);
        const spawnFunctions = [
            {name: 'essentialSpawning', f: spawning.essentialCreepQueue},
            {name: 'miscSpawning', f: spawning.miscCreepQueue},
            {name: 'remoteSpawning', f: spawning.remoteCreepQueue}
        ];

        for (const task of spawnFunctions) {
            try {
                task.f(this.room);
            } catch (e) {
                log.e(`${task.name} for room ${this.room.name} encountered an error`);
                log.e(e.stack);
                Game.notify(e.stack);
            }
        }
    }

    storeCpuData(used) {
        let cpuUsageArray = ROOM_CPU_ARRAY[this.room.name] || [];
        cpuUsageArray.push(used);

        if (cpuUsageArray.length > 100) cpuUsageArray.shift();

        // Only calculate average if needed
        if (cpuUsageArray.length === 100) {
            const avgCpu = average(cpuUsageArray) * 1.1;
            if (avgCpu > this.CPULimit) {
                let cpuOverCount = this.room.memory.cpuOverage || 0;
                this.room.memory.cpuOverage = cpuOverCount + 1;
                log.e(`${this.room.name} is using high CPU - ${avgCpu}`);

                if (cpuOverCount >= 100 && Game.cpu.bucket < BUCKET_MAX * 0.25) {
                    this.room.memory.cpuOverage = undefined;
                    this.room.memory.noRemote = Game.time + 5000;
                    //this.suicideRemoteCreeps();
                    log.e(`${roomLink(this.room.name)} remote spawning has been disabled.`);
                }
            } else {
                if (this.room.memory.cpuOverage) this.room.memory.cpuOverage--;
                if (this.room.memory.noRemote) this.handleNoRemote();
            }
        }

        ROOM_CPU_ARRAY[this.room.name] = cpuUsageArray;
    }

    suicideRemoteCreeps() {
        Object.values(Game.creeps)
            .filter(creep => creep.my && creep.memory.overlord === this.room.name && creep.room.name !== this.room.name && !creep.memory.military)
            .forEach(creep => creep.suicide());
    }

    handleNoRemote() {
        if (this.room.memory.noRemote <= Game.time) {
            this.room.memory.noRemote = undefined;
        } else {
            this.room.memory.noRemote *= 0.9;
        }
    }
}

profiler.registerClass(Overlord, 'Overlord');
module.exports = Overlord;

let errorCount = {};

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

    new Role(minion);
}
