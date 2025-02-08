/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

let lastStateUpdate = {};
let energyFillingTracker = {};
module.exports.setRoomState = function (room) {
    if (!lastStateUpdate[room.name]) lastStateUpdate[room.name] = 0;
    const timeSinceLastStatus = Game.time - lastStateUpdate[room.name];

    // Update every 10 ticks
    if (timeSinceLastStatus >= 10) {
        lastStateUpdate[room.name] = Game.time;

        // Request builders only if certain conditions are met
        requestBuilders(room);

        // Check if struggling
        const isStruggling = room.storage && (room.creeps.length < 3 || !room.energyState);
        if (isStruggling && !room.memory.struggling) {
            log.a(roomLink(room.name) + ' is struggling.', 'ROOMS');
            room.memory.struggling = true;
            room.memory.struggleTime = Game.time;
        } else if (!isStruggling && room.memory.struggling) {
            log.a(roomLink(room.name) + ' has recovered to an acceptable level.', 'ROOMS');
            room.memory.struggling = undefined;
            room.memory.struggleTime = undefined;
        }

        // Track if room is in a state to participate in combat
        const importantBuilds = _.some(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
        INTEL[room.name].availableForCombat = !importantBuilds && room.level >= 3 && room.energyState && !INTEL[room.name].threatLevel;

        // Energy tracking
        const lastEnergy = room.memory.lastEnergyAmount || 0;
        room.memory.lastEnergyAmount = room.energy;
        const energyIncomeArray = ROOM_ENERGY_INCOME_ARRAY[room.name] || [];
        energyIncomeArray.push(room.energy - lastEnergy);

        if (energyIncomeArray.length > 50) {
            energyIncomeArray.shift();
        }

        room.memory.energyPositive = average(energyIncomeArray) > 0;
        ROOM_ENERGY_INCOME_ARRAY[room.name] = energyIncomeArray;

        // Track mined minerals
        if (room.level >= 6) {
            const mineralType = room.mineral.mineralType;
            if (mineralType && !MY_MINERALS[mineralType]) {
                MY_MINERALS[mineralType] = true;
            }
        }

        // Track if the room is filling extensions/spawns fast enough
        if (room.energyCapacityAvailable > room.energyAvailable) {
            if (energyFillingTracker[room.name]) energyFillingTracker[room.name]++; else energyFillingTracker[room.name] = 1;
        } else if (energyFillingTracker[room.name] > 0) energyFillingTracker[room.name]--;
        room.memory.needsHaulers = energyFillingTracker[room.name] > 10;

        // Stats tracking
        let stats = room.memory.stats || {};
        stats.levelInfo = stats.levelInfo || {};
        stats.levelInfo[room.controller.level] = stats.levelInfo[room.controller.level] || Game.time;

        stats.highestRCL = Math.max(stats.highestRCL || 0, room.controller.level);

        room.memory.stats = stats;

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
