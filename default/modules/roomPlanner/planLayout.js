/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Bunker layout and missing-structure placement.
 */

const {bunkerTemplate, coreTemplate} = require('planTemplates');

const {
    isAttackRecoveryMode,
    shouldSkipStructure,
    safeStructureMy,
    canPlaceConstructionSite,
    tryCreateConstructionSite
} = require('planUtils');

const {buildTowersFromHubs} = require('planHub');

const {
    buildSourceExtensions,
    placeRoomExtensions,
    getExtensionDeficit,
    ensureExtensionClearance,
} = require('planExtensions');

const {rampartBuilder} = require('planRamparts');

const {auxiliaryBuilding} = require('planAuxiliary');

function getStructureCounts(room) {
    const counts = {};
    room.structures.forEach(s => counts[s.structureType] = (counts[s.structureType] || 0) + 1);
    room.constructionSites.forEach(s => counts[s.structureType] = (counts[s.structureType] || 0) + 1);
    return counts;
}

const LAYOUT_SKIP_TYPES = [STRUCTURE_CONTAINER, STRUCTURE_RAMPART, STRUCTURE_WALL, STRUCTURE_ROAD];

function hasPendingLayoutStructures(room) {
    const existingCounts = getStructureCounts(room);
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const skipTypes = room.memory.dynamicLayout ? [...LAYOUT_SKIP_TYPES, STRUCTURE_EXTENSION] : LAYOUT_SKIP_TYPES;
    const level = room.controller.level;
    return tmpl.some(s =>
        !skipTypes.includes(s.structureType) &&
        CONTROLLER_STRUCTURES[s.structureType][level] > (existingCounts[s.structureType] || 0)
    );
}

function buildMissingStructures(room, level) {
    // Defense-critical — place before extensions/ramparts consume the per-room site budget.
    buildTowersFromHubs(room);

    ensureExtensionClearance(room);
    if (level >= 2 && getExtensionDeficit(room) > 0) {
        placeRoomExtensions(room);
    }

    const existingCounts = getStructureCounts(room);
    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    const skipTypes = room.memory.dynamicLayout
        ? [...LAYOUT_SKIP_TYPES, STRUCTURE_EXTENSION]
        : level < 6 ? [...LAYOUT_SKIP_TYPES, STRUCTURE_LINK] : LAYOUT_SKIP_TYPES;
    const countCheck = tmpl.filter(s =>
        !skipTypes.includes(s.structureType) &&
        CONTROLLER_STRUCTURES[s.structureType][level] > (existingCounts[s.structureType] || 0)
    );
    if (countCheck && countCheck.length) buildFromLayout(room, countCheck);
}

function buildAuxiliaryStructures(room) {
    let builtSpawn = room.spawns[0];
    if (builtSpawn) auxiliaryBuilding(room);
}

function buildFromLayout(room, countCheck) {
    const hub = room.hub;
    const initialSpawn = _.find(Game.structures, s => s.structureType === STRUCTURE_SPAWN && safeStructureMy(s));
    const roomSpawn = room.spawns[0];
    let filter = [];

    const tmpl = room.memory.dynamicLayout ? coreTemplate : bunkerTemplate;
    if (room.controller.level === 1 && !initialSpawn) {
        filter = tmpl.filter(s => s.structureType === STRUCTURE_SPAWN);
    } else if (room.controller.level >= 5 && isAttackRecoveryMode(room)) {
        room.constructionSites.filter(s => ![STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL, STRUCTURE_RAMPART, STRUCTURE_WALL].includes(s.structureType) && !s.progress).forEach(s => s.remove());
        filter = tmpl.filter(s => [STRUCTURE_SPAWN, STRUCTURE_TOWER, STRUCTURE_TERMINAL].includes(s.structureType));
        rampartBuilder(room, tmpl);
    } else if (!roomSpawn) {
        const spawnPos = tmpl.filter(s => s.structureType === STRUCTURE_SPAWN)[0].pos[0];
        const pos = new RoomPosition(hub.x + spawnPos.x, hub.y + spawnPos.y, room.name);
        if (!canPlaceConstructionSite(room)) return;
        if (!pos.checkForRampart()) tryCreateConstructionSite(pos, STRUCTURE_RAMPART); else if (pos.checkForRampart().hits >= 10000) tryCreateConstructionSite(pos, STRUCTURE_SPAWN);
        return;
    } else {
        filter = countCheck.filter(s => CONTROLLER_STRUCTURES[s.structureType][room.controller.level]);
    }

    if (filter.length) {
        buildSourceExtensions(room);
        for (const structure of filter) {
            if (structure.structureType === STRUCTURE_EXTENSION) continue;
            if (shouldSkipStructure(room, structure)) continue;
            for (const buildPos of structure.pos) {
                const pos = new RoomPosition(hub.x + buildPos.x, hub.y + buildPos.y, room.name);
                if (!pos.checkForConstructionSites() && !pos.checkForAllStructure()) {
                    if (!canPlaceConstructionSite(room)) return;
                    tryCreateConstructionSite(pos, structure.structureType);
                }
            }
        }

        if (room.memory.protoStorage && room.controller.level >= 4) {
            const protoStorage = Game.getObjectById(room.memory.protoStorage);
            if (protoStorage) protoStorage.destroy();
            room.memory.protoStorage = undefined;
        }
    }
}

module.exports = {
    buildMissingStructures,
    buildAuxiliaryStructures,
    hasPendingLayoutStructures,
};