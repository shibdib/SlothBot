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
global.NAP_ALLIANCE = []; // Do not attack members of this alliance
global.ATTACK_LOCALS = true; // Attacks targets within range of the next entry
global.LOCAL_SPHERE = 2; // Range that rooms consider local via linear distance
global.NEW_SPAWN_DENIAL = true; // Crush new spawns immediately
global.POKE_ATTACKS = true; // Small cheap annoying attacks
global.POKE_NEUTRALS = false; // Poke everyone
global.HARASS_ATTACKS = true; // Larger disrupting attacks
global.SIEGE_ENABLED = false; //Attack owned rooms with towers
global.NCP_HOSTILE = true; // Always attack users of open source bots
global.ATTACK_COOLDOWN = 4500; //Time between attacks on a room

// Signing and whatnot
global.OWNED_ROOM_SIGNS = ["~~~NO ENTRY~~~", "Full Auto Overlord Bot"];
global.RESERVE_ROOM_SIGNS = ["~~This is a restricted area, violators will be attacked~~", "~~Exclusion Zone~~"];
global.EXPLORED_ROOM_SIGNS = ["~~HELLO!~~"];
global.ATTACK_ROOM_SIGNS = ["~~ALL YOUR BASE BELONG TO ME~~"];
global.EXPLORER_SPAM = ['HI', 'Hello', 'Beep', 'Boop', 'Aloha', 'Shibby!'];

// Attack limits (Too high and your CPU is screwed, hard coded for non subs)
global.POKE_LIMIT = 2;
global.CLEAN_LIMIT = 1;
global.HARASS_LIMIT = 2;

// Wall and rampart target amounts
global.BARRIER_TARGET_HIT_POINTS = {
    1: 1000,
    2: 50000,
    3: 200000,
    4: 450000,
    5: 750000,
    6: 1500000,
    7: 5000000,
    8: 10000000
};

// Amount targets (Advanced)
global.CREDIT_BUFFER = 100000;
global.TRADE_AMOUNT = 10000;
global.ENERGY_AMOUNT = 50000;
global.TERMINAL_ENERGY_BUFFER = 12000;
global.SIEGE_ENERGY_AMOUNT = 100000;
global.REACTION_AMOUNT = 500;
global.SELL_OFF_AMOUNT = 12500;
global.BOOST_AMOUNT = 5000;
global.DUMP_AMOUNT = TRADE_AMOUNT * 2.25;

// Max prices
global.ENERGY_BUY_MAX = 0.02;
global.END_GAME_SALE_MAX = 2.25;
global.TIER_2_SALE_MAX = 1.25;
global.TIER_1_SALE_MAX = 0.75;
global.BASE_COMPOUNDS_SALE_MAX = 0.35;
global.GHODIUM_SALE_MAX = 1.1;
global.BASE_RESOURCES_SALE_MAX = 0.35;