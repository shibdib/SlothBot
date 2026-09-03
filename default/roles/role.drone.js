/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {isCriticalBuildStructureType, roomHasCriticalBuildSites} = require('bodyHelpers');

class RoleDrone {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        this.creep.say('🤖', true);
        if (this.houseKeeping()) return;
        const energy = this.creep.store.getUsedCapacity(RESOURCE_ENERGY) || 0;
        if (energy === 0) {
            this.creep.memory.working = undefined;
            this.energyCollection();
            return;
        }
        if (!this.creep.memory.working) {
            if (this.creep.isFull) this.creep.memory.working = true;
            else {
                this.energyCollection();
                return;
            }
        }
        this.jobManager();
    }

    houseKeeping() {
        // SK Safety - Throttled
        if ((this.room.memory.sk || (INTEL[this.room.name] && INTEL[this.room.name].sk)) && this.creep.skSafety()) return true;

        // Boosting
        if (this.creep.tryToBoost()) return true;

        const usedCapacity = this.creep.store.getUsedCapacity();
        if (usedCapacity === 0) {
            delete this.creep.memory.working;
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.task;
            delete this.creep.memory.targetWallHits;
        } else if (this.creep.isFull) {
            delete this.creep.memory.energyDestination;
            delete this.creep.memory.source;
            delete this.creep.memory.harvest;
            delete this.creep.memory.remoteMining;
            this.creep.memory.working = true;
        }

        // Adjacent spawn/extension fill. Do not return — transfer and move are
        // the same tick; returning here glued drones to the bunker.
        if (this.creep.store[RESOURCE_ENERGY]) this.creep.opportunisticFill();

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

        if (controllerDowngradeUrgent(this.room) && this.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            if (this.creep.memory.task && this.creep.memory.task !== 'upgrade') clearDroneTaskForUpgrade(this.creep);
            if (this.upgrading(true)) return;
        }

        if (roomHasCriticalBuildSites(this.room) && !controllerDowngradeUrgent(this.room)) {
            if (this.creep.memory.task === 'upgrade') {
                delete this.creep.memory.task;
            }
            if (this.creep.memory.constructionSite) {
                const current = Game.getObjectById(this.creep.memory.constructionSite);
                if (current && !isCriticalBuildStructureType(current.structureType)) {
                    delete this.creep.memory.constructionSite;
                    delete this.creep.memory.task;
                    delete this.creep.memory.sitePos;
                }
            }
        }

        if (shouldInterruptForSpawnFill(this.creep, this.room)) {
            delete this.creep.memory.task;
            delete this.creep.memory.constructionSite;
            delete this.creep.memory.sitePos;
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;
        }

        if (this.creep.memory.task && this.taskedOut()) return;

        // Fill spawn/extensions before sites until a live shuttle or hauler exists.
        if (this.hauling()) return;

        const hasBuilderWork = this.room.constructionSites.some(s =>
            s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART);
        if (hasBuilderWork && this.creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && this.building()) return;

        if ((threatLevel || this.creep.memory.currentTarget) && (!this.room.controller || !this.room.controller.safeMode) && this.walling()) return;
        if (this.building()) return;
        if (this.upgrading()) return;
        if ((shouldLeftoverUpgrade(this.room) || this.creep.memory.destination) && this.upgrading(true)) return;
        this.creep.memory.task = undefined;
        this.creep.idleFor(5);
    }

    taskedOut() {
        switch (this.creep.memory.task) {
            case 'upgrade':
                return this.continueUpgrade();
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

    continueUpgrade() {
        const controller = this.room.controller;
        if (!controller || !controller.my || controller.upgradeBlocked || controller.level === 8) {
            delete this.creep.memory.task;
            return false;
        }
        if (!this.creep.memory.other) this.creep.memory.other = {};
        this.creep.say('Praise!', true);
        const result = this.creep.upgradeController(controller);
        if (result === OK) {
            this.creep.memory.other.stationary = true;
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(controller, {range: 3});
        } else {
            delete this.creep.memory.task;
            return false;
        }
        return true;
    }

    continueWall() {
        const target = Game.getObjectById(this.creep.memory.currentTarget);
        if (!target) {
            delete this.creep.memory.currentTarget;
            delete this.creep.memory.targetWallHits;
            delete this.creep.memory.task;
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

        // Always re-validate via locateEnergy — a cached id can point at an emptied store.
        if (this.creep.locateEnergy()) {
            this.creep.say('Energy!', true);
            return this.creep.withdrawResource();
        }

        // Emergency harvesting if no storage or low on energy
        if (!this.room.storage || this.room.storage.store.getUsedCapacity(RESOURCE_ENERGY) < 1000) {
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
        if (!this.room.controller || !this.room.controller.my) return false;
        if (hasLiveHauler(this.room)) {
            if (this.creep.memory.task === 'haul') {
                delete this.creep.memory.task;
                delete this.creep.memory.storageDestination;
            }
            return false;
        }
        if (!this.creep.store.getUsedCapacity(RESOURCE_ENERGY)) return false;
        if (!spawnEnergyNeedsFill(this.room)) {
            if (this.creep.memory.task === 'haul') {
                delete this.creep.memory.task;
                delete this.creep.memory.storageDestination;
            }
            return false;
        }

        const target = pickSpawnFillTarget(this.creep);
        if (!target) {
            delete this.creep.memory.task;
            delete this.creep.memory.storageDestination;
            return false;
        }

        this.creep.memory.task = 'haul';
        this.creep.say('Haul!', true);
        const result = this.creep.transfer(target, RESOURCE_ENERGY);
        if (result === OK) {
            delete this.creep.memory.storageDestination;
            this.creep.clearShibMove();
            return true;
        }
        if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(target);
            return true;
        }
        delete this.creep.memory.storageDestination;
        return false;
    }

    upgrading(force) {
        if (!force && this.creep.memory.task && this.creep.memory.task !== 'upgrade') return false;

        const controller = this.room.controller;
        if (!controller || !controller.my || controller.upgradeBlocked || controller.level === 8) return false;

        if (!force) {
            if (!controllerDowngradeUrgent(this.room) && !this.creep.memory.task) return false;

            // Ignore reboot / 1W upgraders — they starve the 405k RCL4→5 dump.
            if (hasDedicatedUpgrader(this.room)) {
                if (this.creep.memory.task === 'upgrade') delete this.creep.memory.task;
                return false;
            }
        }

        if (!this.creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
            delete this.creep.memory.task;
            delete this.creep.memory.working;
            return false;
        }
        this.creep.memory.task = 'upgrade';
        this.creep.say('Praise!', true);
        if (!this.creep.memory.other) this.creep.memory.other = {};
        const result = this.creep.upgradeController(this.room.controller);
        if (result === OK) {
            this.creep.memory.other.stationary = true;
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(this.room.controller, {range: 3});
        } else if (result === ERR_NOT_ENOUGH_ENERGY) {
            delete this.creep.memory.task;
            delete this.creep.memory.working;
            return false;
        }
        return true;
    }

    building() {
        if (this.creep.memory.task && this.creep.memory.task !== 'build' && this.creep.memory.task !== 'repair') return false;
        if (this.creep.memory.constructionSite) return this.continueBuild();
        if (this.creep.constructionWork() && this.creep.builderFunction()) return true;
        return false;
    }

    walling() {
        const threatLevel = (INTEL[this.room.name] && INTEL[this.room.name].threatLevel) || 0;
        if (!threatLevel && !this.creep.memory.currentTarget) return false;
        if (!this.room.controller || !this.room.controller.my) return false;

        if (this.creep.memory.currentTarget && Game.getObjectById(this.creep.memory.currentTarget)) {
            return this.continueWall();
        }

        if (this.room.constructionSites.length) {
            const rampartSite = _.find(this.room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL);
            if (rampartSite && rampartSite.id) {
                this.creep.memory.task = 'build';
                this.creep.memory.constructionSite = rampartSite.id;
                return this.continueBuild();
            }
        }

        delete this.creep.memory.currentTarget;
        delete this.creep.memory.targetWallHits;

        const quadTrapWalls = new Set((this.room.memory.quadTrapWalls || []).map(p => `${p.x},${p.y}`));
        const combatFaces = new Set((this.room.memory.quadTrapCombatFaces || []).map(p => `${p.x},${p.y}`));
        const barrierStructures = this.room.barriers.filter(s => {
            const trapKey = `${s.pos.x},${s.pos.y}`;
            const tripwire = s.structureType === STRUCTURE_WALL
                && quadTrapWalls.has(trapKey)
                && !combatFaces.has(trapKey);
            const cap = tripwire ? 20000 : 100000;
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

        if (!target) return false;
        this.creep.memory.currentTarget = target.id;
        this.creep.memory.task = 'waller';
        return this.continueWall();
    }
}

profiler.registerClass(RoleDrone, 'Drone');
module.exports = RoleDrone;

function hasLiveHauler(room) {
    const creeps = room.myCreeps || [];
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (!c || c.spawning || !c.memory) continue;
        if (c.memory.role === 'shuttle' || c.memory.role === 'hauler') return true;
    }
    return false;
}

function spawnEnergyNeedsFill(room) {
    const cap = room.energyCapacityAvailable || 0;
    const avail = room.energyAvailable || 0;
    if (cap <= SPAWN_ENERGY_CAPACITY) return avail < cap;
    // Opportunistic fill tops off while walking. Only pull every drone off
    // build/upgrade when the spawn cannot form a real body.
    return avail < Math.max(SPAWN_ENERGY_CAPACITY + 50, cap * 0.35);
}

function pickSpawnFillTarget(creep) {
    const destId = creep.memory.storageDestination;
    if (destId) {
        const dest = Game.getObjectById(destId);
        if (dest && dest.store && dest.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            && (dest.structureType === STRUCTURE_SPAWN || dest.structureType === STRUCTURE_EXTENSION)) {
            return dest;
        }
        delete creep.memory.storageDestination;
    }
    const sinks = (creep.room.spawns || []).concat(creep.room.extensions || []);
    const open = [];
    for (let i = 0; i < sinks.length; i++) {
        const s = sinks[i];
        if (s && s.my && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0) open.push(s);
    }
    if (!open.length) return null;
    const closest = creep.pos.findClosestByRange(open);
    if (closest) creep.memory.storageDestination = closest.id;
    return closest;
}

function shouldInterruptForSpawnFill(creep, room) {
    if (hasLiveHauler(room)) return false;
    if (!creep.store.getUsedCapacity(RESOURCE_ENERGY)) return false;
    if (!spawnEnergyNeedsFill(room)) return false;
    const task = creep.memory.task;
    return task === 'build' || task === 'repair' || task === 'upgrade' || task === 'waller';
}

function shouldLeftoverUpgrade(room) {
    if (!room || !room.controller || !room.controller.my) return false;
    if (room.storage) return false;
    return room.controller.level < 6;
}

function hasDedicatedUpgrader(room) {
    const container = global.resolveControllerContainer && global.resolveControllerContainer(room);
    const link = room.memory && room.memory.controllerLink && Game.getObjectById(room.memory.controllerLink);
    if (!container && !link) return false;
    const creeps = room.myCreeps || [];
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (!c || c.spawning || !c.memory || c.memory.role !== 'upgrader') continue;
        const work = c.getActiveBodyparts ? c.getActiveBodyparts(WORK) : 0;
        if (work >= 5) return true;
    }
    return false;
}

function controllerDowngradeUrgent(room) {
    const controller = room.controller;
    if (!controller || !controller.my) return false;
    const ticks = controller.ticksToDowngrade;
    if (typeof ticks !== 'number') return false;
    return ticks < CONTROLLER_DOWNGRADE[controller.level] * 0.9;
}

function clearDroneTaskForUpgrade(creep) {
    delete creep.memory.task;
    delete creep.memory.constructionSite;
    delete creep.memory.currentTarget;
    delete creep.memory.targetWallHits;
    delete creep.memory.storageDestination;
}

// Scores each source and picks the best for a drone to harvest from.
// Prefers sources with energy, avoids overcrowded spots, weights by distance.
function selectBestDroneSource(creep, sources) {
    if (!sources.length) return null;
    let best = null, bestScore = -Infinity;
    for (const source of sources) {
        const empty = source.energy === 0;
        const stationaryHarvester = creep.room.myCreeps.find(c => {
            if (c.memory.role !== 'stationaryHarvester') return false;
            const assigned = (c.memory.other && c.memory.other.source) || c.memory.source;
            if (assigned !== source.id) return false;
            return c.memory.onContainer || c.pos.isNearTo(source);
        });
        if (stationaryHarvester) continue;
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