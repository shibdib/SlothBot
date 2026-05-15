const profiler = require("tools.profiler");

class LinkControl {
    constructor() {
    }

    run(room) {
        // Skip if no structures to avoid filtering cost
        if (!room.structures.length) return;

        // Skip tick if no links or no energy in links
        if (Game.time % 2 !== 0 && !room.memory.linkCooldown) return;

        // Get all links that aren't on cooldown and have energy
        const links = room.structures.filter(s =>
            s.structureType === STRUCTURE_LINK &&
            s.store[RESOURCE_ENERGY] > 0
        );

        if (!links.length) {
            room.memory.linkCooldown = undefined;
            return;
        }
        room.memory.linkCooldown = true;

        const hubLink = Game.getObjectById(room.memory.hubLink);
        const controllerLink = Game.getObjectById(room.memory.controllerLink);

        // Validation and lazy setting of controller link
        if (Game.time % 100 === 0 || !controllerLink) {
            this.updateSpecialLinks(room, links);
        }

        // Filter for source links (anything that isn't hub or controller link)
        const sourceLinks = links.filter(l => l.id !== room.memory.hubLink && l.id !== room.memory.controllerLink && !l.cooldown);
        if (!sourceLinks.length) {
            if (hubLink && room.energyState >= 2 && !hubLink.cooldown && hubLink.store[RESOURCE_ENERGY] >= 400 && controllerLink && controllerLink.store[RESOURCE_ENERGY] < 400) {
                hubLink.transferEnergy(controllerLink);
            }
            return;
        }

        for (const link of sourceLinks) {
            // Prioritize controller if upgrader is present
            if (controllerLink && controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) >= 400) {
                if (link.transferEnergy(controllerLink) === OK) continue;
            }

            // Otherwise send to hub
            if (hubLink && hubLink.id !== link.id && hubLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                link.transferEnergy(hubLink);
            }
        }
    }

    updateSpecialLinks(room, links) {
        // Find controller link
        if (!room.memory.controllerLink || !Game.getObjectById(room.memory.controllerLink)) {
            const cLink = room.controller.pos.findInRange(links, 4)[0];
            if (cLink) room.memory.controllerLink = cLink.id;
        }

        // Cleanup hub link if it's gone
        if (room.memory.hubLink && !Game.getObjectById(room.memory.hubLink)) {
            delete room.memory.hubLink;
        }
    }
}

profiler.registerClass(LinkControl, 'LinkControl');
module.exports = LinkControl;