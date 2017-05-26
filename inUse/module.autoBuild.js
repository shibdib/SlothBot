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

    //RCL4 Extensions
    rcl4Extensions(spawn);

    //RCL4 Storage
    rcl4Storage(spawn);
};

function roadsSpawn(spawn) {
    for (i = 1; i < 3; i++) {
        let pos = new RoomPosition(spawn.pos.x+i, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 3; i++) {
        let pos = new RoomPosition(spawn.pos.x+i, spawn.pos.y-i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 3; i++) {
        let pos = new RoomPosition(spawn.pos.x-i, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 3; i++) {
        let pos = new RoomPosition(spawn.pos.x-i, spawn.pos.y-i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 3; i++) {
        let pos = new RoomPosition(spawn.pos.x, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 3; i++) {
        let pos = new RoomPosition(spawn.pos.x, spawn.pos.y-i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 3; i++) {
        let pos = new RoomPosition(spawn.pos.x-i, spawn.pos.y, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
    for (i = 1; i < 3; i++) {
        let pos = new RoomPosition(spawn.pos.x+i, spawn.pos.y, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_ROAD);
        }
    }
}

function rcl2Extensions(spawn) {
    const pos = new RoomPosition(spawn.pos.x+1, spawn.pos.y-2, spawn.room.name);
    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos2 = new RoomPosition(spawn.pos.x+1, spawn.pos.y+2, spawn.room.name);
    if (pos2.lookFor(LOOK_STRUCTURES).length === 0 && pos2.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos2.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos3 = new RoomPosition(spawn.pos.x-1, spawn.pos.y+2, spawn.room.name);
    if (pos3.lookFor(LOOK_STRUCTURES).length === 0 && pos3.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos3.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos4 = new RoomPosition(spawn.pos.x-1, spawn.pos.y-2, spawn.room.name);
    if (pos4.lookFor(LOOK_STRUCTURES).length === 0 && pos4.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos4.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos5 = new RoomPosition(spawn.pos.x+2, spawn.pos.y-1, spawn.room.name);
    if (pos5.lookFor(LOOK_STRUCTURES).length === 0 && pos5.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos5.createConstructionSite(STRUCTURE_EXTENSION);
    }
}

function rcl3Extensions(spawn) {
    const pos = new RoomPosition(spawn.pos.x-2, spawn.pos.y+1, spawn.room.name);
    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos2 = new RoomPosition(spawn.pos.x-2, spawn.pos.y+1, spawn.room.name);
    if (pos2.lookFor(LOOK_STRUCTURES).length === 0 && pos2.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos2.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos3 = new RoomPosition(spawn.pos.x+2, spawn.pos.y+1, spawn.room.name);
    if (pos3.lookFor(LOOK_STRUCTURES).length === 0 && pos3.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos3.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos4 = new RoomPosition(spawn.pos.x-1, spawn.pos.y-3, spawn.room.name);
    if (pos4.lookFor(LOOK_STRUCTURES).length === 0 && pos4.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos4.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos5 = new RoomPosition(spawn.pos.x+1, spawn.pos.y-3, spawn.room.name);
    if (pos5.lookFor(LOOK_STRUCTURES).length === 0 && pos5.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos5.createConstructionSite(STRUCTURE_EXTENSION);
    }
}

function rcl4Extensions(spawn) {
    const pos = new RoomPosition(spawn.pos.x-3, spawn.pos.y+1, spawn.room.name);
    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos2 = new RoomPosition(spawn.pos.x-3, spawn.pos.y-1, spawn.room.name);
    if (pos2.lookFor(LOOK_STRUCTURES).length === 0 && pos2.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos2.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos3 = new RoomPosition(spawn.pos.x+3, spawn.pos.y+1, spawn.room.name);
    if (pos3.lookFor(LOOK_STRUCTURES).length === 0 && pos3.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos3.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos4 = new RoomPosition(spawn.pos.x+3, spawn.pos.y-1, spawn.room.name);
    if (pos4.lookFor(LOOK_STRUCTURES).length === 0 && pos4.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos4.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos5 = new RoomPosition(spawn.pos.x-3, spawn.pos.y-2, spawn.room.name);
    if (pos5.lookFor(LOOK_STRUCTURES).length === 0 && pos5.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos5.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos6 = new RoomPosition(spawn.pos.x-3, spawn.pos.y+2, spawn.room.name);
    if (pos6.lookFor(LOOK_STRUCTURES).length === 0 && pos6.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos6.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos7 = new RoomPosition(spawn.pos.x+3, spawn.pos.y-2, spawn.room.name);
    if (pos7.lookFor(LOOK_STRUCTURES).length === 0 && pos7.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos7.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos8 = new RoomPosition(spawn.pos.x+3, spawn.pos.y+2, spawn.room.name);
    if (pos8.lookFor(LOOK_STRUCTURES).length === 0 && pos8.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos8.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos9 = new RoomPosition(spawn.pos.x-2, spawn.pos.y+3, spawn.room.name);
    if (pos9.lookFor(LOOK_STRUCTURES).length === 0 && pos9.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos9.createConstructionSite(STRUCTURE_EXTENSION);
    }
    const pos10 = new RoomPosition(spawn.pos.x+2, spawn.pos.y-3, spawn.room.name);
    if (pos10.lookFor(LOOK_STRUCTURES).length === 0 && pos10.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos10.createConstructionSite(STRUCTURE_EXTENSION);
    }
}

function rcl4Storage(spawn) {
    const pos = new RoomPosition(spawn.pos.x, spawn.pos.y-4, spawn.room.name);
    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos.createConstructionSite(STRUCTURE_STORAGE);
    }
}

