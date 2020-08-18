/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let Log = require("logger");

let globals = function () {
  // Try to load a private server config otherwise load the default
  try {
    require(Game.shard.name);
    console.log("Loaded config for " + Game.shard.name);
  } catch (e) {
    try {
      require(Memory.customConfig);
      console.log("Loaded config for " + Memory.customConfig);
    } catch (e) {
      require("config");
      console.log("No custom config found loading config.js");
    }
  }
  global.LAYOUT_VERSION = 1.52;

  // Energy income breakdown
  global.ROOM_ENERGY_ALLOTMENT = {
    store: 0.2,
    upgrade: 0.55,
    build: 0.5,
    walls: 0.2,
    other: 0.3,
  };

  // Reaction
  global.TIER_3_BOOSTS = [
    RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
    RESOURCE_CATALYZED_GHODIUM_ACID,
    RESOURCE_CATALYZED_ZYNTHIUM_ACID,
    RESOURCE_CATALYZED_UTRIUM_ACID,
    RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
    RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
    RESOURCE_CATALYZED_KEANIUM_ACID,
    RESOURCE_CATALYZED_LEMERGIUM_ACID,
    RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
    RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
  ];
  global.TIER_2_BOOSTS = [
    RESOURCE_GHODIUM_ALKALIDE,
    RESOURCE_GHODIUM_ACID,
    RESOURCE_ZYNTHIUM_ACID,
    RESOURCE_ZYNTHIUM_ALKALIDE,
    RESOURCE_LEMERGIUM_ALKALIDE,
    RESOURCE_LEMERGIUM_ACID,
    RESOURCE_KEANIUM_ACID,
    RESOURCE_KEANIUM_ALKALIDE,
    RESOURCE_UTRIUM_ALKALIDE,
    RESOURCE_UTRIUM_ACID,
  ];
  global.TIER_1_BOOSTS = [
    RESOURCE_GHODIUM_HYDRIDE,
    RESOURCE_GHODIUM_OXIDE,
    RESOURCE_ZYNTHIUM_HYDRIDE,
    RESOURCE_ZYNTHIUM_OXIDE,
    RESOURCE_LEMERGIUM_OXIDE,
    RESOURCE_LEMERGIUM_HYDRIDE,
    RESOURCE_KEANIUM_OXIDE,
    RESOURCE_KEANIUM_HYDRIDE,
    RESOURCE_UTRIUM_HYDRIDE,
    RESOURCE_UTRIUM_OXIDE,
  ];
  global.BASE_COMPOUNDS = [
    RESOURCE_GHODIUM,
    RESOURCE_ZYNTHIUM_KEANITE,
    RESOURCE_UTRIUM_LEMERGITE,
    RESOURCE_HYDROXIDE,
  ];
  global.BASE_MINERALS = [
    RESOURCE_HYDROGEN,
    RESOURCE_OXYGEN,
    RESOURCE_UTRIUM,
    RESOURCE_LEMERGIUM,
    RESOURCE_KEANIUM,
    RESOURCE_ZYNTHIUM,
    RESOURCE_CATALYST,
    RESOURCE_GHODIUM,
  ];
  global.ALL_BOOSTS = _.union(
    TIER_3_BOOSTS,
    TIER_2_BOOSTS,
    TIER_1_BOOSTS,
    BASE_COMPOUNDS
  );

  // Commodities
  global.MAKE_THESE_COMMODITIES = [];
  global.BASE_COMMODITIES = [
    RESOURCE_SILICON,
    RESOURCE_METAL,
    RESOURCE_BIOMASS,
    RESOURCE_MIST,
  ];
  global.COMPRESSED_COMMODITIES = [
    RESOURCE_UTRIUM_BAR,
    RESOURCE_LEMERGIUM_BAR,
    RESOURCE_ZYNTHIUM_BAR,
    RESOURCE_KEANIUM_BAR,
    RESOURCE_GHODIUM_MELT,
    RESOURCE_OXIDANT,
    RESOURCE_REDUCTANT,
    RESOURCE_PURIFIER,
    RESOURCE_BATTERY,
    RESOURCE_COMPOSITE,
    RESOURCE_CRYSTAL,
    RESOURCE_LIQUID,
  ];
  global.REGIONAL_0_COMMODITIES = [
    RESOURCE_WIRE,
    RESOURCE_CELL,
    RESOURCE_ALLOY,
    RESOURCE_CONDENSATE,
  ];
  global.REGIONAL_1_COMMODITIES = [
    RESOURCE_SWITCH,
    RESOURCE_PHLEGM,
    RESOURCE_TUBE,
    RESOURCE_CONCENTRATE,
  ];
  global.REGIONAL_2_COMMODITIES = [
    RESOURCE_TRANSISTOR,
    RESOURCE_TISSUE,
    RESOURCE_FIXTURES,
    RESOURCE_EXTRACT,
  ];
  global.REGIONAL_3_COMMODITIES = [
    RESOURCE_MICROCHIP,
    RESOURCE_MUSCLE,
    RESOURCE_FRAME,
    RESOURCE_SPIRIT,
  ];
  global.REGIONAL_4_COMMODITIES = [
    RESOURCE_CIRCUIT,
    RESOURCE_ORGANOID,
    RESOURCE_HYDRAULICS,
    RESOURCE_EMANATION,
  ];
  global.REGIONAL_5_COMMODITIES = [
    RESOURCE_DEVICE,
    RESOURCE_ORGANISM,
    RESOURCE_MACHINE,
    RESOURCE_ESSENCE,
  ];
  global.ALL_COMMODITIES = _.union(
    BASE_COMMODITIES,
    COMPRESSED_COMMODITIES,
    REGIONAL_0_COMMODITIES,
    REGIONAL_1_COMMODITIES,
    REGIONAL_2_COMMODITIES,
    REGIONAL_3_COMMODITIES,
    REGIONAL_4_COMMODITIES,
    REGIONAL_5_COMMODITIES
  );

  global.PRIORITIES = {
    // Harvesters
    stationaryHarvester: 2,
    // Workers=
    drone: 3,
    waller: 3,
    upgrader: 4,
    mineralHarvester: 7,
    repairer: 7,
    // Haulers
    hauler: 1,
    miscHauler: 5,
    // Remotes
    remoteUtility: 6,
    remoteHarvester: 3,
    remoteHauler: 4,
    remoteUpgrader: 7,
    roadBuilder: 7,
    assistPioneer: 3,
    fuelTruck: 7,
    reserver: 5,
    borderPatrol: 3,
    // Power
    Power: 6,
    // SK
    SKWorker: 5,
    // Military
    priority: 3,
    urgent: 5,
    high: 7,
    medium: 9,
    secondary: 11,
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
      drone: [MOVE, MOVE, CARRY, WORK],
      waller: [MOVE, MOVE, CARRY, WORK],
      upgrader: [MOVE, MOVE, CARRY, WORK],
      praiseUpgrader: [MOVE, CARRY, WORK],
      hauler: [CARRY, CARRY, MOVE, MOVE],
      filler: [CARRY, CARRY, MOVE, MOVE],
      explorer: [MOVE],
      scout: [MOVE],
      defender: [MOVE, ATTACK],
      longbow: [RANGED_ATTACK, MOVE],
      remoteHauler: [CARRY, CARRY, MOVE, MOVE],
      remoteHarvester: [MOVE, CARRY, WORK],
      remoteAllInOne: [MOVE, MOVE, CARRY, WORK],
    },
  };

  //Cache stuff
  global.ROAD_CACHE = {};
  global.CREEP_CPU_ARRAY = {};
  global.ROOM_CPU_ARRAY = {};
  global.CREEP_ROLE_CPU_ARRAY = {};
  global.ROOM_TASK_CPU_ARRAY = {};
  global.ROOM_ENERGY_INCOME_ARRAY = {};
  global.ROOM_ENERGY_PER_TICK = {};
  global.TASK_CPU_ARRAY = {};
  global.ROOM_CREEP_CPU_OBJECT = {};
  global.ROOM_SOURCE_SPACE = {};
  global.ROOM_CONTROLLER_SPACE = {};
  global.OWNED_MINERALS = [];

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
    [STRUCTURE_KEEPER_LAIR]: "", // TODO: Add icon for keeper lair
    [STRUCTURE_PORTAL]: "", // TODO: Add icon for portal
    [STRUCTURE_POWER_BANK]: "", // TODO: Add icon for power bank
    source: "", // TODO: Add icon for source
    constructionSite: "\uD83C\uDFD7",
    resource: "\uD83D\uDEE2",
    creep: "", // TODO: Add icon for creep
    moveTo: "\u27A1",
    attack: "\uD83D\uDDE1", // NOTE: Same as attackController
    build: "\uD83D\uDD28",
    repair: "\uD83D\uDD27",
    dismantle: "\u2692",
    harvest: "\u26CF",
    pickup: "\u2B07", // NOTE: Same as withdraw
    withdraw: "\u2B07", // NOTE: Same as pickup
    transfer: "\u2B06", // NOTE: Same as upgradeController
    upgradeController: "\u2B06", // NOTE: Same as transfer
    claimController: "\uD83D\uDDDD",
    reserveController: "\uD83D\uDD12",
    attackController: "\uD83D\uDDE1", // NOTE: Same as attack
    recycle: "\u267B",
    tired: "\uD83D\uDCA6",
    stuck0: "\uD83D\uDCA5",
    stuck1: "\uD83D\uDCAB",
    stuck2: "\uD83D\uDCA2",
    wait0: "\uD83D\uDD5B", // 12:00
    wait1: "\uD83D\uDD67", // 12:30
    wait2: "\uD83D\uDD50", // 01:00
    wait3: "\uD83D\uDD5C", // 01:30
    wait4: "\uD83D\uDD51", // 02:00
    wait5: "\uD83D\uDD5D", // 02:30
    wait6: "\uD83D\uDD52", // 03:00
    wait7: "\uD83D\uDD5E", // 03:30
    wait8: "\uD83D\uDD53", // 04:00
    wait9: "\uD83D\uDD5F", // 04:30
    wait10: "\uD83D\uDD54", // 05:00
    wait11: "\uD83D\uDD60", // 05:30
    wait12: "\uD83D\uDD55", // 06:00
    wait13: "\uD83D\uDD61", // 06:30
    wait14: "\uD83D\uDD56", // 07:00
    wait15: "\uD83D\uDD62", // 07:30
    wait16: "\uD83D\uDD57", // 08:00
    wait17: "\uD83D\uDD63", // 08:30
    wait18: "\uD83D\uDD58", // 09:00
    wait19: "\uD83D\uDD64", // 09:30
    wait20: "\uD83D\uDD59", // 10:00
    wait21: "\uD83D\uDD65", // 10:30
    wait22: "\uD83D\uDD5A", // 11:00
    wait23: "\uD83D\uDD66", // 11:30
    sleep: "\uD83D\uDCA4", // for when script is terminated early to refill bucket
    testPassed: "\uD83C\uDF89", // for when scout reaches its goal location
    testFinished: "\uD83C\uDFC1", // for when scout has finished its test run
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
  };

  global.UNIT_COST = (body) => _.sum(body, (p) => BODYPART_COST[p.type || p]);

  global.CUMULATIVE_CONTROLLER_DOWNGRADE = _.map(
    CONTROLLER_DOWNGRADE,
    (v1, k1, c1) => _.reduce(c1, (a, v2, k2, c2) => a + (k2 <= k1 ? v2 : 0), 0)
  );

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
    [RESOURCE_CATALYZED_GHODIUM_ALKALIDE]: [
      RESOURCE_GHODIUM_ALKALIDE,
      RESOURCE_CATALYST,
    ],
    [RESOURCE_CATALYZED_GHODIUM_ACID]: [
      RESOURCE_GHODIUM_ACID,
      RESOURCE_CATALYST,
    ],
    [RESOURCE_CATALYZED_ZYNTHIUM_ACID]: [
      RESOURCE_ZYNTHIUM_ACID,
      RESOURCE_CATALYST,
    ],
    [RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE]: [
      RESOURCE_ZYNTHIUM_ALKALIDE,
      RESOURCE_CATALYST,
    ],
    [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]: [
      RESOURCE_LEMERGIUM_ALKALIDE,
      RESOURCE_CATALYST,
    ],
    [RESOURCE_CATALYZED_LEMERGIUM_ACID]: [
      RESOURCE_LEMERGIUM_ACID,
      RESOURCE_CATALYST,
    ],
    [RESOURCE_CATALYZED_KEANIUM_ALKALIDE]: [
      RESOURCE_KEANIUM_ALKALIDE,
      RESOURCE_CATALYST,
    ],
    [RESOURCE_CATALYZED_KEANIUM_ACID]: [
      RESOURCE_KEANIUM_ACID,
      RESOURCE_CATALYST,
    ],
    [RESOURCE_CATALYZED_UTRIUM_ACID]: [RESOURCE_UTRIUM_ACID, RESOURCE_CATALYST],
    [RESOURCE_CATALYZED_UTRIUM_ALKALIDE]: [
      RESOURCE_UTRIUM_ALKALIDE,
      RESOURCE_CATALYST,
    ],
    //Tier 2
    [RESOURCE_GHODIUM_ACID]: [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_HYDROXIDE],
    [RESOURCE_GHODIUM_ALKALIDE]: [RESOURCE_GHODIUM_OXIDE, RESOURCE_HYDROXIDE],
    [RESOURCE_ZYNTHIUM_ACID]: [RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_HYDROXIDE],
    [RESOURCE_ZYNTHIUM_ALKALIDE]: [RESOURCE_ZYNTHIUM_OXIDE, RESOURCE_HYDROXIDE],
    [RESOURCE_LEMERGIUM_ALKALIDE]: [
      RESOURCE_LEMERGIUM_OXIDE,
      RESOURCE_HYDROXIDE,
    ],
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
    [RESOURCE_UTRIUM_LEMERGITE]: [RESOURCE_UTRIUM, RESOURCE_LEMERGIUM],
  };

  // Boost Uses
  global.BOOST_USE = {
    attack: [
      RESOURCE_CATALYZED_UTRIUM_ACID,
      RESOURCE_UTRIUM_ACID,
      RESOURCE_UTRIUM_HYDRIDE,
    ],
    upgrade: [
      RESOURCE_CATALYZED_GHODIUM_ACID,
      RESOURCE_GHODIUM_ACID,
      RESOURCE_GHODIUM_HYDRIDE,
    ],
    tough: [
      RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
      RESOURCE_GHODIUM_ALKALIDE,
      RESOURCE_GHODIUM_OXIDE,
    ],
    ranged: [
      RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
      RESOURCE_KEANIUM_ALKALIDE,
      RESOURCE_KEANIUM_OXIDE,
    ],
    heal: [
      RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
      RESOURCE_LEMERGIUM_ALKALIDE,
      RESOURCE_LEMERGIUM_OXIDE,
    ],
    build: [
      RESOURCE_CATALYZED_LEMERGIUM_ACID,
      RESOURCE_LEMERGIUM_ACID,
      RESOURCE_LEMERGIUM_HYDRIDE,
    ],
    move: [
      RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
      RESOURCE_ZYNTHIUM_ALKALIDE,
      RESOURCE_ZYNTHIUM_OXIDE,
    ],
    harvest: [
      RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
      RESOURCE_UTRIUM_ALKALIDE,
      RESOURCE_UTRIUM_OXIDE,
    ],
    dismantle: [
      RESOURCE_CATALYZED_ZYNTHIUM_ACID,
      RESOURCE_ZYNTHIUM_ACID,
      RESOURCE_ZYNTHIUM_HYDRIDE,
    ],
  };

  global.MY_USERNAME = _.get(
    _.find(Game.spawns) ||
      _.find(Game.creeps) ||
      _.get(
        _.find(Game.rooms, (room) => room.controller && room.controller.my),
        "controller"
      ),
    ["owner", "username"]
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
        if (this === proto || this === undefined) return;
        let result = fn.call(this, this);
        Object.defineProperty(this, propertyName, {
          value: result,
          configurable: true,
          enumerable: false,
        });
        return result;
      },
      configurable: true,
      enumerable: false,
    });
  };

  //Get average of array
  try {
    global.average = (arr) => arr.reduce((p, c) => p + c, 0) / arr.length;
  } catch (e) {
    global.average = undefined;
  }

  global.displayText = function (room, x, y, what, br = false) {
    if (!br) {
      room.visual
        .text(what, x, y, {
          color: "black",
          opacity: 0.9,
          align: "left",
          font: "bold 0.6 Arial",
        })
        .text(what, x, y, {
          color: "black",
          opacity: 0.9,
          align: "left",
          font: "bold 0.6 Arial",
        });
    } else {
      room.visual
        .text(what, x, y, {
          color: "black",
          opacity: 0.9,
          align: "left",
          font: "bold 0.6 Arial",
          backgroundColor: "black",
          backgroundPadding: 0.3,
        })
        .text(what, x, y, {
          color: "black",
          opacity: 0.9,
          align: "left",
          font: "bold 0.6 Arial",
          backgroundColor: "#eeeeee",
          backgroundPadding: 0.2,
        });
    }
  };

  // League Of Automated Nations allied users list by Kamots
  // Provides global.LOANlist as array of allied usernames. Array is empty if not in an alliance, but still defined.
  // Updates on 2nd run and then every 1001 ticks or if the global scope gets cleared.
  // Usage: After you require this file, just add this to anywhere in your main loop to run every tick: global.populateLOANlist();
  // global.LOANlist will contain an array of usernames after global.populateLOANlist() runs twice in a row (two consecutive ticks).
  global.populateLOANlist = function (
    LOANuser = "LeagueOfAutomatedNations",
    LOANsegment = 99
  ) {
    if (
      typeof RawMemory.setActiveForeignSegment == "function" &&
      !!~["shard0", "shard1", "shard2", "shard3"].indexOf(Game.shard.name)
    ) {
      // To skip running in sim or private servers which prevents errors
      if (
        typeof Memory.lastLOANtime == "undefined" ||
        typeof global.LOANlist == "undefined"
      ) {
        Memory.lastLOANtime = Game.time - 1001;
        global.LOANlist = [];
        if (typeof Memory.LOANalliance == "undefined") Memory.LOANalliance = "";
      }

      if (Game.time >= Memory.lastLOANtime + 1000) {
        RawMemory.setActiveForeignSegment(LOANuser, LOANsegment);
      }

      if (
        Game.time >= Memory.lastLOANtime + 1001 &&
        typeof RawMemory.foreignSegment != "undefined" &&
        RawMemory.foreignSegment.username == LOANuser &&
        RawMemory.foreignSegment.id == LOANsegment
      ) {
        Memory.lastLOANtime = Game.time;
        if (RawMemory.foreignSegment.data == null) {
          global.LOANlist = [];
          Memory.LOANalliance = "";
          global.ALLIANCE_DATA = undefined;
          return false;
        } else {
          let myUsername = ""; // Blank! Will be auto-filled.
          let LOANdata = JSON.parse(RawMemory.foreignSegment.data);
          global.ALLIANCE_DATA = RawMemory.foreignSegment.data;
          let LOANdataKeys = Object.keys(LOANdata);
          let allMyRooms = _.filter(
            Game.rooms,
            (aRoom) =>
              typeof aRoom.controller != "undefined" && aRoom.controller.my
          );
          if (allMyRooms.length == 0) {
            let allMyCreeps = _.filter(Game.creeps, (creep) => true);
            if (allMyCreeps.length == 0) {
              global.LOANlist = [];
              global.LOANlist.concat(MANUAL_FRIENDS);
              Memory.LOANalliance = "";
              return false;
            } else myUsername = allMyCreeps[0].owner.username;
          } else myUsername = allMyRooms[0].controller.owner.username;
          for (let iL = LOANdataKeys.length - 1; iL >= 0; iL--) {
            if (LOANdata[LOANdataKeys[iL]].indexOf(myUsername) >= 0) {
              //console.log("Player",myUsername,"found in alliance",LOANdataKeys[iL]);
              let disavowed = ["BADuser1", "Zenga"];
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
      energyLevel = 2;
    } else if (energy >= RCL_3_ENERGY && energy < RCL_4_ENERGY) {
      energyLevel = 3;
    } else if (energy >= RCL_4_ENERGY && energy < RCL_5_ENERGY) {
      energyLevel = 4;
    } else if (energy >= RCL_5_ENERGY && energy < RCL_6_ENERGY) {
      energyLevel = 5;
    } else if (energy >= RCL_6_ENERGY && energy < RCL_7_ENERGY) {
      energyLevel = 6;
    } else if (energy >= RCL_7_ENERGY && energy < RCL_8_ENERGY) {
      energyLevel = 7;
    } else if (energy >= RCL_8_ENERGY) {
      energyLevel = 8;
    }
    if (energyLevel <= room.controller.level) return energyLevel;
    else return room.controller.level;
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
    } else if (typeof roomArg === "string") {
      roomName = roomArg;
    } else {
      console.log(
        `Invalid parameter to roomLink global function: ${roomArg} of type ${typeof roomArg}`
      );
    }
    text = text || (id ? roomArg : roomName);
    return `<a href="#!/room/${Game.shard.name}/${roomName}" ${
      select && id
        ? `onclick="angular.element('body').injector().get('RoomViewPendingSelector').set('${id}')"`
        : ``
    }>${text}</a>`;
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

  /* Posted March 2nd, 2018 by @semperrabbit */

  global.BUCKET_MAX = 10000;
  global.clamp = function clamp(min, val, max) {
    if (val < min) return min;
    if (val > max) return max;
    return val;
  };
  global.adjustedCPULimit = function adjustedCPULimit(
    limit,
    bucket,
    target = BUCKET_MAX * 0.5,
    maxCpuPerTick = 495
  ) {
    var multiplier = 1;
    if (bucket < target) {
      multiplier = Math.sin((Math.PI * bucket) / (2 * target));
    }
    if (bucket > target) {
      // Thanks @Deign for support with the sine function below
      multiplier =
        2 +
        Math.sin(
          (Math.PI * (bucket - BUCKET_MAX)) / (2 * (BUCKET_MAX - target))
        );
      // take care of our 10 CPU folks, to dip into their bucket reserves more...
      // help them burn through excess bucket above the target.
      if (limit === 10 && multiplier > 1.5) multiplier += 1;
    }

    return clamp(
      Math.round(limit * 0.2),
      Math.round(limit * multiplier),
      maxCpuPerTick
    );
  };

  global.TEN_CPU = Game.cpu.limit === 20 || Game.shard.name === "shard3";

  global.log = new Log();
};

module.exports = globals;
