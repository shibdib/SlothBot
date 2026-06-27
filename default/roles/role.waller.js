/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {spawnEnergyState} = require('spawnFlow');

let barrierListTick = -1;
let barrierListCache = {};
let wallerTargetTick = -1;
let wallerTargetCache = {};

function getBarrierRepairList(room, maintenance) {
    const key = `${room.name}|${maintenance ? 1 : 0}`;
    if (barrierListTick !== Game.time) {
        barrierListTick = Game.time;
        barrierListCache = {};
    }
    if (barrierListCache[key]) return barrierListCache[key];

    const quadTrapWalls = new Set((room.memory.quadTrapWalls || []).map(p => `${p.x},${p.y}`));
    let targetLimit = 100000;
    const rcl = room.level;
    if (rcl >= 8) targetLimit = 10000000;
    else if (rcl >= 6) targetLimit = 5000000;
    if (spawnEnergyState(room) === 1) targetLimit = Math.min(targetLimit, 200000);
    if (maintenance && rcl === 8) targetLimit = RAMPART_HITS_MAX[rcl];

    barrierListCache[key] = room.barriers.filter((s) => {
        const cap = s.structureType === STRUCTURE_WALL && quadTrapWalls.has(`${s.pos.x},${s.pos.y}`) ? 20000 : targetLimit;
        return s.hits < cap;
    });
    return barrierListCache[key];
}

function getWallerTargetIds(roomName) {
    if (wallerTargetTick !== Game.time) {
        wallerTargetTick = Game.time;
        wallerTargetCache = {};
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (!c.my || c.memory.role !== 'waller' || !c.memory.currentTarget) continue;
            const colony = c.memory.colony;
            if (!wallerTargetCache[colony]) wallerTargetCache[colony] = new Set();
            wallerTargetCache[colony].add(c.memory.currentTarget);
        }
    }
    return wallerTargetCache[roomName] || null;
}

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

        // Construction sites before routine rampart grinding.
        const pendingBuilds = this.room.constructionSites.length > 0 || this.creep.memory.constructionSite;
        if (pendingBuilds && this.building()) return;

        if (this.walling()) return;
        if (this.building()) return;
        if (this.hauling()) return;

        // Maintenance: Strengthen barriers if nothing else to do (prevents idling)
        // Only in rich rooms; low-energy wallers (spawned at energyState=1) focus on normal (limited) walling.
        if (spawnEnergyState(this.room) >= 3 && this.walling(true)) return;

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
        if (!this.creep.memory.other) this.creep.memory.other = {};
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
        if (this.creep.memory.task === 'haul' && !needsHaul) {
            delete this.creep.memory.task;
            delete this.creep.memory.storageDestination;
            return false;
        }
        if (needsHaul && this.creep.isFull && this.barriersNeedUrgentRepair()) return false;

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
        if (this.barriersNeedUrgentRepair()) return false;
        if (this.creep.memory.task && this.creep.memory.task !== 'build' && this.creep.memory.task !== 'repair') return false;
        if (this.creep.memory.task || this.creep.constructionWork('barriers')) {
            if (this.creep.builderFunction()) {
                return true;
            }
        }
        return false;
    }

    barrierRepairCap(maintenance = false) {
        const rcl = this.room.level;
        let targetLimit = 100000;
        if (rcl >= 8) targetLimit = 10000000;
        else if (rcl >= 6) targetLimit = 5000000;
        if (spawnEnergyState(this.room) === 1) targetLimit = Math.min(targetLimit, 200000);
        if (maintenance && rcl === 8) targetLimit = RAMPART_HITS_MAX[rcl];
        return targetLimit;
    }

    barriersNeedingRepair(maintenance = false) {
        return getBarrierRepairList(this.room, maintenance);
    }

    barriersNeedUrgentRepair(maintenance = false) {
        if (!this.room.controller || !this.room.controller.my) return false;
        if (this.room.ramparts.some((s) => s.hits < SAFE_RAMPART_HITS)) return true;
        const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
        if (threatLevel && this.room.barriers.some((s) => s.hits < 25000)) return true;
        if (this.room.barriers.some((s) => s.structureType === STRUCTURE_WALL && s.hits < 5000)) return true;
        return false;
    }

    barriersNeedRepair(maintenance = false) {
        if (this.barriersNeedUrgentRepair(maintenance)) return true;
        return this.barriersNeedingRepair(maintenance).length > 0;
    }

    walling(maintenance = false) {
        if (!this.creep.memory.currentTarget || !Game.getObjectById(this.creep.memory.currentTarget)) {
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;

            const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;

            if (!maintenance && !this.barriersNeedUrgentRepair(maintenance) && this.room.constructionSites.length) {
                const barrierSites = this.room.constructionSites.filter(
                    (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL
                );
                const barrierSite = barrierSites.length ? this.creep.pos.findClosestByRange(barrierSites) : null;
                if (barrierSite && barrierSite.id) {
                    this.creep.memory.task = 'build';
                    this.creep.memory.constructionSite = barrierSite.id;
                    return this.building();
                }
            }

            const barrierStructures = this.barriersNeedingRepair(maintenance);

            // Repair existing barriers before new construction sites (planner keeps sites queued).
            if (barrierStructures.length && this.room.controller && this.room.controller.my) {
                let target;
                if (threatLevel) {
                    target = _.min(barrierStructures, 'hits');
                } else {
                    const claimed = getWallerTargetIds(this.room.name);
                    const available = barrierStructures.filter((s) =>
                        !claimed || !claimed.has(s.id) || this.creep.memory.currentTarget === s.id
                    );

                    if (available.length) {
                        const minHits = _.min(available, 'hits').hits;
                        const jitterThreshold = maintenance ? 100000 : 25000;
                        const candidates = available.filter((s) => s.hits <= minHits + jitterThreshold);
                        target = this.creep.pos.findClosestByRange(candidates);
                    } else {
                        target = _.min(barrierStructures, 'hits');
                    }
                }

                if (target) {
                    this.creep.memory.currentTarget = target.id;
                    this.creep.memory.task = 'waller';
                    if (target.structureType === STRUCTURE_RAMPART && target.hits < SAFE_RAMPART_HITS) {
                        this.creep.memory.targetWallHits = SAFE_RAMPART_HITS * 2;
                    } else if (maintenance) {
                        this.creep.memory.targetWallHits = target.hits + 100000;
                    } else {
                        delete this.creep.memory.targetWallHits;
                    }
                }
            }

            if (!this.creep.memory.currentTarget) return false;
        }

        const target = Game.getObjectById(this.creep.memory.currentTarget);
        if (!target) {
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;
            return false;
        }

        this.creep.memory.task = "waller";
        if (!this.creep.memory.targetWallHits) {
            if (target.structureType === STRUCTURE_RAMPART && target.hits < SAFE_RAMPART_HITS) {
                this.creep.memory.targetWallHits = SAFE_RAMPART_HITS;
            } else if (target.structureType === STRUCTURE_WALL) {
                this.creep.memory.targetWallHits = Math.min(
                    target.hits + 50000,
                    this.barrierRepairCap(maintenance),
                    RAMPART_HITS_MAX[this.room.level] || 300000000
                );
            } else {
                this.creep.memory.targetWallHits = Math.min(target.hits + 50000, RAMPART_HITS_MAX[this.room.level] || 300000000);
            }
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