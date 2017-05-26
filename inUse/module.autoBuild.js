/**
 * Created by rober on 5/16/2017.
 */
module.exports.rcl1 = function (spawnName) {
    if (Game.constructionSites.length > 75) {
        return null;
    }
    //Spawn
    let spawn = Game.spawns[spawnName];

    //Auto Build Spawn Roads
    roadsSpawn(spawn);
};

module.exports.rcl2 = function (spawnName) {
    if (Game.constructionSites.length > 75) {
        return null;
    }
    //Spawn
    let spawn = Game.spawns[spawnName];

    //Auto Build Spawn Roads
    console.log('start spawn');
    roadsSpawn(spawn);
    console.log('end spawn');

    //RCL2 Extensions
    console.log('start ext');
    rcl2Extensions(spawn);
    console.log('end ext');

    //RCL2 Roads
    console.log('start sources');
    roadSources(spawn);
    console.log('end sources');
};

module.exports.rcl3 = function (spawnName) {
    if (Game.constructionSites.length > 75) {
        return null;
    }
    //Spawn
    let spawn = Game.spawns[spawnName];

    //Auto Build Spawn Roads
    roadsSpawn(spawn);

    //RCL2 Extensions
    rcl2Extensions(spawn);

    //RCL2 Roads
    roadSources(spawn);

    //RCL3 Extensions
    rcl3Extensions(spawn);

    //RCL3 Tower
    rcl3Tower(spawn);
};

module.exports.rcl4 = function (spawnName) {
    if (Game.constructionSites.length > 75) {
        return null;
    }
    //Spawn
    let spawn = Game.spawns[spawnName];

    //Auto Build Spawn Roads
    roadsSpawn(spawn);

    //RCL2 Extensions
    rcl2Extensions(spawn);

    //RCL2 Roads
    roadSources(spawn);

    //RCL3 Extensions
    rcl3Extensions(spawn);

    //RCL3 Tower
    rcl3Tower(spawn);

    //RCL4 Extensions
    rcl4Extensions(spawn);

    //RCL4 Storage
    rcl4Storage(spawn);
};

function roadsSpawn(spawn) {
    for (i = 1; i < 7; i++) {
        let pos = new RoomPosition(spawn.pos.x, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 7; i++) {
        let pos = new RoomPosition(spawn.pos.x, spawn.pos.y-i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 7; i++) {
        let pos = new RoomPosition(spawn.pos.x+i, spawn.pos.y, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 7; i++) {
        let pos = new RoomPosition(spawn.pos.x-i, spawn.pos.y, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
}

function roadSources(spawn){
    const sources = spawn.room.find(FIND_SOURCES);
    for (i=0;i<sources.length;i++) {
        let path = spawn.room.findPath(spawn.pos, sources[i], {
            maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: false
        });
        for (let i = 0; i < path.length; i++) {
            if (path[i] !== undefined) {
                let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
                const roadCheck = build.lookFor(LOOK_STRUCTURES);
                const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                if (constructionCheck.length > 0 || roadCheck.length > 0) {
                } else {
                    build.createConstructionSite(STRUCTURE_ROAD);
                }
            }
        }
    }

}

function rcl2Extensions(spawn) {
    const pos = new RoomPosition(spawn.pos.x-4, spawn.pos.y-4, spawn.room.name);
    let path = spawn.room.findPath(spawn.pos, pos, {
        costCallback: function (roomName, costMatrix) {
            const structures = spawn.room.find(FIND_STRUCTURES);
            for (let i = 0; i < structures.length; i++) {
                costMatrix.set(structures[i].pos.x, structures[i].pos.y, 0);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    for (let i = 0; i < 5; i++) {
        if (path[i] !== undefined) {
            let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            const spawnDistance = build.getRangeTo(spawn);
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 4) {
                build.createConstructionSite(STRUCTURE_EXTENSION);
            }
        }
    }
}

function rcl3Extensions(spawn) {
    const pos = new RoomPosition(spawn.pos.x+4, spawn.pos.y+4, spawn.room.name);
    let path = spawn.room.findPath(spawn.pos, pos, {
        costCallback: function (roomName, costMatrix) {
            const structures = spawn.room.find(FIND_STRUCTURES);
            for (let i = 0; i < structures.length; i++) {
                costMatrix.set(structures[i].pos.x, structures[i].pos.y, 0);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    for (let i = 0; i < 5; i++) {
        if (path[i] !== undefined) {
            let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            const spawnDistance = build.getRangeTo(spawn);
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 4) {
                build.createConstructionSite(STRUCTURE_EXTENSION);
            }
        }
    }
}

function rcl4Extensions(spawn) {
    const pos = new RoomPosition(spawn.pos.x+4, spawn.pos.y-4, spawn.room.name);
    let path = spawn.room.findPath(spawn.pos, pos, {
        costCallback: function (roomName, costMatrix) {
            const structures = spawn.room.find(FIND_STRUCTURES);
            for (let i = 0; i < structures.length; i++) {
                costMatrix.set(structures[i].pos.x, structures[i].pos.y, 0);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    for (let i = 0; i < 5; i++) {
        if (path[i] !== undefined) {
            let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            const spawnDistance = build.getRangeTo(spawn);
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 4) {
                build.createConstructionSite(STRUCTURE_EXTENSION);
            }
        }
    }
    const pos2 = new RoomPosition(spawn.pos.x-4, spawn.pos.y-4, spawn.room.name);
    let path2 = spawn.room.findPath(spawn.pos, pos2, {
        costCallback: function (roomName, costMatrix) {
            const structures = spawn.room.find(FIND_STRUCTURES);
            for (let i = 0; i < structures.length; i++) {
                costMatrix.set(structures[i].pos.x, structures[i].pos.y, 0);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    for (let i = 0; i < 5; i++) {
        if (path2[i] !== undefined) {
            let build = new RoomPosition(path2[i].x, path2[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            const spawnDistance = build.getRangeTo(spawn);
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 4) {
                build.createConstructionSite(STRUCTURE_EXTENSION);
            }
        }
    }
}

function rcl3Tower(spawn) {
    const pos = new RoomPosition(spawn.pos.x-4, spawn.pos.y+4, spawn.room.name);
    let path = spawn.room.findPath(spawn.pos, pos, {
        costCallback: function (roomName, costMatrix) {
            const structures = spawn.room.find(FIND_STRUCTURES);
            for (let i = 0; i < structures.length; i++) {
                costMatrix.set(structures[i].pos.x, structures[i].pos.y, 0);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    for (let i = 0; i < 5; i++) {
        if (path[i] !== undefined) {
            let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            const spawnDistance = build.getRangeTo(spawn);
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 4) {
                build.createConstructionSite(STRUCTURE_TOWER);
            }
        }
    }
}

function rcl4Storage(spawn) {
    const pos = new RoomPosition(spawn.pos.x-3, spawn.pos.y+3, spawn.room.name);
    let path = spawn.room.findPath(spawn.pos, pos, {
        costCallback: function (roomName, costMatrix) {
            const structures = spawn.room.find(FIND_STRUCTURES);
            for (let i = 0; i < structures.length; i++) {
                costMatrix.set(structures[i].pos.x, structures[i].pos.y, 0);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    for (let i = 0; i < 5; i++) {
        if (path[i] !== undefined) {
            let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            const spawnDistance = build.getRangeTo(spawn);
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 4) {
                build.createConstructionSite(STRUCTURE_STORAGE);
            }
        }
    }
}

