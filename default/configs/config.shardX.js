/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

// BACKUP THIS FILE BETWEEN UPDATES!!!!!!!


// General Settings
global.STATUS_COOLDOWN = 180; // Seconds between console status reports
global.GENERATE_PIXELS = false; // Generate pixels when feasible (not in war)
global.PIXEL_FARM = false; // Use this on spawn ins, bot will do nothing but farm pixels and keep the room from decaying
global.SELL_PIXELS = true; // Sell pixels
global.PIXEL_BUFFER = 1000; // Sell any pixels above this amount
global.DESIRED_LOGGING_LEVEL = 4; //Set level 1-5 (5 being most info)
global.TOWER_FIRST = false; // Set to true to have towers built before spawns
global.FORCE_CLAIM = undefined;

// Diplomacy
global.AVOID_ALLIED_SECTORS = true; // Try not to claim rooms in allied sectors
global.COMBAT_SERVER = false; // If you'd like to declare everyone hostile
global.HOSTILES = []; // Manually set players as hostile
global.MANUAL_FRIENDS = ['Screepburner', 'kirk', 'WoodenRobot', 'Trollmones']; // Manually set players as friends (overrides COMBAT_SERVER)
global.NO_DIRECT_ATTACKS = ['0xDEADFEED']; // Manually set players that will not have their rooms sieged but still can be harassed
global.MANUAL_WAR_TARGETS = []; // Always-war list. Bypasses standing/qualification and is included in WAR_TARGETS even when otherwise at peace.
global.RAMPART_ACCESS = true // Allow friends and allies access through ramparts. Having this disabled does save CPU.
global.NAP_ALLIANCE = []; // Do not attack members of this alliance
global.FUNNEL_REQUESTS = false; // Whether to make energy funneling requests

// Remote Mining
global.REMOTE_MINING = true; // Whether we remote mine or not
global.REMOTE_DISTANCE_MAX = 65; // Max distance score per source (single-hauler service radius at RCL7+)
global.REMOTE_ROUTE_MAX = 3; // Max intel-weighted map hops for remote mining routes
global.REMOTE_ROUTE_PROBE_MAX = 8; // Max remote candidates considered per colony per refresh
global.REMOTE_ROUTE_PROBE_BUDGET = 3; // Empire-wide Game.map.findRoute calls for remotes per tick
global.REMOTE_LINEAR_MAX = 4; // Max linear room distance before route probe
global.REMOTE_SCORE_ROUTE_MULT = 20; // Estimate score multiplier per map hop
global.REMOTE_SCORE_ROUTE_BASE = 12; // Estimate score base offset
global.REMOTE_SCORE_SWAMP_PENALTY = 8; // Extra estimate score for swamp remotes
global.REMOTE_SCORE_PATH_MULT = 2; // Reject visible path scores above estimate * this (blocks winding paths)
global.REMOTE_NO_ROAD_SCORE_RATIO = 0.8; // Block high-score remotes without roads above MAX * ratio
global.REMOTE_MAX_ROOMS_RCL6 = 2; // Max distinct remote rooms per RCL6 colony
global.REMOTE_MAX_ROOMS_RCL7 = 4; // Max distinct remote rooms per RCL7 colony
global.REMOTE_MAX_ROOMS_RCL8 = 5; // Max distinct remote rooms per RCL8 colony
global.REMOTE_REFRESH_STAGGER = 150; // Spread refreshRemoteRoomTargets across ticks
global.REMOTE_MINING_ROUTE_TTL = 1500; // miningRoutes cache TTL (ticks)
global.SK_MINING = true; // Do we SK mine
global.SK_MINING_LEVEL = 7; // What level do we do this (won't work before 7 atm)
global.SK_MINING_MAX_ROOMS = 1; // Max source-keeper rooms a colony will mine

// Combat Settings
global.OFFENSIVE_OPERATIONS = true; // Room attacks (occupy / remote denial / siege). Harassment is independent.
global.OFFENSIVE_NUKES = true; // Escalate stalled roomDenial sieges with nukes
global.OFFENSIVE_NUKE_RESERVE = 1; // Keep this many loaded nukers available for MAD retaliation
global.OFFENSIVE_NUKE_COOLDOWN = 50000; // Ticks between proactive nuke launches (matches nuke land time)
global.OFFENSIVE_NUKE_MIN_WAVES = 3; // Require this many siege waves plus remaining towers before escalating
global.HARASSMENT_OPERATIONS = true; // Cheap longbows that raid threat remotes. Works when OFFENSIVE_OPERATIONS is false.
global.HARASSMENT_BUDGET_RATIO = 0.15; // Share of combat-ready rooms used as harasser cap
global.HARASSMENT_MAX = 3; // Hard cap on simultaneous harassers
global.REMOTE_DENIAL_MAX_WITH_HARASS = 1; // Fallback remote denial if harassment has no remotes
global.REMOTE_DENIAL_MAX_WITHOUT_HARASS = 3;
global.HOLD_SECTOR = true; // Attack rooms in sectors you have rooms
global.NEW_SPAWN_DENIAL = false; // Immediately occupy/siege RCL<=3 rooms of war targets (skips attack cooldown)
global.NCP_HOSTILE = false; // Always attack users of open source bots
global.ATTACK_COOLDOWN = 1500; //Time between attacks on a room
global.AVOID_ATTACKING_ALLIANCES = true; // Check LOAN and avoid attacking people in alliances
global.DEFENSIVE_BUBBLE = 1; // What range are we more aggressive

// Market Settings
global.BUY_ENERGY = true; // If true it will buy energy when above the buffer
global.BUY_ENERGY_CREDIT_BUFFER = 500000; // Stay above this to buy energy
global.CREDIT_BUFFER = 10000; // Stay above this amount
global.TERMINAL_ENERGY_BUFFER = 15000; // Floor retained after sends, trades, and tx costs
global.TERMINAL_ENERGY_TARGET = 35000; // Export-ready level (buffer + 10k send + tx headroom)
global.SELL_BOOSTS = true; // If we should sell spare boosts or not
global.SELL_ENERGY = false;

// Room Build
// Rampart levels
global.BUNKER_LEVEL = 6;
global.SPECIAL_RAMPARTS = 8; // What level do we build ramparts on important structures/controller/sources/on-ramps
global.PROTECT_STRUCTURES = true; // Rampart significant structures (tied to the above)
global.PROTECT_CONTROLLER = true; // Build ramparts around the controller
global.PROTECT_MINERAL = false; // Build ramparts around the mineral
global.PROTECT_SOURCES = false; // Build ramparts around the source
global.ROAD_LEVEL = 4 // What level to build roads
global.MAX_CONSTRUCTION_SITES_PER_ROOM = 5; // Per-room cap so one room cannot hog the global 100-site limit

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