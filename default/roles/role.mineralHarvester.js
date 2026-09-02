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
                log.a(this.room.name + ' supply of ' + (mineral && mineral.mineralType || 'mineral') + ' has been depleted.');
                return this.creep.recycleCreep();
            }
        }
    }

    setExtractor() {
        const mineral = Game.getObjectById(this.creep.memory.other && this.creep.memory.other.assignedMineral);
        let extractor = mineral && mineral.pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_EXTRACTOR);
        if (!extractor) extractor = this.room.extractor;
        if (extractor) {
            this.creep.memory.extractor = extractor.id;
        } else {
            this.creep.recycleCreep();
        }
    }

    dumpThorium() {
        const t = typeof RESOURCE_THORIUM !== 'undefined' ? RESOURCE_THORIUM : 'T';
        const nearby = this.creep.pos.findInRange(this.room.myCreeps, 1);
        for (let i = 0; i < nearby.length; i++) {
            const c = nearby[i];
            if (c.id === this.creep.id) continue;
            if (c.memory.role === 'thoriumHauler' && c.store.getFreeCapacity(t) > 0) {
                this.creep.transfer(c, t);
                return;
            }
        }
        const dest = this.room.terminal || this.room.storage;
        if (!dest) return this.creep.idleFor(5);
        if (this.creep.transfer(dest, t) === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(dest, {offRoad: true});
        }
    }

    extractResource() {
        const mineral = Game.getObjectById(this.creep.memory.other && this.creep.memory.other.assignedMineral);
        if (!mineral) return this.creep.recycleCreep();
        const thorium = this.isThorium(mineral);

        if (thorium && this.creep.store.getFreeCapacity() < this.creep.store.getCapacity() * 0.25) {
            return this.dumpThorium();
        }

        if (!thorium) {
            const container = Game.getObjectById(this.room.memory.extractorContainer);
            if (container) {
                if (!this.creep.pos.isEqualTo(container.pos)) {
                    this.creep.memory.onContainer = undefined;
                    return this.creep.shibMove(container, {range: 0});
                }
                this.creep.memory.onContainer = true;
                if (!container.store.getFreeCapacity()) return this.creep.idleFor(25);
            }
        } else if (this.creep.store.getUsedCapacity()) {
            const onTile = this.creep.pos.lookFor(LOOK_STRUCTURES);
            for (let i = 0; i < onTile.length; i++) {
                const type = onTile[i].structureType;
                if (type === STRUCTURE_ROAD || type === STRUCTURE_CONTAINER) {
                    return this.dumpThorium();
                }
            }
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
                this.creep.memory.other.stationary = !thorium;
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(mineral, thorium ? {range: 1, offRoad: true} : undefined);
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
