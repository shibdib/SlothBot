/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.setRoomState = function (room) {
    if (Game.time % 2 === 0) {
        // Set Energy Needs
        let energyInRoom = room.energy;
        //Delete old memory
        room.memory.energyIncomeArray = undefined;
        room.memory.energySurplus = undefined;
        room.memory.extremeEnergySurplus = undefined;
        room.memory.energyNeeded = undefined;
        // Request builders
        if (Math.random() > 0.7) requestBuilders(room);
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
        // SEASON 2 store room symbol
        if (Game.shard.name === 'shardSeason') {
            let currentSymbols = Memory.ownedSymbols || [];
            currentSymbols.push(room.decoder.resourceType);
            Memory.ownedSymbols = _.uniq(currentSymbols);
        }
        // Stats
        let stats = room.memory.stats || {};
        // Store ticks on rcl upgrade
        if (!stats.levelInfo) stats.levelInfo = {};
        if (!stats.levelInfo[room.controller.level]) stats.levelInfo[room.controller.level] = Game.time;
        // Store ticks with a threat level
        if (Memory.roomCache[room.name].threatLevel >= 3) {
            if (!stats.underAttack) stats.underAttack = 1; else stats.underAttack += 1;
        } else if (stats.underAttack) stats.underAttack -= 1;
        room.memory.stats = stats;
    }
};

function requestBuilders(room) {
    room.memory.buildersNeeded = (!_.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN).length || !_.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER).length || room.level < room.controller.level);
}