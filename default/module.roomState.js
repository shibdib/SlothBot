/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let lastStateUpdate = {};
module.exports.setRoomState = function (room) {
    if (!lastStateUpdate[room.name]) {
        lastStateUpdate[room.name] = 0;
    }
    const currentTime = _.round(new Date().getTime() / 1000, 2);
    const timeSinceLastStatus = currentTime - lastStateUpdate[room.name];

    // Update every 30 seconds
    if (timeSinceLastStatus >= 30) {
        lastStateUpdate[room.name] = currentTime;
        const randomValue = Math.random();

        // Request builders only if certain conditions are met
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

        // Efficient energy tracking (only store the last 50 values)
        const lastEnergy = room.memory.lastEnergyAmount || 0;
        room.memory.lastEnergyAmount = room.energy;
        const energyIncomeArray = ROOM_ENERGY_INCOME_ARRAY[room.name] || [];
        energyIncomeArray.push(room.energy - lastEnergy);

        if (energyIncomeArray.length > 50) {
            energyIncomeArray.shift(); // Keep only the last 50 ticks
        }

        room.memory.energyPositive = average(energyIncomeArray) > 0;
        ROOM_ENERGY_INCOME_ARRAY[room.name] = energyIncomeArray;

        // Track mined minerals
        if (room.level >= 6) {
            const mineralType = room.mineral.mineralType;
            if (mineralType && !MY_MINERALS[mineralType]) {
                MY_MINERALS[mineralType] = true; // Track unique minerals
            }
        }

        // Stats tracking
        let stats = room.memory.stats || {};
        stats.levelInfo = stats.levelInfo || {};
        stats.levelInfo[room.controller.level] = stats.levelInfo[room.controller.level] || Game.time;

        stats.highestRCL = Math.max(stats.highestRCL || 0, room.controller.level);

        // Efficient threat level tracking (only keep the last 10 threat levels)
        stats.threatLevels = stats.threatLevels || [];
        if (INTEL[room.name].threatLevel >= 3) {
            stats.threatLevels.push(Game.time);
            if (stats.threatLevels.length > 10) {
                stats.threatLevels.shift(); // Keep only the last 10 threat levels
            }
        } else if (stats.threatLevels.length > 0) {
            stats.threatLevels = stats.threatLevels.filter(time => Game.time - time < 50); // Remove outdated threat levels
        }

        // If under attack for a significant period, mark under attack
        stats.underAttack = stats.threatLevels.length >= 5 ? (stats.underAttack || 0) + 1 : 0;

        room.memory.stats = stats;

        // Helper function to calculate average of an array
        function average(array) {
            if (!array || array.length === 0) return 0;
            return array.reduce((sum, value) => sum + value, 0) / array.length;
        }
    }
};

// Optimized function to request builders based on the room's impassible structures
function requestBuilders(room) {
    const impassibleStructures = room.impassibleStructures || [];
    let hasSpawn = false;
    let hasTower = false;

    // Iterate once over the impassible structures and check for spawns and towers
    for (let structure of impassibleStructures) {
        if (structure.structureType === STRUCTURE_SPAWN) {
            hasSpawn = true;
        } else if (structure.structureType === STRUCTURE_TOWER) {
            hasTower = true;
        }

        // Early exit if both spawns and towers are found
        if (hasSpawn && hasTower) {
            break;
        }
    }

    // Set buildersNeeded flag only if one or both structures are missing
    const buildersNeeded = !(hasSpawn && hasTower);
    if (room.memory.buildersNeeded !== buildersNeeded) {
        room.memory.buildersNeeded = buildersNeeded;
    }
}
