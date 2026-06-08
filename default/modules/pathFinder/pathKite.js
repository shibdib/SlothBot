/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Kiting and hide behavior for creeps and squads.

 */


const {FLEE_RANGE} = require('pathState');

const {getMoveWeight} = require('pathUtils');

const {getMatrix} = require('pathMatrix');

Creep.prototype.shibKite = function (fleeRange = FLEE_RANGE) {
    if (this.memory.squadMembers) return this.shibSquadKite(fleeRange);

    if (!this.hasActiveBodyparts(MOVE) || (this.room.controller?.safeMode) || this.pos.checkForRampart()) return false;

    const threats = gatherThreats(this, fleeRange);
    if (!threats.length) return false;

    const options = getMoveWeight(this);
    options.flee = true;

    const currentRoom = this.pos.roomName;
    const fleeGoals = threats.map(a => {
        const pureMelee = a instanceof Creep && a.hasActiveBodyparts(ATTACK) && !a.hasActiveBodyparts(RANGED_ATTACK);
        return {pos: a.pos, range: pureMelee ? fleeRange + 3 : fleeRange + 2};
    });

    const allowedRooms = [currentRoom].concat(Object.values(Game.map.describeExits(currentRoom)));

    const result = PathFinder.search(this.pos, fleeGoals, {
        flee: true,
        maxRooms: allowedRooms.length + 1,
        roomCallback: (roomName) => {
            if (allowedRooms.length && !allowedRooms.includes(roomName)) return false;
            if (roomName !== currentRoom && INTEL[roomName]?.owner && !FRIENDLIES.includes(INTEL[roomName].owner)) return false;
            return getMatrix(roomName, this, options);
        }
    });

    if (result.path.length) {
        this.move(this.pos.getDirectionTo(result.path[0]));
        return true;
    }
    return false;
};

Creep.prototype.hide = function () {
    if (!this.hasActiveBodyparts(MOVE)) return false;

    const options = getMoveWeight(this);
    const threats = this.room.creeps.filter(c => c.id !== this.id)
        .concat(this.room.structures)
        .concat(this.room.constructionSites);

    const result = PathFinder.search(this.pos, threats.map(a => ({pos: a.pos, range: 5})), {
        flee: true,
        maxRooms: 1,
        roomCallback: (roomName) => {
            if (roomName !== this.pos.roomName) return false;
            return getMatrix(roomName, this, options);
        }
    });

    if (result.path.length) {
        this.move(this.pos.getDirectionTo(result.path[0]));
        return true;
    }
    return greedyKiteEscape(this, threats);
};

function greedyKiteEscape(creep, threats) {
    const terrain = Game.map.getRoomTerrain(creep.room.name);
    const directions = [
        [TOP, 0, -1], [TOP_RIGHT, 1, -1], [RIGHT, 1, 0], [BOTTOM_RIGHT, 1, 1],
        [BOTTOM, 0, 1], [BOTTOM_LEFT, -1, 1], [LEFT, -1, 0], [TOP_LEFT, -1, -1]
    ];

    let bestScore = -Infinity;
    let bestDir;

    for (const [dir, dx, dy] of directions) {
        const nx = creep.pos.x + dx;
        const ny = creep.pos.y + dy;
        if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
        if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;

        const pos = new RoomPosition(nx, ny, creep.room.name);
        if (pos.checkForObstacleStructure()) continue;

        const minThreatDist = Math.min(...threats.map(t => pos.getRangeTo(t)));
        let openness = 0;
        for (let ddx = -1; ddx <= 1; ddx++) {
            for (let ddy = -1; ddy <= 1; ddy++) {
                if (ddx === 0 && ddy === 0) continue;
                const px = nx + ddx, py = ny + ddy;
                if (px >= 0 && px <= 49 && py >= 0 && py <= 49 && terrain.get(px, py) !== TERRAIN_MASK_WALL) openness++;
            }
        }

        const score = minThreatDist * 10 + openness;
        if (score > bestScore) {
            bestScore = score;
            bestDir = dir;
        }
    }

    if (bestDir !== undefined) {
        creep.move(bestDir);
        return true;
    }
    return false;
}

function gatherThreats(creep, fleeRange) {
    const threats = creep.room.hostileCreeps.filter(c =>
        (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)) &&
        creep.pos.getRangeTo(c) <= fleeRange + 2
    );
    const lairs = creep.room.structures.filter(s =>
        s.structureType === STRUCTURE_KEEPER_LAIR &&
        s.ticksToSpawn && s.ticksToSpawn <= fleeRange + 2 &&
        creep.pos.getRangeTo(s) <= fleeRange + 2
    );
    return threats.concat(lairs);
}