/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleWaller {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        this.creep.say('🤖', true);
        if (this.houseKeeping()) return;
        if (!this.creep.memory.working) {
            if (this.creep.isFull) {
                this.creep.memory.working = true;
                return this.jobManager();
            }
            this.energyCollection();
        } else {
            this.jobManager();
        }
    }

    houseKeeping() {
        // SK Safety - Throttled
        if ((this.room.memory.sk || (INTEL[this.room.name] && INTEL[this.room.name].sk)) && this.creep.skSafety()) return true;

        // Boosting
        if (this.creep.tryToBoost()) return true;

        const usedCapacity = this.creep.store.getUsedCapacity();
        // If full clear memory
        if (this.creep.isFull) {
            delete this.creep.memory.energyDestination;
            delete this.creep.memory.source;
            delete this.creep.memory.harvest;
            delete this.creep.memory.remoteMining;
            this.creep.memory.working = true;
        } else if (usedCapacity === 0) {
            delete this.creep.memory.working;
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.task;
            delete this.creep.memory.targetWallHits;
        }

        // If damaged move to safety
        if (this.creep.hits < this.creep.hitsMax && (!this.creep.hasActiveBodyparts(WORK) || !this.creep.hasActiveBodyparts(CARRY))) return this.creep.goToHub();

        return false;
    }

    jobManager() {
        // If already tasked out
        if (this.creep.memory.task && this.taskedOut()) return;

        // Task priority
        if (this.walling()) return;
        if (this.building()) return;
        if (this.hauling()) return;

        // Maintenance: Strengthen barriers if nothing else to do (prevents idling)
        if (this.walling(true)) return;

        // Final fallback: Idle
        this.creep.memory.task = undefined;
        this.creep.idleFor(5);
    }

    taskedOut() {
        switch (this.creep.memory.task) {
            case 'build':
            case 'repair':
                return this.building();
            case 'haul':
                return this.hauling();
            case 'waller':
                return this.walling();
        }
        return false;
    }

    energyCollection() {
        this.creep.memory.other.stationary = undefined;
        this.creep.memory.working = undefined;
        this.creep.memory.constructionSite = undefined;
        this.creep.memory.task = undefined;

        if (this.creep.memory.energyDestination || this.creep.locateEnergy()) {
            this.creep.say('Energy!', true);
            return this.creep.withdrawResource();
        }

        this.creep.idleFor(5);
    }

    hauling() {
        if (this.creep.memory.task && this.creep.memory.task !== 'haul') return false;
        if (!this.room.controller || !this.room.controller.my) return false;

        const needsHaul = !this.room.myCreeps.some(c => c.memory.role === 'shuttle' || c.memory.role === 'hauler');

        if (this.creep.memory.task === 'haul' || (this.creep.isFull && needsHaul)) {
            this.creep.memory.task = 'haul';
            this.creep.say('Haul!', true);
            if (this.creep.memory.storageDestination || this.creep.haulerDelivery()) {
                const storageItem = Game.getObjectById(this.creep.memory.storageDestination);
                if (!storageItem) {
                    delete this.creep.memory.storageDestination;
                    return false;
                }
                const result = this.creep.transfer(storageItem, RESOURCE_ENERGY);
                if (result === OK) {
                    delete this.creep.memory.storageDestination;
                    delete this.creep.memory._shibMove;
                } else if (result === ERR_NOT_IN_RANGE) {
                    this.creep.shibMove(storageItem);
                } else {
                    delete this.creep.memory.storageDestination;
                }
                return true;
            } else {
                delete this.creep.memory.task;
            }
        }
        return false;
    }

    building() {
        if (this.creep.memory.task && this.creep.memory.task !== 'build' && this.creep.memory.task !== 'repair') return false;
        if (this.creep.memory.task || this.creep.constructionWork()) {
            if (this.creep.builderFunction()) {
                return true;
            }
        }
        return false;
    }

    walling(maintenance = false) {
        if (!this.creep.memory.currentTarget || !Game.getObjectById(this.creep.memory.currentTarget)) {
            // Check for ramparts that need to be built (priority over repairs)
            if (!maintenance && this.room.constructionSites.length) {
                const rampartSite = _.find(this.room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
                if (rampartSite && rampartSite.id) {
                    this.creep.memory.task = 'build';
                    this.creep.memory.constructionSite = rampartSite.id;
                    return this.building();
                }
            }

            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;

            let targetLimit = 100000;
            if (this.room.controller.level >= 8) targetLimit = 3000000;
            else if (this.room.controller.level >= 6) targetLimit = 1000000;

            if (maintenance && this.room.level === 8) targetLimit = RAMPART_HITS_MAX[this.room.level];

            const quadTrapWalls = new Set((this.room.memory.quadTrapWalls || []).map(p => `${p.x},${p.y}`));
            const barrierStructures = this.room.barriers.filter(s => {
                const cap = s.structureType === STRUCTURE_WALL && quadTrapWalls.has(`${s.pos.x},${s.pos.y}`) ? 20000 : targetLimit;
                return s.hits < cap;
            });

            if (!barrierStructures.length || !this.room.controller || !this.room.controller.my) return false;

            let target;
            const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
            if (threatLevel) {
                target = _.min(barrierStructures, 'hits');
            } else {
                // To avoid multiple wallers on the same wall unless necessary
                const available = barrierStructures.filter(s =>
                    !this.room.myCreeps.some(c => c.memory.currentTarget === s.id && c.id !== this.creep.id)
                );

                if (available.length) {
                    // Pick the closest of the lowest health ones to reduce travel jitter
                    const minHits = _.min(available, 'hits').hits;
                    const jitterThreshold = maintenance ? 100000 : 25000;
                    const candidates = available.filter(s => s.hits <= minHits + jitterThreshold);
                    target = this.creep.pos.findClosestByRange(candidates);
                } else {
                    // Fallback to absolute lowest if all are targeted
                    target = _.min(barrierStructures, 'hits');
                }
            }

            if (target) {
                this.creep.memory.currentTarget = target.id;
                this.creep.memory.task = "waller";
                // Increase the hit buffer for maintenance to reduce retargeting frequency
                if (maintenance) this.creep.memory.targetWallHits = target.hits + 100000;
            } else {
                return false;
            }
        }

        const target = Game.getObjectById(this.creep.memory.currentTarget);
        if (!target) {
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;
            return false;
        }

        this.creep.memory.task = "waller";
        if (!this.creep.memory.targetWallHits) {
            this.creep.memory.targetWallHits = Math.min(target.hits + 50000, RAMPART_HITS_MAX[this.room.controller.level] || 300000000);
        }

        this.creep.say(ICONS.castle, true);
        const result = this.creep.repair(target);
        if (result === OK) {
            if (target.hits >= this.creep.memory.targetWallHits) {
                delete this.creep.memory.currentTarget;
                delete this.creep.memory.targetWallHits;
            }
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(target, {range: 3});
        } else {
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;
        }
        return true;
    }
}

profiler.registerClass(RoleWaller, 'Waller');
module.exports = RoleWaller;