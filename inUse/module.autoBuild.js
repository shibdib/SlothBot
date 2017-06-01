/**
 * Created by rober on 5/16/2017.
 */
module.exports.roomBuilding = function (spawnName) {
    let level = Game.spawns[spawnName].room.controller.level;
    if (level === 1) {
        rcl1(spawnName);
    }
    if (level === 2) {
        rcl2(spawnName);
    }
    if (level === 3) {
        rcl3(spawnName);
    }
    if (level === 4) {
        rcl4(spawnName);
    }
    if (level === 5) {
        rcl4(spawnName);
    }
    if (level === 6) {
        rcl4(spawnName);
    }
    if (level === 7) {
        rcl4(spawnName);
    }
    if (level === 8) {
        rcl4(spawnName);
    }
};
function rcl1(spawnName) {
    if (Game.constructionSites.length > 75) {
        return null;
    }
    //Spawn
    let spawn = Game.spawns[spawnName];

    //Auto Build Spawn Roads
    roadsSpawn(spawn);
}

function rcl2(spawnName) {
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
}

function rcl3(spawnName) {
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
}

function rcl4(spawnName) {
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
}

function roadsSpawn(spawn) {
    for (i = 1; i < 8; i++) {
        let pos = new RoomPosition(spawn.pos.x, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 8; i++) {
        let pos = new RoomPosition(spawn.pos.x, spawn.pos.y-i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 8; i++) {
        let pos = new RoomPosition(spawn.pos.x+i, spawn.pos.y, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 8; i++) {
        let pos = new RoomPosition(spawn.pos.x-i, spawn.pos.y, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
}

function roadSources(spawn){
    const sources = spawn.room.find(FIND_SOURCES);
    for (i=0;i<sources.length;i++) {
        let path = spawn.room.findPath(spawn.pos, sources[i].pos, {
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
    const pos = new RoomPosition(spawn.pos.x - 2, spawn.pos.y - 1, spawn.room.name);
    const pos2 = new RoomPosition(spawn.pos.x - 2, spawn.pos.y - 5, spawn.room.name);
    let path = spawn.room.findPath(pos, pos2, {
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
            const spawnDistance = build.getRangeTo(spawn);
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 8) {
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
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 8) {
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
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 8) {
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
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 8) {
                build.createConstructionSite(STRUCTURE_EXTENSION);
            }
        }
    }
}

function rcl3Tower(spawn) {
    const pos = new RoomPosition(spawn.pos.x - 2, spawn.pos.y + 2, spawn.room.name);
    let path = spawn.room.findPath(spawn.pos, pos, {
        costCallback: function (roomName, costMatrix) {
            const structures = spawn.room.find(FIND_STRUCTURES);
            for (let i = 0; i < structures.length; i++) {
                costMatrix.set(structures[i].pos.x, structures[i].pos.y, 0);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    for (let i = 0; i < 3; i++) {
        if (path[i] !== undefined) {
            let build = new RoomPosition(path[i].x, path[i].y, spawn.room.name);
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            const spawnDistance = build.getRangeTo(spawn);
            if (constructionCheck.length === 0 && roadCheck.length === 0 && spawnDistance > 2 && spawnDistance < 8) {
                build.createConstructionSite(STRUCTURE_TOWER);
            }
        }
    }
}

function rcl4Storage(spawn) {
    let pos = new RoomPosition(spawn.room.controller.pos.x, spawn.room.controller.pos.y - 4, spawn.room.name);
    if (Game.map.getTerrainAt(pos) !== 'wall') {
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_STORAGE);
        }
    } else {
        let pos = new RoomPosition(spawn.room.controller.pos.x, spawn.room.controller.pos.y + 4, spawn.room.name);
        if (Game.map.getTerrainAt(pos) !== 'wall') {
            if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
                pos.createConstructionSite(STRUCTURE_STORAGE);
            }
        } else {
            let pos = new RoomPosition(spawn.room.controller.pos.x - 4, spawn.room.controller.pos.y, spawn.room.name);
            if (Game.map.getTerrainAt(pos) !== 'wall') {
                if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
                    pos.createConstructionSite(STRUCTURE_STORAGE);
                }
            } else {
                let pos = new RoomPosition(spawn.room.controller.pos.x + 4, spawn.room.controller.pos.y, spawn.room.name);
                if (Game.map.getTerrainAt(pos) !== 'wall') {
                    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
                        pos.createConstructionSite(STRUCTURE_STORAGE);
                    }
                }
            }
        }
    }
}

