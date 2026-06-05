const profiler = require("tools.profiler");

const CONTROLLER_LINK_RANGE = 3;
const HUB_EMERGENCY_CONTROLLER_MAX = 200;
const HUB_EMERGENCY_HUB_MIN = 400;

class LinkControl {
    constructor() {
    }

    run(room) {
        if (!room.structures.length) return;
        if (Game.time % 2 !== 0 && !room.memory.linkCooldown) return;

        const allLinks = room.links.filter(l => l.isActive());
        if (!allLinks.length) {
            room.memory.linkCooldown = undefined;
            return;
        }

        const {hubLink, controllerLink} = this.resolveSpecialLinks(room, allLinks);

        if (!allLinks.some(l => l.store[RESOURCE_ENERGY] > 0)) {
            room.memory.linkCooldown = undefined;
            return;
        }
        room.memory.linkCooldown = true;

        const sourceLinks = allLinks.filter(l =>
            l.id !== room.memory.hubLink &&
            l.id !== room.memory.controllerLink &&
            !l.cooldown &&
            l.store[RESOURCE_ENERGY] > 0
        );

        for (const link of sourceLinks) {
            const target = this.pickSourceDestination(link, controllerLink, hubLink, room);
            if (target) link.transferEnergy(target);
        }

        if (controllerLink && hubLink && !hubLink.cooldown &&
            controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) < HUB_EMERGENCY_CONTROLLER_MAX &&
            hubLink.store.getUsedCapacity(RESOURCE_ENERGY) >= HUB_EMERGENCY_HUB_MIN &&
            controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
            (room.level < 8 || room.energyState >= 2)) {
            hubLink.transferEnergy(controllerLink);
        }
    }

    pickSourceDestination(link, controllerLink, hubLink, room) {
        const carrying = link.store.getUsedCapacity(RESOURCE_ENERGY);
        const cFree = controllerLink ? controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
        const hFree = hubLink ? hubLink.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
        const canSendToController = controllerLink && cFree >= carrying;
        const canSendToHub = hubLink && hubLink.id !== link.id && hFree >= carrying;

        if (room.level < 8) {
            if (canSendToController) return controllerLink;
            return canSendToHub ? hubLink : null;
        }

        if (room.energyState < 2) {
            if (canSendToHub) return hubLink;
            return canSendToController ? controllerLink : null;
        }

        if (canSendToController) return controllerLink;
        return canSendToHub ? hubLink : null;
    }

    resolveSpecialLinks(room, links) {
        if (room.memory.hubLink && !Game.getObjectById(room.memory.hubLink)) {
            delete room.memory.hubLink;
        }
        if (room.memory.controllerLink && !Game.getObjectById(room.memory.controllerLink)) {
            delete room.memory.controllerLink;
        }

        let controllerLink = Game.getObjectById(room.memory.controllerLink);
        if (controllerLink && room.controller &&
            controllerLink.pos.getRangeTo(room.controller) > CONTROLLER_LINK_RANGE) {
            delete room.memory.controllerLink;
            controllerLink = undefined;
        }

        if (!controllerLink && room.controller) {
            const candidates = room.controller.pos.findInRange(links, CONTROLLER_LINK_RANGE)
                .filter(l => l.isActive())
                .sort((a, b) => a.pos.getRangeTo(room.controller) - b.pos.getRangeTo(room.controller));
            if (candidates.length) {
                room.memory.controllerLink = candidates[0].id;
                controllerLink = candidates[0];
            } else {
                delete room.memory.controllerLink;
            }
        }

        const hubLink = Game.getObjectById(room.memory.hubLink);
        return {hubLink, controllerLink};
    }
}

profiler.registerClass(LinkControl, 'LinkControl');
module.exports = LinkControl;