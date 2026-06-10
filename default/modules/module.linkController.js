const profiler = require("tools.profiler");

const CONTROLLER_LINK_RANGE = 3;
const UPGRADER_STARVE_THRESHOLD = 0.65;
const HUB_OVERFLOW_RATIO = 0.85;
const HUB_DRIP_MIN = 400;
const CONTROLLER_FEED_TICKS = 40;
const CONTROLLER_DRIP_MIN = 100;

function getUpgradeWork(room) {
    const diag = room.memory.energyDiag;
    if (diag && diag.upgradeExpense > 0) return diag.upgradeExpense;

    let work = 0;
    for (const c of room.myCreeps) {
        if (c.memory.role === 'upgrader') work += c.getActiveBodyparts(WORK);
    }
    return Math.max(work, 1);
}

function buildLinkPolicy(room, hubLink, controllerLink) {
    const energyInfo = room.memory.energyInfo;
    const upgraderDuty = (energyInfo && typeof energyInfo.upgraderDuty === 'number') ? energyInfo.upgraderDuty : 1;
    const upgradeWork = getUpgradeWork(room);
    const controllerTarget = Math.min(LINK_CAPACITY, upgradeWork * CONTROLLER_FEED_TICKS);
    const controllerMin = Math.max(CONTROLLER_DRIP_MIN, Math.floor(controllerTarget * 0.25));
    const hubEnergy = hubLink ? hubLink.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
    const hubFill = hubLink ? hubEnergy / LINK_CAPACITY : 0;
    const controllerEnergy = controllerLink ? controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
    const upgraderStarved = upgraderDuty < UPGRADER_STARVE_THRESHOLD;
    const isStockpiling = room.level >= 8 && room.energyState >= 3;
    const buildingStock = room.level >= 8 && room.energyState === 2;
    const needsControllerDrip = !!controllerLink && controllerEnergy < controllerMin;

    return {
        upgraderDuty,
        controllerTarget,
        controllerMin,
        hubFill,
        controllerEnergy,
        upgraderStarved,
        isStockpiling,
        buildingStock,
        hubSaturated: hubFill >= HUB_OVERFLOW_RATIO,
        needsControllerDrip,
        allowHubToController: room.level < 8 ||
            room.energyState < 2 ||
            upgraderStarved ||
            (buildingStock && needsControllerDrip) ||
            (isStockpiling && upgraderDuty < 0.75 && needsControllerDrip),
        allowControllerOverflow: isStockpiling && hubFill >= HUB_OVERFLOW_RATIO && upgraderStarved,
        recycleControllerSurplus: isStockpiling && controllerEnergy > controllerTarget,
    };
}

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

        const policy = buildLinkPolicy(room, hubLink, controllerLink);

        if (controllerLink && !controllerLink.cooldown && hubLink && !hubLink.cooldown &&
            policy.recycleControllerSurplus &&
            hubLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            controllerLink.transferEnergy(hubLink);
        }

        if (controllerLink && hubLink && !hubLink.cooldown &&
            policy.allowHubToController &&
            policy.needsControllerDrip &&
            hubLink.store.getUsedCapacity(RESOURCE_ENERGY) >= HUB_DRIP_MIN &&
            controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            hubLink.transferEnergy(controllerLink);
        }

        const sourceLinks = allLinks.filter(l =>
            l.id !== room.memory.hubLink &&
            l.id !== room.memory.controllerLink &&
            !l.cooldown &&
            l.store[RESOURCE_ENERGY] > 0
        );

        for (const link of sourceLinks) {
            const target = this.pickSourceDestination(link, controllerLink, hubLink, room, policy);
            if (target) link.transferEnergy(target);
        }

        if (controllerLink && !controllerLink.cooldown && hubLink && !room.energyState &&
            controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            controllerLink.transferEnergy(hubLink);
        }
    }

    pickSourceDestination(link, controllerLink, hubLink, room, policy) {
        const carrying = link.store.getUsedCapacity(RESOURCE_ENERGY);
        const cFree = controllerLink ? controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
        const hFree = hubLink ? hubLink.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
        const cEnergy = controllerLink ? controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
        const canSendToHub = hubLink && hubLink.id !== link.id && hFree >= carrying;
        const canSendToController = controllerLink && cFree >= carrying && cEnergy < policy.controllerTarget;

        if (!room.energyState) {
            if (canSendToHub) return hubLink;
            return canSendToController ? controllerLink : null;
        }

        if (room.level < 8) {
            if (canSendToController) return controllerLink;
            return canSendToHub ? hubLink : null;
        }

        if (room.energyState < 2) {
            if (canSendToHub) return hubLink;
            return canSendToController ? controllerLink : null;
        }

        if (canSendToHub && !policy.hubSaturated) return hubLink;

        if (policy.allowControllerOverflow && canSendToController) return controllerLink;
        if (policy.upgraderStarved && canSendToController) return controllerLink;
        if (policy.buildingStock && policy.needsControllerDrip && canSendToController) return controllerLink;

        if (canSendToHub) return hubLink;
        if (policy.isStockpiling) return null;
        return canSendToController ? controllerLink : null;
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