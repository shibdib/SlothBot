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
        if (room.storage && (room.creeps.length < 4 || !room.energyState)) {
            if (room.memory.struggling !== true) log.a(roomLink(room.name) + ' is struggling.', 'ROOMS');
            room.memory.struggling = true;
            room.memory.struggleTime = Game.time;
        } else {
            if (room.memory.struggling) log.a(roomLink(room.name) + ' has recovered to an acceptable level.', 'ROOMS');
            room.memory.struggling = undefined;
            room.memory.struggleTime = undefined;
        }
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
        // Store minerals
        let currentMinerals = MY_MINERALS || [];
        currentMinerals.push(room.mineral.mineralType);
        global.MY_MINERALS = _.uniq(currentMinerals);
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
        if (INTEL[room.name].threatLevel >= 3) {
            if (!stats.underAttack) stats.underAttack = 1; else stats.underAttack += 1;
        } else if (stats.underAttack) stats.underAttack -= 1;
        room.memory.stats = stats;
    }
};

function requestBuilders(room) {
    room.memory.buildersNeeded = (!_.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN).length || !_.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER).length);
}