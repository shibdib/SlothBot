module.exports.buildWalls = function (spawn) {
    for (let i = 2; i < 47; i++) {
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
            maxOps: 100000, serialize: false, ignoreCreeps: true, maxRooms: 1
        });
        if (path[7] !== undefined) {
            let build = new RoomPosition(path[7].x, path[7].y, spawn.room.name);
            build.createConstructionSite(STRUCTURE_RAMPART);
        }
    }
};