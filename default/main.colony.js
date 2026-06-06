/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const ObserverControl = require('module.observerController');
const LabManager = require('module.labController');
const FactoryControl = require('module.factoryController');
const DefenseControl = require('module.defense');
const LinkControl = require('module.linkController');
const TerminalControl = require('module.terminalController');
const spawning = require('module.creepSpawning');
const DiplomacyControl = require('module.diplomacy');
const profiler = require('tools.profiler');

let errorCount = {};

class Colony {
    constructor(room, creeps = []) {
        const worldStart = Game.cpu.getUsed();
        this.room = room;
        this.creeps = creeps;

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
        if (this.room.level >= 8) {
            const since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
            if (since > 10 || ((this.room.name.charCodeAt(1) || 0) % 3 === since % 3)) {
                this.observerController();
            }
        }

        // Factory controller
        if (this.room.factory) {
            const since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
            if (since > 15 || ((this.room.name.charCodeAt(3) || 0) % 2 === since % 2)) {
                this.factoryController(); // defer a couple ticks on reset
            }
        }

        // Store tick tracker and cpu usage data
        this.storeCpuData(Game.cpu.getUsed() - worldStart);
    }

    creepManager() {
        const roomCreeps = shuffle(this.creeps);
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
            creep.suicide();
        } else if (errorCount[creep.name] === 1) {
            log.a(`${creep.name} encountered an error in room ${roomLink(creep.room.name)}`);
            log.a(e.stack);
            Game.notify(e.stack);
        }
    }

    linkController() {
        new LinkControl().run(this.room);
    }

    labController() {
        new LabManager(this.room).run(this.room);
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
                if (cpuOverCount >= 80 && Game.cpu.bucket < BUCKET_MAX * 0.15) {
                    this.room.memory.cpuOverage = undefined;
                    this.room.memory.noRemote = Game.time + CREEP_LIFE_TIME;
                    this.suicideRemoteCreeps();
                    log.a(`${roomLink(this.room.name)} remotes disabled (severe CPU + low bucket).`, 'ROOM MANAGER:');
                    cpuUsageArray = [];
                } else if (cpuOverCount >= 40 && Game.cpu.bucket < BUCKET_MAX * 0.25) {
                    this.room.memory.cpuOverage = undefined;
                    this.room.memory.remotePenalty = Game.time + 500;
                    log.a(`${roomLink(this.room.name)} remote spawning penalized to conserve CPU.`, 'ROOM MANAGER:');
                    cpuUsageArray = [];
                }
            } else {
                if (this.room.memory.cpuOverage) this.room.memory.cpuOverage--;
                if (this.room.memory.noRemote || this.room.memory.remotePenalty) this.handleNoRemote();
            }
        }

        ROOM_CPU_ARRAY[this.room.name] = cpuUsageArray;
    }

    suicideRemoteCreeps() {
        this.creeps
            .filter(creep => creep.memory.role.includes('remote') || creep.memory.role.includes('SK'))
            .forEach(creep => creep.suicide());
    }

    handleNoRemote() {
        if (this.room.memory.noRemote && this.room.memory.noRemote <= Game.time) {
            if (this.room.energyState > 1) {
                log.a(`${roomLink(this.room.name)} is remaining No Remote as it has energy.`, 'ROOM MANAGER:');
                this.room.memory.noRemote = Game.time + CREEP_LIFE_TIME;
            } else {
                log.a(`${roomLink(this.room.name)} has re-enabled remote spawning.`, 'ROOM MANAGER:');
                this.room.memory.noRemote = undefined;
            }
        }
        if (this.room.memory.remotePenalty && this.room.memory.remotePenalty <= Game.time) {
            if (this.room.energyState > 1) {
                this.room.memory.remotePenalty = Game.time + 500;
            } else {
                this.room.memory.remotePenalty = undefined;
            }
        }
    }

    minionController(minion) {
        // Disable notifications if not already disabled
        if (minion.ticksToLive < 1499 && !minion.memory.notifyDisabled) {
            minion.notifyWhenAttacked(false);
            minion.memory.notifyDisabled = true;
        }

        if (minion.towTruck()) return;

        // Seasonal handling
        if (Game.shard.name === 'shardSeason' && minion.memory.scoreTarget) {
            const score = Game.getObjectById(minion.memory.scoreTarget);
            if (score) {
                return minion.shibMove(score, {range: 0});
            } else {
                minion.memory.scoreTarget = undefined;
            }
        }

        // Return if idle
        if (minion.idle) return;

        // Track Threat
        DiplomacyControl.trackThreat(minion);

        // Handle edge cases (border or nuke flee)
        if (minion.memory.fleeNukeTime && minion.fleeNukeRoom()) {
            return;
        }

        // Border
        if (minion.borderCheck()) return;

        // Report intel if outside MY_ROOMS — skip if micro-update is still fresh
        if (!MY_ROOMS.includes(minion.room.name)) {
            const _ri = INTEL[minion.room.name];
            if (!_ri || _ri.microUpdate + 150 < Game.time || !_ri.cached) {
                minion.room.invaderCheck();
                minion.room.cacheRoomIntel(false, minion);
            }
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