/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleStationaryHarvester {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (!this.creep.memory.other) this.creep.memory.other = {};
        if (!this.creep.memory.other.source) {
            this.findSource();
        } else {
            this.harvestSource();
        }
    }

    findSource() {
        if (!this.creep.findSource()) {
            // Use myCreeps — room.creeps includes hostiles
            const harvesters = this.room.myCreeps.filter(c => c.memory.role === 'stationaryHarvester' && c.id !== this.creep.id);
            const oldestHarvester = _.min(harvesters.filter(c => c.ticksToLive < 500), 'ticksToLive')
                || harvesters.find(c => c.memory.other && c.memory.other.reboot);
            if (!oldestHarvester || !oldestHarvester.id) return this.creep.suicide();
            const inherited = oldestHarvester.memory.other && oldestHarvester.memory.other.source;
            if (!inherited) return;
            this.creep.memory.other.source = inherited;
            // Do NOT suicide the old one here. Let it run until natural death (or its own low TTL).
            // This prevents killing a still-productive full-size harvester when the replacement
            // was forced to spawn small (low energy bank) or is still being towed into position.
            // The new creep now "claims" the source id (so findSource won't duplicate), and will
            // tow/wait at range 1 until the spot frees. Eliminates harvest gaps on owned sources.
            // Overlap is brief and only at replacement time; net win for sustained energy gain.
        }
    }

    harvestSource() {
        let source = Game.getObjectById(this.creep.memory.other.source);
        if (!source) return;
        // If in place harvest
        if (this.creep.memory.onContainer) {
            // Resolve container once per tick — passed to depositEnergy to avoid repeated getObjectById
            let container = global.resolveSourceContainer(source, this.room);
            let containerSite = !container ? global.resolveSourceContainerSite(source) : null;
            // Build container site if missing
            if (!container && !containerSite && this.creep.store[RESOURCE_ENERGY]) {
                const site = this.creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
                if (site && site.structureType === STRUCTURE_CONTAINER) {
                    this.creep.build(site);
                    const dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
                    if (dropped) this.creep.pickup(dropped);
                    return;
                }
            }
            // If we have a link and container, withdraw overflow from container this tick
            if (this.creep.store.getFreeCapacity() && source.memory.link
                && source.memory.link !== this.room.memory.hubLink
                && container && container.store[RESOURCE_ENERGY] > 0) {
                return this.creep.withdraw(container, RESOURCE_ENERGY);
            }
            // Deposit energy this tick if container is full or we're carrying surplus
            if (this.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                depositEnergy(this.creep, source, container);
            }
            switch (this.creep.harvest(source)) {
                case ERR_NOT_IN_RANGE:
                    if (container || containerSite) this.creep.shibMove(container || containerSite, {range: 0});
                    this.creep.memory.onContainer = undefined;
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    if (container) this.creep.repair(container);
                    if (container && !container.store[RESOURCE_ENERGY]) this.creep.idleFor(source.ticksToRegeneration + 1);
                    break;
                case OK:
                    // Set stationary so we don't get bumped
                    this.creep.memory.other.stationary = true;
                    // Check for a link every 50 ticks if we don't have one, or if we haven't checked yet
                    if (container && (!this.creep.memory.other.linkCheck || Game.time % 50 === 0)) {
                        let link = Game.getObjectById(source.memory.link);
                        if (link && !isSourceDumpLink(this.room, source, link, container)) {
                            link = undefined;
                            source.memory.link = undefined;
                            this.creep.memory.link = undefined;
                        }
                        if (!link) {
                            link = _.find(container.pos.findInRange(this.room.links, 1),
                                (s) => isSourceDumpLink(this.room, source, s, container));
                            if (link) source.memory.link = link.id;
                        }
                        if (link) this.creep.memory.link = link.id;
                        this.creep.memory.other.linkCheck = true;
                    }
                    break;
            }
        } else {
            let container = global.resolveSourceContainer(source, this.room);
            let containerSite = !container ? global.resolveSourceContainerSite(source) : null;
            const standPos = container || containerSite;
            if (standPos) {
                if (!this.creep.pos.isEqualTo(standPos.pos)) {
                    return this.creep.shibMove(standPos, {range: 0});
                }
                this.creep.memory.onContainer = true;
            } else if (this.creep.pos.getRangeTo(source) > 1) {
                return this.creep.shibMove(source);
            } else {
                this.creep.memory.onContainer = true;
            }
        }
    }
}

// Deposit harvested energy into link → container → repair in priority order
function depositEnergy(creep, source, container) {
    if (!source) source = Game.getObjectById(creep.memory.other && creep.memory.other.source);
    if (!container && source) container = global.resolveSourceContainer(source, creep.room);

    // Fill nearby extensions (Critical)
    if (extensionFiller(creep)) return;

    // Prioritize a real source/controller dump link. Hub is a receiver — dumping
    // into it fills the inbound slot and blocks the other source's link.
    const linkId = source.memory.link;
    if (linkId && linkId !== creep.room.memory.hubLink) {
        const link = Game.getObjectById(linkId);
        if (link && isSourceDumpLink(creep.room, source, link, container)
            && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            source.memory.link = link.id;
            creep.transfer(link, RESOURCE_ENERGY);
            if (container && container.store[RESOURCE_ENERGY] > 0) creep.withdraw(container, RESOURCE_ENERGY);
            return;
        }
    } else if (linkId) {
        source.memory.link = undefined;
        creep.memory.link = undefined;
    }

    // Fallback to Container
    if (container && container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        creep.transfer(container, RESOURCE_ENERGY);
        return;
    }

    // If structures are full, use energy for maintenance (prevent decay/waste)
    // Container repair/build is always critical (harvester lives on it, positioning + no dropped energy).
    // Rampart repair is the "oversize benefit" for defense, but only do it when the room is healthy
    // (energyState or spare) so we don't divert scarce mined energy from stockpile in lean times.
    // This directly helps the "struggling to stockpile" goal while still maintaining the container.
    if (creep.store[RESOURCE_ENERGY] > 0) {
        if (!container) {
            const containerSite = global.resolveSourceContainerSite(source)
                || creep.pos.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})[0];
            if (containerSite) return creep.build(containerSite);
        } else if (container && container.hits < container.hitsMax) {
            return creep.repair(container);
        }
        const roomHealthy = creep.room.energyState >= 2 || (creep.room.energyInfo && (creep.room.energyInfo.spareIncome || 0) > 2);
        if (roomHealthy) {
            const rampart = creep.pos.checkForRampart();
            if (rampart && rampart.hits < rampart.hitsMax) {
                return creep.repair(rampart);
            }
        }
    }

    if (!container && !linkId) {
        delete creep.memory.containerID;
        delete creep.memory.linkID;
    }
}

function isSourceDumpLink(room, source, link, container) {
    if (!link || (link.isActive && !link.isActive())) return false;
    if (room.memory.hubLink && link.id === room.memory.hubLink) return false;
    if (container && !link.pos.isNearTo(container)) return false;
    if (room.memory.controllerLink && link.id === room.memory.controllerLink) {
        return !!(source && room.controller && source.pos.getRangeTo(room.controller) <= 2);
    }
    return true;
}

function extensionFiller(creep) {
    if (!ROOM_HARVESTER_EXTENSIONS[creep.room.name] || !creep.memory.extensionsFound) {
        creep.memory.extensionsFound = true;
        const container = Game.getObjectById(creep.memory.containerID) || creep;
        const nearby = creep.room.impassibleStructures.filter(s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION);
        const extension = container.pos.findInRange(nearby, 1);
        ROOM_HARVESTER_EXTENSIONS[creep.room.name] = _.union(ROOM_HARVESTER_EXTENSIONS[creep.room.name] || [], _.pluck(extension, 'id'));
        return false;
    }
    // Only opportunisticFill if there are actually extensions in range
    if (ROOM_HARVESTER_EXTENSIONS[creep.room.name].length && creep.opportunisticFill()) return true;
    return false;
}

profiler.registerClass(RoleStationaryHarvester, 'StationaryHarvester');
module.exports = RoleStationaryHarvester;