/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const Log = require('logger');
let activeConfig;

// noinspection JSUnresolvedReference
let globals = function () {

    global.PROFILER_ENABLED = true; // Disable if you don't want to use the profiler. Should save CPU.

    // Creep build priorities (Lower is higher priority)
    global.PRIORITIES = {
        // Harvesters
        stationaryHarvester: 1,
        // Workers
        upgrader: 6, drone: 6, mineralHarvester: 7,
        // Haulers — slightly behind harvesters since they're gated by harvester presence
        hauler: 2, miscHauler: 7,
        // Remotes — harvesters before haulers (a hauler without a harvester does nothing)
        remoteHarvester: 4, remoteHauler: 5, roadBuilder: 7, fuelTruck: 8, reserver: 6,
        // Military
        defender: 3, extreme: 3, priority: 4, urgent: 5, high: 6, medium: 7, secondary: 9
    };

    //
    //
    //
    //  DO NOT EDIT BELOW THIS LINE
    //
    //
    //


    const slothBotASCII = `
      SSSSS  L       OOO   TTTTT  H   H   BBBBB   OOO   TTTTT
     S        L      O   O    T    H   H   B    B O   O    T
      SSS     L      O   O    T    HHHHH   BBBBB  O   O    T
         S    L      O   O    T    H   H   B    B O   O    T
     SSSSS    LLLLL   OOO     T    H   H   BBBBB   OOO     T
     
     https://github.com/shibdib/SlothBot
    `;

    console.log(slothBotASCII);

    // Try to load a private server config otherwise load the default
    console.log(`Global Reset - Last reset occurred ${Game.time - (Memory.lastGlobalReset || Game.time)} ticks ago.`);
    Memory.lastGlobalReset = Game.time;

    try {
        const configFile = activeConfig || `config.${Game.shard.name}`;
        require(configFile);
        activeConfig = activeConfig || `config.${Game.shard.name}`;

        console.log('------------------------------------------------------------------');
        console.log(`Loaded config for ${Game.shard.name}`);

        const combatMessage = COMBAT_SERVER
            ? 'Combat Server Mode Active - All Players Considered Hostile'
            : `Manual Enemies - ${HOSTILES.toString()}\nManual Allies - ${MANUAL_FRIENDS.toString()}`;

        console.log(combatMessage);

        if (COMBAT_SERVER) {
            console.log(`Manual Allies (Overrides the above) - ${MANUAL_FRIENDS.toString()}`);
        }

        console.log('------------------------------------------------------------------');
    } catch (e) {
        const fallbackConfig = activeConfig || 'config.default';
        require(fallbackConfig);
        activeConfig = 'config.default';

        console.log('------------------------------------------------------------------');
        console.log('No custom config found, loading default config.');
        console.log("Create a custom config using the naming scheme 'config.shardName.js'");

        const fallbackMessage = COMBAT_SERVER
            ? 'Combat Server Mode Active - All Players Considered Hostile'
            : `Manual Enemies - ${HOSTILES.toString()}\nManual Allies - ${MANUAL_FRIENDS.toString()}`;

        console.log(fallbackMessage);

        if (COMBAT_SERVER) {
            console.log(`Manual Allies (Overrides the above) - ${MANUAL_FRIENDS.toString()}`);
        }

        console.log('------------------------------------------------------------------');
    }

    // Config
    global.BOOST_AMOUNT = function (room, boost) {
        const base = room.level === 6 ? 5000 : room.level === 7 ? 25000 : 50000;
        if (!boost) return base;
        // T3 is the end-goal stockpile (largest target). T1/T2 are intermediate —
        // we want plenty for conversion and direct-use boosting, but at half the volume.
        if (TIER_3_BOOSTS.includes(boost) || BASE_COMPOUNDS.includes(boost)) return base;
        if (TIER_2_BOOSTS.includes(boost)) return Math.floor(base * 0.5);
        if (TIER_1_BOOSTS.includes(boost)) return Math.floor(base * 0.5);
        return base;
    };
    global.DUMP_AMOUNT = 50000; // Fills buys (or if overflowing it will offload to other terminals)
    global.REACTION_AMOUNT = 10000; // Minimum amount we aim for base minerals

    // Versioning for cache purposes
    global.PATHFINDER_VERSION = 1;
    global.INTEL_VERSION = 5;
    global.RAMPART_VERSION = 1;

    // Debug
    global.PATHING_DEBUG = false;

    // Global cache for roles
    global.ROLE_CACHE = {};

    // Combat roles
    global.COMBAT_ROLES = ['attacker', 'claimAttacker', 'defender', 'longbow']

    // Reaction
    // Prio - RA, Heals, Repairs, praising, tough
    global.LAB_WAR_PRIORITY = [RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ACID];
    global.LAB_PEACE_PRIORITY = [RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ALKALIDE];
    global.BUY_THESE_BOOSTS = [RESOURCE_GHODIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID];
    global.TIER_3_BOOSTS = [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE];
    global.TIER_2_BOOSTS = [RESOURCE_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_ACID, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID, RESOURCE_KEANIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_UTRIUM_ACID];
    global.TIER_1_BOOSTS = [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_OXIDE, RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_LEMERGIUM_OXIDE, RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_KEANIUM_OXIDE, RESOURCE_KEANIUM_HYDRIDE, RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_OXIDE];
    global.BASE_COMPOUNDS = [RESOURCE_GHODIUM, RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE, RESOURCE_HYDROXIDE, RESOURCE_GHODIUM];
    global.BASE_MINERALS = [RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM, RESOURCE_KEANIUM, RESOURCE_ZYNTHIUM, RESOURCE_CATALYST];
    global.ALL_BOOSTS = _.union(TIER_3_BOOSTS, TIER_2_BOOSTS, TIER_1_BOOSTS, BASE_COMPOUNDS);

    // Commodities
    global.MAKE_THESE_COMMODITIES = [];
    global.BASE_COMMODITIES = [RESOURCE_SILICON, RESOURCE_METAL, RESOURCE_BIOMASS, RESOURCE_MIST];
    global.COMPRESSED_COMMODITIES = [RESOURCE_UTRIUM_BAR, RESOURCE_LEMERGIUM_BAR, RESOURCE_ZYNTHIUM_BAR, RESOURCE_KEANIUM_BAR, RESOURCE_GHODIUM_MELT, RESOURCE_OXIDANT, RESOURCE_REDUCTANT, RESOURCE_PURIFIER, RESOURCE_BATTERY];
    global.REGIONAL_0_COMMODITIES = [RESOURCE_WIRE, RESOURCE_CELL, RESOURCE_ALLOY, RESOURCE_CONDENSATE];
    global.REGIONAL_1_COMMODITIES = [RESOURCE_SWITCH, RESOURCE_PHLEGM, RESOURCE_TUBE, RESOURCE_CONCENTRATE];
    global.REGIONAL_2_COMMODITIES = [RESOURCE_TRANSISTOR, RESOURCE_TISSUE, RESOURCE_FIXTURES, RESOURCE_EXTRACT];
    global.REGIONAL_3_COMMODITIES = [RESOURCE_MICROCHIP, RESOURCE_MUSCLE, RESOURCE_FRAME, RESOURCE_SPIRIT];
    global.REGIONAL_4_COMMODITIES = [RESOURCE_CIRCUIT, RESOURCE_ORGANOID, RESOURCE_HYDRAULICS, RESOURCE_EMANATION];
    global.REGIONAL_5_COMMODITIES = [RESOURCE_DEVICE, RESOURCE_ORGANISM, RESOURCE_MACHINE, RESOURCE_ESSENCE];
    global.HIGHER_COMMODITIES = [RESOURCE_COMPOSITE, RESOURCE_CRYSTAL, RESOURCE_LIQUID];
    global.MANUFACTURED_COMMODITIES = _.union(BASE_COMMODITIES, HIGHER_COMMODITIES, REGIONAL_0_COMMODITIES, REGIONAL_1_COMMODITIES, REGIONAL_2_COMMODITIES, REGIONAL_3_COMMODITIES, REGIONAL_4_COMMODITIES, REGIONAL_5_COMMODITIES);
    global.ALL_COMMODITIES = _.union(BASE_COMMODITIES, HIGHER_COMMODITIES, REGIONAL_0_COMMODITIES, REGIONAL_1_COMMODITIES, REGIONAL_2_COMMODITIES, REGIONAL_3_COMMODITIES, REGIONAL_4_COMMODITIES, REGIONAL_5_COMMODITIES, COMPRESSED_COMMODITIES);

    // Commodity resource types
    global.COMMODITY_RESOURCE_TYPES = {
        [RESOURCE_WIRE]: RESOURCE_UTRIUM,
        [RESOURCE_CELL]: RESOURCE_LEMERGIUM,
        [RESOURCE_ALLOY]: RESOURCE_ZYNTHIUM,
        [RESOURCE_CONDENSATE]: RESOURCE_KEANIUM
    }

    //Cache stuff
    global.CACHE = {};
    global.ROUTE_CACHE = CACHE.ROUTE_CACHE = {};
    global.PATH_CACHE = CACHE.PATH_CACHE = {};
    global.ROAD_CACHE = CACHE.ROAD_CACHE = {};
    global.ROOM_CPU_ARRAY = CACHE.ROOM_CPU_ARRAY = {};
    global.ROOM_REMOTE_TARGETS = CACHE.ROOM_REMOTE_TARGETS = {};
    global.ROOM_HARVESTER_EXTENSIONS = CACHE.ROOM_HARVESTER_EXTENSIONS = {};
    global.ALLY_HELP_REQUESTS = CACHE.ALLY_HELP_REQUESTS = {};
    global.INTEL = CACHE.INTEL = {};
    global.MY_MINERALS = CACHE.MY_MINERALS = {};
    global.CREEP_QUEUES = CACHE.CREEP_QUEUES = {};
    global.MARKET_HISTORY = CACHE.MARKET_HISTORY = {};
    global.ORDER_CACHE = CACHE.ORDER_CACHE = {};
    global.TOWER_DAMAGE_CACHE = CACHE.TOWER_DAMAGE_CACHE = {};
    global.ROOM_RAMPART_SPOTS = CACHE.ROOM_RAMPART_SPOTS = {};

    // Set some diplo stuff
    global.ENEMIES = [];
    global.THREATS = [];
    global.MY_ROOMS = [];
    global.FRIENDLIES = [];

    // Declare intel cache

    global.ICONS = {
        [STRUCTURE_CONTROLLER]: "\uD83C\uDFF0",
        [STRUCTURE_SPAWN]: "\uD83C\uDFE5",
        [STRUCTURE_EXTENSION]: "\uD83C\uDFEA",
        [STRUCTURE_CONTAINER]: "\uD83D\uDCE4",
        [STRUCTURE_STORAGE]: "\uD83C\uDFE6",
        [STRUCTURE_RAMPART]: "\uD83D\uDEA7",
        [STRUCTURE_WALL]: "\u26F0",
        [STRUCTURE_TOWER]: "\uD83D\uDD2B",
        [STRUCTURE_ROAD]: "\uD83D\uDEE3",
        [STRUCTURE_LINK]: "\uD83D\uDCEE",
        [STRUCTURE_EXTRACTOR]: "\uD83C\uDFED",
        [STRUCTURE_LAB]: "\u2697",
        [STRUCTURE_TERMINAL]: "\uD83C\uDFEC",
        [STRUCTURE_OBSERVER]: "\uD83D\uDCE1",
        [STRUCTURE_POWER_SPAWN]: "\uD83C\uDFDB",
        [STRUCTURE_NUKER]: "\u2622",
        [STRUCTURE_KEEPER_LAIR]: "" // TODO: Add icon for keeper lair
        ,
        [STRUCTURE_PORTAL]: "" // TODO: Add icon for portal
        ,
        [STRUCTURE_POWER_BANK]: "" // TODO: Add icon for power bank
        ,
        source: "" // TODO: Add icon for source
        ,
        constructionSite: "\uD83C\uDFD7",
        resource: "\uD83D\uDEE2",
        creep: "" // TODO: Add icon for creep
        ,
        moveTo: "\u27A1",
        attack: "\uD83D\uDDE1" // NOTE: Same as attackController
        ,
        build: "\uD83D\uDD28",
        repair: "\uD83D\uDD27",
        dismantle: "\u2692",
        harvest: "\u26CF",
        pickup: "\u2B07" // NOTE: Same as withdraw
        ,
        withdraw: "\u2B07" // NOTE: Same as pickup
        ,
        transfer: "\u2B06" // NOTE: Same as upgradeController
        ,
        upgradeController: "\u2B06" // NOTE: Same as transfer
        ,
        claimController: "\uD83D\uDDDD",
        reserveController: "\uD83D\uDD12",
        attackController: "\uD83D\uDDE1" // NOTE: Same as attack
        ,
        recycle: "\u267B",
        tired: "\uD83D\uDCA6",
        stuck0: "\uD83D\uDCA5",
        stuck1: "\uD83D\uDCAB",
        stuck2: "\uD83D\uDCA2",
        wait0: "\uD83D\uDD5B" // 12:00
        ,
        wait1: "\uD83D\uDD67" // 12:30
        ,
        wait2: "\uD83D\uDD50" // 01:00
        ,
        wait3: "\uD83D\uDD5C" // 01:30
        ,
        wait4: "\uD83D\uDD51" // 02:00
        ,
        wait5: "\uD83D\uDD5D" // 02:30
        ,
        wait6: "\uD83D\uDD52" // 03:00
        ,
        wait7: "\uD83D\uDD5E" // 03:30
        ,
        wait8: "\uD83D\uDD53" // 04:00
        ,
        wait9: "\uD83D\uDD5F" // 04:30
        ,
        wait10: "\uD83D\uDD54" // 05:00
        ,
        wait11: "\uD83D\uDD60" // 05:30
        ,
        wait12: "\uD83D\uDD55" // 06:00
        ,
        wait13: "\uD83D\uDD61" // 06:30
        ,
        wait14: "\uD83D\uDD56" // 07:00
        ,
        wait15: "\uD83D\uDD62" // 07:30
        ,
        wait16: "\uD83D\uDD57" // 08:00
        ,
        wait17: "\uD83D\uDD63" // 08:30
        ,
        wait18: "\uD83D\uDD58" // 09:00
        ,
        wait19: "\uD83D\uDD64" // 09:30
        ,
        wait20: "\uD83D\uDD59" // 10:00
        ,
        wait21: "\uD83D\uDD65" // 10:30
        ,
        wait22: "\uD83D\uDD5A" // 11:00
        ,
        wait23: "\uD83D\uDD66" // 11:30
        ,
        sleep: "\uD83D\uDCA4" // for when script is terminated early to refill bucket
        ,
        testPassed: "\uD83C\uDF89" // for when scout reaches its goal location
        ,
        testFinished: "\uD83C\uDFC1" // for when scout has finished its test run
        ,
        reaction: "\ud83d\udd2c",
        haul: "\ud83d\ude9a",
        haul2: "\ud83d\ude9b",
        respond: "\ud83d\ude93",
        boost: "\ud83c\udccf",
        nuke: "\u2622",
        noEntry: "\u26d4",
        renew: "\u26fd",
        greenCheck: "\u2705",
        crossedSword: "\u2694",
        castle: "\ud83c\udff0",
        traffic: "\ud83d\udea6",
        border: "\ud83d\udec2",
        hospital: "\ud83c\udfe5",
        courier: "\ud83d\ude90",
        power: "\u26a1",
        medical: "\u2695",
        eye: "\ud83d\udc40",
        santa: "\ud83c\udf85"
    };

    global.UNIT_COST = (body) => _.sum(body, p => BODYPART_COST[p.type || p]);

    global.CUMULATIVE_CONTROLLER_DOWNGRADE = _.map(CONTROLLER_DOWNGRADE, (v1, k1, c1) => (_.reduce(c1, (a, v2, k2, c2) => (a + ((k2 <= k1) ? v2 : 0)), 0)));

    global.ROOM_ENERGY_CAPACITY = {0: 0, 1: 300, 2: 550, 3: 800, 4: 1300, 5: 1800, 6: 2300, 7: 5600, 8: 12900};

    global.RCL_1_EXTENSIONS = 0;
    global.RCL_2_EXTENSIONS = 5;
    global.RCL_3_EXTENSIONS = 10;
    global.RCL_4_EXTENSIONS = 20;
    global.RCL_5_EXTENSIONS = 30;
    global.RCL_6_EXTENSIONS = 40;
    global.RCL_7_EXTENSIONS = 50;
    global.RCL_8_EXTENSIONS = 60;

    if (Memory.tickInfo) global.EST_SEC_PER_TICK = Memory.tickInfo.tickLength; else global.EST_SEC_PER_TICK = 2.5; // time between ticks is currently averaging ~4.84 seconds (as of 2017/05/07)
    global.EST_TICKS_PER_MIN = Math.ceil(60 / EST_SEC_PER_TICK); // 60s
    global.EST_TICKS_PER_DAY = Math.ceil(86400 / EST_SEC_PER_TICK); // 24h * 60m * 60s = 86400s

    global.toStr = (obj) => JSON.stringify(obj, null, 2); // shortcut to stringify an object (idea credit: warinternal, from the Screeps Slack)

    // Upkeep costs
    global.RAMPART_UPKEEP = RAMPART_DECAY_AMOUNT / REPAIR_POWER / RAMPART_DECAY_TIME;
    global.ROAD_UPKEEP = ROAD_DECAY_AMOUNT / REPAIR_POWER / ROAD_DECAY_TIME;
    global.CONTAINER_UPKEEP = CONTAINER_DECAY / REPAIR_POWER / CONTAINER_DECAY_TIME_OWNED;
    global.REMOTE_CONTAINER_UPKEEP = CONTAINER_DECAY / REPAIR_POWER / CONTAINER_DECAY_TIME;

    // Boost Components
    global.BOOST_COMPONENTS = {
        //Tier 3
        [RESOURCE_CATALYZED_GHODIUM_ALKALIDE]: [RESOURCE_GHODIUM_ALKALIDE, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_GHODIUM_ACID]: [RESOURCE_GHODIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_ZYNTHIUM_ACID]: [RESOURCE_ZYNTHIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]: [RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]: [RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_LEMERGIUM_ACID]: [RESOURCE_LEMERGIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_KEANIUM_ALKALIDE]: [RESOURCE_KEANIUM_ALKALIDE, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_KEANIUM_ACID]: [RESOURCE_KEANIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_UTRIUM_ACID]: [RESOURCE_UTRIUM_ACID, RESOURCE_CATALYST],
        [RESOURCE_CATALYZED_UTRIUM_ALKALIDE]: [RESOURCE_UTRIUM_ALKALIDE, RESOURCE_CATALYST], //Tier 2
        [RESOURCE_GHODIUM_ACID]: [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_GHODIUM_ALKALIDE]: [RESOURCE_GHODIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_ZYNTHIUM_ACID]: [RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_ZYNTHIUM_ALKALIDE]: [RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_LEMERGIUM_ALKALIDE]: [RESOURCE_LEMERGIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_LEMERGIUM_ACID]: [RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_KEANIUM_ALKALIDE]: [RESOURCE_KEANIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_KEANIUM_ACID]: [RESOURCE_KEANIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_UTRIUM_ACID]: [RESOURCE_UTRIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_UTRIUM_ALKALIDE]: [RESOURCE_UTRIUM_OXIDE, RESOURCE_HYDROXIDE], //Tier 1
        [RESOURCE_GHODIUM_HYDRIDE]: [RESOURCE_GHODIUM, RESOURCE_HYDROGEN],
        [RESOURCE_GHODIUM_OXIDE]: [RESOURCE_GHODIUM, RESOURCE_OXYGEN],
        [RESOURCE_ZYNTHIUM_HYDRIDE]: [RESOURCE_ZYNTHIUM, RESOURCE_HYDROGEN],
        [RESOURCE_ZYNTHIUM_OXIDE]: [RESOURCE_ZYNTHIUM, RESOURCE_OXYGEN],
        [RESOURCE_LEMERGIUM_OXIDE]: [RESOURCE_LEMERGIUM, RESOURCE_OXYGEN],
        [RESOURCE_LEMERGIUM_HYDRIDE]: [RESOURCE_LEMERGIUM, RESOURCE_HYDROGEN],
        [RESOURCE_KEANIUM_OXIDE]: [RESOURCE_KEANIUM, RESOURCE_OXYGEN],
        [RESOURCE_KEANIUM_HYDRIDE]: [RESOURCE_KEANIUM, RESOURCE_HYDROGEN],
        [RESOURCE_UTRIUM_HYDRIDE]: [RESOURCE_UTRIUM, RESOURCE_HYDROGEN],
        [RESOURCE_UTRIUM_OXIDE]: [RESOURCE_UTRIUM, RESOURCE_OXYGEN], //Base
        [RESOURCE_GHODIUM]: [RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE],
        [RESOURCE_HYDROXIDE]: [RESOURCE_OXYGEN, RESOURCE_HYDROGEN],
        [RESOURCE_ZYNTHIUM_KEANITE]: [RESOURCE_ZYNTHIUM, RESOURCE_KEANIUM],
        [RESOURCE_UTRIUM_LEMERGITE]: [RESOURCE_UTRIUM, RESOURCE_LEMERGIUM]
    };

    global.TOWER_POWER_FROM_RANGE = function (dist, power) {
        if (dist <= TOWER_OPTIMAL_RANGE) {
            return power
        }
        if (dist >= TOWER_FALLOFF_RANGE) {
            return power * (1 - TOWER_FALLOFF);
        }
        let towerFalloffPerTile = TOWER_FALLOFF / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE)
        return Math.round(power * (1 - (dist - TOWER_OPTIMAL_RANGE) * towerFalloffPerTile))
    }

    // Boost Uses
    global.BOOST_USE = {
        'attack': [RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_UTRIUM_ACID, RESOURCE_UTRIUM_HYDRIDE],
        'upgrade': [RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_GHODIUM_ACID, RESOURCE_GHODIUM_HYDRIDE],
        'tough': [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_OXIDE],
        'ranged_attack': [RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_KEANIUM_OXIDE],
        'heal': [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_OXIDE],
        'build': [RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_LEMERGIUM_ACID, RESOURCE_LEMERGIUM_HYDRIDE],
        'move': [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_ZYNTHIUM_OXIDE],
        'harvest': [RESOURCE_CATALYZED_UTRIUM_ALKALIDE, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_UTRIUM_OXIDE],
        'dismantle': [RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_HYDRIDE]
    }

    // Get Username
    global.MY_USERNAME = _.get(_.find(Game.spawns) || _.find(Game.creeps) || _.get(_.find(Game.rooms, room => room.controller && room.controller.my), 'controller'), ['owner', 'username'],);

    /*
     Cached dynamic properties: Declaration
     By warinternal, from the Screeps Slack
     NOTES:
     - This function is easiest to use when declared as a global
     - See prototype.creep for usage examples
     */
    global.defineCachedGetter = function (proto, propertyName, fn) {
        Object.defineProperty(proto, propertyName, {
            get: function () {
                if (this === proto || this === undefined) return;
                let result = fn.call(this, this);
                Object.defineProperty(this, propertyName, {
                    value: result, configurable: true, enumerable: false
                });
                return result;
            }, configurable: true, enumerable: false
        });
    };

    //Get average of array
    try {
        global.average = arr => arr.reduce((p, c) => p + c, 0) / arr.length;
    } catch (e) {
        global.average = undefined;
    }

    global.displayText = function (room, x, y, what, br = false) {
        if (!br) {
            room.visual.text(what, x, y, {
                color: "black", opacity: 0.9, align: "left", font: "bold 0.6 Monospace"
            }).text(what, x, y, {
                color: "black", opacity: 0.9, align: "left", font: "bold 0.6 Monospace",
            });
        } else {
            room.visual.text(what, x, y, {
                color: "black",
                opacity: 0.9,
                align: "left",
                font: "bold 0.6 Monospace",
                backgroundColor: "black",
                backgroundPadding: 0.3
            }).text(what, x, y, {
                color: "black",
                opacity: 0.9,
                align: "left",
                font: "bold 0.6 Monospace",
                backgroundColor: "#eeeeee",
                backgroundPadding: 0.2
            });
        }
    };

    // League Of Automated Nations Alliance and NCP processing
    global.populateLOANlist = function (LOANuser = "LeagueOfAutomatedNations", LOANsegment = 99) {
        const shardNames = ['shard0', 'shard1', 'shard2', 'shard3', 'shardX'];
        if (shardNames.includes(Game.shard.name)) {
            // Handle alliance data first
            if (!global.ALLIANCE_DATA_AGE || global.ALLIANCE_DATA_AGE + 10000 < Game.time) {
                global.LOAN_LIST = [...MANUAL_FRIENDS];
                global.LOAN_CHECK = false;
                // Check if the segment is set
                if (RawMemory.foreignSegment && RawMemory.foreignSegment.username && RawMemory.foreignSegment.username === LOANuser && RawMemory.foreignSegment.id === 99) {
                    global.ALLIANCE_DATA_AGE = Game.time;
                    const data = JSON.parse(RawMemory.foreignSegment.data);
                    global.ALLIANCE_DATA = data;
                    const keys = Object.keys(data);
                    for (let iL = keys.length - 1; iL >= 0; iL--) {
                        if (data[keys[iL]].includes(MY_USERNAME)) {
                            global.LOAN_LIST = [...global.LOAN_LIST, ...MANUAL_FRIENDS];
                            global.LOAN_ALLIANCE = keys[iL];
                            break;
                        }
                    }
                    console.log(`Loaded LOAN data from ${LOANuser}.`);
                } else {
                    // Handle not being able to find the data
                    if (!global.LOAN_ATTEMPT) global.LOAN_ATTEMPT = 1; else global.LOAN_ATTEMPT++;
                    if (global.LOAN_ATTEMPT >= 25) {
                        console.log(`Failed to get alliance data from ${LOANuser} after 25 attempts.`);
                        global.LOAN_ATTEMPT = 0;
                        global.ALLIANCE_DATA_AGE = Game.time;
                        global.NCP_DATA_AGE = Game.time;
                        global.LOAN_CHECK = true;
                        global.LOAN_LIST = [...MANUAL_FRIENDS];
                        global.ALLIANCE_DATA = undefined;
                        global.NCP_DATA = undefined;
                        return false;
                    }
                    RawMemory.setActiveForeignSegment(LOANuser, 99);
                }
            } else if (!global.NCP_DATA_AGE || global.NCP_DATA_AGE + 20000 < Game.time) {
                global.LOAN_CHECK = false;
                // Check if the segment is set
                if (RawMemory.foreignSegment && RawMemory.foreignSegment.username && RawMemory.foreignSegment.username === LOANuser && RawMemory.foreignSegment.id === 98) {
                    global.NCP_DATA_AGE = Game.time;
                    global.NCP_DATA = RawMemory.foreignSegment.data;
                    global.LOAN_CHECK = true;
                } else {
                    RawMemory.setActiveForeignSegment(LOANuser, 98);
                }
            }
            return true;
        } else {
            // For non-shard environments
            global.LOAN_CHECK = true;
            global.LOAN_LIST = [...MANUAL_FRIENDS];
            global.ALLIANCE_DATA = undefined;
            if (!global.NCP_DATA) global.NCP_DATA = undefined;
            return false;
        }
    };


    global.shuffle = function (array) {
        let counter = array.length;
        // While there are elements in the array
        while (counter > 0) {
            // Pick a random index
            let index = Math.floor(Math.random() * counter);
            // Decrease counter by 1
            counter--;
            // And swap the last element with it
            let temp = array[counter];
            array[counter] = array[index];
            array[index] = temp;
        }
        return array;
    };

    global.getLevel = function (room) {
        if (!room.controller || !room.energyCapacityAvailable) return 0;
        let energyLevel = 0;
        while (room.energyCapacityAvailable >= ROOM_ENERGY_CAPACITY[energyLevel]) {
            energyLevel++;
        }
        if (room.energyCapacityAvailable < ROOM_ENERGY_CAPACITY[energyLevel]) energyLevel--;
        if (energyLevel <= room.controller.level) return energyLevel; else return room.controller.level;
    };

    global.roomLink = function (roomArg, text = undefined, select = true) {
        let id;
        if (roomArg) id = roomArg.id; else return undefined;
        let roomName;
        if (roomArg instanceof Room) {
            roomName = roomArg.name;
        } else if (roomArg.pos !== undefined) {
            roomName = roomArg.pos.roomName;
        } else if (roomArg.roomName !== undefined) {
            roomName = roomArg.roomName;
        } else if (typeof roomArg === 'string') {
            roomName = roomArg;
        } else {
            console.log(`Invalid parameter to roomLink global function: ${roomArg} of type ${typeof roomArg}`);
        }
        text = text || (id ? roomArg : roomName);
        return `<a href="#!/room/${Game.shard.name}/${roomName}" ${select && id ? `onclick="angular.element('body').injector().get('RoomViewPendingSelector').set('${id}')"` : ``}>${text}</a>`;
    };

    global.roomHistoryLink = function (roomArg, text = undefined, select = true) {
        let roomName;
        let id = roomArg.id;
        if (roomArg instanceof Room) {
            roomName = roomArg.name;
        } else if (roomArg.pos !== undefined) {
            roomName = roomArg.pos.roomName;
        } else if (roomArg.roomName !== undefined) {
            roomName = roomArg.roomName;
        } else if (typeof roomArg === 'string') {
            roomName = roomArg;
        } else {
            console.log(`Invalid parameter to roomLink global function: ${roomArg} of type ${typeof roomArg}`);
        }
        text = text || (id ? roomArg : roomName);
        return `<a href="#!/history/${Game.shard.name}/${roomName}?t=${Game.time}" ${select && id ? `onclick="angular.element('body').injector().get('RoomViewPendingSelector').set('${id}')"` : ``}>${text}</a>`;
    };

    global.getRandomInt = function (min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    };

    global.isEven = function (n) {
        return n % 2 === 0;
    };

    global.isOdd = function (n) {
        return Math.abs(n % 2) === 1;
    };

    global.BUCKET_MAX = 10000;

    global.clamp = function clamp(min, val, max) {
        if (val < min) return min;
        if (val > max) return max;
        return val;
    };

    global.CPU_TASK_LIMITS = {};

    global.SHARD3 = Game.shard.name === 'shard3';

    global.log = new Log();

    global.floodFill = function (roomName) {
        const room = Game.rooms[roomName];
        if (!room) return console.log(`floodFill: no visibility in ${roomName}`);

        const terrain = new Room.Terrain(roomName);
        const startTime = Game.cpu.getUsed();
        const matrix = new PathFinder.CostMatrix();

        room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART
        }).forEach(s => matrix.set(s.pos.x, s.pos.y, 255));

        // Seed all four edges (i = 0..49 covers every tile including corners)
        const queue = [];
        for (let i = 0; i <= 49; i++) {
            if (terrain.get(i, 0) !== TERRAIN_MASK_WALL) {
                matrix.set(i, 0, 1);
                queue.push([i, 0]);
            }
            if (terrain.get(i, 49) !== TERRAIN_MASK_WALL) {
                matrix.set(i, 49, 1);
                queue.push([i, 49]);
            }
            if (terrain.get(0, i) !== TERRAIN_MASK_WALL) {
                matrix.set(0, i, 1);
                queue.push([0, i]);
            }
            if (terrain.get(49, i) !== TERRAIN_MASK_WALL) {
                matrix.set(49, i, 1);
                queue.push([49, i]);
            }
        }

        // O(n) BFS with a head pointer — avoids O(n²) splice-per-level
        let head = 0;
        while (head < queue.length) {
            const [x, y] = queue[head++];
            for (let dx = x - 1; dx <= x + 1; dx++) {
                for (let dy = y - 1; dy <= y + 1; dy++) {
                    if (dx > 0 && dx < 49 && dy > 0 && dy < 49 && matrix.get(dx, dy) === 0 && (terrain.get(dx, dy) & TERRAIN_MASK_WALL) === 0) {
                        matrix.set(dx, dy, 1);
                        queue.push([dx, dy]);
                    }
                }
            }
        }

        console.log('cpu used:', Game.cpu.getUsed() - startTime);

        const visual = new RoomVisual(roomName);
        for (let x = 1; x < 49; x++) {
            for (let y = 1; y < 49; y++) {
                if (matrix.get(x, y) === 1) {
                    visual.circle(x, y, {radius: 0.2, fill: 'white', opacity: 0.6});
                }
            }
        }
    };

    // Safe toJSON methods for game objects to prevent end-of-tick serialization crashes
    // when a game object is accidentally saved into Memory.
    const safeClasses = [
        'RoomObject', 'Room', 'RoomPosition', 'Creep', 'PowerCreep', 'Structure', 'Spawn', 'OwnedStructure',
        'StructureContainer', 'StructureController', 'StructureExtension', 'StructureExtractor', 'StructureFactory',
        'StructureInvaderCore', 'StructureKeeperLair', 'StructureLab', 'StructureLink', 'StructureNuker',
        'StructureObserver', 'StructurePortal', 'StructurePowerBank', 'StructurePowerSpawn', 'StructureRampart',
        'StructureRoad', 'StructureSpawn', 'StructureStorage', 'StructureTerminal', 'StructureTower', 'StructureWall',
        'ConstructionSite', 'Tombstone', 'Ruin', 'Resource', 'Source', 'Mineral', 'Deposit', 'Nuke', 'Flag'
    ];
    for (let className of safeClasses) {
        if (typeof global[className] !== 'undefined' && global[className].prototype) {
            global[className].prototype.toJSON = function () {
                return this.id || this.name || "[" + className + "]";
            };
        }
    }
    if (typeof RoomPosition !== 'undefined' && RoomPosition.prototype) {
        RoomPosition.prototype.toJSON = function () {
            return {x: this.x, y: this.y, roomName: this.roomName};
        };
    }
};

module.exports = globals;
