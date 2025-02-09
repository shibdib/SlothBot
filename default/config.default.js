/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// BACKUP THIS FILE BETWEEN UPDATES!!!!!!!
// Use this to modify how your overlord bot runs


// General Settings
global.STATUS_COOLDOWN = 180; // Seconds between console status reports
global.SIGN_CLEANER = true; // Clean room signs away with explorers
global.AVOID_ALLIED_SECTORS = true; // Try not to claim rooms in allied sectors
global.GENERATE_PIXELS = false; // Generate pixels when feasible (not in war)
global.PIXEL_FARM = false; // Use this on spawn ins, bot will do nothing but farm pixels and keep the room from decaying
global.SELL_PIXELS = false; // Sell pixels
global.PIXEL_BUFFER = 1000; // Sell any pixels above this amount
global.DESIRED_LOGGING_LEVEL = 4; //Set level 1-5 (5 being most info)
global.TOWER_FIRST = false; // Set to true to have towers built before spawns

// Diplomacy
global.COMBAT_SERVER = false; // If you'd like to declare everyone hostile
global.HOSTILES = []; // Manually set players as hostile
global.MANUAL_FRIENDS = []; // Manually set players as friends (overrides COMBAT_SERVER)
global.NO_DIRECT_ATTACKS = []; // Manually set players that will not be directly attacked but are also no friends
global.RAMPART_ACCESS = false // Allow friends and allies access through ramparts. Having this disabled does save CPU.
global.NAP_ALLIANCE = []; // Do not attack members of this alliance

// Remote Mining
global.REMOTE_MINING = true; // Whether we remote mine or not
global.REMOTE_DISTANCE_MAX = 75; // Max distance score per source
global.SK_MINING = true; // Do we SK mine
global.SK_MINING_LEVEL = 7; // What level do we do this (won't work before 7 atm)

// Combat Settings
global.OFFENSIVE_OPERATIONS = true; // Offensive Combat, disabling this will disable all offensive operations
global.HARASSMENT_OPERATIONS = true; // Random harassing attacks
global.HOLD_SECTOR = true; // Attack rooms in sectors you have rooms
global.ATTACK_LOCALS = false; // Attacks targets within range indiscriminately. Bot will still attack aggressors.
global.NEW_SPAWN_DENIAL = false; // Crush new spawns immediately
global.NCP_HOSTILE = true; // Always attack users of open source bots
global.ATTACK_COOLDOWN = 4500; //Time between attacks on a room
global.AVOID_ATTACKING_ALLIANCES = true; // Check LOAN and avoid attacking people in alliances

// Market Settings
global.BUY_ENERGY = false; // If true it will buy energy when above the buffer
global.BUY_ENERGY_CREDIT_BUFFER = 500000; // Stay above this to buy energy
global.CREDIT_BUFFER = 10000; // Stay above this amount
global.MINERAL_TRADE_AMOUNT = 10000;  // Hold this much of a mineral before selling
global.REACTION_AMOUNT = 10000; // Minimum amount we aim for base minerals
global.TERMINAL_ENERGY_BUFFER = 10000; // Keep this much in terminal (Needed for trade)
global.SELL_BOOSTS = false; // If we should sell spare boosts or not
global.BOOST_AMOUNT = 15000; // Try to have this much of all applicable boosts
global.DUMP_AMOUNT = 40000; // Fills buys (or if overflowing it will offload to other terminals)

// Room Ramparts
global.BUNKER_LEVEL = 4; // What level do we start building the bunker
global.SPECIAL_RAMPARTS = 7; // What level do we build ramparts on important structures/controller/sources
global.RAMPARTS_ONLY = true; // Only build ramparts and not a checkered pattern
global.PROTECT_STRUCTURES = true; // Rampart significant structures
global.PROTECT_CONTROLLER = false; // Include controller in the bunker algorithm
global.PROTECT_MINERAL = false; // Include mineral in the bunker algorithm
global.PROTECT_SOURCES = false; // Include sources in the bunker algorithm

// Energy Targets
global.ENERGY_TARGETS = {
    1: 0,
    2: 0,
    3: 0,
    4: 25000,
    5: 50000,
    6: 125000,
    7: 250000,
    8: 500000
}

// Signing and whatnot
global.OWNED_ROOM_SIGNS = [
    "SlothBot"
];

global.RESERVE_ROOM_SIGNS = [
    "Protected Territory - Unauthorized Entry Prohibited"
];

global.EXPLORED_ROOM_SIGNS = [
    "Explored by SlothBot"
];

global.ATTACK_ROOM_SIGNS = [
    "SlothBot"
];