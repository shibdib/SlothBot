/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleMineralHarvester {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (!this.creep.memory.extractor) {
            this.setExtractor();
        } else {
            this.extractResource();
        }
    }

    isThorium(mineral) {
        if (!(typeof IS_SEASON !== 'undefined' && IS_SEASON)) return false;
        if (this.creep.memory.other && this.creep.memory.other.thorium) return true;
        const t = typeof RESOURCE_THORIUM !== 'undefined' ? RESOURCE_THORIUM : 'T';
        return !!(mineral && mineral.mineralType === t);
    }

    housekeeping() {
        if (this.creep.tryToBoost()) return true;
        const assigned = this.creep.memory.other && this.creep.memory.other.assignedMineral;
        if (assigned) {
            const mineral = Game.getObjectById(assigned);
            if (!mineral || mineral.mineralAmount === 0) {
                if (this.isThorium(mineral) && this.creep.store.getUsedCapacity()) {
                    this.dumpThorium();
                    return true;
                }
                log.a(this.room.name + ' supply of ' + (mineral && mineral.mineralType || 'mineral') + ' has been depleted.');
                return this.creep.recycleCreep();
            }
            if (!this.extractorContainer()) {
                if (this.creep.store.getUsedCapacity()) {
                    if (this.isThorium(mineral)) {
                        this.dumpThorium();
                        return true;
                    }
                }
                return this.creep.recycleCreep();
            }
        }
    }

    setExtractor() {
        const mineral = Game.getObjectById(this.creep.memory.other && this.creep.memory.other.assignedMineral);
        const extractor = mineral && mineral.pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_EXTRACTOR);
        if (extractor) {
            this.creep.memory.extractor = extractor.id;
        } else {
            const pos = mineral && mineral.pos;
            if (pos && !pos.checkForConstructionSites()) {
                const {tryCreateConstructionSite} = require('planUtils');
                tryCreateConstructionSite(pos, STRUCTURE_EXTRACTOR);
            }
            this.creep.recycleCreep();
        }
    }

    dumpThorium() {
        const t = typeof RESOURCE_THORIUM !== 'undefined' ? RESOURCE_THORIUM : 'T';
        const container = this.extractorContainer();
        if (container && container.store.getFreeCapacity(t) > 0) {
            if (this.creep.pos.isEqualTo(container.pos) || this.creep.pos.isNearTo(container)) {
                if (this.creep.transfer(container, t) === OK) return;
            } else {
                this.creep.shibMove(container, {range: 0});
                return;
            }
        }
        const nearby = this.creep.pos.findInRange(this.room.myCreeps, 1);
        for (let i = 0; i < nearby.length; i++) {
            const c = nearby[i];
            if (c.id === this.creep.id) continue;
            if (!c.store || c.store.getFreeCapacity(t) <= 0) continue;
            if (this.creep.transfer(c, t) === OK) return;
        }
        // Last resort — dropped Thorium decays. Only if the container is gone/full.
        this.creep.drop(t);
    }

    extractorContainer() {
        let container = Game.getObjectById(this.room.memory.extractorContainer);
        if (container) return container;
        const mineral = Game.getObjectById(this.creep.memory.other && this.creep.memory.other.assignedMineral);
        const pos = mineral && mineral.pos;
        if (!pos) return null;
        const near = this.room.containers || [];
        for (let i = 0; i < near.length; i++) {
            if (near[i].pos.getRangeTo(pos) === 1) {
                this.room.memory.extractorContainer = near[i].id;
                return near[i];
            }
        }
        return null;
    }

    extractResource() {
        const mineral = Game.getObjectById(this.creep.memory.other && this.creep.memory.other.assignedMineral);
        if (!mineral) return this.creep.recycleCreep();
        const thorium = this.isThorium(mineral);
        const container = this.extractorContainer();

        if (thorium && this.creep.store.getUsedCapacity() && this.creep.store.getFreeCapacity() < this.creep.store.getCapacity() * 0.25) {
            return this.dumpThorium();
        }

        // Harvest must land in the container. Dropped Thorium decays; Thorium
        // in a container only ages the structure (labTech drains it).
        if (thorium && !container) {
            if (this.creep.pos.getRangeTo(mineral) > 1) this.creep.shibMove(mineral, {range: 1});
            else this.creep.idleFor(5);
            return;
        }

        if (container) {
            if (!this.creep.pos.isEqualTo(container.pos)) {
                this.creep.memory.onContainer = undefined;
                return this.creep.shibMove(container, {range: 0});
            }
            this.creep.memory.onContainer = true;
            if (!container.store.getFreeCapacity()) return this.creep.idleFor(5);
        }

        const extractor = Game.getObjectById(this.creep.memory.extractor);
        if (!extractor) return this.creep.recycleCreep();
        if (extractor.cooldown && this.creep.pos.getRangeTo(extractor) < 2) {
            if (thorium && this.creep.store.getUsedCapacity()) return this.dumpThorium();
            return this.creep.idleFor(extractor.cooldown - 1);
        }

        switch (this.creep.harvest(mineral)) {
            case OK:
                if (!this.creep.memory.other) this.creep.memory.other = {};
                this.creep.memory.other.stationary = true;
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(container || mineral, container ? {range: 0} : {range: 1});
                break;
            case ERR_NOT_FOUND:
                const {tryCreateConstructionSite} = require('planUtils');
                tryCreateConstructionSite(mineral.pos, STRUCTURE_EXTRACTOR);
                break;
            case ERR_FULL:
                if (thorium) return this.dumpThorium();
                break;
        }
    }
}

profiler.registerClass(RoleMineralHarvester, 'MineralHarvester');
module.exports = RoleMineralHarvester;
