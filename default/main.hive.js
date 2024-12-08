/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const overlord = require('main.overlord');
const highCommand = require('military.highCommand');
const labs = require('module.labController');
const segments = require('module.segmentManager');
const power = require('module.powerManager');
const spawning = require('module.creepSpawning');
const expansion = require('module.expansion');
const diplomacy = require('module.diplomacy');
const hud = require('module.hud');
const profiler = require('tools.profiler');
let buildingNotifications;
let tickTracker = {};

class Hive {
    constructor() {
        // General housekeeping
        this.houseKeeping();
        // Segment management
        this.segmentManager();
        // Manage rooms
        this.overlordManager();
        // Military creep manager
        this.militaryCreepManager();
        // PowerCreep manager
        this.powerCreepManager();
        // Hud manager
        this.hudManager();
        // Global queue
        if ((tickTracker['globalQueue'] || 0) + 10 < Game.time) {
            this.globalQueue();
            tickTracker['globalQueue'] = Game.time;
        }
        // High Command
        if ((tickTracker['highCommand'] || 0) + 50 < Game.time) {
            this.highCommand();
            tickTracker['highCommand'] = Game.time;
        }
        // Lab manager
        if ((tickTracker['labManager'] || 0) + 5 < Game.time) {
            this.labManager();
            tickTracker['labManager'] = Game.time;
        }
        // Expansion manager
        if ((tickTracker['expansionManager'] || 0) + 1000 < Game.time) {
            this.expansionManager();
            tickTracker['expansionManager'] = Game.time;
        }
    }

    houseKeeping() {
        // Timing
        Memory.tickCooldowns = undefined;
        // Silence Alerts
        if (Game.time % 2500 === 0 || !buildingNotifications) {
            buildingNotifications = true;
            for (let building of _.filter(Game.structures)) {
                building.notifyWhenAttacked(false);
            }
        }
        // Diplomacy
        diplomacy.diplomacyOverlord();
    }

    hudManager() {
        hud.hud();
    }

    highCommand() {
        highCommand.highCommand();
    }

    labManager() {
        labs.labManager();
    }

    expansionManager() {
        expansion.claimNewRoom();
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
        let militaryCreeps = shuffle(_.filter(Game.creeps, (r) => (r.memory.military || !r.memory.overlord) && !r.spawning));
        for (let creep of militaryCreeps) {
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

    overlordManager() {
        // Overlord loop
        MY_ROOMS.forEach(function (room) {
            let activeRoom = Game.rooms[room];
            // If no longer owned, filter out
            if (!activeRoom) {
                global.MY_ROOMS = _.filter(MY_ROOMS, (r) => r !== room);
                return;
            }
            try {
                activeRoom.invaderCheck();
                activeRoom.cacheRoomIntel();
                new overlord(activeRoom, CPU_TASK_LIMITS['roomLimit'] * 0.9 / _.size(MY_ROOMS));
            } catch (e) {
                log.e('Overlord Module experienced an error in room ' + roomLink(room));
                log.e(e.stack);
                Game.notify(e.stack);
            }
        })
    }
}

profiler.registerClass(Hive, 'Hive');
module.exports = Hive;

let errorCount = {};

function minionController(minion) {
    // Disable notifications
    if (!minion.memory.notifyDisabled) {
        minion.notifyWhenAttacked(false);
        minion.memory.notifyDisabled = true;
    }
    // Handle idle
    if (minion.idle) return;
    // Track Threat
    diplomacy.trackThreat(minion);
    // Combat
    minion.attackInRange();
    minion.healInRange();
    // Handle edge cases
    if (minion.borderCheck() || (minion.memory.fleeNukeTime && minion.fleeNukeRoom())) {
        return;
    }
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
