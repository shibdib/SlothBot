//modules
let autoBuild = require('room.autoBuild');
let _ = require('lodash');
const profiler = require('screeps-profiler');

function roomControl() {
    for (let name in Game.spawns) {
        let currentRoom = Game.spawns[name].room;
        if (!currentRoom.memory._caches || !currentRoom.memory._caches.tick || currentRoom.memory._caches.tick < Game.time) {
            currentRoom.memory._caches = {};
            currentRoom.memory._caches.tick = Game.time;
            currentRoom.memory._caches.creeps = _.filter(Game.creeps, (c) => c.room.name === currentRoom.name);

            //Process Build Queue
            currentRoom.creepQueueChecks();
            cleanQueue(currentRoom);
            currentRoom.processBuildQueue();


            //Room Building
            if (Game.time % 75 === 0 && Game.cpu.bucket > 7500) {
                autoBuild.roomBuilding(currentRoom.name);
            }

            //Cache Buildings
            if (Game.time % 50 === 0) {
                currentRoom.memory.structureCache = undefined;
                for (let structures of currentRoom.find(FIND_STRUCTURES)) {
                    if (structures.room === currentRoom && structures.structureType !== STRUCTURE_ROAD && structures.structureType !== STRUCTURE_WALL && structures.structureType !== STRUCTURE_RAMPART) {
                        currentRoom.cacheRoomStructures(structures.id);
                    }
                }
            }
        }
    }
}
module.exports.roomControl = profiler.registerFN(roomControl, 'roomControl');

function cleanQueue(room) {
    for (let key in room.memory.creepBuildQueue) {
        if (room.memory.creepBuildQueue[key].room !== room.name) delete room.memory.creepBuildQueue[key]
    }
}