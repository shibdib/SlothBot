"use strict";

// Resources Module handles determining what sort of mode we should be operating in.
//
// CRITICAL, LOW, NORMAL
//
// The mode is based upon a combination of factors, including:
//   Room Controller Level
//   Room Structures - Storage, Container
//   Room Sources (probably a linear relationship to other things like minimum stored energy)

// Things which are expected to vary based upon the resource mode, room level, and sources:
//   Creep behavior (e.g., no upgrading room controller at CRITICAL)
//   Number of creeps of each type
//   Body size/configuration of creeps
//   Minimum level of repair for decayable things (storage, roads, ramparts)
//   Minimum level of repair of walls

// Resource budget is complex.
// 1. Income averages to 10 energy per tick per source
// 2. A creep lasts 1500 ticks, 
//    a. takes 3 ticks per body part to build (CREEP_SPAWN_TIME)
//    b. takes a variable energy cost per body part (BODYPART_COST)
// 3. Number of structures differs at controller level (CONTROLLER_STRUCTURES, no arrays)
// 


// Determines the number of containers that are adjacent to sources.
// NOTE: THIS MUST MATCH CALCULATIONS IN role.harvester2.determine_destination()!!!
function count_source_containers(room) {
    let room_sources = room.sources;

    // Go through all sources and all nearby containers, and pick one that is not
    // claimed by another harvester2 for now.
    // TODO: Prefer to pick one at a source that isn't already claimed.
    let retval = 0;

    for (let source of room_sources) {
        let nearby_containers =
            source.pos.findInRange(FIND_STRUCTURES, 2, {filter: s => s.structureType === STRUCTURE_CONTAINER});
        // console.log(room.name + ', source: ' + source.id + ', nearby containers: ' + nearby_containers.length);
        for (let nc of nearby_containers) {
            if (nc.pos.getRangeTo(source) >= 2.0) {
                // We can't say 1.999 above I don't think, in the findInRange, so double check.
                continue;
            }
            retval++;
        } // nearby_containers
    } // room_sources

    return retval;
} // num_source_containers


// Summarizes the situation in a room in a single object.
// Room can be a string room name or an actual room object.
function summarize_room_internal(room) {
    if (_.isString(room)) {
        room = Game.rooms[room];
    }
    if (room === null) {
        return null;
    }
    if (!room.controller || !room.controller.my) {
        // Can null even happen?
        return null;
    }
    const controller_level = room.controller.level;
    const controller_progress = room.controller.progress;
    const controller_needed = room.controller.progressTotal;
    const controller_downgrade = room.controller.ticksToDowngrade;
    const controller_blocked = room.controller.upgradeBlocked;
    const controller_safemode = room.controller.safeMode ? room.controller.safeMode : 0;
    const controller_safemode_avail = room.controller.safeModeAvailable;
    const controller_safemode_cooldown = room.controller.safeModeCooldown;
    const has_storage = room.storage !== null;
    const storage_energy = room.storage ? room.storage.store[RESOURCE_ENERGY] : 0;
    const storage_minerals = room.storage ? _.sum(room.storage.store) - storage_energy : 0;
    const energy_avail = room.energyAvailable;
    const energy_cap = room.energyCapacityAvailable;
    const containers = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_CONTAINER});
    const num_containers = containers === null ? 0 : containers.length;
    const container_energy = _.sum(containers, c => c.store.energy);
    const sources = room.find(FIND_SOURCES);
    const num_sources = sources === null ? 0 : sources.length;
    const source_energy = _.sum(sources, s => s.energy);
    const links = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_LINK && s.my});
    const num_links = links === null ? 0 : links.length;
    const link_energy = _.sum(links, l => l.energy);
    const minerals = room.mineral;
    const mineral = minerals && minerals.length > 0 ? minerals[0] : null;
    const mineral_type = mineral ? mineral.mineralType : "";
    const mineral_amount = mineral ? mineral.mineralAmount : 0;
    const extractors = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_EXTRACTOR});
    const num_extractors = extractors.length;
    const creeps = _.filter(Game.creeps, c => c.memory.overlord === room.name && c.my);
    const num_creeps = creeps ? creeps.length : 0;
    const enemy_creeps = room.find(FIND_HOSTILE_CREEPS);
    const creep_energy = _.sum(Game.creeps, c => c.memory.overlord === room.name ? c.carry.energy : 0);
    const num_enemies = enemy_creeps ? enemy_creeps.length : 0;
    const spawns = room.find(FIND_MY_SPAWNS);
    const num_spawns = spawns ? spawns.length : 0;
    const spawns_spawning = _.sum(spawns, s => s.spawning ? 1 : 0);
    const towers = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_TOWER && s.my});
    const num_towers = towers ? towers.length : 0;
    const tower_energy = _.sum(towers, t => t.energy);
    const const_sites = room.find(FIND_CONSTRUCTION_SITES);
    const my_const_sites = room.find(FIND_CONSTRUCTION_SITES, {filter: cs => cs.my});
    const num_construction_sites = const_sites.length;
    const num_my_construction_sites = my_const_sites.length;
    const num_source_containers = count_source_containers(room);
    const has_terminal = room.terminal !== null;
    const terminal_energy = room.terminal ? room.terminal.store[RESOURCE_ENERGY] : 0;
    const terminal_minerals = room.terminal ? _.sum(room.terminal.store) - terminal_energy : 0;

    // Get info on all our structures
    // TODO: Split roads to those on swamps vs those on dirt
    const structure_types = new Set(room.find(FIND_STRUCTURES).map(s => s.structureType));
    const structure_info = {};
    for (const s of structure_types) {
        const ss = room.find(FIND_STRUCTURES, {filter: str => str.structureType === s});
        structure_info[s] = {
            count: ss.length,
            min_hits: _.min(ss, 'hits').hits,
            max_hits: _.max(ss, 'hits').hits,
        };
    }
    // console.log(JSON.stringify(structure_info));

    const ground_resources = room.find(FIND_DROPPED_RESOURCES);
    // const ground_resources_short = ground_resources.map(r => ({ amount: r.amount, resourceType: r.resourceType }));
    const reduced_resources = _.reduce(ground_resources, (acc, res) => {
        acc[res.resourceType] = _.get(acc, [res.resourceType], 0) + res.amount;
        return acc;
    }, {});

    // _.reduce([{resourceType: 'energy', amount: 200},{resourceType: 'energy', amount:20}], (acc, res) => { acc[res.resourceType] = _.get(acc, [res.resourceType], 0) + res.amount; return acc; }, {});

    // console.log(JSON.stringify(reduced_resources));

    // Number of each kind of creeps
    // const creep_types = src Set(creeps.map(c => c.memory.role));
    const creep_counts = _.countBy(creeps, c => c.memory.role);

    // Other things we can count:
    // Tower count, energy
    // Minimum health of ramparts, walls
    // Minimum health of roads
    // Number of roads?
    // Resources (energy/minerals) on the ground?

    // Other things we can't count but we _can_ track manually:
    // Energy spent on repairs
    // Energy spent on making creeps
    // Energy lost to links
    //
    // Energy in a source when it resets (wasted/lost energy)

    // console.log('Room ' + room.name + ': ' + JSON.stringify(retval));
    return {
        room_name: room.name, // In case this gets taken out of context
        controller_level,
        controller_progress,
        controller_needed,
        controller_downgrade,
        controller_blocked,
        controller_safemode,
        controller_safemode_avail,
        controller_safemode_cooldown,
        energy_avail,
        energy_cap,
        num_sources,
        source_energy,
        mineral_type,
        mineral_amount,
        num_extractors,
        has_storage,
        storage_energy,
        storage_minerals,
        has_terminal,
        terminal_energy,
        terminal_minerals,
        num_containers,
        container_energy,
        num_links,
        link_energy,
        num_creeps,
        creep_counts,
        creep_energy,
        num_enemies,
        num_spawns,
        spawns_spawning,
        num_towers,
        tower_energy,
        structure_info,
        num_construction_sites,
        num_my_construction_sites,
        ground_resources: reduced_resources,
        num_source_containers,
    };
} // summarize_room

function summarize_rooms() {
    const now = Game.time;

    // First check if we cached it
    if (global.summarized_room_timestamp === now) {
        return global.summarized_rooms;
    }

    let retval = {};

    for (let r in Game.rooms) {
        retval[r] = summarize_room_internal(Game.rooms[r]);
    }

    global.summarized_room_timestamp = now;
    global.summarized_rooms = retval;

    // console.log('All rooms: ' + JSON.stringify(retval));
    return retval;
} // summarize_rooms

function summarize_room(room) {
    if (_.isString(room)) {
        room = Game.rooms[room];
    }
    if (room === null) {
        return null;
    }

    const sr = summarize_rooms();

    return sr[room.name];
}

module.exports = {
    summarize_room,
    summarize_rooms,
};
