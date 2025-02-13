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
        if (this.creep.tryToBoost([WORK])) return true;
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
        // If we can't get to the controller or sources, clear a path
        const blocked = blockedLocations(this.creep);
        if (blocked && blocked.length) {
            this.creep.memory.target = blocked[0].structure.id;
        } else if (!this.creep.scorchedEarth()) {
            this.room.cacheRoomIntel(true);
            this.creep.suicide();
        }
    }
}

function blockedLocations(creep) {
    if (!creep.memory.notBlocked) {
        // Check controller
        if (findBestCleaningPath(creep, creep.room.controller).length) return findBestCleaningPath(creep, creep.room.controller);
        else INTEL[creep.room.name].claimClear = true;
        // Check sources
        for (const source of creep.room.sources) {
            if (findBestCleaningPath(creep, source).length) return findBestCleaningPath(creep, source);
        }
        // Check exits
        for (const exit of Object.values(Game.map.describeExits(creep.room.name))) {
            const targetPos = creep.pos.findClosestByRange(creep.room.findExitTo(exit))
            if (findBestCleaningPath(creep, targetPos).length) return findBestCleaningPath(creep, targetPos);
        }
    }
    creep.memory.notBlocked = true;
}

function findBestCleaningPath(creep, target) {
    const room = creep.room;
    if (!room) return {path: null, structures: []}; // Room not visible
    const costMatrix = new PathFinder.CostMatrix();
    room.find(FIND_STRUCTURES).forEach(structure => {
        if (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) {
            if (structure.owner && structure.owner.username === MY_USERNAME) {
                costMatrix.set(structure.pos.x, structure.pos.y, 1);
            } else {
                // Calculate the cost based on hits, higher hits = higher cost
                let cost = Math.floor(structure.hits / 100000); // Adjust this divisor as needed
                // Cap the cost to prevent impassable barriers
                cost = Math.min(cost, 255); // 255 is the max cost in a CostMatrix
                costMatrix.set(structure.pos.x, structure.pos.y, cost);
            }
        }
    });
    if (!(target instanceof RoomPosition)) target = target.pos;
    // Pathfinding options
    const pathOptions = {
        roomCallback: function (roomName) {
            if (roomName === room.name) {
                return costMatrix;
            }
            return false;
        },
        plainCost: 1,
        swampCost: 2,
        maxOps: 2000,
    };
    const path = PathFinder.search(creep.pos, {pos: target, range: 1}, pathOptions);
    let structuresOnPath = [];
    if (path.path.length > 0) {
        structuresOnPath = path.path.reduce((acc, pos) => {
            const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
            structures.forEach(structure => {
                if (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) {
                    acc.push({pos: structure.pos, structure: structure});
                }
            });
            return acc;
        }, []);
    }
    return structuresOnPath;
}

profiler.registerClass(RoleCleaner, 'Cleaner');
module.exports = RoleCleaner;
