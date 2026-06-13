/*
 * Intercept structure-related room.find / findInRange / lookFor calls so the
 * Screeps driver never rebuilds FIND caches over corrupt owner refs (common on
 * private servers after downgrade). All call sites are covered — no per-file hunt needed.
 */

function structureFilterMatch(s, filter) {
    if (!filter) return true;
    if (typeof filter === 'function') return filter(s);
    if (filter.structureType) return s.structureType === filter.structureType;
    return true;
}

function safeConstructionSiteMy(site) {
    if (!site) return false;
    try {
        return !!site.my;
    } catch (e) {
        return false;
    }
}

function isHostileOwnedStructure(s) {
    if (!s || !(s instanceof OwnedStructure)) return false;
    const owner = global.safeStructureOwner(s);
    if (!owner || global.safeStructureMy(s)) return false;
    return !FRIENDLIES.includes(owner);
}

function nativeRoomFind(room, type, opts) {
    try {
        return room.__nativeFind(type, opts);
    } catch (e) {
        if (global.reportCorruptFind) global.reportCorruptFind(room.name, type, e);
        return [];
    }
}

function safeRoomFind(room, type, opts) {
    const filter = opts && opts.filter;
    switch (type) {
        case FIND_STRUCTURES:
            return global.roomStructuresFromGame(room).filter(s => structureFilterMatch(s, filter));
        case FIND_MY_STRUCTURES:
            return global.roomMyStructures(room, {filter});
        case FIND_HOSTILE_STRUCTURES:
            return global.roomStructuresFromGame(room).filter(s =>
                isHostileOwnedStructure(s) && structureFilterMatch(s, filter)
            );
        case FIND_MY_SPAWNS:
            return global.roomMySpawns(room).filter(s => structureFilterMatch(s, filter));
        case FIND_HOSTILE_SPAWNS:
            return global.roomStructuresFromGame(room).filter(s =>
                s.structureType === STRUCTURE_SPAWN && isHostileOwnedStructure(s) && structureFilterMatch(s, filter)
            );
        case FIND_CONSTRUCTION_SITES:
            return global.roomConstructionSitesFromGame(room).filter(s => structureFilterMatch(s, filter));
        case FIND_MY_CONSTRUCTION_SITES:
            return global.roomConstructionSitesFromGame(room).filter(s =>
                safeConstructionSiteMy(s) && structureFilterMatch(s, filter)
            );
        case FIND_HOSTILE_CONSTRUCTION_SITES:
            return global.roomConstructionSitesFromGame(room).filter(s =>
                !safeConstructionSiteMy(s) && structureFilterMatch(s, filter)
            );
        case FIND_RUINS:
            return nativeRoomFind(room, FIND_RUINS, opts).filter(r => structureFilterMatch(r, filter));
        default:
            return nativeRoomFind(room, type, opts);
    }
}

const UNSAFE_FIND_TYPES = new Set([
    FIND_STRUCTURES,
    FIND_MY_STRUCTURES,
    FIND_HOSTILE_STRUCTURES,
    FIND_MY_SPAWNS,
    FIND_HOSTILE_SPAWNS,
    FIND_CONSTRUCTION_SITES,
    FIND_MY_CONSTRUCTION_SITES,
    FIND_HOSTILE_CONSTRUCTION_SITES,
    FIND_RUINS,
]);

function structuresAt(pos) {
    const room = Game.rooms[pos.roomName];
    if (!room) return [];
    return global.roomStructuresFromGame(room).filter(s => s.pos.x === pos.x && s.pos.y === pos.y);
}

function constructionSitesAt(pos) {
    const room = Game.rooms[pos.roomName];
    if (!room) return [];
    return global.roomConstructionSitesFromGame(room).filter(s => s.pos.x === pos.x && s.pos.y === pos.y);
}

function installSafeFindPatches() {
    if (!Room.prototype.__nativeFind) {
        Room.prototype.__nativeFind = Room.prototype.find;
        Room.prototype.find = function (type, opts) {
            if (UNSAFE_FIND_TYPES.has(type)) {
                try {
                    return safeRoomFind(this, type, opts);
                } catch (e) {
                    if (global.reportCorruptFind) global.reportCorruptFind(this.name, type, e);
                    return [];
                }
            }
            return nativeRoomFind(this, type, opts);
        };
    }

    if (!RoomPosition.prototype.__nativeFindInRange) {
        RoomPosition.prototype.__nativeFindInRange = RoomPosition.prototype.findInRange;
        RoomPosition.prototype.findInRange = function (type, range, opts) {
            if (UNSAFE_FIND_TYPES.has(type)) {
                const room = Game.rooms[this.roomName];
                if (!room) return [];
                try {
                    return safeRoomFind(room, type, opts).filter(o => this.getRangeTo(o) <= range);
                } catch (e) {
                    if (global.reportCorruptFind) global.reportCorruptFind(this.roomName, type, e);
                    return [];
                }
            }
            try {
                return this.__nativeFindInRange(type, range, opts);
            } catch (e) {
                if (global.reportCorruptFind) global.reportCorruptFind(this.roomName, type, e);
                return [];
            }
        };
    }

    if (!RoomPosition.prototype.__nativeFindClosestByRange) {
        RoomPosition.prototype.__nativeFindClosestByRange = RoomPosition.prototype.findClosestByRange;
        RoomPosition.prototype.findClosestByRange = function (targets, opts) {
            if (typeof targets === 'number' && UNSAFE_FIND_TYPES.has(targets)) {
                const room = Game.rooms[this.roomName];
                if (!room) return null;
                try {
                    const list = safeRoomFind(room, targets, opts);
                    return list.length ? this.__nativeFindClosestByRange(list) : null;
                } catch (e) {
                    if (global.reportCorruptFind) global.reportCorruptFind(this.roomName, targets, e);
                    return null;
                }
            }
            try {
                return this.__nativeFindClosestByRange(targets, opts);
            } catch (e) {
                if (global.reportCorruptFind) global.reportCorruptFind(this.roomName, targets, e);
                return null;
            }
        };
    }

    if (!RoomPosition.prototype.__nativeFindClosestByPath) {
        RoomPosition.prototype.__nativeFindClosestByPath = RoomPosition.prototype.findClosestByPath;
        RoomPosition.prototype.findClosestByPath = function (targets, opts) {
            if (typeof targets === 'number' && UNSAFE_FIND_TYPES.has(targets)) {
                const room = Game.rooms[this.roomName];
                if (!room) return null;
                try {
                    const list = safeRoomFind(room, targets, opts);
                    return list.length ? this.__nativeFindClosestByPath(list, opts) : null;
                } catch (e) {
                    if (global.reportCorruptFind) global.reportCorruptFind(this.roomName, targets, e);
                    return null;
                }
            }
            try {
                return this.__nativeFindClosestByPath(targets, opts);
            } catch (e) {
                if (global.reportCorruptFind) global.reportCorruptFind(this.roomName, targets, e);
                return null;
            }
        };
    }

    if (!RoomPosition.prototype.__nativeLookFor) {
        RoomPosition.prototype.__nativeLookFor = RoomPosition.prototype.lookFor;
        RoomPosition.prototype.lookFor = function (type) {
            try {
                if (type === LOOK_STRUCTURES) return structuresAt(this);
                if (type === LOOK_CONSTRUCTION_SITES) return constructionSitesAt(this);
                return this.__nativeLookFor(type);
            } catch (e) {
                if (global.reportCorruptFind) global.reportCorruptFind(this.roomName, type, e);
                return [];
            }
        };
    }

    global.safeRoomFind = safeRoomFind;
}

module.exports = installSafeFindPatches;