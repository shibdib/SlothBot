/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleDrone {
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
        
        // Handle returning to overlord
        if (this.creep.memory.destination && this.room.name !== this.creep.memory.destination && !this.creep.memory.remoteMining && !this.creep.memory.energyDestination) {
            const destination = new RoomPosition(25, 25, this.creep.memory.destination);
            this.creep.shibMove(destination, {range: 20});
            return true;
        }

        // Handle case of carry something besides energy
        if (usedCapacity > this.creep.store[RESOURCE_ENERGY]) {
            const dropOff = this.room.storage || this.room.terminal;
            if (dropOff) {
                for (let resourceType in this.creep.store) {
                    if (resourceType === RESOURCE_ENERGY) continue;
                    const result = this.creep.transfer(dropOff, resourceType);
                    if (result === OK) return true;
                    if (result === ERR_NOT_IN_RANGE) {
                        this.creep.shibMove(dropOff);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    jobManager() {
        const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
        // If under attack, waller else chance to be a waller
        if ((threatLevel || this.creep.memory.currentTarget) && this.walling()) return;
        
        // If already tasked out
        if (this.creep.memory.task) {
            if (this.taskedOut()) return;
        }

        // Task priority
        if (this.hauling()) return;
        if (this.building()) return;
        if (this.walling()) return;
        if (this.upgrading()) return;

        // Maintenance: Strengthen barriers if nothing else to do (prevents idling)
        if (this.walling(true)) return;

        // Fallback: Upgrade if no upgrader exists
        if (this.room.level < 4 && this.upgrading(true)) return;

        // Final fallback: Idle
        this.creep.memory.task = undefined;
        this.creep.idleFor(5);
    }

    taskedOut() {
        switch (this.creep.memory.task) {
            case 'upgrade':
                return this.upgrading();
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

        // Emergency harvesting if no storage or low on energy
        const hasStorage = !!this.room.storage;
        if (!hasStorage || this.room.energyAvailable < 300) {
            let source = Game.getObjectById(this.creep.memory.source) || this.creep.pos.getClosestSource();
            if (source && (!INTEL[this.room.name].owner || INTEL[this.room.name].owner === MY_USERNAME)) {
                this.creep.memory.harvest = true;
                this.creep.say('Harvest!', true);
                this.creep.memory.source = source.id;
                const result = this.creep.harvest(source);
                if (result === OK) {
                    this.creep.memory.other.stationary = true;
                } else if (result === ERR_NOT_IN_RANGE) {
                    this.creep.shibMove(source);
                } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                    delete this.creep.memory.source;
                }
                return true;
            }
        }

        // Remote mining if nothing local
        if (this.creep.memory.remoteMining || (Game.time % 20 === 0 && findRemoteSource(this.creep))) {
            this.creep.say('Remote!', true);
            if (this.creep.memory.remoteMining !== this.room.name) {
                return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.remoteMining), {range: 15});
            }
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

    upgrading(force) {
        if (this.creep.memory.task && this.creep.memory.task !== 'upgrade') return false;

        // Drones should not upgrade if a specialized upgrader exists
        if (this.room.myCreeps.some(c => c.memory.role === 'upgrader') && !force) {
            if (this.creep.memory.task === 'upgrade') delete this.creep.memory.task;
            return false;
        }

        if (!force) {
            const controller = this.room.controller;
            if (!controller || !controller.my || controller.upgradeBlocked || controller.level === 8) return false;

            // Throttled check for downgrade risk
            if (!controller.ticksToDowngrade || (controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[controller.level] * 0.9 && !this.creep.memory.task)) return false;
        }

        this.creep.memory.task = 'upgrade';
        this.creep.say('Praise!', true);
        const result = this.creep.upgradeController(this.room.controller);
        if (result === OK) {
            this.creep.memory.other.stationary = true;
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(this.room.controller, {range: 3});
        }
        return true;
    }

    building() {
        if (this.creep.memory.task && this.creep.memory.task !== 'build' && this.creep.memory.task !== 'repair') return false;
        if (this.creep.memory.task || this.creep.constructionWork()) {
            if (this.creep.builderFunction()) {
                this.creep.memory.other.stationary = true;
            }
            return true;
        }
        return false;
    }

    walling(maintenance = false) {
        if (!this.creep.memory.currentTarget || !Game.getObjectById(this.creep.memory.currentTarget)) {
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;

            const targetLimit = maintenance ? 300000000 : (this.room.memory.barrierHitsTarget || 100000);
            const barrierStructures = this.room.structures.filter(s =>
                (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
                s.hits < targetLimit
            );

            if (!barrierStructures.length || !this.room.controller || !this.room.controller.my) return false;

            let target;
            const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
            if (threatLevel) {
                target = _.min(barrierStructures, 'hits');
            } else {
                target = _.min(barrierStructures.filter(s =>
                    !this.room.myCreeps.some(c => c.memory.currentTarget === s.id && c.id !== this.creep.id)
                ), 'hits');
            }

            if (target) {
                this.creep.memory.currentTarget = target.id;
                // For maintenance mode, set a significant boost to hits to prevent constant retargeting
                if (maintenance) this.creep.memory.targetWallHits = target.hits + 50000;
            } else {
                return false;
            }
        }

        const target = Game.getObjectById(this.creep.memory.currentTarget);
        if (target) {
            this.creep.memory.task = "waller";
            if (!this.creep.memory.targetWallHits) {
                this.creep.memory.targetWallHits = Math.min(target.hits + 25000, RAMPART_HITS_MAX[this.room.controller.level] || 300000000);
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
        return false;
    }
}

profiler.registerClass(RoleDrone, 'Drone');
module.exports = RoleDrone;

function findRemoteSource(creep) {
    let adjacent = _.filter(Game.map.describeExits(creep.pos.roomName), (r) => INTEL[r] &&
        ((!INTEL[r].owner || INTEL[r].owner === MY_USERNAME)
            && (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME)
            && !INTEL[r].sk && INTEL[r].sources));
    if (adjacent.length) {
        creep.memory.remoteMining = _.sample(adjacent);
        return true;
    }
}