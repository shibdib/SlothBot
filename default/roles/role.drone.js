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

        if (this.creep.memory.task && this.taskedOut()) return;
        if ((threatLevel || this.creep.memory.currentTarget) && this.walling()) return;
        if (this.hauling()) return;
        if (this.building()) return;
        if (this.upgrading()) return;
        if ((this.room.level < 4 || this.creep.memory.destination) && this.upgrading(true)) return;
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
        if (!this.creep.memory.other) this.creep.memory.other = {};
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
            let source = Game.getObjectById(this.creep.memory.source);
            const sources = this.room.sources;

            // Re-evaluate source if: none assigned, current is empty while another has energy,
            // or periodic recheck while still traveling (don't interrupt active harvesting)
            const activelyHarvesting = source && source.energy > 0 && this.creep.pos.isNearTo(source);
            const needsReeval = !source
                || (source.energy === 0 && sources.some(s => s.energy > 0))
                || (!activelyHarvesting && Game.time % 25 === 0);

            if (needsReeval) {
                source = selectBestDroneSource(this.creep, sources);
                this.creep.memory.source = source ? source.id : undefined;
            }

            const intel = INTEL[this.room.name];
            if (source && (!intel?.owner || intel.owner === MY_USERNAME)) {
                this.creep.memory.harvest = true;
                this.creep.say('Harvest!', true);
                const result = this.creep.harvest(source);
                if (result === OK) {
                    this.creep.memory.other.stationary = true;
                } else if (result === ERR_NOT_IN_RANGE) {
                    this.creep.shibMove(source);
                } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                    if (sources.every(s => s.energy === 0)) {
                        // All sources empty — wait near the one regenerating soonest
                        const soonest = _.min(sources, s => s.ticksToRegeneration);
                        this.creep.memory.source = soonest.id;
                        this.creep.memory.other.stationary = this.creep.pos.isNearTo(soonest);
                        if (!this.creep.memory.other.stationary) this.creep.shibMove(soonest);
                    } else {
                        // This source is empty but another has energy — switch
                        delete this.creep.memory.source;
                    }
                }
                return true;
            }
        }

        // Remote mining ONLY if the room literally has 0 sources (e.g. corridors)
        if (this.room.sources.length === 0) {
            if (this.creep.memory.remoteMining || (Game.time % 20 === 0 && findRemoteSource(this.creep))) {
                this.creep.say('Remote!', true);
                if (this.creep.memory.remoteMining !== this.room.name) {
                    return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.remoteMining), {range: 15});
                }
            }
        }

        this.creep.idleFor(5);
    }

    hauling() {
        if (this.creep.memory.task && this.creep.memory.task !== 'haul') return false;
        const spawn = global.roomMySpawns ? global.roomMySpawns(this.room)[0] : this.room.find(FIND_MY_SPAWNS)[0];
        if (!this.room.controller || !this.room.controller.my || !spawn) return false;

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
        if (!this.creep.memory.other) this.creep.memory.other = {};
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
        const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
        if (!threatLevel && this.creep.memory.constructionSite) {
            const target = Game.getObjectById(this.creep.memory.constructionSite);
            if (target && (target.structureType === STRUCTURE_WALL || target.structureType === STRUCTURE_RAMPART)) {
                delete this.creep.memory.constructionSite;
                delete this.creep.memory.task;
                delete this.creep.memory.sitePos;
                delete this.creep.memory.targetHits;
            }
        }
        if (this.creep.memory.task || this.creep.constructionWork()) {
            if (this.creep.builderFunction()) {
                return true;
            }
        }
        return false;
    }

    walling() {
        const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
        if (!threatLevel && !this.creep.memory.currentTarget) return false;
        if (!this.room.controller || !this.room.controller.my) return false;

        if (!this.creep.memory.currentTarget || !Game.getObjectById(this.creep.memory.currentTarget)) {
            if (this.room.constructionSites.length) {
                const rampartSite = _.find(this.room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
                if (rampartSite && rampartSite.id) {
                    this.creep.memory.task = 'build';
                    this.creep.memory.constructionSite = rampartSite.id;
                    return this.building();
                }
            }

            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;

            const quadTrapWalls = new Set((this.room.memory.quadTrapWalls || []).map(p => `${p.x},${p.y}`));
            const barrierStructures = this.room.barriers.filter(s => {
                const cap = s.structureType === STRUCTURE_WALL && quadTrapWalls.has(`${s.pos.x},${s.pos.y}`) ? 20000 : 100000;
                return s.hits < cap;
            });

            if (!barrierStructures.length) return false;

            let target;
            if (threatLevel) {
                target = _.min(barrierStructures, 'hits');
            } else {
                const available = barrierStructures.filter(s =>
                    !this.room.myCreeps.some(c => c.memory.currentTarget === s.id && c.id !== this.creep.id)
                );
                if (available.length) {
                    const minHits = _.min(available, 'hits').hits;
                    const candidates = available.filter(s => s.hits <= minHits + 25000);
                    target = this.creep.pos.findClosestByRange(candidates);
                } else {
                    target = _.min(barrierStructures, 'hits');
                }
            }

            if (target) {
                this.creep.memory.currentTarget = target.id;
                this.creep.memory.task = 'waller';
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

        this.creep.memory.task = 'waller';
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

profiler.registerClass(RoleDrone, 'Drone');
module.exports = RoleDrone;

// Scores each source and picks the best for a drone to harvest from.
// Prefers sources with energy, avoids overcrowded spots, weights by distance.
function selectBestDroneSource(creep, sources) {
    if (!sources.length) return null;
    let best = null, bestScore = -Infinity;
    for (const source of sources) {
        const empty = source.energy === 0;
        const stationaryHarvester = creep.room.myCreeps.find(c => c.memory.role === 'stationaryHarvester' && c.memory.source === source.id);
        if (stationaryHarvester) continue; // Don't compete with stationary harvesters
        const adjacentDrones = source.pos.findInRange(FIND_MY_CREEPS, 1).filter(c => c.id !== creep.id).length;
        const distance = creep.pos.getRangeTo(source);
        // Heavy penalty for empty sources; moderate penalty per adjacent drone; mild penalty for distance
        const score = (empty ? -1000 : 0) - (adjacentDrones * 60) - (distance * 4);
        if (score > bestScore) {
            bestScore = score;
            best = source;
        }
    }
    return best;
}

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