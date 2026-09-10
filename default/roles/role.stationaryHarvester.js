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
        if (this.creep.memory.other.source) this.creep.memory.assignment = this.creep.memory.other.source;
    }

    harvestSource() {
        let source = Game.getObjectById(this.creep.memory.other.source);
        if (!source) return;
        if (this.creep.memory.other.source) this.creep.memory.assignment = this.creep.memory.other.source;
        if (this.creep.memory.onContainer) {
            let container = global.resolveSourceContainer(source, this.room);
            let containerSite = !container ? global.resolveSourceContainerSite(source) : null;
            if (!container && !containerSite && this.creep.store[RESOURCE_ENERGY]) {
                const site = this.creep.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0];
                if (site && site.structureType === STRUCTURE_CONTAINER) {
                    this.creep.build(site);
                    const dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
                    if (dropped) this.creep.pickup(dropped);
                    return;
                }
            }

            if (!source.energy) {
                onSourceEmpty(this.creep, source, container);
                return;
            }

            const harvestResult = this.creep.harvest(source);
            if (harvestResult === ERR_NOT_IN_RANGE) {
                if (container || containerSite) this.creep.shibMove(container || containerSite, {range: 0});
                this.creep.memory.onContainer = undefined;
                return;
            }
            if (harvestResult === OK) {
                this.creep.memory.other.stationary = true;
                bindSourceLink(this.creep, source, container);
            }

            // Transfer/withdraw is a different intent — never skip harvest for it.
            if (this.creep.store[RESOURCE_ENERGY]) {
                depositEnergy(this.creep, source, container);
            } else if (this.creep.store.getFreeCapacity() && container && container.store[RESOURCE_ENERGY] > 0) {
                const link = sourceDumpLink(this.room, source, container);
                if (link && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                    this.creep.withdraw(container, RESOURCE_ENERGY);
                }
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
                return this.harvestSource();
            }
            if (this.creep.pos.getRangeTo(source) > 1) {
                return this.creep.shibMove(source);
            }
            this.creep.memory.onContainer = true;
            return this.harvestSource();
        }
    }
}

function sourceDumpLink(room, source, container) {
    const linkId = source && source.memory && source.memory.link;
    if (!linkId || linkId === room.memory.hubLink) return null;
    const link = Game.getObjectById(linkId);
    if (link && isSourceDumpLink(room, source, link, container)) return link;
    return null;
}

function bindSourceLink(creep, source, container) {
    if (!container || (creep.memory.other.linkCheck && Game.time % 50 !== 0)) return;
    let link = Game.getObjectById(source.memory.link);
    if (link && !isSourceDumpLink(creep.room, source, link, container)) {
        link = undefined;
        source.memory.link = undefined;
        creep.memory.link = undefined;
    }
    if (!link) {
        link = _.find(container.pos.findInRange(creep.room.links, 1),
            (s) => isSourceDumpLink(creep.room, source, s, container));
        if (link) source.memory.link = link.id;
    }
    if (link) creep.memory.link = link.id;
    creep.memory.other.linkCheck = true;
}

function onSourceEmpty(creep, source, container) {
    const damaged = container && container.hits && container.hits < container.hitsMax;
    if (damaged) {
        if (creep.store[RESOURCE_ENERGY]) {
            creep.repair(container);
            return;
        }
        if (container.store && container.store[RESOURCE_ENERGY]) {
            creep.withdraw(container, RESOURCE_ENERGY);
            return;
        }
    }
    if (creep.store[RESOURCE_ENERGY]) {
        depositEnergy(creep, source, container);
        return;
    }
    const link = sourceDumpLink(creep.room, source, container);
    if (link && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        && container && container.store && container.store[RESOURCE_ENERGY] > 0) {
        creep.withdraw(container, RESOURCE_ENERGY);
        return;
    }
    if (!damaged) {
        const regen = source.ticksToRegeneration || 1;
        creep.idleFor(Math.max(1, regen));
    }
}

// Dump carry into link / adjacent spawn / container. No work intent — harvest owns that.
function depositEnergy(creep, source, container) {
    if (!source) source = Game.getObjectById(creep.memory.other && creep.memory.other.source);
    if (!container && source) container = global.resolveSourceContainer(source, creep.room);

    if (extensionFiller(creep)) return;

    const link = sourceDumpLink(creep.room, source, container);
    if (link && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (source.memory) source.memory.link = link.id;
        creep.transfer(link, RESOURCE_ENERGY);
        return;
    }
    if (source && source.memory && source.memory.link && !link) {
        source.memory.link = undefined;
        creep.memory.link = undefined;
    }

    if (container && container.store && container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        creep.transfer(container, RESOURCE_ENERGY);
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