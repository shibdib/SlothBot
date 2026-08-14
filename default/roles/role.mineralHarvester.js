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

    housekeeping() {
        if (this.creep.tryToBoost()) return true;
        const mineral = Game.getObjectById(this.creep.memory.other && this.creep.memory.other.assignedMineral);
        if (mineral && mineral.mineralAmount === 0) {
            log.a(this.room.name + ' supply of ' + mineral.mineralType + ' has been depleted.');
            return this.creep.recycleCreep();
        }
    }

    setExtractor() {
        let extractor = this.room.extractor;
        if (extractor) {
            this.creep.memory.extractor = extractor.id;
        } else {
            this.creep.recycleCreep();
        }
    }

    extractResource() {
        const container = Game.getObjectById(this.room.memory.extractorContainer);
        if (container) {
            if (!this.creep.pos.isEqualTo(container.pos)) {
                this.creep.memory.onContainer = undefined;
                return this.creep.shibMove(container, {range: 0});
            }
            this.creep.memory.onContainer = true;
            if (!container.store.getFreeCapacity()) return this.creep.idleFor(25);
        }

        const extractor = Game.getObjectById(this.creep.memory.extractor);
        if (!extractor) return this.creep.recycleCreep();
        if (extractor.cooldown && this.creep.pos.getRangeTo(extractor) < 2) {
            return this.creep.idleFor(extractor.cooldown - 1);
        }

        const mineral = Game.getObjectById(this.creep.memory.other && this.creep.memory.other.assignedMineral);
        if (!mineral) return this.creep.recycleCreep();
        switch (this.creep.harvest(mineral)) {
            case OK:
                this.creep.memory.other.stationary = true;
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(mineral);
                break;
            case ERR_NOT_FOUND:
                const {tryCreateConstructionSite} = require('planUtils');
                tryCreateConstructionSite(mineral.pos, STRUCTURE_EXTRACTOR);
                break;
        }
    }
}

profiler.registerClass(RoleMineralHarvester, 'MineralHarvester');
module.exports = RoleMineralHarvester;
