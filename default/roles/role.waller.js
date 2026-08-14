/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {spawnEnergyState} = require('spawnFlow');

let barrierListTick = -1;
let barrierListCache = {};
let wallerTargetTick = -1;
let wallerTargetCache = {};
let urgentTick = -1;
const urgentCache = {};

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

function barriersNeedUrgentRepair(room) {
    if (!room.controller || !room.controller.my) return false;
    if (urgentTick !== Game.time) {
        urgentTick = Game.time;
        for (const key in urgentCache) delete urgentCache[key];
    }
    if (urgentCache[room.name] !== undefined) return urgentCache[room.name];

    let urgent = room.ramparts.some((s) => s.hits < SAFE_RAMPART_HITS);
    if (!urgent) {
        const threatLevel = (INTEL[room.name] && INTEL[room.name].threatLevel) || 0;
        if (threatLevel) urgent = room.barriers.some((s) => s.hits < 25000);
        if (!urgent) urgent = room.barriers.some((s) => s.structureType === STRUCTURE_WALL && s.hits < 5000);
    }
    urgentCache[room.name] = urgent;
    return urgent;
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
        if (this.creep.memory.task && this.taskedOut()) return;

        const pendingBuilds = this.room.constructionSites.length > 0 || this.creep.memory.constructionSite;
        if (pendingBuilds && this.building()) return;

        if (this.walling()) return;
        if (this.building()) return;
        if (this.hauling()) return;

        if (spawnEnergyState(this.room) >= 3 && this.walling(true)) return;

        this.creep.memory.task = undefined;
        this.creep.idleFor(5);
    }

    taskedOut() {
        switch (this.creep.memory.task) {
            case 'build':
            case 'repair':
                return this.continueBuild();
            case 'haul':
                return this.continueHaul();
            case 'waller':
                return this.continueWall();
        }
        return false;
    }

    continueBuild() {
        return this.creep.builderFunction();
    }

    continueHaul() {
        const storageItem = Game.getObjectById(this.creep.memory.storageDestination);
        if (!storageItem) {
            delete this.creep.memory.storageDestination;
            delete this.creep.memory.task;
            return false;
        }
        const result = this.creep.transfer(storageItem, RESOURCE_ENERGY);
        if (result === OK) {
            delete this.creep.memory.storageDestination;
            this.creep.clearShibMove();
            return false;
        }
        if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(storageItem);
            return true;
        }
        delete this.creep.memory.storageDestination;
        return false;
    }

    continueWall(maintenance = false) {
        const target = Game.getObjectById(this.creep.memory.currentTarget);
        if (!target) {
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;
            delete this.creep.memory.task;
            return false;
        }

        this.creep.memory.task = 'waller';
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
                delete this.creep.memory.task;
                return false;
            }
            return true;
        }
        if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(target, {range: 3});
            return true;
        }
        delete this.creep.memory.currentTarget;
        delete this.creep.memory.targetWallHits;
        delete this.creep.memory.task;
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
        if (needsHaul && this.creep.isFull && barriersNeedUrgentRepair(this.room)) return false;

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
                    this.creep.clearShibMove();
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
        if (barriersNeedUrgentRepair(this.room)) return false;
        if (this.creep.memory.task && this.creep.memory.task !== 'build' && this.creep.memory.task !== 'repair') return false;
        if (this.creep.memory.constructionSite) return this.continueBuild();
        if (this.creep.constructionWork('barriers') && this.creep.builderFunction()) return true;
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
        return barriersNeedUrgentRepair(this.room);
    }

    barriersNeedRepair(maintenance = false) {
        if (this.barriersNeedUrgentRepair(maintenance)) return true;
        return this.barriersNeedingRepair(maintenance).length > 0;
    }

    walling(maintenance = false) {
        if (this.creep.memory.currentTarget && Game.getObjectById(this.creep.memory.currentTarget)) {
            return this.continueWall(maintenance);
        }

        delete this.creep.memory.currentTarget;
        delete this.creep.memory.targetWallHits;

        const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;

        if (!maintenance && !barriersNeedUrgentRepair(this.room) && this.room.constructionSites.length) {
            const barrierSites = this.room.constructionSites.filter(
                (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL
            );
            const barrierSite = barrierSites.length ? this.creep.pos.findClosestByRange(barrierSites) : null;
            if (barrierSite && barrierSite.id) {
                this.creep.memory.task = 'build';
                this.creep.memory.constructionSite = barrierSite.id;
                return this.continueBuild();
            }
        }

        const barrierStructures = this.barriersNeedingRepair(maintenance);

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
        return this.continueWall(maintenance);
    }
}

profiler.registerClass(RoleWaller, 'Waller');
module.exports = RoleWaller;