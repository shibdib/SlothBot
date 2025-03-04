const profiler = require("tools.profiler");

class LinkControl {
    constructor() {
    }

    run(room) {
        // Get all available links with conditions inlined
        let links = room.impassibleStructures.filter(s =>
            s.structureType === STRUCTURE_LINK &&
            !s.cooldown &&
            s.store[RESOURCE_ENERGY] >= 100
        ).sort(() => Math.random() - 0.5); // Shuffle array

        if (!links.length) return;

        let hubLink = Game.getObjectById(room.memory.hubLink);
        let controllerLink = Game.getObjectById(room.memory.controllerLink);

        // Set controller link if not already set
        if (!controllerLink || !(controllerLink instanceof StructureLink)) this.setControllerLink(room, links, controllerLink);

        // Ensure hub link is valid or delete from memory if not
        if (!hubLink || !(hubLink instanceof StructureLink)) delete room.memory.hubLink;

        // Process links and handle energy transfer
        links.forEach(link => this.processLink(link, room, hubLink, controllerLink));
    }

    setControllerLink(room, links, controllerLink) {
        controllerLink = links.find(s => s.pos.findInRange(room.structures, 2,
            {filter: f => f.structureType === STRUCTURE_CONTROLLER}
        )[0]);
        if (controllerLink) room.memory.controllerLink = controllerLink.id;
    }

    processLink(link, room, hubLink, controllerLink) {
        //if (link.id === room.memory.hubLink && link.room.energyAvailable !== link.room.energyCapacityAvailable) return;

        // Controller link only shares if room is under attack
        if (link.id === room.memory.controllerLink && !room.memory.dangerousAttack) return;

        const upgrader = room.creeps.find(c => c.memory && c.memory.role === 'upgrader' && c.memory.inPosition);

        // Simplified energy transfer logic
        if (upgrader && controllerLink && controllerLink.store[RESOURCE_ENERGY] < LINK_CAPACITY * 0.5) {
            link.transferEnergy(controllerLink);
        } else if (room.level >= 7) {
            if (hubLink && !hubLink.room.energyState) {
                link.transferEnergy(hubLink);
            } else if (hubLink && hubLink.store[RESOURCE_ENERGY] < 400) {
                link.transferEnergy(hubLink);
            } else if (controllerLink && controllerLink.store[RESOURCE_ENERGY] < LINK_CAPACITY * 0.7) {
                link.transferEnergy(controllerLink);
            } else if (hubLink && hubLink.store[RESOURCE_ENERGY] < LINK_CAPACITY) {
                link.transferEnergy(hubLink);
            } else {
                this.transferEnergyBetweenLinks(link, room);
            }
        }
    }

    transferEnergyBetweenLinks(link, room) {
        let lowEnergyLinks = room.impassibleStructures.filter(l =>
            l.structureType === STRUCTURE_LINK &&
            l.id !== link.id &&
            l.store[RESOURCE_ENERGY] < LINK_CAPACITY * 0.5
        );
        let targetLink = lowEnergyLinks.find(l => l.store[RESOURCE_ENERGY] < link.store[RESOURCE_ENERGY]);

        if (link.store[RESOURCE_ENERGY] > LINK_CAPACITY * 0.98 && targetLink) {
            link.transferEnergy(targetLink, link.store[RESOURCE_ENERGY] * 0.5);
        }
    }
}

profiler.registerClass(LinkControl, 'LinkControl');
module.exports = LinkControl;