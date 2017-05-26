/**
 * Created by rober on 5/16/2017.
 */
module.exports.rcl1 = function (spawnName) {
    //Spawn
    let spawn = Game.spawns[spawnName];

    //Auto Build Spawn Roads
    roadsSpawn(spawn);
};

module.exports.rcl2 = function (spawnName) {
    //Spawn
    let spawn = Game.spawns[spawnName];

    //RCL2 Extensions
    rcl2Extensions(spawn);
};

module.exports.rcl3 = function (spawnName) {
    //Spawn
    let spawn = Game.spawns[spawnName];

    //Auto Build Spawn Roads
    roadsSpawn(spawn);

    //RCL2 Extensions
    rcl2Extensions(spawn);

    //RCL3 Extensions
    rcl3Extensions(spawn);

    //RCL3 Tower
    rcl3Tower(spawn);
};

module.exports.rcl4 = function (spawnName) {
    //Spawn
    let spawn = Game.spawns[spawnName];

    //Auto Build Spawn Roads
    roadsSpawn(spawn);

    //RCL2 Extensions
    rcl2Extensions(spawn);

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
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x+1, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x-1, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x-i, spawn.pos.y+1, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x+i, spawn.pos.y-1, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x+i, spawn.pos.y+1, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x+i, spawn.pos.y-1, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x-i, spawn.pos.y-1, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x+1, spawn.pos.y-i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 4; i++) {
        let pos = new RoomPosition(spawn.pos.x-1, spawn.pos.y-i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    let pos = new RoomPosition(spawn.pos.x-2, spawn.pos.y-2, spawn.room.name);
    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos.createConstructionSite(STRUCTURE_ROAD);
    }
    let pos2 = new RoomPosition(spawn.pos.x+2, spawn.pos.y+2, spawn.room.name);
    if (pos2.lookFor(LOOK_STRUCTURES).length === 0 && pos2.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos2.createConstructionSite(STRUCTURE_ROAD);
    }
    let pos3 = new RoomPosition(spawn.pos.x-2, spawn.pos.y+2, spawn.room.name);
    if (pos3.lookFor(LOOK_STRUCTURES).length === 0 && pos3.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos3.createConstructionSite(STRUCTURE_ROAD);
    }
    let pos4 = new RoomPosition(spawn.pos.x+2, spawn.pos.y-2, spawn.room.name);
    if (pos4.lookFor(LOOK_STRUCTURES).length === 0 && pos4.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos4.createConstructionSite(STRUCTURE_ROAD);
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
            if (constructionCheck.length > 0 || roadCheck.length > 0) {
            } else {
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
            if (constructionCheck.length > 0 || roadCheck.length > 0) {
            } else {
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
            if (constructionCheck.length > 0 || roadCheck.length > 0) {
            } else {
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
            if (constructionCheck.length > 0 || roadCheck.length > 0) {
            } else {
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
    for (let i = 0; i < 4; i++) {
        if (path[i] !== undefined) {
            let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            if (constructionCheck.length > 0 || roadCheck.length > 0) {
            } else {
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
    for (let i = 0; i < 4; i++) {
        if (path[i] !== undefined) {
            let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            if (constructionCheck.length > 0 || roadCheck.length > 0) {
            } else {
                build.createConstructionSite(STRUCTURE_STORAGE);
            }
        }
    }
}

