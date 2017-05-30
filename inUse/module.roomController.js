//modules
let autoBuild = require('module.autoBuild');
let respawnCreeps = require('module.respawn');
let militaryFunctions = require('module.militaryFunctions');
let cache = require('module.cache');

module.exports.roomControl = function () {

    for (let name in Game.spawns) {

        //Every 100 ticks
        if (Game.time % 100 === 0) {
            //autoBuild.run(name);
            if (Game.spawns[name].memory.wallCheck !== true && level >= 3) {
                militaryFunctions.buildWalls(Game.spawns[name]);
                //militaryFunctions.roadNetwork(Game.spawns[name]);
            }
        }

        //RCL
        let level = Game.spawns[name].room.controller.level;

        //SAFE MODE
        if (Game.spawns[name].hits < Game.spawns[name].hitsMax / 2) {
            Game.spawns[name].room.controller.activateSafeMode();
        }

        //DEFENSE MODE
        let attackDetected = _.filter(Game.creeps, (creep) => creep.memory.enemyCount !== null && creep.memory.role === 'scout');
        if (attackDetected.length > 0 || Game.spawns[name].memory.defenseMode === true) {
            militaryFunctions.activateDefense(Game.spawns[name], attackDetected);
        }
        if (Game.spawns[name].memory.defenseMode === true) {
            Game.spawns[name].memory.defenseModeTicker++;
            if (Game.spawns[name].memory.defenseModeTicker > 250) {
                Game.spawns[name].memory.defenseMode = false;
            }
        }

        //RENEWAL/RECYCLE CHECK
        //Mark old creeps for recycling
        let legacyCreeps = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[name].id && creep.memory.level === undefined || creep.memory.level === null);
        for (let i = 0; i < legacyCreeps.length; i++) {
            legacyCreeps[i].memory.level = level;
        }
        let recycleCreeps = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === Game.spawns[name].id && creep.memory.level < level && creep.memory.level !== 0);
        for (let i = 0; i < recycleCreeps.length; i++) {
            recycleCreeps[i].memory.recycle = true;
        }
        if (!Game.spawns[name].spawning) {
            let creep = Game.spawns[name].pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => c.memory.recycle === true});
            if (creep.length) {
                Game.spawns[name].recycleCreep(creep[0]);
            } else {
                let creep = _.min(Game.spawns[name].pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => c.memory.renew === true}), 'ticksToLive');
                if (creep.body) {
                    let cost = _.sum(creep.body, p => BODYPART_COST[p.type]);
                    let totalParts = creep.body.length;
                    let renewPerTick = Math.floor(600 / totalParts);
                    let costPerRenew = Math.ceil(cost / 2.5 / totalParts);
                    let renewCost = ((1000 - creep.ticksToLive) / renewPerTick) * costPerRenew;
                    if (renewCost < cost - (cost * 0.34)) {
                        Game.spawns[name].renewCreep(creep);
                        if (creep.ticksToLive > 1000) {
                            creep.memory.renew = false;
                        }
                    } else {
                        Game.spawns[name].recycleCreep(creep);
                    }
                }
            }
        }

        //Creep spawning
        respawnCreeps.creepRespawn(name);

        //Room Building
        autoBuild.roomBuilding(name);

        //Cache Buildings
        if (Game.time % 25 === 0) {
            for (let structures of _.values(Game.structures)) {
                if (structures.room === Game.spawns[name].room && structures.structureType !== STRUCTURE_WALL && structures.structureType !== STRUCTURE_RAMPART) {
                    cache.cacheRoomStructure(structures.id);
                }
            }
        }

        //Hauling
        let roomStructures = Game.spawns[name].room.memory.structureCache;
        if (roomStructures.length > 0) {
            for (i = 0; i < roomStructures.length; i++) {
                if (roomStructures.type === 'container' && Game.getObjectById(roomStructures.id).store > 100) {
                    const basicHauler = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHauler' && creep.room === Game.spawns[name].room && creep.memory.energyDestination === null && creep.memory.hauling === false);
                    const basicHaulerLarge = _.filter(Game.creeps, (creep) => creep.memory.role === 'basicHaulerLarge' && creep.room === Game.spawns[name].room && creep.memory.energyDestination === null && creep.memory.hauling === false);
                    if (basicHaulerLarge.length !== 0) {
                        basicHaulerLarge[0].memory.energyDestination = roomStructures[i].id;
                    } else if (basicHauler.length > 0) {
                        basicHauler[0].memory.energyDestination = roomStructures[i].id;
                    }
                }
            }
        }

    }
};