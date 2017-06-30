//modules
let autoBuild = require('module.autoBuild');
let respawnCreeps = require('oldStuff/module.respawn');
let cache = require('module.cache');
let _ = require('lodash');

let doNotAggress = RawMemory.segments[2];

module.exports.roomControl = function () {

    for (let name in Game.spawns) {

        //RCL
        //let level = Game.spawns[name].room.controller.level;

        //Every 100 ticks
        /**if (Game.time % 100 === 0) {
            //autoBuild.run(name);
            if (Game.spawns[name].memory.wallCheck !== true && level >= 3) {
                //militaryFunctions.buildWalls(Game.spawns[name]);
                militaryFunctions.borderWalls(Game.spawns[name]);
                //militaryFunctions.roadNetwork(Game.spawns[name]);
            }
        }**/

        //SAFE MODE
        if (Game.spawns[name].hits < Game.spawns[name].hitsMax / 2) {
            Game.spawns[name].room.controller.activateSafeMode();
        }

        //DEFENSE MODE
        //ramparts public unless needed
        let rampart = _.pluck(_.filter(Game.spawns[name].room.memory.structureCache, 'type', 'rampart'), 'id');
        if (rampart.length > 0) {
            if (Game.getObjectById(rampart[0])) {
                let hostile = Game.getObjectById(rampart[0]).pos.findClosestByRange(FIND_CREEPS, {filter: (s) => _.includes(doNotAggress, s.owner['username']) === false});
                if (!hostile) {
                    for (let i = 0; i < rampart.length; i++) {
                        if (Game.getObjectById(rampart[i])) {
                            if (Game.getObjectById(rampart[i]).isPublic === false) {
                                Game.getObjectById(rampart[i]).setPublic(true);
                            }
                        }
                    }
                } else {
                    for (let i = 0; i < rampart.length; i++) {
                        if (Game.getObjectById(rampart[i])) {
                            if (Game.getObjectById(rampart[i]).isPublic === true) {
                                Game.getObjectById(rampart[i]).setPublic(false);
                            }
                        }
                    }
                }
            }
        }
        /**let attackDetected = _.filter(Game.creeps, (creep) => creep.memory.enemyCount !== null && creep.memory.role === 'scout');
        if (attackDetected.length > 0 || Game.spawns[name].memory.defenseMode === true) {
            militaryFunctions.activateDefense(Game.spawns[name], attackDetected);
        }
        if (Game.spawns[name].memory.defenseMode === true) {
            Game.spawns[name].memory.defenseModeTicker++;
            if (Game.spawns[name].memory.defenseModeTicker > 250) {
                Game.spawns[name].memory.defenseMode = false;
            }
        }**/

        //RENEWAL/RECYCLE CHECK
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

        Memory.stats.cpu.postCreepRespawn = Game.cpu.getUsed();

        //Room Building
        if (Game.time % 75 === 0) {
            autoBuild.roomBuilding(name);
            Memory.stats.cpu.postRoomBuilding = Game.cpu.getUsed();
        }

        //Cache Buildings
        if (Game.time % 50 === 0) {
            Game.spawns[name].room.memory.structureCache = undefined;
            for (let structures of Game.spawns[name].room.find(FIND_STRUCTURES)) {
                if (structures.room === Game.spawns[name].room && structures.structureType !== STRUCTURE_ROAD && structures.structureType !== STRUCTURE_WALL) {
                    cache.cacheRoomStructures(structures.id);
                    Memory.stats.cpu.postCacheRoom = Game.cpu.getUsed();
                }
            }
        }

        //Hauling


    }
};