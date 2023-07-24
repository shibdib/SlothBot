/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.setRoomState = function (room) {
    if (Game.time % 5 === 0) {
        // Set Energy Needs
        let energyInRoom = room.energy;
        // Request builders
        if (Math.random() > 0.7) requestBuilders(room);
        // Check if struggling
        let rebootCreeps = _.filter(room.myCreeps, (c) => c.memory.other.reboot && c.memory.role !== "upgrader").length;
        if (room.level >= 3 && (room.creeps.length < 3 || rebootCreeps > 1)) {
            if (room.memory.struggling !== true) log.a(roomLink(room.name) + ' is struggling to survive.', 'ROOMS');
            room.memory.struggling = true;
            room.memory.struggleTime = Game.time;
        } else if (room.memory.struggling && room.memory.struggleTime + 1000 < Game.time) {
            log.a(roomLink(room.name) + ' has recovered to an acceptable level.', 'ROOMS');
            room.memory.struggling = false;
        }
        room.memory.struggling = room.level > 2 && (room.friendlyCreeps.length < 5 || rebootCreeps > 1);
        let last = room.memory.lastEnergyAmount || 0;
        room.memory.lastEnergyAmount = energyInRoom;
        let energyIncomeArray = [];
        // Backwards compatibility
        if (ROOM_ENERGY_INCOME_ARRAY[room.name])
            energyIncomeArray = ROOM_ENERGY_INCOME_ARRAY[room.name];
        if (energyIncomeArray.length < 250) {
            energyIncomeArray.push(energyInRoom - last);
        } else {
            energyIncomeArray.shift();
            energyIncomeArray.push(energyInRoom - last);
        }
        room.memory.energyPositive = average(energyIncomeArray) > 0;
        ROOM_ENERGY_INCOME_ARRAY[room.name] = energyIncomeArray;
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
        // Store minerals
        let currentMinerals = Memory.ownedMinerals || [];
        currentMinerals.push(room.mineral.mineralType);
        Memory.ownedMinerals = _.uniq(currentMinerals);
        if (room.controller.level >= 6) {
            if (Math.random() > 0.95) Memory.harvestableMinerals = undefined;
            let harvestableMinerals = Memory.harvestableMinerals || [];
            harvestableMinerals.push(room.mineral.mineralType);
            Memory.harvestableMinerals = _.uniq(harvestableMinerals);
        }
        // Stats
        let stats = room.memory.stats || {};
        // Store ticks on rcl upgrade
        if (!stats.levelInfo) stats.levelInfo = {};
        if (!stats.levelInfo[room.controller.level]) stats.levelInfo[room.controller.level] = Game.time;
        // Store highest rcl
        if (!stats.highestRCL || stats.highestRCL < room.controller.level) stats.highestRCL = room.controller.level;
        // Store ticks with a threat level
        if (Memory.roomCache[room.name].threatLevel >= 3) {
            if (!stats.underAttack) stats.underAttack = 1; else stats.underAttack += 1;
        } else if (stats.underAttack) stats.underAttack -= 1;
        room.memory.stats = stats;
    }
};

function requestBuilders(room) {
    room.memory.buildersNeeded = (!_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN).length || !_.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER).length);
}