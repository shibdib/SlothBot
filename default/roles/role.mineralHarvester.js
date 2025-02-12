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
        if (this.creep.tryToBoost(['harvest'])) return true;
        // Check if mineral depleted
        if (this.creep.memory.other.assignedMineral && Game.getObjectById(this.creep.memory.other.assignedMineral).mineralAmount === 0) {
            log.a(this.room.name + ' supply of ' + Game.getObjectById(this.creep.memory.other.assignedMineral).mineralType + ' has been depleted.');
            return this.creep.suicide();
        }
    }

    setExtractor() {
        let extractor = this.room.structures.filter((s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
        if (extractor) {
            this.creep.memory.extractor = extractor.id;
        } else {
            this.creep.suicide();
        }
    }

    extractResource() {
        if (!this.creep.memory.onContainer) {
            let container = Game.getObjectById(this.room.memory.extractorContainer);
            if (container) {
                if (this.creep.pos.getRangeTo(container)) return this.creep.shibMove(container, {range: 0}); else this.creep.memory.onContainer = true;
            } else {
                this.creep.memory.onContainer = true;
            }
        } else if (Math.random() > 0.9) this.creep.memory.onContainer = undefined;
        let extractor = Game.getObjectById(this.creep.memory.extractor);
        if (!extractor) return this.creep.suicide();
        if (Game.getObjectById(this.room.memory.extractorContainer) && _.sum(Game.getObjectById(this.room.memory.extractorContainer).store) === 2000
            && !this.creep.pos.getRangeTo(Game.getObjectById(this.room.memory.extractorContainer))) return this.creep.idleFor(25);
        if (extractor.cooldown && extractor.pos.getRangeTo(this.creep) < 2) {
            this.creep.idleFor(extractor.cooldown - 1)
        } else {
            let mineral = Game.getObjectById(this.creep.memory.other.assignedMineral);
            switch (this.creep.harvest(mineral)) {
                case OK:
                    this.creep.memory.other.stationary = true;
                    break;
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(mineral);
                    break;
                case ERR_NOT_FOUND:
                    mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
                    break;
            }
        }
    }
}

profiler.registerClass(RoleMineralHarvester, 'MineralHarvester');
module.exports = RoleMineralHarvester;
