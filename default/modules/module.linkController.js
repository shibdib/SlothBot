const profiler = require("tools.profiler");

class LinkControl {
    constructor() {
    }

    run(room) {
        if (!room.structures.length) return;
        if (Game.time % 2 !== 0 && !room.memory.linkCooldown) return;

        const allLinks = room.links;
        if (!allLinks.length) {
            room.memory.linkCooldown = undefined;
            return;
        }

        const hubLink = Game.getObjectById(room.memory.hubLink);
        const controllerLink = Game.getObjectById(room.memory.controllerLink);

        if (Game.time % 100 === 0 || !controllerLink) {
            this.updateSpecialLinks(room, allLinks);
        }

        // Wake-up gate: keep running next tick if any link still has energy to move.
        if (!allLinks.some(l => l.store[RESOURCE_ENERGY] > 0)) {
            room.memory.linkCooldown = undefined;
            return;
        }
        room.memory.linkCooldown = true;

        // Source links = anything that isn't hub/controller, holding energy, off cooldown.
        const sourceLinks = allLinks.filter(l =>
            l.id !== room.memory.hubLink &&
            l.id !== room.memory.controllerLink &&
            !l.cooldown &&
            l.store[RESOURCE_ENERGY] > 0
        );

        // Route the first source link that can move this tick.
        for (const link of sourceLinks) {
            const target = this.pickSourceDestination(link, controllerLink, hubLink, room);
            if (target && link.transferEnergy(target) === OK) break;
        }

        // Hub → controller emergency feed.
        // Pre-RCL8 we *always* protect upgrader throughput — getting to RCL8 is the priority,
        // and an idle upgrader stalls room progression for thousands of ticks.
        // At RCL8 we only do this once storage has hit target; otherwise we'd be unwinding the
        // stockpile we're trying to build.
        if (controllerLink && hubLink && !hubLink.cooldown &&
            controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) < 200 &&
            hubLink.store.getUsedCapacity(RESOURCE_ENERGY) >= 400 &&
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

        // Pre-RCL8: controller wins. Stockpile is secondary — upgrading is what unlocks RCL8.
        // Spill to hub only when the controller can't accept the full payload.
        if (room.level < 8) {
            if (canSendToController) return controllerLink;
            return canSendToHub ? hubLink : null;
        }

        // RCL8 + storage below target: stockpile is the priority. Controller is fed via the
        // emergency hub→controller path only once we re-cross target.
        if (room.energyState < 2) {
            if (canSendToHub) return hubLink;
            return canSendToController ? controllerLink : null;
        }

        // RCL8 + at/above target: drain the stockpile via upgrades; spill to hub when controller
        // can't take it (e.g., upgrader hasn't kept up).
        if (canSendToController) return controllerLink;
        return canSendToHub ? hubLink : null;
    }

    updateSpecialLinks(room, links) {
        // Find controller link.
        if (!room.memory.controllerLink || !Game.getObjectById(room.memory.controllerLink)) {
            const cLink = room.controller.pos.findInRange(links, 4)[0];
            if (cLink) room.memory.controllerLink = cLink.id;
        }

        // Cleanup hub link if it's gone.
        if (room.memory.hubLink && !Game.getObjectById(room.memory.hubLink)) {
            delete room.memory.hubLink;
        }
    }
}

profiler.registerClass(LinkControl, 'LinkControl');
module.exports = LinkControl;
