const profiler = require('screeps-profiler');

let protectedStructures = [
    STRUCTURE_SPAWN,
    STRUCTURE_STORAGE,
    STRUCTURE_TOWER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_TERMINAL,
    STRUCTURE_CONTAINER,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
    STRUCTURE_LINK
];

Room.prototype.buildRoom = function () {
    if (Game.constructionSites.length > 75) return;
    if (this.controller.level === 2) {
        buildExtensions(this);
    }
};

function buildExtensions(room) {
    if (_.filter(room.memory.structureCache, 'type', 'extension').length < room.getExtensionCount()) {
        let hub;
        if (room.memory.extensionHub) {
            hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        } else {
            findExtensionHub(room);
            hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        }
        for (let x = 2; x < 6; x++) {
            if (x === 3 || x === 5) continue;
            x = _.sample([x, -x]);
            for (let y = 2; y < 6; y++) {
                if (y === 3 || y === 5) continue;
                y = _.sample([y, -y]);
                let pos = new RoomPosition(hub.pos.x + x, hub.pos.y + y, room.name);
                switch (pos.createConstructionSite(STRUCTURE_EXTENSION)) {
                    case OK:
                        if (pos.findInRange(FIND_STRUCTURES, 1, {filter: (s) => s.structureType === STRUCTURE_ROAD}).length > 0) continue;
                        let path = hub.room.findPath(hub, pos, {
                            maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: false
                        });
                        for (let p = 0; p < path.length; p++) {
                            if (path[p] !== undefined) {
                                let build = new RoomPosition(path[p].x, path[p].y, room.name);
                                const roadCheck = build.lookFor(LOOK_STRUCTURES);
                                const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                                if (constructionCheck.length > 0 || roadCheck.length > 0) {
                                } else {
                                    build.createConstructionSite(STRUCTURE_ROAD);
                                }
                            }
                        }
                        continue;
                    case ERR_RCL_NOT_ENOUGH:
                        break;
                }
            }
        }
    }
}

buildExtensions = profiler.registerFN(buildExtensions, 'buildExtensionsRoom');

function findExtensionHub(room) {
    for (let name in Game.flags) {
        if (_.startsWith(name, 'hub')) {
            if (Game.flags[name].pos.roomName === room.name) {
                room.memory.extensionHub = undefined;
                room.memory.extensionHub.x = Game.flags[name].pos.x;
                room.memory.extensionHub.y = Game.flags[name].pos.y;
                return;
            }
        }
    }
    for (let i = 1; i < 249; i++) {
        let pos = new RoomPosition(getRandomInt(8, 41), getRandomInt(8, 41), room.name);
        if (pos.findInRange(FIND_STRUCTURES, 7, {filter: (s) => OBSTACLE_OBJECT_TYPES.includes(s.structureType)}).length === 0) {
            room.memory.extensionHub = undefined;
            room.memory.extensionHub.x = pos.x;
            room.memory.extensionHub.y = pos.y;
            return;
        }
    }
}

findExtensionHub = profiler.registerFN(findExtensionHub, 'findExtensionHub');

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}