let Log = require('logger');

let globals = function () {

    global.log = new Log();

    //Manually set baddies and friends and combat stuff
    global.HOSTILES = [];
    global.NO_AGGRESSION = [];
    global.MANUAL_FRIENDS = [];
    global.NAP_ALLIANCE = ['YP', 'CoPS', 'Andromeda'];
    global.ATTACK_LOCALS = true;
    global.LOCAL_SPHERE = 6; //Range that rooms consider local via linear distance
    global.POKE_ATTACKS = true;
    global.POKE_NEUTRALS = true;
    global.ATTACK_COOLDOWN = 4500; //Time between attacks on a room

    // remote rooms
    global.HARVESTER_TARGET = 5; //Aim to have this number of remote harvesters

    //Signing and whatnot
    global.OWNED_ROOM_SIGNS = ["~~~OVERLORD BOT~~~", "~~OVERLORD HIVE~~", "~~RESTRICTED AREA BY ORDER OF THE OVERLORDS~~", "~~THIS ROOM IS UNDER THE PROTECTION OF AN OVERLORDS ALLIANCE MEMBER ~~"];
    global.RESERVE_ROOM_SIGNS = ["~~Reserved Territory of an #overlords member~~", "~~This is a restricted area, violators will be attacked #overlords~~", "~~#overlords Exclusion Zone~~", "~~#overlords Reserved Room~~", "~~THIS ROOM IS UNDER THE PROTECTION OF AN OVERLORDS ALLIANCE MEMBER~~"];
    global.EXPLORED_ROOM_SIGNS = ["#overlords were here.", "#overlords have collected intel from this room. We Know.", "Spawn More #Overlord-Bot's", "All your rooms belong to #overlords"];
    global.ATTACK_ROOM_SIGNS = ["~~Overlords is your daddy~~", "~~This room was declared unnecessary by overlords~~", "~~#overlords wasteland~~"];
    global.EXPLORER_SPAM = ['HI', 'Hello', '#overlords'];

    //Attack limits (Too high and your CPU is screwed, hard coded for non subs)
    global.POKE_LIMIT = 3;
    global.CLEAN_LIMIT = 1;
    global.HARASS_LIMIT = 5;

    global.LAYOUT_VERSION = 1.52;

    //PC Stuff
    global.OPERATOR_UPGRADE_PRIORITY = [PWR_GENERATE_OPS, PWR_OPERATE_SPAWN, PWR_OPERATE_EXTENSION, PWR_OPERATE_TOWER];

    //Terminal
    global.REACTION_NEEDS = [RESOURCE_ZYNTHIUM,
        RESOURCE_KEANIUM, RESOURCE_UTRIUM, RESOURCE_LEMERGIUM, RESOURCE_OXYGEN, RESOURCE_HYDROGEN, RESOURCE_CATALYST];

    global.BOOST_NEEDS = [];

    global.TRADE_TARGETS = [];

    global.DO_NOT_SELL_LIST = [RESOURCE_CATALYZED_UTRIUM_ACID,
        RESOURCE_CATALYZED_ZYNTHIUM_ACID,
        RESOURCE_CATALYZED_GHODIUM_ACID];

    global.CREDIT_BUFFER = 100000;
    global.TRADE_AMOUNT = 10000;
    global.ENERGY_AMOUNT = 25000;
    global.SIEGE_ENERGY_AMOUNT = 100000;
    global.REACTION_AMOUNT = 1000;
    global.SELL_OFF_AMOUNT = 12500;
    global.BOOST_AMOUNT = 7500;
    global.DUMP_AMOUNT = TRADE_AMOUNT * 2.25;

    // Max prices
    global.ENERGY_BUY_MAX = 0.02;
    global.END_GAME_SALE_MAX = 2.25;
    global.TIER_2_SALE_MAX = 1.25;
    global.TIER_1_SALE_MAX = 0.75;
    global.BASE_COMPOUNDS_SALE_MAX = 0.35;
    global.GHODIUM_SALE_MAX = 1.1;
    global.BASE_RESOURCES_SALE_MAX = 0.35;


    // Reaction
    global.MAKE_THESE_BOOSTS = [RESOURCE_GHODIUM, RESOURCE_GHODIUM_ACID, RESOURCE_GHODIUM_ALKALIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_UTRIUM_ACID, RESOURCE_LEMERGIUM_ACID, RESOURCE_UTRIUM_ALKALIDE];
    global.END_GAME_BOOSTS = [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE];
    global.TIER_2_BOOSTS = [RESOURCE_GHODIUM_ALKALIDE, RESOURCE_GHODIUM_ACID, RESOURCE_ZYNTHIUM_ACID, RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_LEMERGIUM_ACID, RESOURCE_KEANIUM_ACID, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_UTRIUM_ACID];
    global.TIER_1_BOOSTS = [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_OXIDE, RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_LEMERGIUM_OXIDE, RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_KEANIUM_OXIDE, RESOURCE_KEANIUM_HYDRIDE, RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_OXIDE];
    global.BASE_COMPOUNDS = [RESOURCE_GHODIUM, RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE, RESOURCE_HYDROXIDE];

    global.PRIORITIES = {
        // Harvesters
        stationaryHarvester: 2,
        // Workers
        worker: 5,
        drone: 5,
        waller: 4,
        upgrader: 4,
        mineralHarvester: 7,
        repairer: 7,
        // Haulers
        hauler: 1,
        // Remotes
        remoteUtility: 6,
        remoteHarvester: 6,
        remoteHauler: 6,
        remoteUpgrader: 7,
        remotePioneer: 7,
        assistPioneer: 7,
        fuelTruck: 7,
        remoteResponse: 5,
        reserver: 7,
        borderPatrol: 7,
        // Power
        Power: 5,
        // SK
        SKworker: 5,
        SKattacker: 7,
        SKsupport: 7,
        SKhauler: 5,
        // Military
        priority: 6,
        urgent: 7,
        high: 9,
        medium: 10,
        secondary: 11,
        siege: 6,
        harass: 3,
        hold: 4,
        raid: 8,
        clean: 8,
        swarm: 4,
        scout: 3,
        responder: 2,
        // Misc
        claimer: 3,
        explorer: 2,
        jerk: 2,
    };

    global.SPAWN = {
        0: {
            stationaryHarvester: [WORK, WORK, CARRY, MOVE],
            worker: [MOVE, MOVE, CARRY, WORK],
            drone: [MOVE, MOVE, CARRY, WORK],
            waller: [MOVE, MOVE, CARRY, WORK],
            pioneer: [MOVE, MOVE, CARRY, WORK],
            upgrader: [MOVE, MOVE, CARRY, WORK],
            hauler: [CARRY, CARRY, MOVE, MOVE],
            explorer: [MOVE],
            scout: [MOVE],
            responder: [TOUGH, TOUGH, MOVE, MOVE, MOVE, ATTACK],
            longbow: [RANGED_ATTACK, MOVE],
            remoteHauler: [CARRY, CARRY, MOVE, MOVE],
            remoteHarvester: [MOVE, CARRY, WORK],
        }
    };

    //Cache stuff
    global.roadCache = {};
    global.creepCpuArray = {};
    global.roomCpuArray = {};
    global.roomEnergyArray = {};
    global.taskCpuArray = {};
    global.roomCreepCpuObject = {};
    global.roomSourceSpace = {};
    global.roomControllerSpace = {};

    global.ICONS = {
        [STRUCTURE_CONTROLLER]: "\uD83C\uDFF0"
        , [STRUCTURE_SPAWN]: "\uD83C\uDFE5"
        , [STRUCTURE_EXTENSION]: "\uD83C\uDFEA"
        , [STRUCTURE_CONTAINER]: "\uD83D\uDCE4"
        , [STRUCTURE_STORAGE]: "\uD83C\uDFE6"
        , [STRUCTURE_RAMPART]: "\uD83D\uDEA7"
        , [STRUCTURE_WALL]: "\u26F0"
        , [STRUCTURE_TOWER]: "\uD83D\uDD2B"
        , [STRUCTURE_ROAD]: "\uD83D\uDEE3"
        , [STRUCTURE_LINK]: "\uD83D\uDCEE"
        , [STRUCTURE_EXTRACTOR]: "\uD83C\uDFED"
        , [STRUCTURE_LAB]: "\u2697"
        , [STRUCTURE_TERMINAL]: "\uD83C\uDFEC"
        , [STRUCTURE_OBSERVER]: "\uD83D\uDCE1"
        , [STRUCTURE_POWER_SPAWN]: "\uD83C\uDFDB"
        , [STRUCTURE_NUKER]: "\u2622"
        , [STRUCTURE_KEEPER_LAIR]: "" // TODO: Add icon for keeper lair
        , [STRUCTURE_PORTAL]: "" // TODO: Add icon for portal
        , [STRUCTURE_POWER_BANK]: "" // TODO: Add icon for power bank
        , source: "" // TODO: Add icon for source
        , constructionSite: "\uD83C\uDFD7"
        , resource: "\uD83D\uDEE2"
        , creep: "" // TODO: Add icon for creep
        , moveTo: "\u27A1"
        , attack: "\uD83D\uDDE1" // NOTE: Same as attackController
        , build: "\uD83D\uDD28"
        , repair: "\uD83D\uDD27"
        , dismantle: "\u2692"
        , harvest: "\u26CF"
        , pickup: "\u2B07" // NOTE: Same as withdraw
        , withdraw: "\u2B07" // NOTE: Same as pickup
        , transfer: "\u2B06" // NOTE: Same as upgradeController
        , upgradeController: "\u2B06" // NOTE: Same as transfer
        , claimController: "\uD83D\uDDDD"
        , reserveController: "\uD83D\uDD12"
        , attackController: "\uD83D\uDDE1" // NOTE: Same as attack
        , recycle: "\u267B"
        , tired: "\uD83D\uDCA6"
        , stuck0: "\uD83D\uDCA5"
        , stuck1: "\uD83D\uDCAB"
        , stuck2: "\uD83D\uDCA2"
        , wait0: "\uD83D\uDD5B" // 12:00
        , wait1: "\uD83D\uDD67" // 12:30
        , wait2: "\uD83D\uDD50" // 01:00
        , wait3: "\uD83D\uDD5C" // 01:30
        , wait4: "\uD83D\uDD51" // 02:00
        , wait5: "\uD83D\uDD5D" // 02:30
        , wait6: "\uD83D\uDD52" // 03:00
        , wait7: "\uD83D\uDD5E" // 03:30
        , wait8: "\uD83D\uDD53" // 04:00
        , wait9: "\uD83D\uDD5F" // 04:30
        , wait10: "\uD83D\uDD54" // 05:00
        , wait11: "\uD83D\uDD60" // 05:30
        , wait12: "\uD83D\uDD55" // 06:00
        , wait13: "\uD83D\uDD61" // 06:30
        , wait14: "\uD83D\uDD56" // 07:00
        , wait15: "\uD83D\uDD62" // 07:30
        , wait16: "\uD83D\uDD57" // 08:00
        , wait17: "\uD83D\uDD63" // 08:30
        , wait18: "\uD83D\uDD58" // 09:00
        , wait19: "\uD83D\uDD64" // 09:30
        , wait20: "\uD83D\uDD59" // 10:00
        , wait21: "\uD83D\uDD65" // 10:30
        , wait22: "\uD83D\uDD5A" // 11:00
        , wait23: "\uD83D\uDD66" // 11:30
        , sleep: "\uD83D\uDCA4" // for when script is terminated early to refill bucket
        , testPassed: "\uD83C\uDF89" // for when scout reaches its goal location
        , testFinished: "\uD83C\uDFC1" // for when scout has finished its test run
        , reaction: "\ud83d\udd2c"
        , haul: "\ud83d\ude9a"
        , haul2: "\ud83d\ude9b"
        , respond: "\ud83d\ude93"
        , boost: "\ud83c\udccf"
        , nuke: "\u2622"
        , noEntry: "\u26d4"
        , renew: "\u26fd"
        , greenCheck: "\u2705"
        , crossedSword: "\u2694"
        , castle: "\ud83c\udff0"
        , traffic: "\ud83d\udea6"
        , border: "\ud83d\udec2"
        , hospital: "\ud83c\udfe5"
        , courier: "\ud83d\ude90"
        , power: "\u26a1"
    };

    global.UNIT_COST = (body) => _.sum(body, p => BODYPART_COST[p.type || p]);

    global.CUMULATIVE_CONTROLLER_DOWNGRADE = _.map(CONTROLLER_DOWNGRADE, (v1, k1, c1) => (_.reduce(c1, (a, v2, k2, c2) => (a + ((k2 <= k1) ? v2 : 0)), 0)));

    global.resourceWorth = function (resourceType) {
        switch (resourceType) {
            case RESOURCE_ENERGY:
            default:
                return 1; // 10^0
            case RESOURCE_HYDROGEN:
            case RESOURCE_OXYGEN:
            case RESOURCE_UTRIUM:
            case RESOURCE_LEMERGIUM:
            case RESOURCE_KEANIUM:
            case RESOURCE_ZYNTHIUM:
            case RESOURCE_CATALYST:
                return 10; // 10^1
            case RESOURCE_HYDROXIDE:
            case RESOURCE_ZYNTHIUM_KEANITE:
            case RESOURCE_UTRIUM_LEMERGITE:
                return 100; // 10^2
            case RESOURCE_GHODIUM:
            case RESOURCE_UTRIUM_HYDRIDE:
            case RESOURCE_UTRIUM_OXIDE:
            case RESOURCE_KEANIUM_HYDRIDE:
            case RESOURCE_KEANIUM_OXIDE:
            case RESOURCE_LEMERGIUM_HYDRIDE:
            case RESOURCE_LEMERGIUM_OXIDE:
            case RESOURCE_ZYNTHIUM_HYDRIDE:
            case RESOURCE_ZYNTHIUM_OXIDE:
            case RESOURCE_GHODIUM_HYDRIDE:
            case RESOURCE_GHODIUM_OXIDE:
                return 1000; // 10^3
            case RESOURCE_UTRIUM_ACID:
            case RESOURCE_UTRIUM_ALKALIDE:
            case RESOURCE_KEANIUM_ACID:
            case RESOURCE_KEANIUM_ALKALIDE:
            case RESOURCE_LEMERGIUM_ACID:
            case RESOURCE_LEMERGIUM_ALKALIDE:
            case RESOURCE_ZYNTHIUM_ACID:
            case RESOURCE_ZYNTHIUM_ALKALIDE:
            case RESOURCE_GHODIUM_ACID:
            case RESOURCE_GHODIUM_ALKALIDE:
                return 10000; // 10^4
            case RESOURCE_CATALYZED_UTRIUM_ACID:
            case RESOURCE_CATALYZED_UTRIUM_ALKALIDE:
            case RESOURCE_CATALYZED_KEANIUM_ACID:
            case RESOURCE_CATALYZED_KEANIUM_ALKALIDE:
            case RESOURCE_CATALYZED_LEMERGIUM_ACID:
            case RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE:
            case RESOURCE_CATALYZED_ZYNTHIUM_ACID:
            case RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE:
            case RESOURCE_CATALYZED_GHODIUM_ACID:
            case RESOURCE_CATALYZED_GHODIUM_ALKALIDE:
                return 100000; // 10^5
            case RESOURCE_POWER:
                return 1000000; // 10^6
        }
    };
    global.RCL_1_ENERGY = 300;
    global.RCL_2_ENERGY = 550;
    global.RCL_3_ENERGY = 800;
    global.RCL_4_ENERGY = 1300;
    global.RCL_5_ENERGY = 1800;
    global.RCL_6_ENERGY = 2300;
    global.RCL_7_ENERGY = 5600;
    global.RCL_8_ENERGY = 12900;

    global.RCL_1_EXTENSIONS = 0;
    global.RCL_2_EXTENSIONS = 5;
    global.RCL_3_EXTENSIONS = 10;
    global.RCL_4_EXTENSIONS = 20;
    global.RCL_5_EXTENSIONS = 30;
    global.RCL_6_EXTENSIONS = 40;
    global.RCL_7_EXTENSIONS = 50;
    global.RCL_8_EXTENSIONS = 60;

    global.EST_SEC_PER_TICK = Memory.tickLength || 3; // time between ticks is currently averaging ~4.84 seconds (as of 2017/05/07)
    global.EST_TICKS_PER_MIN = Math.ceil(60 / EST_SEC_PER_TICK); // 60s
    global.EST_TICKS_PER_DAY = Math.ceil(86400 / EST_SEC_PER_TICK); // 24h * 60m * 60s = 86400s

    global.toStr = (obj) => JSON.stringify(obj, null, 2); // shortcut to stringify an object (idea credit: warinternal, from the Screeps Slack)

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
        [RESOURCE_CATALYZED_UTRIUM_ALKALIDE]: [RESOURCE_UTRIUM_ALKALIDE, RESOURCE_CATALYST],
        //Tier 2
        [RESOURCE_GHODIUM_ACID]: [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_GHODIUM_ALKALIDE]: [RESOURCE_GHODIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_ZYNTHIUM_ACID]: [RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_ZYNTHIUM_ALKALIDE]: [RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_LEMERGIUM_ALKALIDE]: [RESOURCE_LEMERGIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_LEMERGIUM_ACID]: [RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_KEANIUM_ALKALIDE]: [RESOURCE_KEANIUM_OXIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_KEANIUM_ACID]: [RESOURCE_KEANIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_UTRIUM_ACID]: [RESOURCE_UTRIUM_HYDRIDE, RESOURCE_HYDROXIDE],
        [RESOURCE_UTRIUM_ALKALIDE]: [RESOURCE_UTRIUM_OXIDE, RESOURCE_HYDROXIDE],
        //Tier 1
        [RESOURCE_GHODIUM_HYDRIDE]: [RESOURCE_GHODIUM, RESOURCE_HYDROGEN],
        [RESOURCE_GHODIUM_OXIDE]: [RESOURCE_GHODIUM, RESOURCE_OXYGEN],
        [RESOURCE_ZYNTHIUM_HYDRIDE]: [RESOURCE_ZYNTHIUM, RESOURCE_HYDROGEN],
        [RESOURCE_ZYNTHIUM_OXIDE]: [RESOURCE_ZYNTHIUM, RESOURCE_OXYGEN],
        [RESOURCE_LEMERGIUM_OXIDE]: [RESOURCE_LEMERGIUM, RESOURCE_OXYGEN],
        [RESOURCE_LEMERGIUM_HYDRIDE]: [RESOURCE_LEMERGIUM, RESOURCE_HYDROGEN],
        [RESOURCE_KEANIUM_OXIDE]: [RESOURCE_KEANIUM, RESOURCE_OXYGEN],
        [RESOURCE_KEANIUM_HYDRIDE]: [RESOURCE_KEANIUM, RESOURCE_HYDROGEN],
        [RESOURCE_UTRIUM_HYDRIDE]: [RESOURCE_UTRIUM, RESOURCE_HYDROGEN],
        [RESOURCE_UTRIUM_OXIDE]: [RESOURCE_UTRIUM, RESOURCE_OXYGEN],
        //Base
        [RESOURCE_GHODIUM]: [RESOURCE_ZYNTHIUM_KEANITE, RESOURCE_UTRIUM_LEMERGITE],
        [RESOURCE_HYDROXIDE]: [RESOURCE_OXYGEN, RESOURCE_HYDROGEN],
        [RESOURCE_ZYNTHIUM_KEANITE]: [RESOURCE_ZYNTHIUM, RESOURCE_KEANIUM],
        [RESOURCE_UTRIUM_LEMERGITE]: [RESOURCE_UTRIUM, RESOURCE_LEMERGIUM]
    };

    // Boost Uses
    global.BOOST_USE = {
        'attack': [RESOURCE_UTRIUM_HYDRIDE, RESOURCE_UTRIUM_ACID, RESOURCE_CATALYZED_UTRIUM_ACID],
        'upgrade': [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ACID],
        'tough': [RESOURCE_GHODIUM_OXIDE, RESOURCE_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_GHODIUM_ALKALIDE],
        'ranged': [RESOURCE_KEANIUM_OXIDE, RESOURCE_KEANIUM_ALKALIDE, RESOURCE_CATALYZED_KEANIUM_ALKALIDE],
        'heal': [RESOURCE_LEMERGIUM_OXIDE, RESOURCE_LEMERGIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE],
        'build': [RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_LEMERGIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ACID],
        'move': [RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE],
        'harvest': [RESOURCE_UTRIUM_OXIDE, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_CATALYZED_UTRIUM_ALKALIDE],
        'dismantle': [RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ACID]
    };

    global.MY_USERNAME = _.get(
        _.find(Game.spawns) || _.find(Game.creeps) || _.get(_.find(Game.rooms, room => room.controller && room.controller.my), 'controller'),
        ['owner', 'username'],
    );

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
                if (this === proto || this === undefined)
                    return;
                let result = fn.call(this, this);
                Object.defineProperty(this, propertyName, {
                    value: result,
                    configurable: true,
                    enumerable: false
                });
                return result;
            },
            configurable: true,
            enumerable: false
        });
    };

    /*
     The following is copied from the path finder in the screeps driver at:
     https://github.com/screeps/driver/blob/master/lib/path-finder.js
     */
    //const MAX_WORLD_SIZE = 255; // Talk to marcel before growing world larger than W127N127 :: E127S127
    // Convert a room name to/from usable coordinates ("E1N1" -> { xx: 129, yy: 126 })
    global.parseRoomName = function (roomName) {
        let room = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomName);
        if (!room) {
            return; //throw src Error("Invalid room name " + roomName);
        }
        let rx = (WORLD_WIDTH >> 1) + ((room[1] === "W") ? (-Number(room[2])) : (Number(room[2]) + 1));
        let ry = (WORLD_HEIGHT >> 1) + ((room[3] === "N") ? (-Number(room[4])) : (Number(room[4]) + 1));
        if (((rx > 0) && (rx <= WORLD_WIDTH) && (ry > 0) && (ry <= WORLD_HEIGHT)) === false) {
            return; //throw src Error("Invalid room name " + roomName);
        }
        return {xx: rx, yy: ry};
    };
    // Converts return value of 'parseRoomName' back into a normal room name
    global.generateRoomName = function (xx, yy) {
        return (
            ((xx <= (WORLD_WIDTH >> 1)) ? ("W" + ((WORLD_WIDTH >> 1) - xx)) : ("E" + (xx - (WORLD_WIDTH >> 1) - 1)))
            + ((yy <= (WORLD_HEIGHT >> 1)) ? ("N" + ((WORLD_HEIGHT >> 1) - yy)) : ("S" + (yy - (WORLD_HEIGHT >> 1) - 1)))
        );
    };
    // Helper function to convert RoomPosition objects into global coordinate objects
    global.toWorldPosition = function (rp) {
        let xx = (rp.x | 0), yy = (rp.y | 0);
        if (((xx >= 0) && (xx < 50) && (yy >= 0) && (yy < 50)) === false) {
            return; //throw src Error("Invalid room position");
        }
        let offset = parseRoomName(rp.roomName);
        return {
            xx: (xx + offset.xx * 50)
            , yy: (yy + offset.yy * 50)
        };
    };
    // Converts back to a RoomPosition
    global.fromWorldPosition = function (wp) {
        return new RoomPosition(
            wp[0] % 50
            , wp[1] % 50
            , generateRoomName(Math.floor(wp[0] / 50), Math.floor(wp[1] / 50))
        );
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
                color: "black",
                opacity: 0.9,
                align: "left",
                font: "bold 0.6 Arial"
            }).text(what, x, y, {
                color: "black",
                opacity: 0.9,
                align: "left",
                font: "bold 0.6 Arial",
            });
        } else {
            room.visual.text(what, x, y, {
                color: "black",
                opacity: 0.9,
                align: "left",
                font: "bold 0.6 Arial",
                backgroundColor: "black",
                backgroundPadding: 0.3
            }).text(what, x, y, {
                color: "black",
                opacity: 0.9,
                align: "left",
                font: "bold 0.6 Arial",
                backgroundColor: "#eeeeee",
                backgroundPadding: 0.2
            });
        }
    };

// League Of Automated Nations allied users list by Kamots
// Provides global.LOANlist as array of allied usernames. Array is empty if not in an alliance, but still defined.
// Updates on 2nd run and then every 1001 ticks or if the global scope gets cleared.
// Usage: After you require this file, just add this to anywhere in your main loop to run every tick: global.populateLOANlist();
// global.LOANlist will contain an array of usernames after global.populateLOANlist() runs twice in a row (two consecutive ticks).
    global.populateLOANlist = function (LOANuser = "LeagueOfAutomatedNations", LOANsegment = 99) {
        if ((typeof RawMemory.setActiveForeignSegment == "function") && !!~['shard0', 'shard1', 'shard2', 'shard3'].indexOf(Game.shard.name)) { // To skip running in sim or private servers which prevents errors
            if ((typeof Memory.lastLOANtime == "undefined") || (typeof global.LOANlist == "undefined")) {
                Memory.lastLOANtime = Game.time - 1001;
                global.LOANlist = [];
                if (typeof Memory.LOANalliance == "undefined") Memory.LOANalliance = "";
            }

            if (Game.time >= (Memory.lastLOANtime + 1000)) {
                RawMemory.setActiveForeignSegment(LOANuser, LOANsegment);
            }

            if ((Game.time >= (Memory.lastLOANtime + 1001)) && (typeof RawMemory.foreignSegment != "undefined") && (RawMemory.foreignSegment.username == LOANuser) && (RawMemory.foreignSegment.id == LOANsegment)) {
                Memory.lastLOANtime = Game.time;
                if (RawMemory.foreignSegment.data == null) {
                    global.LOANlist = [];
                    Memory.LOANalliance = "";
                    global.ALLIANCE_DATA = undefined;
                    return false;
                }
                else {
                    let myUsername = ""; // Blank! Will be auto-filled.
                    let LOANdata = JSON.parse(RawMemory.foreignSegment.data);
                    global.ALLIANCE_DATA = RawMemory.foreignSegment.data;
                    let LOANdataKeys = Object.keys(LOANdata);
                    let allMyRooms = _.filter(Game.rooms, (aRoom) => (typeof aRoom.controller != "undefined") && aRoom.controller.my);
                    if (allMyRooms.length == 0) {
                        let allMyCreeps = _.filter(Game.creeps, (creep) => true);
                        if (allMyCreeps.length == 0) {
                            global.LOANlist = [];
                            global.LOANlist.concat(MANUAL_FRIENDS);
                            Memory.LOANalliance = "";
                            return false;
                        } else myUsername = allMyCreeps[0].owner.username;
                    } else myUsername = allMyRooms[0].controller.owner.username;
                    for (let iL = (LOANdataKeys.length - 1); iL >= 0; iL--) {
                        if (LOANdata[LOANdataKeys[iL]].indexOf(myUsername) >= 0) {
                            //console.log("Player",myUsername,"found in alliance",LOANdataKeys[iL]);
                            let disavowed = ['BADuser1', 'Zenga'];
                            global.LOANlist = LOANdata[LOANdataKeys[iL]];
                            global.LOANlist = global.LOANlist.filter(function (uname) {
                                return disavowed.indexOf(uname) < 0;
                            });
                            global.LOANlist.concat(MANUAL_FRIENDS);
                            Memory.LOANalliance = LOANdataKeys[iL].toString();
                            return true;
                        }
                    }
                    return false;
                }
            }
            return true;
        } else {
            global.LOANlist = [];
            Memory.LOANalliance = "";
            global.ALLIANCE_DATA = undefined;
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
        let energy = room.energyCapacityAvailable;
        let energyLevel = 0;
        if (energy >= RCL_1_ENERGY && energy < RCL_2_ENERGY) {
            energyLevel = 1;
        } else if (energy >= RCL_2_ENERGY && energy < RCL_3_ENERGY) {
            energyLevel = 2
        } else if (energy >= RCL_3_ENERGY && energy < RCL_4_ENERGY) {
            energyLevel = 3
        } else if (energy >= RCL_4_ENERGY && energy < RCL_5_ENERGY) {
            energyLevel = 4
        } else if (energy >= RCL_5_ENERGY && energy < RCL_6_ENERGY) {
            energyLevel = 5
        } else if (energy >= RCL_6_ENERGY && energy < RCL_7_ENERGY) {
            energyLevel = 6
        } else if (energy >= RCL_7_ENERGY && energy < RCL_8_ENERGY) {
            energyLevel = 7
        } else if (energy >= RCL_8_ENERGY) {
            energyLevel = 8
        }
        if (energyLevel <= room.controller.level) return energyLevel; else return room.controller.level;
    };

    global.roomLink = function (roomArg, text = undefined, select = true) {
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
        return `<a href="#!/room/${Game.shard.name}/${roomName}" ${select && id ? `onclick="angular.element('body').injector().get('RoomViewPendingSelector').set('${id}')"` : ``}>${text}</a>`;
    };

    global.getRandomInt = function (min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    };

    global.stats = require('stats');

    global.TEN_CPU = Game.cpu.limit === 20 || Game.shard.name === 'shard3';
};

module.exports = globals;
