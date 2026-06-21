const {
    canPlaceConstructionSite,
    tryCreateConstructionSite,
    isControllerLinkPos,
    isControllerAreaLink,
} = require('planUtils');

/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Link network construction.

 */


function linkBuilder(room) {
    if (room.level < 5) return false;
    const linkLimit = CONTROLLER_STRUCTURES[STRUCTURE_LINK][room.level];
    const currentLinks = room.links.length +
        room.constructionSites.filter(s => s.structureType === STRUCTURE_LINK).length;

    // 1. Controller Link (RCL 5+)
    const rememberedControllerLink = Game.getObjectById(room.memory.controllerLink);
    if (!rememberedControllerLink || !isControllerAreaLink(rememberedControllerLink, room)) {
        if (room.memory.controllerLink) room.memory.controllerLink = undefined;
        const existingLink = room.controller.pos.findInRange(room.links, 3)
            .filter((l) => isControllerAreaLink(l, room))
            .sort((a, b) => a.pos.getRangeTo(room.controller) - b.pos.getRangeTo(room.controller))[0];
        if (existingLink) {
            room.memory.controllerLink = existingLink.id;
        } else {
            room.memory.controllerLink = undefined;
            const controllerContainer = global.resolveControllerContainer(room);
            const base = room.level === 8 ? room.controller : controllerContainer || room.controller;
            if (!base) return false;
            // If too close to the hub don't build one
            if (base.pos.getRangeTo(room.hub) <= 5) return false;
            const range = base.id === room.controller.id ? 2 : 1;
            const site = _.find(base.pos.findInRange(FIND_CONSTRUCTION_SITES, range), (s) => s.structureType === STRUCTURE_LINK && isControllerLinkPos(s.pos, room));
            if (site) return true;
            const zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, base.pos.y - range, base.pos.x - range,
                base.pos.y + range, base.pos.x + range, true);
            for (let key in zoneTerrain) {
                let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
                if (position.checkForAllStructure() || position.checkForImpassible() || position.isNearTo(room.controller)) continue;
                if (!isControllerLinkPos(position, room)) continue;
                if (tryCreateConstructionSite(position, STRUCTURE_LINK) === OK) return true;
            }
        }
    }

    // 2. Farthest Source Link (RCL 5+)
    const sortedSources = _.sortBy(room.sources, s => -s.pos.getRangeTo(room.hub));
    if (currentLinks < linkLimit && sortedSources.length > 0) {
        if (buildSourceLink(room, sortedSources[0])) return true;
    }

    if (!room.memory.controllerLink) return false;

    // 3. Hub Link (RCL 6+) — bunker template owns (0,1); dynamic layout still places here ad hoc
    if (!room.memory.hubLink || !Game.getObjectById(room.memory.hubLink)) {
        const hubLinkPos = new RoomPosition(room.hub.x, room.hub.y + 1, room.name);
        const existingLink = hubLinkPos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_LINK);
        if (existingLink) {
            room.memory.hubLink = existingLink.id;
        } else {
            const site = hubLinkPos.lookFor(LOOK_CONSTRUCTION_SITES).find(s => s.structureType === STRUCTURE_LINK);
            if (site) return true;
            if (!room.memory.dynamicLayout) return false;
            const extension = hubLinkPos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_EXTENSION);
            if (extension) extension.destroy();
            if (tryCreateConstructionSite(hubLinkPos, STRUCTURE_LINK) === OK) return true;
        }
    }

    // 4. Next Source Link (RCL 7+)
    if (currentLinks < linkLimit && sortedSources.length > 1) {
        if (buildSourceLink(room, sortedSources[1])) return true;
    }

    // 5. Remote Links (RCL 8)
    if (currentLinks < linkLimit) {
        const neighboring = Object.values(Game.map.describeExits(room.name));
        for (const neighbor of neighboring) {
            const remoteHarvester = Game.rooms[neighbor] && Game.rooms[neighbor].myCreeps.find(c => c.memory.role === 'remoteHarvester');
            if (!remoteHarvester) continue;
            const exit = Game.map.findExit(room.name, neighbor);
            const exitTiles = room.find(exit);
            if (!exitTiles.length) continue;
            const middle = _.round(exitTiles.length / 2);
            const startPos = exitTiles[middle];
            const existingLink = startPos.findClosestByRange(room.structures, {filter: (s => s.structureType === STRUCTURE_LINK)});
            if (existingLink && existingLink.pos.getRangeTo(startPos) <= 4) continue;
            const inBuildLink = startPos.findClosestByRange(room.constructionSites, {filter: (s => s.structureType === STRUCTURE_LINK)});
            if (inBuildLink && inBuildLink.pos.getRangeTo(startPos) <= 4) continue;
            for (let xOff = -3; xOff <= 3; xOff++) {
                for (let yOff = -3; yOff <= 3; yOff++) {
                    if (xOff === 0 && yOff === 0) continue;
                    if (startPos.x + xOff < 1 || startPos.x + xOff > 48 || startPos.y + yOff < 1 || startPos.y + yOff > 48) continue;
                    let pos = new RoomPosition(startPos.x + xOff, startPos.y + yOff, room.name);
                    if (pos.checkForAllStructure() || pos.checkForImpassible()) continue;
                    if (tryCreateConstructionSite(pos, STRUCTURE_LINK) === OK) return true;
                }
            }
        }
    }

    return false;

    function buildSourceLink(room, source) {
        const sourceContainer = Game.getObjectById(source.memory.container);
        if (!sourceContainer) return false;

        const existingLink = sourceContainer.pos.findInRange(room.links, 1)[0];
        if (existingLink) {
            source.memory.link = existingLink.id;
            return false;
        }

        const site = _.find(sourceContainer.pos.findInRange(FIND_CONSTRUCTION_SITES, 1), s => s.structureType === STRUCTURE_LINK);
        if (site) return true;

        // If we're right near the hub don't build

        if (sourceContainer.pos.getRangeTo(room.hub) <= 8) return false;

        const zoneTerrain = room.lookForAtArea(LOOK_TERRAIN, sourceContainer.pos.y - 1, sourceContainer.pos.x - 1,
            sourceContainer.pos.y + 1, sourceContainer.pos.x + 1, true);
        for (let key in zoneTerrain) {
            let position = new RoomPosition(zoneTerrain[key].x, zoneTerrain[key].y, room.name);
            if (position.checkForWall() || position.checkForAllStructure() || position.isNearTo(room.controller)) continue;
            if (tryCreateConstructionSite(position, STRUCTURE_LINK) === OK) return true;
        }
        return false;
    }
}

module.exports = {

    linkBuilder,

};
