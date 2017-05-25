module.exports.buildWalls = function (spawn) {
    if (Game.constructionSites.length > 75) {
        return null;
    }
    let pos = new RoomPosition(39, 14, spawn.room.name);
    let path = spawn.room.findPath(spawn.pos, pos, {
        costCallback: function (roomName, costMatrix) {
            const nonRampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType !== STRUCTURE_RAMPART || r.structureType !== STRUCTURE_WALL});
            for (let i = 0; i < nonRampart.length; i++) {
                costMatrix.set(nonRampart[i].pos.x, nonRampart[i].pos.y, 0);
            }
            const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
            for (let i = 0; i < rampart.length; i++) {
                costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
            }
            const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
            for (let i = 0; i < construction.length; i++) {
                costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    if (path[4] !== undefined) {
        let build = new RoomPosition(path[4].x, path[4].y, spawn.room.name);
        let nearbyRamps = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        let nearbyWalls = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
        const buildRamps = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        const buildWalls = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
        const roadCheck = build.lookFor(LOOK_STRUCTURES);
        const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
        if (constructionCheck.length > 0) {
            spawn.memory.wallCheck = false;
        } else if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
            build.createConstructionSite(STRUCTURE_RAMPART);
            spawn.memory.wallCheck = false;
        } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
            build.createConstructionSite(STRUCTURE_WALL);
            spawn.memory.wallCheck = false;
        } else {
            build.createConstructionSite(STRUCTURE_RAMPART);
            spawn.memory.wallCheck = false;
        }
    } else {
        let path = spawn.room.findPath(spawn.room.controller.pos, pos, {
            costCallback: function (roomName, costMatrix) {
                const nonRampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType !== STRUCTURE_RAMPART});
                for (let i = 0; i < nonRampart.length; i++) {
                    costMatrix.set(nonRampart[i].pos.x, nonRampart[i].pos.y, 0);
                }
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
            let nearbyRamps = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
            let nearbyWalls = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
            const buildRamps = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
            const buildWalls = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            if (constructionCheck.length > 0) {
                spawn.memory.wallCheck = false;
            } else if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                build.createConstructionSite(STRUCTURE_RAMPART);
                spawn.memory.wallCheck = false;
            } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                build.createConstructionSite(STRUCTURE_WALL);
                spawn.memory.wallCheck = false;
            } else {
                build.createConstructionSite(STRUCTURE_RAMPART);
                spawn.memory.wallCheck = false;
            }
        } else {
            spawn.memory.wallCheck = true;
        }
    }
};