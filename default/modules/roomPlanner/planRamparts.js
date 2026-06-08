/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Rampart perimeter, protection, and quad traps.

 */


const minCut = require('util.minCut');

const {extensionPositionCache, quadTraps} = require('planState');

const {bunkerTemplate, coreTemplate, protectedStructureTypes} = require('planTemplates');

const {isValidRampartPosition} = require('planUtils');

function rampartBuilder(room, layout = undefined, count = false) {
    // Clean old ramparts
    if (Memory.rampartVersion !== RAMPART_VERSION) {
        Memory.rampartVersion = RAMPART_VERSION;
        for (const r of MY_ROOMS) {
            const owned = Game.rooms[r];
            if (!owned) continue;
            owned.structures.filter((s) =>
                s.structureType === STRUCTURE_RAMPART || (s.structureType === STRUCTURE_ROAD && s.pos.checkForRampart())
            ).forEach((q) => q.destroy());
            owned.constructionSites.filter((s) =>
                [STRUCTURE_RAMPART, STRUCTURE_WALL].includes(s.structureType)
            ).forEach((s) => s.remove());
            if (ROOM_RAMPART_SPOTS) ROOM_RAMPART_SPOTS[r] = undefined;
        }
    }

    // Bunker
    if (room.level >= BUNKER_LEVEL && room.energyState) {
        if (handleBunkerRamparts(room, layout, count)) return true;
        if (buildProtectiveRamparts(room)) return true;
    }

    // Handle quad traps â€” RCL8 only, walls capped at 20k
    if (room.level >= 8 && buildQuadTraps(room)) {
        return true;
    }

    function handleBunkerRamparts(room, layout, count) {
        if (!ROOM_RAMPART_SPOTS[room.name]) {
            return initializeRampartSpots(room, layout, count);
        } else {
            return placeRamparts(room, count);
        }
    }

    function buildProtectiveRamparts(room) {
        const ramparts = ROOM_RAMPART_SPOTS && ROOM_RAMPART_SPOTS[room.name] ? JSON.parse(ROOM_RAMPART_SPOTS[room.name]) : undefined;
        if (!ramparts || !ramparts.length) return false;
        let counter = 0;
        const rampartPositions = ramparts.map(p => new RoomPosition(p.x, p.y, room.name));
        const vulnerableStructures = room.structures.filter((s) =>
            s.structureType !== STRUCTURE_ROAD &&
            s.structureType !== STRUCTURE_WALL &&
            !s.pos.checkForRampart() &&
            !s.pos.checkForConstructionSites());
        for (const structure of vulnerableStructures) {
            if (counter >= 3) return true;
            const rangeFromRampart = structure.pos.getRangeTo(structure.pos.findClosestByRange(rampartPositions));
            const inBunker = structure.pos.isInBunker();
            if ((rangeFromRampart <= 3 && inBunker) || !inBunker) {
                if (structure.pos.createConstructionSite(STRUCTURE_RAMPART) === OK) counter++;
            }
        }
        if (room.level >= SPECIAL_RAMPARTS) {
            if (PROTECT_SOURCES) {
                for (let source of room.sources) {
                    if (source.pos.isInBunker()) continue;
                    if (counter >= 3) return true;
                    if (buildRampartAround(source.pos)) counter++;
                }
            }
            if (PROTECT_MINERAL && !room.mineral.pos.isInBunker()) {
                if (counter >= 3) return true;
                if (buildRampartAround(room.mineral.pos)) counter++;
            }
            if (PROTECT_CONTROLLER && !room.controller.pos.isInBunker()) {
                if (counter >= 3) return true;
                if (buildRampartAround(room.controller.pos)) counter++;
            }
            // Handle ramparts on protected structures
            if (PROTECT_STRUCTURES && room.level >= 8) {
                for (let structure of room.structures) {
                    if (counter >= 3) return true;
                    if (protectedStructureTypes.includes(structure.structureType)) {
                        if (!structure.pos.checkForRampart() && !structure.pos.checkForConstructionSites()) {
                            if (structure.pos.createConstructionSite(STRUCTURE_RAMPART) === OK) counter++;
                        }
                    }
                }
            }
        }
        return false;
    }

    function buildQuadTraps(room) {
        if (!quadTraps[room.name]) setQuadTraps(room);
        if (!quadTraps[room.name] || !quadTraps[room.name].length) return false;

        const QUAD_WALL_CAP = 20000;
        let counter = 0;
        const newWallPositions = room.memory.quadTrapWalls ? new Set(room.memory.quadTrapWalls.map(p => `${p.x},${p.y}`)) : new Set();

        for (const trap of quadTraps[room.name]) {
            if (counter >= 3) return true;
            const pos = new RoomPosition(trap.x, trap.y, room.name);
            if (pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) ||
                room.sources.some(s => pos.isNearTo(s))) continue;

            const isWallTile = (pos.x + pos.y) % 2 === 0;
            if (isWallTile) {
                // Skip if wall already exists at or above the cap
                const existing = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_WALL);
                if (existing && existing.hits >= QUAD_WALL_CAP) continue;
                if (existing || pos.checkForConstructionSites()) continue;
                if (pos.createConstructionSite(STRUCTURE_WALL) === OK) {
                    counter++;
                    if (!newWallPositions.has(`${pos.x},${pos.y}`)) {
                        newWallPositions.add(`${pos.x},${pos.y}`);
                        if (!room.memory.quadTrapWalls) room.memory.quadTrapWalls = [];
                        room.memory.quadTrapWalls.push({x: pos.x, y: pos.y});
                    }
                }
            }
        }
        return counter > 0;
    }

    function setQuadTraps(room) {
        if (!ROOM_RAMPART_SPOTS[room.name]) return false;
        const ramparts = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!ramparts || !ramparts.length) return;
        const hub = room.hub;
        const terrain = Game.map.getRoomTerrain(room.name);
        const trapLocations = [];

        for (const {x, y} of ramparts) {
            // Push one tile outward from the hub (away from centre)
            const dx = x === hub.x ? 0 : (x < hub.x ? -1 : 1);
            const dy = y === hub.y ? 0 : (y < hub.y ? -1 : 1);
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || nx > 48 || ny < 1 || ny > 48) continue;
            if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;
            const pos = new RoomPosition(nx, ny, room.name);
            if (pos.lookFor(LOOK_STRUCTURES).some(s => OBSTACLE_OBJECT_TYPES.includes(s.structureType))) continue;
            trapLocations.push({x: nx, y: ny});
        }
        quadTraps[room.name] = trapLocations;
    }

    function initializeRampartSpots(room, layout, count) {
        ROOM_RAMPART_SPOTS[room.name] = undefined;
        let rectArray = getProtectedAreaBounds(layout, room);
        let bounds = {x1: 0, y1: 0, x2: 49, y2: 49};

        try {
            ROOM_RAMPART_SPOTS[room.name] = JSON.stringify(minCut.GetCutTiles(room.name, rectArray, bounds));
        } catch (e) {
            log.e('MinCut Error in room ' + room.name);
            log.e(e.stack);
        }

        // Count ramparts if requested
        if (count && ROOM_RAMPART_SPOTS[room.name]) {
            return _.size(JSON.parse(ROOM_RAMPART_SPOTS[room.name]));
        }
    }

    function getProtectedAreaBounds(layout, room) {
        let rectArray = [];
        for (let structure of layout) {
            for (let buildPos of structure.pos) {
                rectArray.push({
                    x1: (buildPos.x + room.hub.x) - 1,
                    y1: (buildPos.y + room.hub.y) - 1,
                    x2: (buildPos.x + room.hub.x) + 1,
                    y2: (buildPos.y + room.hub.y) + 1
                });
            }
        }
        // Lab hub
        if (room.memory.labHub) {
            const labHub = room.memory.labHub;
            rectArray.push({x1: labHub.x - 3, y1: labHub.y - 3, x2: labHub.x + 3, y2: labHub.y + 3});
        }
        // Tower hubs â€” must be inside the rampart perimeter so towers can be resupplied during combat
        if (room.memory.towerHubs) {
            for (const {x, y} of room.memory.towerHubs) {
                rectArray.push({x1: x - 1, y1: y - 1, x2: x + 1, y2: y + 1});
            }
        }
        // Dynamic Extensions
        if (extensionPositionCache[room.name]) {
            for (const {x, y} of extensionPositionCache[room.name]) {
                rectArray.push({x1: x - 1, y1: y - 1, x2: x + 1, y2: y + 1});
            }
        }
        // Set bounds
        for (let key in rectArray) {
            let rect = rectArray[key];
            rect.x1 = Math.max(rect.x1, 2);
            rect.y1 = Math.max(rect.y1, 2);
            rect.x2 = Math.min(rect.x2, 47);
            rect.y2 = Math.min(rect.y2, 47);
        }
        return rectArray;
    }

    function placeRamparts(room) {
        let spots = JSON.parse(ROOM_RAMPART_SPOTS[room.name]);
        if (!spots || !spots.length) {
            addExistingRampartsToSpots(room, spots);
        }

        let buildPositions = spots.map(p => new RoomPosition(p.x, p.y, room.name));
        let inBuild = _.filter(room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL).length;

        // Avoid exceeding 5 constructions at a time
        let cycles = 0;
        for (let pos of buildPositions) {
            if (cycles + inBuild >= 5) return true;
            if (shouldBuildRampartAtPosition(pos, room)) {
                const isWallTile = (pos.x + pos.y) % 2 === 0;
                if (isWallTile) {
                    if (pos.createConstructionSite(STRUCTURE_WALL) === OK) {
                        cycles++;
                    }
                } else if (pos.createConstructionSite(STRUCTURE_RAMPART) === OK) {
                    cycles++;
                }
            }
        }
        if (cycles || inBuild.length) return true;
    }

    function addExistingRampartsToSpots(room, spots) {
        // Only add existing ramparts or walls once
        let existingRamparts = room.ramparts.concat(room.constructedWalls);
        existingRamparts.forEach((b) => spots.push({x: b.pos.x, y: b.pos.y}));
    }

    function shouldBuildRampartAtPosition(pos, room) {
        // General rampart check based on proximity to important structures
        if (isNearProtectedStructure(pos, room)) {
            return !pos.checkForRampart() && !pos.checkForConstructionSites();
        }

        // Handle tunnels
        if (pos.checkForWall() && pos.checkForRoad()) {
            return handleTunnelRampart(pos);
        }

        return !pos.checkForBarrierStructure() && !pos.checkForConstructionSites();
    }

    function isNearProtectedStructure(pos, room) {
        return pos.isNearTo(room.controller) || pos.isNearTo(room.mineral) || pos.isNearTo(pos.findClosestByRange(FIND_SOURCES));
    }

    function handleTunnelRampart(pos) {
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                if (xOff !== 0 || yOff !== 0) {
                    let newPos = new RoomPosition(pos.x + xOff, pos.y + yOff, pos.roomName);
                    if (!newPos.checkForWall() && !newPos.checkForBarrierStructure() && !newPos.checkForConstructionSites() &&
                        newPos.createConstructionSite(STRUCTURE_RAMPART) === OK) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function buildRampartAround(position) {
        // Loop through a 3x3 area around the position
        for (let xOff = -1; xOff <= 1; xOff++) {
            for (let yOff = -1; yOff <= 1; yOff++) {
                // Skip the center position
                if (xOff === 0 && yOff === 0) continue;

                let targetPos = new RoomPosition(position.x + xOff, position.y + yOff, position.roomName);

                // Check if the position is valid for placing a rampart
                if (isValidRampartPosition(targetPos)) {
                    targetPos.createConstructionSite(STRUCTURE_RAMPART);
                    return true; // Stop after placing one rampart
                }
            }
        }
        return false; // Return false if no valid position was found
    }
}

module.exports = {

    rampartBuilder,

};