/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let observers = require('module.observerController');
let defense = require('military.defense');
let links = require('module.linkController');
let terminals = require('module.terminalController');
let spawning = require('module.creepSpawning');
let state = require('module.roomState');
let planner = require('module.roomPlanner');
let diplomacy = require('module.diplomacy');
let storedLevel = {};

module.exports.overlordMind = function (room) {
    if (!room) return;
    let mindStart = Game.cpu.getUsed();
    let cpuBucket = Game.cpu.bucket;

    // Cache globals
    cacheRoomItems(room);

    // Set room state
    state.setRoomState(room);

    // Handle Defense
    defense.controller(room);

    // Request builders
    if (Math.random() > 0.7) requestBuilders(room);

    //Build Room
    if (!room.memory.bunkerHub || (room.controller.level < 4 && Math.random() > 0.7) || (getLevel(room) !== room.controller.level && Game.time % 20 === 0) || (Game.time % 200 === 0 && Math.random() > 0.5)) {
        try {
            planner.buildRoom(room);
        } catch (e) {
            log.e('Room Building for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }
    // Silence Alerts
    if (Game.time % 2500 === 0) {
        for (let building of room.structures) {
            building.notifyWhenAttacked(false);
        }
    }

    // Manage creep spawning
    // Level 1 room management
    if (Math.random() > 0.7) {
        if (getLevel(room) < 2) {
            spawning.roomStartup(room);
            if (Math.random() > 0.7) spawning.remoteCreepQueue(room);
        } else {
            if (Math.random() > 0.1 && cpuBucket >= 2500) {
                try {
                    spawning.essentialCreepQueue(room);
                } catch (e) {
                    log.e('Essential Queueing for room ' + room.name + ' experienced an error');
                    log.e(e.stack);
                    Game.notify(e.stack);
                }
            }
            if (Math.random() > 0.5 && cpuBucket >= 3500) {
                try {
                    spawning.miscCreepQueue(room);
                } catch (e) {
                    log.e('Misc Queueing for room ' + room.name + ' experienced an error');
                    log.e(e.stack);
                    Game.notify(e.stack);
                }
            }
            if (Math.random() > 0.6 && cpuBucket >= 4000) {
                try {
                    spawning.remoteCreepQueue(room);
                } catch (e) {
                    log.e('Remote Creep Queuing for room ' + room.name + ' experienced an error');
                    log.e(e.stack);
                    Game.notify(e.stack);
                }
            }
        }
    }

    // Manage creeps
    let roomCreeps = shuffle(_.filter(Game.creeps, (r) => r.memory.overlord === room.name && !r.memory.military));
    // Worker minions
    for (let key in roomCreeps) {
        try {
            minionController(roomCreeps[key]);
        } catch (e) {
            log.e(roomCreeps[key].name + ' in room ' + roomCreeps[key].room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }

    // Observer Control
    if (room.level === 8 && cpuBucket >= 2000) {
        try {
            observers.observerControl(room);
        } catch (e) {
            log.e('Observer Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }

    // Handle Links
    if (room.level >= 5) {
        try {
            links.linkControl(room);
        } catch (e) {
            log.e('Link Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }

    // Handle Terminals
    if (room.terminal && room.level >= 6 && !room.terminal.cooldown && Game.time % _.random(7, 12) === 0) {
        try {
            terminals.terminalControl(room);
        } catch (e) {
            log.e('Terminal Control for room ' + room.name + ' experienced an error');
            log.e(e.stack);
            Game.notify(e.stack);
        }
    }

    // Store Data
    storedLevel[room.name] = room.controller.level;
    if (room.controller.level >= 6) {
        let currentMinerals = Memory.ownedMinerals || [];
        currentMinerals.push(room.mineral.mineralType);
        Memory.ownedMinerals = _.uniq(currentMinerals);
    }
    let used = Game.cpu.getUsed() - mindStart;
    let cpuUsageArray = ROOM_CPU_ARRAY[room.name] || [];
    if (cpuUsageArray.length < 50) {
        cpuUsageArray.push(used)
    } else {
        cpuUsageArray.shift();
        cpuUsageArray.push(used);
        if (average(cpuUsageArray) > 20 && Game.time % 150 === 0) {
            log.e(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
            for (let key in TASK_CPU_ARRAY[room.name]) {
                log.e(_.capitalize(key) + ' Avg. CPU - ' + _.round(average(TASK_CPU_ARRAY[room.name][key]), 2));
            }
            Game.notify(room.name + ' is using a high amount of CPU - ' + average(cpuUsageArray));
            for (let key in TASK_CPU_ARRAY[room.name]) {
                log.e(_.capitalize(key) + ' Avg. CPU - ' + _.round(average(TASK_CPU_ARRAY[room.name][key]), 2));
            }
        }
    }
    room.memory.averageCpu = _.round(average(cpuUsageArray), 2);
    ROOM_CPU_ARRAY[room.name] = cpuUsageArray;
};

let errorCount = {};
function minionController(minion) {
    // If on portal or border move
    if (minion.portalCheck() || minion.borderCheck()) return;
    // Disable notifications
    if (minion.ticksToLive > 1490) minion.notifyWhenAttacked(false);
    // Handle nuke flee
    if (minion.memory.fleeNukeTime && minion.fleeNukeRoom(minion.memory.fleeNukeRoom)) return;
    // If idle sleep
    if (minion.idle) return;
    // If minion has been flagged to recycle do so
    if (minion.memory.recycle) return minion.recycleCreep();
    // Chance based CPU saving
    let adjustedLimit = adjustedCPULimit(Game.cpu.limit, Game.cpu.bucket);
    let cpuUsed = Game.cpu.getUsed();
    if (Game.cpu.bucket < 8000) {
        if ((cpuUsed >= adjustedLimit && Math.random() > 0.5) || Math.random() > 0.9) return minion.say('CPU'); else {
            if (Math.random() > Game.cpu.bucket / 8000) return minion.say('BUCKET');
        }
    }
    // Track Threat
    diplomacy.trackThreat(minion);
    // Report intel chance
    if (minion.room.name !== minion.memory.overlord && Math.random() > 0.75) {
        minion.room.invaderCheck();
        minion.room.cacheRoomIntel();
    }
    // Set role
    let memoryRole = minion.memory.role;
    // Run role and log CPU
    try {
        let creepRole = require('role.' + memoryRole);
        creepRole.role(minion);
        let used = Game.cpu.getUsed() - cpuUsed;
        //if (used > 0.7) console.log(minion.name + ' ' + roomLink(minion.room.name) + ' ' + used)
        let cpuUsageArray = CREEP_CPU_ARRAY[minion.name] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
            if (average(cpuUsageArray) > 4) {
                minion.memory.recycle = true;
                log.e(minion.name + ' was killed for overusing CPU in room ' + minion.room.name);
            }
        }
        CREEP_CPU_ARRAY[minion.name] = cpuUsageArray;
        let roomCreepCpu = ROOM_CREEP_CPU_OBJECT[minion.memory.overlord] || {};
        cpuUsageArray = roomCreepCpu[minion.name] || [];
        if (cpuUsageArray.length < 50) {
            cpuUsageArray.push(used)
        } else {
            cpuUsageArray.shift();
            cpuUsageArray.push(used);
        }
        roomCreepCpu[minion.name] = cpuUsageArray;
        ROOM_CREEP_CPU_OBJECT[minion.memory.overlord] = roomCreepCpu;
        minion.room.visual.text(
            _.round(average(cpuUsageArray), 2),
            minion.pos.x,
            minion.pos.y,
            {opacity: 0.8, font: 0.4, stroke: '#000000', strokeWidth: 0.05}
        );
    } catch (e) {
        if (!errorCount[minion.name]) errorCount[minion.name] = 1; else errorCount[minion.name] += 1;
        if (errorCount[minion.name] < 10) {
            log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name));
            log.e(e.stack);
            Game.notify(e.stack);
        } else {
            log.e(minion.name + ' experienced an error in room ' + roomLink(minion.room.name) + ' and has been marked for recycling due to hitting the error cap.');
            minion.memory.recycle = true;
        }
    }
}

function cacheRoomItems(room) {
    // Cache number of spaces around sources for things
    if (!ROOM_SOURCE_SPACE[room.name]) {
        let spaces = 0;
        for (let source of room.sources) spaces += source.pos.countOpenTerrainAround();
        ROOM_SOURCE_SPACE[room.name] = spaces;
    }
    // Cache number of spaces around sources for things
    if (!ROOM_CONTROLLER_SPACE[room.name]) {
        ROOM_CONTROLLER_SPACE[room.name] = room.controller.pos.countOpenTerrainAround();
    }
}

function requestBuilders(room) {
    if (!_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN).length || getLevel(room) !== room.controller.level || _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER)[0]) {
        room.memory.buildersNeeded = true;
    }
}