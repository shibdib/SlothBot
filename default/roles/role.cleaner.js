/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleCleaner {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (this.creep.memory.barrierClearing) {
            this.barrierCleaning();
        } else if (this.creep.memory.destination && this.room.name !== this.creep.memory.destination) {
            this.travel();
        } else {
            this.cleanRoom();
        }
    }

    housekeeping() {
        if (!this.creep.memory.other) this.creep.memory.other = {};
        // Boosting
        if (this.creep.tryToBoost()) return true;
        this.creep.say('NOM!', true);
    }

    barrierCleaning() {
        let barrier = Game.getObjectById(this.creep.memory.target);
        if (!barrier) return this.creep.memory.target = undefined;
        if (this.creep.pos.isNearTo(barrier)) {
            if (this.creep.hasActiveBodyparts(WORK)) {
                if (this.creep.dismantle(barrier) === OK) this.creep.memory.other.stationary = true;
            }
        } else this.creep.shibMove(barrier);
    }

    travel() {
        this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination));
    }

    cleanRoom() {
        let target = Game.getObjectById(this.creep.memory.target);
        if (target) {
            if (this.creep.pos.isNearTo(target)) {
                if (this.creep.hasActiveBodyparts(WORK)) {
                    if (this.creep.dismantle(target) === OK) this.creep.memory.other.stationary = true;
                }
            } else this.creep.shibMove(target);
            return;
        }
        const blocked = blockedLocations(this.creep);
        if (blocked && blocked.length) {
            this.creep.memory.target = blocked[0].structure.id;
            return;
        }
        if (this.creep.scorchedEarth()) return;
        this.room.cacheRoomIntel(true);
        if (INTEL[this.room.name] && INTEL[this.room.name].obstacles) {
            const leftover = this.room.structures.find(s => isCleanableObstacle(s));
            if (leftover) {
                this.creep.memory.target = leftover.id;
                this.creep.memory.notBlocked = undefined;
                return;
            }
        }
        this.creep.suicide();
    }
}

function isCleanableObstacle(structure) {
    if (!structure) return false;
    const type = structure.structureType;
    if (type === STRUCTURE_CONTROLLER || type === STRUCTURE_ROAD || type === STRUCTURE_CONTAINER) return false;
    if (type === STRUCTURE_KEEPER_LAIR || type === STRUCTURE_POWER_BANK) return false;
    const owner = structure.safeOwnerName ? structure.safeOwnerName() : (structure.owner && structure.owner.username);
    if (owner === MY_USERNAME) return false;
    return type === STRUCTURE_RAMPART || type === STRUCTURE_WALL
        || (typeof OBSTACLE_OBJECT_TYPES !== 'undefined' && OBSTACLE_OBJECT_TYPES.includes(type));
}

function blockedLocations(creep) {
    if (creep.memory.notBlocked) return;
    const room = creep.room;
    if (!room) return;

    if (room.controller) {
        const toController = findBestCleaningPath(creep, room.controller.pos, 1);
        if (toController.structures.length) {
            if (INTEL[room.name]) INTEL[room.name].claimClear = undefined;
            return toController.structures;
        }
        if (INTEL[room.name]) {
            INTEL[room.name].claimClear = toController.complete || undefined;
        }
    }

    for (const source of room.sources) {
        const blocked = findBestCleaningPath(creep, source.pos, 1);
        if (blocked.structures.length) return blocked.structures;
    }

    const exits = Game.map.describeExits(room.name) || {};
    for (const exitRoom of Object.values(exits)) {
        const exitDir = room.findExitTo(exitRoom);
        if (!(exitDir > 0)) continue;
        const tiles = room.find(exitDir);
        if (!tiles.length) continue;
        const blocked = findBestCleaningPath(creep, tiles, 0);
        if (blocked.structures.length) return blocked.structures;
    }
    creep.memory.notBlocked = true;
}

function findBestCleaningPath(creep, target, range = 0) {
    const room = creep.room;
    if (!room || !target) return {structures: [], complete: false};

    const asGoals = (item) => {
        if (!item) return null;
        const pos = item instanceof RoomPosition ? item : item.pos;
        return pos ? {pos, range} : null;
    };
    const goals = (Array.isArray(target) ? target : [target]).map(asGoals).filter(Boolean);
    if (!goals.length) return {structures: [], complete: false};

    const costMatrix = new PathFinder.CostMatrix();
    if (room.controller) costMatrix.set(room.controller.pos.x, room.controller.pos.y, 255);
    for (const structure of room.structures) {
        if (!isCleanableObstacle(structure)) continue;
        // Never 255 — PathFinder must walk through blockers so we can target them.
        const cost = structure.hits
            ? Math.max(10, Math.min(254, Math.floor(structure.hits / 10000)))
            : 20;
        costMatrix.set(structure.pos.x, structure.pos.y, cost);
    }

    const path = PathFinder.search(creep.pos, goals, {
        roomCallback: function (roomName) {
            return roomName === room.name ? costMatrix : false;
        },
        plainCost: 1,
        swampCost: 2,
        maxOps: 5000,
    });

    const structuresOnPath = [];
    const seen = new Set();
    const consider = (x, y) => {
        const key = x + ',' + y;
        if (seen.has(key) || x < 0 || x > 49 || y < 0 || y > 49) return;
        seen.add(key);
        for (const structure of room.lookForAt(LOOK_STRUCTURES, x, y)) {
            if (isCleanableObstacle(structure)) {
                structuresOnPath.push({pos: structure.pos, structure});
            }
        }
    };
    for (const pos of path.path) consider(pos.x, pos.y);

    // Incomplete paths stop on the last walkable tile, so the wall itself is missing.
    if (!structuresOnPath.length && path.incomplete) {
        const end = path.path.length ? path.path[path.path.length - 1] : creep.pos;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) consider(end.x + dx, end.y + dy);
        }
    }

    return {structures: structuresOnPath, complete: !path.incomplete};
}

profiler.registerClass(RoleCleaner, 'Cleaner');
module.exports = RoleCleaner;
