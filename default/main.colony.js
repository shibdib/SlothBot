/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const ObserverControl = require('module.observerController');
const LabControl = require('module.labController');
const FactoryControl = require('module.factoryController');
const DefenseControl = require('module.defense');
const LinkControl = require('module.linkController');
const TerminalControl = require('module.terminalController');
const spawning = require('module.creepSpawning');
const diplomacy = require('module.diplomacy');
const profiler = require('tools.profiler');

class Colony {
    constructor(room) {
        const worldStart = Game.cpu.getUsed();
        this.room = room;

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

        // Handle terminal
        this.terminalController();

        // Observer controller for room level >= 8
        if (this.room.level >= 8) this.observerController();

        // Factory controller
        if (this.room.factory) this.factoryController();

        // Store tick tracker and cpu usage data
        this.storeCpuData(Game.cpu.getUsed() - worldStart);
    }

    creepManager() {
        const roomCreeps = shuffle(Object.values(Game.creeps).filter(creep => creep.memory.colony === this.room.name && !creep.memory.military));
        for (const creep of roomCreeps) {
            try {
                this.minionController(creep);
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
            //creep.recycleCreep();
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
        new LabControl(this.room).run(this.room);
    }

    terminalController() {
        new TerminalControl(this.room).run();
    }

    observerController() {
        new ObserverControl().run(this.room);
    }

    factoryController() {
        new FactoryControl().run(this.room);
    }

    defenseController() {
        new DefenseControl(this.room).run();
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

        if (cpuUsageArray.length > 25) cpuUsageArray.shift();

        if (cpuUsageArray.length === 25) {
            const avgCpu = average(cpuUsageArray);
            let roomCount = MY_ROOMS.length;
            // If we're RCL8 and have energy, make this more likely
            if (this.room.level === 8 && this.room.energyState) roomCount *= 1.5
            const roomCpuTarget = (Game.cpu.limit * 0.95) / roomCount
            if (avgCpu > roomCpuTarget) {
                let cpuOverCount = this.room.memory.cpuOverage || 0;
                this.room.memory.cpuOverage = cpuOverCount + 1;
                if (cpuOverCount >= 25 && Game.cpu.bucket < BUCKET_MAX * 0.25) {
                    this.room.memory.cpuOverage = undefined;
                    this.room.memory.noRemote = Game.time + (CREEP_LIFE_TIME * 3);
                    this.suicideRemoteCreeps();
                    log.e(`${roomLink(this.room.name)} remote spawning has been disabled to conserve CPU.`, 'ROOM MANAGER:');
                    cpuUsageArray = [];
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
            .filter(creep => creep.my && creep.memory.colony === this.room.name && (creep.memory.role.includes('remote') || creep.memory.role.includes('SK')))
            .forEach(creep => creep.suicide());
    }

    handleNoRemote() {
        if (this.room.memory.noRemote <= Game.time) {
            // If we still have energy.. keep it rocking
            if (this.room.energyState) {
                this.room.memory.noRemote = Game.time + (CREEP_LIFE_TIME * 3);
            } else {
                this.room.memory.noRemote = undefined;
            }
        }
    }

    minionController(minion) {
        // Disable notifications if not already disabled
        if (!minion.memory.notifyDisabled) {
            minion.notifyWhenAttacked(false);
            minion.memory.notifyDisabled = true;
        }

        if (minion.towTruck()) return;

        // Return if idle
        if (minion.idle) return;

        // Track Threat
        diplomacy.trackThreat(minion);

        // Handle edge cases (border or nuke flee)
        if (minion.memory.fleeNukeTime && minion.fleeNukeRoom()) {
            return;
        }

        // Border
        minion.borderCheck();

        // Report intel if outside MY_ROOMS
        if (!MY_ROOMS.includes(minion.room.name)) {
            minion.room.invaderCheck();
            minion.room.cacheRoomIntel(false, minion);
        }

        // If no role, the minion should suicide
        if (!minion.memory.role) return minion.recycleCreep();

        // If we're fleeing, continue to do so
        if (minion.memory.runCooldown && Game.time < minion.memory.runCooldown) return minion.fleeHome(true);

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
}

profiler.registerClass(Colony, 'Colony');
module.exports = Colony;

let errorCount = {};
