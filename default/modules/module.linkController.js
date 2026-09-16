const profiler = require("tools.profiler");
const {isControllerAreaLink} = require('planUtils');
const {ENERGY_ACCRUAL_FLOOR, upgraderFeedWorkCap} = require('spawnFlow');

const CONTROLLER_LINK_RANGE = 3;
const UPGRADER_STARVE_THRESHOLD = 0.65;
const HUB_OVERFLOW_RATIO = 0.85;
const HUB_DRIP_MIN = 400;
const CONTROLLER_FEED_TICKS = 40;
const CONTROLLER_DRIP_MIN = 100;
// 3% tax + 1-tick cooldown makes a 10-energy send worse than waiting to batch.
const LINK_SEND_MIN = 200;

function linkSendWorth(amount, urgent) {
    if (!(amount > 0)) return false;
    if (amount >= LINK_SEND_MIN) return true;
    return !!(urgent && amount >= CONTROLLER_DRIP_MIN);
}

function getUpgradeWork(room) {
    const diag = room.energyDiag;
    if (diag && diag.upgradeExpense > 0) return diag.upgradeExpense;

    let work = 0;
    for (const c of room.myCreeps) {
        if (c.memory.role === 'upgrader') work += c.getActiveBodyparts(WORK);
    }
    return Math.max(work, 1);
}

function linkCapacity() {
    return typeof LINK_CAPACITY === 'number' ? LINK_CAPACITY : 800;
}

/**
 * How much energy the controller link should hold. RCL8 uses live WORK.
 * Below RCL8 a leftover dump-sized upgrader must not keep the link full while
 * the room is below its stockpile target.
 */
function scaledControllerTarget(room, upgradeWork) {
    const cap = linkCapacity();
    const full = Math.min(cap, Math.max(1, upgradeWork) * CONTROLLER_FEED_TICKS);
    const rcl = (room.controller && room.controller.level) || room.level || 0;
    if (rcl >= 8) return full;
    const feedCap = upgraderFeedWorkCap(room);
    const feedWork = feedCap ? Math.min(upgradeWork, feedCap) : upgradeWork;
    return Math.min(full, Math.max(CONTROLLER_DRIP_MIN, feedWork * CONTROLLER_FEED_TICKS));
}

function buildLinkPolicy(room, hubLink, controllerLink) {
    const energyInfo = room.energyInfo;
    const upgraderDuty = (energyInfo && typeof energyInfo.upgraderDuty === 'number') ? energyInfo.upgraderDuty : 1;
    const upgradeWork = getUpgradeWork(room);
    const controllerTarget = scaledControllerTarget(room, upgradeWork);
    const controllerMin = Math.max(CONTROLLER_DRIP_MIN, Math.floor(controllerTarget * 0.25));
    const hubEnergy = hubLink ? hubLink.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
    const hubFill = hubLink ? hubEnergy / linkCapacity() : 0;
    const controllerEnergy = controllerLink ? controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) : 0;
    const upgraderStarved = upgraderDuty < UPGRADER_STARVE_THRESHOLD;
    const energyState = room.energyState || 0;
    const rcl = (room.controller && room.controller.level) || room.level || 0;
    const isStockpiling = rcl >= 8 && energyState >= 3;
    const buildingStock = rcl >= 8 && energyState === 2;
    const needsControllerDrip = !!controllerLink && controllerEnergy < controllerMin;
    const downgradeTicks = room.controller && room.controller.ticksToDowngrade;
    const downgradeRisk = rcl === 8 && downgradeTicks
        && typeof CONTROLLER_DOWNGRADE !== 'undefined'
        && downgradeTicks < CONTROLLER_DOWNGRADE[8] * 0.25;
    const spareIncome = (energyInfo && energyInfo.spareIncome) || 0;
    const spareOk = spareIncome >= ENERGY_ACCRUAL_FLOOR;

    return {
        upgraderDuty,
        controllerTarget,
        controllerMin,
        hubFill,
        controllerEnergy,
        upgraderStarved,
        isStockpiling,
        buildingStock,
        energyState,
        hubSaturated: hubFill >= HUB_OVERFLOW_RATIO,
        needsControllerDrip,
        allowHubToController: downgradeRisk ||
            (rcl < 8 && energyState >= 2 && spareOk) ||
            (rcl < 8 && energyState === 1 && needsControllerDrip && spareOk) ||
            (buildingStock && needsControllerDrip && spareOk) ||
            (isStockpiling && upgraderDuty < 0.75 && needsControllerDrip && spareOk),
        allowControllerOverflow: isStockpiling && hubFill >= HUB_OVERFLOW_RATIO && upgraderStarved,
        recycleControllerSurplus: (isStockpiling && controllerEnergy > controllerTarget)
            || (rcl < 8 && energyState < 2 && controllerEnergy > controllerTarget),
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

        let hubFreeRemaining = hubLink ? hubLink.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
        let hubBusy = false;
        let hubInboundThisTick = false;

        if (controllerLink && !controllerLink.cooldown && hubLink && !hubLink.cooldown &&
            policy.recycleControllerSurplus &&
            hubFreeRemaining > 0) {
            const surplus = Math.max(0, policy.controllerEnergy - policy.controllerTarget);
            const send = Math.min(surplus, hubFreeRemaining);
            if (linkSendWorth(send, false) && controllerLink.transferEnergy(hubLink, send) === OK) {
                hubFreeRemaining = hubLink.store.getFreeCapacity(RESOURCE_ENERGY);
                hubBusy = true;
                hubInboundThisTick = true;
            }
        }

        if (!hubBusy && controllerLink && hubLink && !hubLink.cooldown &&
            policy.allowHubToController &&
            policy.needsControllerDrip &&
            hubLink.store.getUsedCapacity(RESOURCE_ENERGY) >= HUB_DRIP_MIN &&
            controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            const remaining = Math.max(0, policy.controllerTarget - policy.controllerEnergy);
            const send = Math.min(
                hubLink.store.getUsedCapacity(RESOURCE_ENERGY),
                controllerLink.store.getFreeCapacity(RESOURCE_ENERGY),
                remaining
            );
            if (linkSendWorth(send, true) && hubLink.transferEnergy(controllerLink, send) === OK) {
                hubFreeRemaining = hubLink.store.getFreeCapacity(RESOURCE_ENERGY);
                hubBusy = true;
            }
        }

        const sourceLinks = allLinks.filter(l =>
            l.id !== room.memory.hubLink &&
            l.id !== room.memory.controllerLink &&
            !l.cooldown &&
            l.store[RESOURCE_ENERGY] > 0
        ).sort((a, b) => b.store[RESOURCE_ENERGY] - a.store[RESOURCE_ENERGY]);

        let controllerFreeRemaining = controllerLink ? controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) : 0;
        const cap = linkCapacity();
        for (const link of sourceLinks) {
            let target = this.pickSourceDestination(link, controllerLink, hubLink, room, policy, {
                hubFreeRemaining,
                controllerFreeRemaining,
                allowHubInbound: !hubInboundThisTick && !hubBusy,
            });
            if (!target) continue;
            const amount = link.store[RESOURCE_ENERGY];
            let sendAmount = amount;
            if (target === hubLink) sendAmount = Math.min(amount, hubFreeRemaining);
            else if (target === controllerLink) {
                const cUsed = cap - controllerFreeRemaining;
                sendAmount = Math.min(amount, controllerFreeRemaining,
                    Math.max(0, policy.controllerTarget - cUsed));
            }
            const urgent = target === controllerLink && policy.needsControllerDrip;
            if (!linkSendWorth(sendAmount, urgent)) {
                if (target !== controllerLink || hubInboundThisTick || hubBusy
                    || !hubLink || hubLink.id === link.id || !(hubFreeRemaining > 0)) continue;
                target = hubLink;
                sendAmount = Math.min(amount, hubFreeRemaining);
                if (!linkSendWorth(sendAmount, false)) continue;
            }
            if (link.transferEnergy(target, sendAmount) !== OK) continue;
            if (target === hubLink) {
                hubInboundThisTick = true;
                hubFreeRemaining = Math.max(0, hubFreeRemaining - sendAmount);
            } else if (target === controllerLink) {
                controllerFreeRemaining = Math.max(0, controllerFreeRemaining - sendAmount);
            }
        }

        const rcl = (room.controller && room.controller.level) || room.level || 0;
        if (controllerLink && !controllerLink.cooldown && hubLink &&
            rcl >= 8 &&
            (!room.energyState || (room.energyState < 2 && !policy.allowHubToController))) {
            const drain = Math.min(
                controllerLink.store.getUsedCapacity(RESOURCE_ENERGY) || 0,
                hubLink.store.getFreeCapacity(RESOURCE_ENERGY) || 0
            );
            if (linkSendWorth(drain, false)) controllerLink.transferEnergy(hubLink, drain);
        }
    }

    pickSourceDestination(link, controllerLink, hubLink, room, policy, options = {}) {
        const cFree = options.controllerFreeRemaining != null
            ? options.controllerFreeRemaining
            : (controllerLink ? controllerLink.store.getFreeCapacity(RESOURCE_ENERGY) : 0);
        const hFree = options.hubFreeRemaining != null
            ? options.hubFreeRemaining
            : (hubLink ? hubLink.store.getFreeCapacity(RESOURCE_ENERGY) : 0);
        const cap = linkCapacity();
        const cUsed = controllerLink ? cap - cFree : 0;
        const allowHubInbound = options.allowHubInbound !== false;
        const hubFill = hubLink ? (cap - hFree) / cap : 0;
        const hubSaturated = hubFill >= HUB_OVERFLOW_RATIO;
        const canSendToHub = allowHubInbound && hubLink && hubLink.id !== link.id && hFree > 0;
        const canSendToController = controllerLink && cFree > 0 && cUsed < policy.controllerTarget;

        const rcl = (room.controller && room.controller.level) || room.level || 0;
        const energyState = policy.energyState != null ? policy.energyState : (room.energyState || 0);
        if (!energyState && rcl >= 8) {
            if (canSendToHub) return hubLink;
            return canSendToController ? controllerLink : null;
        }

        if (rcl < 8) {
            if (energyState >= 2) {
                if (canSendToController) return controllerLink;
                return canSendToHub ? hubLink : null;
            }
            // Below target: keep a drip so praising does not stall, then storage.
            if (canSendToController && policy.needsControllerDrip) return controllerLink;
            if (canSendToHub && !hubSaturated) return hubLink;
            if (canSendToController) return controllerLink;
            return canSendToHub ? hubLink : null;
        }

        if (room.energyState < 2) {
            if (canSendToHub) return hubLink;
            return canSendToController ? controllerLink : null;
        }

        if (canSendToHub && !hubSaturated) return hubLink;

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
        // Bind hub before controller discovery so a near-hub receiver is not
        // claimed as controllerLink (isControllerAreaLink keys off this id).
        let hubLink = Game.getObjectById(room.memory.hubLink);
        if (!hubLink || hubLink.structureType !== STRUCTURE_LINK || !hubLink.store) {
            try {
                require('planEconomy').bindHubLinkMemory(room);
            } catch (e) { /* ignore */
            }
            hubLink = Game.getObjectById(room.memory.hubLink);
        }

        let controllerLink = Game.getObjectById(room.memory.controllerLink);
        if (controllerLink && room.controller &&
            (controllerLink.pos.getRangeTo(room.controller) > CONTROLLER_LINK_RANGE
                || !isControllerAreaLink(controllerLink, room))) {
            delete room.memory.controllerLink;
            controllerLink = undefined;
        }

        if (!controllerLink && room.controller) {
            const candidates = room.controller.pos.findInRange(links, CONTROLLER_LINK_RANGE)
                .filter(l => l.isActive() && isControllerAreaLink(l, room))
                .sort((a, b) => a.pos.getRangeTo(room.controller) - b.pos.getRangeTo(room.controller));
            if (candidates.length) {
                room.memory.controllerLink = candidates[0].id;
                controllerLink = candidates[0];
            } else {
                delete room.memory.controllerLink;
            }
        }

        return {hubLink, controllerLink};
    }
}

profiler.registerClass(LinkControl, 'LinkControl');
module.exports = LinkControl;