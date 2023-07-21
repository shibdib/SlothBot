/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

// BACKUP THIS FILE BETWEEN UPDATES!!!!!!!
// Use this to modify how your overlord bot runs

global.COMBAT_SERVER = []; // Insert the Game.shard.name of servers you'd like to declare everyone hostile
global.HOSTILES = []; // Manually set players as hostile
global.MANUAL_FRIENDS = []; // Manually set players as friends (overrides COMBAT_SERVER)
global.RAMPART_ACCESS = true // Allow friends and allies access thru ramparts
global.NAP_ALLIANCE = []; // Do not attack members of this alliance
global.OFFENSIVE_OPERATIONS = true; // Offensive Combat
global.HOLD_SECTOR = true; // Attack rooms in sectors you have rooms
global.ATTACK_LOCALS = false; // Attacks targets within range of the next entry
global.NEW_SPAWN_DENIAL = true; // Crush new spawns immediately
global.NCP_HOSTILE = true; // Always attack users of open source bots
global.ATTACK_COOLDOWN = 4500; //Time between attacks on a room
global.STATUS_COOLDOWN = 180; // Seconds between console status reports
global.SIGN_CLEANER = true; // Clean room signs away with explorers
global.AVOID_ALLIED_SECTORS = true; // Dont claim rooms in allied sectors
global.REMOTE_SOURCE_SCORE = 200; // Set the score for remote sources to be mined (higher means more sources but further)
global.REMOTE_SOURCE_TARGET = 6; // The number of remote sources a room looks to have
global.AVOID_ATTACKING_ALLIANCES = true; // Check LOAN and avoid attacking people in alliances
global.GENERATE_PIXELS = true; // Generate pixels sporadically

// Seasonal Specific
global.SEASON_RCL_CUTOFF = 8; // Only score in rooms greater than or equal to this

// Signing and whatnot
global.OWNED_ROOM_SIGNS = ["~~~NO ENTRY - Full Automation In Progress - NO ENTRY~~~"];
global.RESERVE_ROOM_SIGNS = ["~~RESTRICTED - Deadly Force Authorized - RESTRICTED~~"];
global.EXPLORED_ROOM_SIGNS = ["We Noticed", "We're Everywhere", "We Know", "We See You", "We're Watching"];
global.ATTACK_ROOM_SIGNS = ["~~ALL YOUR BASE BELONG TO ME~~"];
global.EXPLORER_SPAM = ['HI', 'Hello', 'Beep', 'Boop', 'Aloha', 'Shibby!'];

// The boosts you want labs to focus on first (resources permitted)
global.LAB_PRIORITY = [RESOURCE_GHODIUM_ACID, RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID];
// If credits permit, buy these boosts
global.BUY_THESE_BOOSTS = [RESOURCE_GHODIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID];