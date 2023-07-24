/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let highCommand = require('military.highCommand');
const {getUserStrength} = require("./military.highCommand");

Creep.prototype.scoutRoom = function () {
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {
            range: 23,
            offRoad: true
        });
    }
    if (!this.shibKite()) {
        this.moveToHostileConstructionSites();
    }
    return operationPlanner(this.room, this);
};

Creep.prototype.operationManager = function () {
    return operationPlanner(this.room, this);
};

StructureObserver.prototype.operationPlanner = function (room) {
    return operationPlanner(room);
};

function operationPlanner(room, creep = undefined) {
    // Handle forward observer
    if (Memory.targetRooms[room.name]) {
        forwardObserver(room);
        if (creep && !creep.moveToHostileConstructionSites(false, true)) creep.idleFor(25);
    }
}

// Observer tasks
function forwardObserver(room) {
    if (!Memory.targetRooms[room.name]) return false;
    // Safemode
    if (room.controller && room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + room.controller.safeMode,
        };
        Memory.targetRooms = cache;
        return;
    }
    // Store seen users
    if (room.hostileCreeps.length) {
        let userList = Memory.targetRooms[room.name].userList || [];
        let users = _.uniq(_.map(room.hostileCreeps, 'owner.username'));
        Memory.targetRooms[room.name].userList = _.union(userList, users);
        Memory.targetRooms[room.name].maxLevel = highCommand.getUserStrength(_.max(Memory.targetRooms[room.name].userList, function (u) {
            return highCommand.getUserStrength(u);
        }));
    }
    // Type specific stuff
    let armedEnemies = _.find(room.hostileCreeps, (c) => (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) && !_.includes(FRIENDLIES, c.owner.username));
    switch (Memory.targetRooms[room.name].type) {
        case 'hold':
            let towers = _.find(room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.store[RESOURCE_ENERGY] >= TOWER_ENERGY_COST && c.isActive());
            if (towers) {
                Memory.targetRooms[room.name].type = 'harass';
                Memory.targetRooms[room.name].level = 1;
                log.a('Converting hold operation in ' + roomLink(room.name) + ' to a harass operation as a tower is now detected.', 'HIGH COMMAND: ');
                return room.cacheRoomIntel(true);
            }
            // Clear target if room is no longer owned
            if (!room.controller || !room.controller.owner) {
                log.a('Canceling hold operation in ' + roomLink(room.name) + ' as it is no longer owned.', 'HIGH COMMAND: ');
                delete Memory.targetRooms[room.name];
                return room.cacheRoomIntel(true);
            }
            // Request cleaner if structures are present
            // Request claim attacker if viable
            if (!armedEnemies) {
                if (room.hostileStructures.length) Memory.targetRooms[room.name].cleaner = true;
                if ((!room.controller.upgradeBlocked || room.controller.upgradeBlocked < CREEP_CLAIM_LIFE_TIME) && room.controller.pos.countOpenTerrainAround()) Memory.targetRooms[room.name].claimAttacker = true;
                else Memory.targetRooms[room.name].claimAttacker = undefined;
            } else {
                Memory.targetRooms[room.name].claimAttacker = undefined;
                Memory.targetRooms[room.name].cleaner = undefined;
            }
            // Up priority if they're close to level 3 or a tower is in build
            let inBuildTower = _.find(room.constructionSites, (s) => s.structureType === STRUCTURE_TOWER && s.progress);
            if (inBuildTower || (room.controller.level === 2 && room.controller.progress >= room.controller.progressTotal * 0.25)) {
                if (!Memory.targetRooms[room.name].level) Memory.targetRooms[room.name].level = 1;
                Memory.targetRooms[room.name].priority = PRIORITIES.priority;
            }
            break;
    }
    if (room.hostileCreeps.length || room.hostileStructures.length) {
        Memory.targetRooms[room.name].level = 2;
    } else if (room.hostileStructures.length) {
        Memory.targetRooms[room.name].level = 1;
    } else {
        Memory.targetRooms[room.name].level = 0;
    }
}