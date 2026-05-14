/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// BACKUP THIS FILE BETWEEN UPDATES!!!!!!!


// General Settings
global.STATUS_COOLDOWN = 180; // Seconds between console status reports
global.GENERATE_PIXELS = false; // Generate pixels when feasible (not in war)
global.PIXEL_FARM = false; // Use this on spawn ins, bot will do nothing but farm pixels and keep the room from decaying
global.SELL_PIXELS = false; // Sell pixels
global.PIXEL_BUFFER = 1000; // Sell any pixels above this amount
global.DESIRED_LOGGING_LEVEL = 4; //Set level 1-5 (5 being most info)
global.TOWER_FIRST = false; // Set to true to have towers built before spawns
global.FORCE_CLAIM = undefined;

// Diplomacy
global.AVOID_ALLIED_SECTORS = true; // Try not to claim rooms in allied sectors
global.COMBAT_SERVER = false; // If you'd like to declare everyone hostile
global.HOSTILES = []; // Manually set players as hostile
global.MANUAL_FRIENDS = []; // Manually set players as friends (overrides COMBAT_SERVER)
global.NO_DIRECT_ATTACKS = []; // Manually set players that will not be directly attacked but are also no friends
global.RAMPART_ACCESS = false // Allow friends and allies access through ramparts. Having this disabled does save CPU.
global.NAP_ALLIANCE = []; // Do not attack members of this alliance
global.FUNNEL_REQUESTS = false; // Whether to make energy funneling requests

// Remote Mining
global.REMOTE_MINING = true; // Whether we remote mine or not
global.REMOTE_DISTANCE_MAX = 125; // Max distance score per source
global.SK_MINING = true; // Do we SK mine
global.SK_MINING_LEVEL = 7; // What level do we do this (won't work before 7 atm)

// Combat Settings
global.OFFENSIVE_OPERATIONS = false; // Offensive Combat, disabling this will disable all offensive operations
global.HARASSMENT_OPERATIONS = false; // Proactive harassers that will target people on the threat list
global.HOLD_SECTOR = true; // Attack rooms in sectors you have rooms
global.ATTACK_LOCALS = false; // Attacks targets within range indiscriminately. Bot will still attack aggressors.
global.NEW_SPAWN_DENIAL = false; // Crush new spawns immediately
global.NCP_HOSTILE = false; // Always attack users of open source bots
global.ATTACK_COOLDOWN = 3000; //Time between attacks on a room
global.AVOID_ATTACKING_ALLIANCES = true; // Check LOAN and avoid attacking people in alliances
global.DEFENSIVE_BUBBLE = 2; // What range are we more aggressive

// Market Settings
global.BUY_ENERGY = false; // If true it will buy energy when above the buffer
global.BUY_ENERGY_CREDIT_BUFFER = 500000; // Stay above this to buy energy
global.CREDIT_BUFFER = 10000; // Stay above this amount
global.TERMINAL_ENERGY_BUFFER = 10000; // Keep this much in terminal (Needed for trade)
global.SELL_BOOSTS = false; // If we should sell spare boosts or not
global.SELL_ENERGY = false;

// Room Build
global.BUNKER_LEVEL = 6;
global.SPECIAL_RAMPARTS = 8; // What level do we build ramparts on important structures/controller/sources/on-ramps
global.PROTECT_STRUCTURES = true; // Rampart significant structures (tied to the above)
global.PROTECT_CONTROLLER = true; // Build ramparts around the controller
global.PROTECT_MINERAL = false; // Build ramparts around the mineral
global.PROTECT_SOURCES = false; // Build ramparts around the source
global.ROAD_LEVEL = 4 // What level to build roads

// Manual Operations
global.MANUAL_OPERATIONS = []; // Manually set rooms to attack

// Signing and whatnot
global.SIGN_ROOMS = true;
global.OWNED_ROOM_SIGNS = [
    "SlothBot by Shibdib"
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