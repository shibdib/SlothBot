/**
 * Created by rober on 5/16/2017.
 */
module.exports.rcl1 = function (spawn) {
    //Spawn
    let spawn = Game.spawns[spawn];

    //Auto Build Spawn Roads
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
};

module.exports.rcl2 = function (spawn) {
    //Spawn
    let spawn = Game.spawns[spawn];

    //Auto Build Spawn Roads
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

    //Auto Build Extensions
    for (i = 3; i < 5; i++) {
        let pos = new RoomPosition(spawn.pos.x, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_EXTENSION);
        }
    }
    for (i = 3; i < 5; i++) {
        let pos = new RoomPosition(spawn.pos.x+1, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_EXTENSION);
        }
    }
    let pos = new RoomPosition(spawn.pos.x+2, spawn.pos.y+3, spawn.room.name);
    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos.createConstructionSite(STRUCTURE_EXTENSION);
    }
};

module.exports.rcl2 = function (spawn) {
    //Spawn
    let spawn = Game.spawns[spawn];

    //Auto Build Spawn Roads
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

    //Auto Build Extensions
    for (i = 3; i < 5; i++) {
        let pos = new RoomPosition(spawn.pos.x, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_EXTENSION);
        }
    }
    for (i = 3; i < 5; i++) {
        let pos = new RoomPosition(spawn.pos.x+1, spawn.pos.y+i, spawn.room.name);
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
            pos.createConstructionSite(STRUCTURE_EXTENSION);
        }
    }
    let pos = new RoomPosition(spawn.pos.x+2, spawn.pos.y+3, spawn.room.name);
    if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0) {
        pos.createConstructionSite(STRUCTURE_EXTENSION);
    }
};

