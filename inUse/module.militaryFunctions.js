module.exports.buildWalls = function (spawn) {
        if (Game.constructionSites.length > 75) {
            return null;
        }
        let pos = new RoomPosition(39, 14, spawn.room.name);
        let path = spawn.room.findPath(spawn.pos, pos, {
            costCallback: function (roomName, costMatrix) {
                const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                for (let i = 0; i < rampart.length; i++) {
                    costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                }
                const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                for (let i = 0; i < construction.length; i++) {
                    costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
                }
            },
            maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
        });
    if (path[4] !== undefined) {
        let build = new RoomPosition(path[4].x, path[4].y, spawn.room.name);
            build.createConstructionSite(STRUCTURE_RAMPART);
            spawn.memory.wallCheck = false;
        } else {
            let path = spawn.room.findPath(spawn.room.controller.pos, pos, {
                costCallback: function (roomName, costMatrix) {
                    const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    for (let i = 0; i < rampart.length; i++) {
                        costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                    }
                    const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                    for (let i = 0; i < construction.length; i++) {
                        costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
                    }
                },
                maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
            });
        if (path[2] !== undefined) {
            let build = new RoomPosition(path[2].x, path[2].y, spawn.room.name);
                build.createConstructionSite(STRUCTURE_RAMPART);
                spawn.memory.wallCheck = false;
            } else {
                spawn.memory.wallCheck = true;
            }
        }
};