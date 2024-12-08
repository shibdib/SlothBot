/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.setRoomState = function (room) {
    if (Game.time % 5 === 0) {
        const randomValue = Math.random();

        // Request builders
        if (randomValue > 0.7) requestBuilders(room);

        // Check if struggling
        const isStruggling = room.storage && (room.creeps.length < 4 || !room.energyState);
        if (isStruggling && !room.memory.struggling) {
            log.a(roomLink(room.name) + ' is struggling.', 'ROOMS');
            room.memory.struggling = true;
            room.memory.struggleTime = Game.time;
        } else if (!isStruggling && room.memory.struggling) {
            log.a(roomLink(room.name) + ' has recovered to an acceptable level.', 'ROOMS');
            room.memory.struggling = undefined;
            room.memory.struggleTime = undefined;
        }

        // Energy tracking
        const lastEnergy = room.memory.lastEnergyAmount || 0;
        room.memory.lastEnergyAmount = room.energy;
        const energyIncomeArray = ROOM_ENERGY_INCOME_ARRAY[room.name] || [];
        if (energyIncomeArray.length < 250) {
            energyIncomeArray.push(room.energy - lastEnergy);
        } else {
            energyIncomeArray.shift();
            energyIncomeArray.push(room.energy - lastEnergy);
        }
        room.memory.energyPositive = average(energyIncomeArray) > 0;
        ROOM_ENERGY_INCOME_ARRAY[room.name] = energyIncomeArray;

        // Track unique minerals
        if (!global.MY_MINERALS) global.MY_MINERALS = [];
        global.MY_MINERALS.push(room.mineral.mineralType);

        // Stats tracking
        let stats = room.memory.stats || {};
        stats.levelInfo = stats.levelInfo || {};
        stats.levelInfo[room.controller.level] = stats.levelInfo[room.controller.level] || Game.time;

        stats.highestRCL = Math.max(stats.highestRCL || 0, room.controller.level);

        // Track threat level
        if (INTEL[room.name].threatLevel >= 3) {
            stats.underAttack = (stats.underAttack || 0) + 1;
        } else if (stats.underAttack) {
            stats.underAttack -= 1;
        }

        room.memory.stats = stats;
    }
};


function requestBuilders(room) {
    room.memory.buildersNeeded = (!_.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN).length || !_.filter(room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER).length);
}