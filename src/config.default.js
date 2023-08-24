/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

// BACKUP THIS FILE BETWEEN UPDATES!!!!!!!
// Use this to modify how your overlord bot runs


// General Settings
global.STATUS_COOLDOWN = 180; // Seconds between console status reports
global.SIGN_CLEANER = true; // Clean room signs away with explorers
global.AVOID_ALLIED_SECTORS = true; // Try not to claim rooms in allied sectors
global.GENERATE_PIXELS = true; // Generate pixels when feasible (not in war)
global.PIXEL_FARM = false; // Use this on spawn ins, bot will do nothing but farm pixels and keep the room from decaying
global.PIXEL_BUFFER = 1000; // Sell any pixels above this amount
global.DESIRED_LOGGING_LEVEL = 4; //Set level 1-5 (5 being most info)

// Diplomacy
global.COMBAT_SERVER = []; // Insert the Game.shard.name of servers you'd like to declare everyone hostile
global.HOSTILES = []; // Manually set players as hostile
global.MANUAL_FRIENDS = []; // Manually set players as friends (overrides COMBAT_SERVER)
global.RAMPART_ACCESS = false // Allow friends and allies access through ramparts. Having this disabled does save CPU.
global.NAP_ALLIANCE = []; // Do not attack members of this alliance

// Combat Settings
global.OFFENSIVE_OPERATIONS = true; // Offensive Combat, disabling this will disable all offensive operations
global.HOLD_SECTOR = true; // Attack rooms in sectors you have rooms
global.ATTACK_LOCALS = false; // Attacks targets within range indiscriminately. Bot will still attack aggressors.
global.NEW_SPAWN_DENIAL = true; // Crush new spawns immediately
global.NCP_HOSTILE = true; // Always attack users of open source bots
global.ATTACK_COOLDOWN = 4500; //Time between attacks on a room
global.AVOID_ATTACKING_ALLIANCES = true; // Check LOAN and avoid attacking people in alliances

// Market Settings
global.BUY_ENERGY = true; // If true it will buy energy when above the buffer
global.BUY_ENERGY_CREDIT_BUFFER = 500000; // Stay above this to buy energy
global.CREDIT_BUFFER = 5000; // Stay above this amount
global.MINERAL_TRADE_AMOUNT = 10000;  // Hold this much of a mineral before selling
global.BOOST_TRADE_AMOUNT = 15000;  // Hold this much of a boost before selling
global.REACTION_AMOUNT = 10000; // Minimum amount we aim for base minerals
global.TERMINAL_ENERGY_BUFFER = 10000; // Keep this much in terminal (Needed for trade)
global.STORAGE_ENERGY_BUFFER = 50000; // Keep this much in storage (useful for sieges but may slow down praising if too high)
global.BOOST_AMOUNT = 10000; // Try to have this much of all applicable boosts
global.DUMP_AMOUNT = 40000; // Fills buys (or if overflowing it will offload to other terminals)

// Room Ramparts
global.RAMPARTS_ONLY = true; // Only build ramparts and not a checkered pattern
global.PROTECT_CONTROLLER = false; // Include controller in the bunker algorithm
global.PROTECT_MINERAL = false; // Include mineral in the bunker algorithm
global.PROTECT_SOURCES = false; // Include sources in the bunker algorithm

// Signing and whatnot
global.OWNED_ROOM_SIGNS = ["~~~NO ENTRY - Full Automation In Progress - NO ENTRY~~~"];
global.RESERVE_ROOM_SIGNS = ["~~RESTRICTED - Deadly Force Authorized - RESTRICTED~~"];
global.EXPLORED_ROOM_SIGNS = ["We Noticed", "We're Everywhere", "We Know", "We See You", "We're Watching"];
global.ATTACK_ROOM_SIGNS = ["~~ALL YOUR BASE BELONG TO ME~~"];
global.EXPLORER_SPAM = ['HI', 'Hello', 'Beep', 'Boop', 'Aloha', 'Shibby!'];

// The boosts you want labs to focus on first (resources permitted)
global.LAB_PRIORITY = [RESOURCE_GHODIUM, RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ACID];
// If credits permit, buy these boosts
global.BUY_THESE_BOOSTS = [RESOURCE_GHODIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID];