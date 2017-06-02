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
                militaryFunctions.borderWalls(Game.spawns[name]);
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
            let creep = Game.spawns[name].pos.findInRange(FIND_MY_CREEPS, 1);
            if (creep.length > 0 && creep[0].memory.recycle === true) {
                Game.spawns[name].recycleCreep(creep[0]);
            }
            /** else {
                let creep = _.min(Game.spawns[name].pos.findInRange(FIND_MY_CREEPS, 1), 'ticksToLive');
                if (creep.ticksToLive < 1000) {
                    Game.spawns[name].renewCreep(creep);
                    return;
                }
            }**/
        }

        //Creep spawning
        respawnCreeps.creepRespawn(name);

        //Room Building
        if (Game.time % 30 === 0) {
            autoBuild.roomBuilding(name);
        }

        //Cache Buildings
        if (Game.time % 50 === 0) {
            for (let structures of Game.spawns[name].room.find(FIND_STRUCTURES)) {
                if (structures.room === Game.spawns[name].room && structures.structureType !== STRUCTURE_WALL && structures.structureType !== STRUCTURE_RAMPART && structures.structureType !== STRUCTURE_ROAD) {
                    cache.cacheRoomStructures(structures.id);
                }
            }
        }

        //Hauling


    }
}
;