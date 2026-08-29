/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const DEAD_EMPIRE_KEYS = [
    '_distanceCache', '_mapVisuals', 'tickCooldowns', 'lastTick', 'tickLength',
    'structureMemory', 'terminalEnergyExpense', 'renewalEnergyExpense',
    'nukeEnergyExpense', 'factoryEnergyExpense', 'HUD', 'errorLogs',
    '_defenseAlerts', '_rampartsSet', '_siegeCancelLog',
];

const ROOM_HEAP_STRIP_KEYS = [
    'energyInfo', 'energyDiag', 'readinessSticky', 'extensionGroups', 'extensionGroupLevel',
    '_labTechBalance', 'needsHaulers', 'combatReadyStress',
];

module.exports.cleanup = function () {
    let since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    // Defer heavy cleans until ~50 ticks after reset (cold caches + other systems spiking)
    if (Game.time % 100 === 0 && since > 50) {
        pruneDeadEmpireKeys();
        pruneRoomMemoryFat();
        pruneHeapOrphans();
        cleanConstructionSites();
        cleanStructureMemory();
        cleanStructures();
        cleanPathingCaches();
        if (global.ERROR_LOGS && global.ERROR_LOGS.length > 50) {
            global.ERROR_LOGS = global.ERROR_LOGS.slice(-50);
        }
        if (Memory.errorLogs) delete Memory.errorLogs;
    }
    since = global.ticksSinceLastGlobalReset ? global.ticksSinceLastGlobalReset() : 99;
    // Defer Memory.creeps/flags sweeps for ~25 ticks after reset
    if (Game.time % 5 === 0 && since > 25) {
        pruneDeadEmpireKeys();
        pruneRoomMemoryFat();
        for (let name in Memory.creeps) {
            if (!Game.creeps[name]) {
                delete Memory.creeps[name];
                if (global.CREEP_HEAP) delete global.CREEP_HEAP[name];
            } else {
                const mem = Memory.creeps[name];
                if (mem) {
                    if (mem.idle !== undefined) delete mem.idle;
                    if (mem.idleSet !== undefined) delete mem.idleSet;
                    if (mem._shibMove !== undefined) delete mem._shibMove;
                }
            }
        }

        for (let name in Memory.flags) {
            if (!Game.flags[name]) {
                delete Memory.flags[name];
            }
        }

        if (Memory.spawns) {
            for (const name in Memory.spawns) {
                if (!Game.spawns[name] || !Memory.spawns[name] || !Object.keys(Memory.spawns[name]).length) {
                    delete Memory.spawns[name];
                }
            }
        }

        if (Memory.powerCreeps) {
            for (const name in Memory.powerCreeps) {
                if (!Game.powerCreeps[name]) {
                    delete Memory.powerCreeps[name];
                    if (global.CREEP_HEAP) delete global.CREEP_HEAP[name];
                } else if (Memory.powerCreeps[name] && Memory.powerCreeps[name].idle !== undefined) {
                    delete Memory.powerCreeps[name].idle;
                }
            }
        }
    }
};

function pruneDeadEmpireKeys() {
    if (Memory._siegeCancelLog && Memory._siegeCancelLog.length
        && (!global.SIEGE_CANCEL_LOG || !global.SIEGE_CANCEL_LOG.length)) {
        global.SIEGE_CANCEL_LOG = Memory._siegeCancelLog;
    }
    if (Memory._defenseAlerts && (!global.DEFENSE_ALERTS || !Object.keys(global.DEFENSE_ALERTS).length)) {
        global.DEFENSE_ALERTS = Memory._defenseAlerts;
    }
    if (Memory.HUD && global.HUD_DATA && !global.HUD_DATA.GCL && Memory.HUD.GCL) {
        global.HUD_DATA.GCL = Memory.HUD.GCL;
        global.HUD_DATA.RCL = Memory.HUD.RCL;
    }
    for (let i = 0; i < DEAD_EMPIRE_KEYS.length; i++) {
        const key = DEAD_EMPIRE_KEYS[i];
        if (Memory[key] !== undefined) delete Memory[key];
    }
    if (Memory.profiler && Memory.profiler.map) {
        if (!global._profilerRuntime) global._profilerRuntime = {map: {}, totalTime: 0};
        if (!global._profilerRuntime.map || !Object.keys(global._profilerRuntime.map).length) {
            global._profilerRuntime.map = Memory.profiler.map;
        }
        delete Memory.profiler.map;
        if (Memory.profiler.totalTime != null) {
            if (!global._profilerRuntime.totalTime) global._profilerRuntime.totalTime = Memory.profiler.totalTime;
            delete Memory.profiler.totalTime;
        }
    }
}

function prunePackedDualWrite(mem) {
    const plan = mem.plan;
    const layers = plan && plan.layers;
    if (!layers) return;
    if (layers.extensions && layers.extensions.packed && layers.extensions.packed.length) {
        if (mem.dynamicExtensionsPacked !== undefined) delete mem.dynamicExtensionsPacked;
        if (mem.dynamicCorridorPacked !== undefined) delete mem.dynamicCorridorPacked;
        if (mem.dynamicExtensionsVersion !== undefined) delete mem.dynamicExtensionsVersion;
        if (mem.dynamicAccessOk !== undefined) delete mem.dynamicAccessOk;
        if (mem.dynamicAccessFailed !== undefined) delete mem.dynamicAccessFailed;
        if (mem.dynamicAccessSkipped !== undefined) delete mem.dynamicAccessSkipped;
    }
    if (layers.specials && layers.specials.packed && layers.specials.packed.length) {
        if (mem.dynamicSpecialPacked !== undefined) delete mem.dynamicSpecialPacked;
        if (mem.dynamicSpecialVersion !== undefined) delete mem.dynamicSpecialVersion;
    }
}

function pruneRoomMemoryFat() {
    if (!Memory.rooms) return;
    const owned = {};
    if (typeof MY_ROOMS !== 'undefined' && MY_ROOMS) {
        for (let i = 0; i < MY_ROOMS.length; i++) owned[MY_ROOMS[i]] = true;
    }
    const claimRoom = Memory.claimTarget && Memory.claimTarget.room;
    for (const name in Memory.rooms) {
        const mem = Memory.rooms[name];
        if (!mem) {
            delete Memory.rooms[name];
            continue;
        }
        const heap = global.roomHeap ? global.roomHeap(name) : null;
        if (heap) {
            if (mem.energyInfo && !heap.energyInfo) heap.energyInfo = mem.energyInfo;
            if (mem.energyDiag && !heap.energyDiag) heap.energyDiag = mem.energyDiag;
            if (mem.readinessSticky && !heap.readinessSticky) heap.readinessSticky = mem.readinessSticky;
            if (mem.extensionGroups && !heap.extensionGroups) {
                heap.extensionGroups = mem.extensionGroups;
                heap.extensionGroupLevel = mem.extensionGroupLevel;
            }
            if (mem._labTechBalance && !heap.labTechBalance) heap.labTechBalance = mem._labTechBalance;
        }
        for (let i = 0; i < ROOM_HEAP_STRIP_KEYS.length; i++) {
            if (mem[ROOM_HEAP_STRIP_KEYS[i]] !== undefined) delete mem[ROOM_HEAP_STRIP_KEYS[i]];
        }
        prunePackedDualWrite(mem);
        if (owned[name] || name === claimRoom) continue;
        if (mem.plan || mem.bunkerHub) continue;
        delete Memory.rooms[name];
    }
}

function pruneHeapOrphans() {
    if (global.ROOM_HEAP && typeof MY_ROOMS !== 'undefined' && MY_ROOMS) {
        const owned = {};
        for (let i = 0; i < MY_ROOMS.length; i++) owned[MY_ROOMS[i]] = true;
        for (const name in global.ROOM_HEAP) {
            if (!owned[name]) delete global.ROOM_HEAP[name];
        }
    }
    if (global.CREEP_HEAP) {
        for (const name in global.CREEP_HEAP) {
            if (!Game.creeps[name] && !(Game.powerCreeps && Game.powerCreeps[name])) {
                delete global.CREEP_HEAP[name];
            }
        }
    }
}

function isOwnedSiteRoom(room, roomName) {
    if (room && room.controller && room.controller.my) return true;
    return typeof MY_ROOMS !== 'undefined' && MY_ROOMS && roomName && MY_ROOMS.includes(roomName);
}

function isActiveRemoteRoom(roomName) {
    if (!roomName || typeof INTEL === 'undefined' || !INTEL[roomName]) return false;
    const activeAt = INTEL[roomName].activeRemote;
    if (!activeAt) return false;
    const window = typeof CREEP_LIFE_TIME === 'number' ? CREEP_LIFE_TIME : 1500;
    return activeAt + window > Game.time;
}

// Sites the planner (or remote builders) immediately re-queue on the same tile.
// Randomly deleting these just flickers the same construction site forever.
const STICKY_SITE_TYPES = {
    [STRUCTURE_RAMPART]: true,
    [STRUCTURE_WALL]: true,
    [STRUCTURE_SPAWN]: true,
    [STRUCTURE_TOWER]: true,
    [STRUCTURE_EXTENSION]: true,
    [STRUCTURE_CONTAINER]: true,
    [STRUCTURE_LINK]: true,
    [STRUCTURE_STORAGE]: true,
    [STRUCTURE_TERMINAL]: true,
    [STRUCTURE_EXTRACTOR]: true,
    [STRUCTURE_LAB]: true,
};

function cleanConstructionSites() {
    for (let id in Game.constructionSites) {
        const site = Game.constructionSites[id];
        const room = site.room;
        const roomName = site.pos && site.pos.roomName;
        if (STICKY_SITE_TYPES[site.structureType]) continue;
        // Owned rooms: the planner owns this queue. Do not randomly evict idle roads.
        if (isOwnedSiteRoom(room, roomName)) continue;
        if (site.progress > 0) continue;
        // Still-mined remotes: remoteBuilder / harvesters will put the same road back.
        if (isActiveRemoteRoom(roomName)) continue;
        if (
            Math.random() > 0.5 &&
            (!room || !site.pos.findClosestByRange(FIND_MY_CREEPS))
        ) {
            site.remove();
        }
    }
}

function cleanStructureMemory() {
    if (Memory.structureMemory) {
        delete Memory.structureMemory;
    }

    for (let i = 0; i < MY_ROOMS.length; i++) {
        const room = Game.rooms[MY_ROOMS[i]];
        if (room && room.memory) {
            const memKeys = ['structureMemory', '_structureMemory'];
            for (let key of memKeys) {
                if (room.memory[key]) {
                    for (let structureId in room.memory[key]) {
                        if (!Game.getObjectById(structureId)) {
                            delete room.memory[key][structureId];
                        }
                    }
                    if (_.isEmpty(room.memory[key])) delete room.memory[key];
                }
            }
        }
    }
}

function cleanStructures() {
    const structures = [];
    for (let r of MY_ROOMS) {
        let room = Game.rooms[r];
        if (room && room.controller && (!room.controller.owner || room.controller.owner.username !== MY_USERNAME)) {
            for (let s of room.structures) {
                if (!s.isActive()) structures.push(s);
            }
        }
    }

    for (let i = 0; i < structures.length; i++) {
        structures[i].destroy();
    }
}

const cleanPathingCaches = () => {
    const now = Game.time;
    const {ROUTE_TTL, ROUTE_DISTANCE_TTL} = require('pathRoute');
    const routeCache = CACHE.ROUTE_CACHE;
    const pathCache = CACHE.PATH_CACHE;
    const distanceCache = CACHE.ROUTE_DISTANCE;

    for (let key in routeCache) {
        if (now - routeCache[key].tick > ROUTE_TTL) {
            delete routeCache[key];
        }
    }
    if (distanceCache) {
        for (let key in distanceCache) {
            if (now - distanceCache[key].tick > ROUTE_DISTANCE_TTL) {
                delete distanceCache[key];
            }
        }
    }
    for (let key in pathCache) {
        if (now - pathCache[key].tick > 50) {
            delete pathCache[key];
        }
    }
};