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
global.RAMPART_ACCESS = false // Allow friends and allies access through ramparts. Having this disabled does save CPU.
global.NAP_ALLIANCE = []; // Do not attack members of this alliance

// Remote Mining
global.REMOTE_MINING = true; // Whether we remote mine or not
global.REMOTE_DISTANCE_MAX = 75; // Max distance score per source
global.SK_MINING = true; // Do we SK mine
global.SK_MINING_LEVEL = 7; // What level do we do this (won't work before 7 atm)

// Combat Settings
global.OFFENSIVE_OPERATIONS = true; // Offensive Combat, disabling this will disable all offensive operations
global.HARASSMENT_OPERATIONS = false; // Random harassing attacks
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
global.BOOST_TRADE_AMOUNT = 15000;  // Hold this much of a boost before selling
global.REACTION_AMOUNT = 10000; // Minimum amount we aim for base minerals
global.TERMINAL_ENERGY_BUFFER = 10000; // Keep this much in terminal (Needed for trade)
global.STORAGE_ENERGY_BUFFER = 50000; // Keep this much in storage (useful for sieges but may slow down praising if too high)
global.BOOST_AMOUNT = 10000; // Try to have this much of all applicable boosts
global.DUMP_AMOUNT = 40000; // Fills buys (or if overflowing it will offload to other terminals)

// Room Ramparts
global.BUNKER_LEVEL = 4; // What level do we start building the bunker
global.SPECIAL_RAMPARTS = 8; // What level do we build ramparts on important structures/controller/sources
global.RAMPARTS_ONLY = true; // Only build ramparts and not a checkered pattern
global.PROTECT_STRUCTURES = true; // Rampart significant structures
global.PROTECT_CONTROLLER = false; // Include controller in the bunker algorithm
global.PROTECT_MINERAL = false; // Include mineral in the bunker algorithm
global.PROTECT_SOURCES = false; // Include sources in the bunker algorithm

// Signing and whatnot
global.OWNED_ROOM_SIGNS = [
    "Managed by SlothBot",
    "This Room is Under SlothBot's Watchful Gaze",
    "Welcome to SlothBot's Domain",
    "SlothBot's Territory"
];

global.RESERVE_ROOM_SIGNS = [
    "Protected Territory - Unauthorized Entry Prohibited",
    "Enter at Your Own Risk - Security Measures in Place",
    "Beware: Advanced Defense Systems Active",
    "Private Property - Trespassing Will Be Met with Countermeasures",
    "Hostile Environment - No Safe Passage",
    "Warning: Experimental AI Surveillance",
    "Proceed with Caution - Monitored Area",
    "Beware: Automated Defenders on Patrol",
    "Intruders Will Be Met with Aggression",
    "Restricted Access",
    "Tread Lightly - You Are on SlothBot's Watch List"
];

global.EXPLORED_ROOM_SIGNS = [
    "Explored by SlothBot",
    "SlothBot Surveillance",
    "Your Moves Are Known",
    "Observation Complete",
    "SlothBot: Eyes Everywhere",
    "SlothBot",
    "SlothBot Knows",
    "SlothBot Has Been Here",
    "This Room's Secrets Are Now SlothBot's",
    "We've Seen It All",
    "SlothBot Has Explored Here"
];

global.ATTACK_ROOM_SIGNS = [
    "SlothBot Declares War - Resistance is Futile",
    "Surrender or Face the Wrath of SlothBot",
    "SlothBot's Offensive - Slow but Inevitable"
];

// The boosts you want labs to focus on first (resources permitted)
global.LAB_PRIORITY = [RESOURCE_GHODIUM, RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ACID];
// If credits permit, buy these boosts
global.BUY_THESE_BOOSTS = [RESOURCE_GHODIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID];