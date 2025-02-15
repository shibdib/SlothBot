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
        if (this.houseKeeping()) return;
        if (!this.creep.memory.working) {
            if (this.creep.isFull) return this.creep.memory.working = true;
            this.energyCollection();
        } else {
            this.jobManager();
        }
    }

    houseKeeping() {
        if (this.creep.tryToBoost([WORK])) return true;
        // Handle remote drones overlord change
        if (this.creep.memory.destination && this.creep.memory.colony !== this.creep.memory.destination) this.creep.memory.colony = this.creep.memory.destination;
        // If full clear memory
        if (this.creep.isFull && !this.creep.memory.stationaryHarvester) {
            this.creep.memory.source = undefined;
            this.creep.memory.harvest = undefined;
            this.creep.memory.remoteMining = undefined;
            this.creep.memory.source = undefined;
            this.creep.memory.energyDestination = undefined;
            this.creep.memory.working = true;
        } else if (!this.creep.store[RESOURCE_ENERGY]) {
            this.creep.memory.working = undefined;
            this.creep.memory.currentTarget = undefined;
            this.creep.memory.task = undefined;
            this.creep.memory.targetWallHits = undefined;
        }
        // If damaged move to safety
        if (!this.creep.getActiveBodyparts(WORK) || !this.creep.getActiveBodyparts(CARRY)) return this.creep.goToHub();
        // Handle returning to overlord
        if (this.room.name !== this.creep.memory.colony && !this.creep.memory.remoteMining && !this.creep.memory.energyDestination) {
            this.creep.memory.energyDestination = undefined;
            this.creep.goToHub();
            return true;
        }
        // Handle case of carry something besides energy
        if (_.sum(this.creep.store) > this.creep.store[RESOURCE_ENERGY]) {
            for (let resourceType in this.creep.store) {
                switch (this.creep.transfer(this.room.storage || this.room.terminal, resourceType)) {
                    case OK:
                        return;
                    case ERR_NOT_IN_RANGE:
                        this.creep.shibMove(this.room.storage || this.room.terminal);
                        return true;
                }
            }
        }
    }

    jobManager() {
        // If under attack, waller else chance to be a waller
        if ((INTEL[this.room.name].threatLevel || this.creep.memory.currentTarget) && this.walling()) return;
        // If already tasked out
        if (this.creep.memory.task) {
            if (this.taskedOut()) return;
        }
        // If praiser needed praise
        if (this.upgrading()) return;
        // If haulers needed haul
        if (this.hauling()) return;
        // If builder needed build
        if (this.building()) return;
        // If walls to repair
        if (this.walling()) return;
        // If nothing else to do upgrade
        if (this.upgrading(true)) return;
        // Otherwise idle
        else {
            this.creep.memory.task = undefined;
            this.creep.idleFor(5);
        }
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
    }

    energyCollection() {
        this.creep.memory.other.stationary = undefined;
        this.creep.memory.working = undefined;
        this.creep.memory.constructionSite = undefined;
        this.creep.memory.task = undefined;
        let spawn = _.find(this.room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_SPAWN);
        if (this.creep.memory.energyDestination || this.creep.locateEnergy()) {
            this.creep.say('Energy!', true);
            this.creep.withdrawResource();
        } else if (!spawn || !this.room.storage) {
            let source = Game.getObjectById(this.creep.room.memory.droneSource) || Game.getObjectById(this.creep.memory.source) || this.creep.pos.getClosestSource();
            if (source && (!INTEL[this.room.name].owner || INTEL[this.room.name].owner === MY_USERNAME) && (!INTEL[this.room.name].reservation || INTEL[this.room.name].reservation === MY_USERNAME)) {
                this.creep.room.memory.droneSource = source.id;
                this.creep.memory.harvest = true;
                // Set a stationary harvester on new spawns
                if (!spawn && !_.find(this.room.myCreeps, (c) => c.id !== this.creep.id && c.memory.stationaryHarvester) && _.find(this.room.myCreeps, (c) => c.id !== this.creep.id && c.memory.role === 'drone')) this.creep.memory.stationaryHarvester = true;
                this.creep.say('Harvest!', true);
                this.creep.memory.source = source.id;
                switch (this.creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        this.creep.memory.other.stationary = undefined;
                        this.creep.shibMove(source);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.creep.memory.source = undefined;
                        break;
                    case OK:
                        this.creep.memory.other.stationary = true;
                        break;
                }
            } else {
                if (this.creep.memory.remoteMining || findRemoteSource(this.creep)) {
                    this.creep.say('Remote!', true);
                    if (this.creep.memory.remoteMining !== this.room.name) return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.remoteMining), {range: 15}); else this.creep.idleFor(5);
                } else {
                    delete this.creep.memory.harvest;
                    this.creep.idleFor(5);
                }
            }
        } else {
            this.creep.idleFor(5);
        }
    }

    hauling() {
        if (this.creep.memory.task && this.creep.memory.task !== 'haul') return;
        if (!this.room.controller || !this.room.controller.owner || this.room.controller.owner.username !== MY_USERNAME) return false;
        let haulers = _.filter(this.room.myCreeps, (c) => c.memory && ((c.memory.role === 'drone' && c.memory.task === 'haul') || c.memory.role === 'hauler' || c.memory.role === 'shuttle')).length < 1;
        let needyTower = _.filter(this.room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * 0.1).length > 0;
        if (this.creep.memory.task === 'haul' || (this.room.level <= 4 && this.creep.isFull && (haulers || needyTower) && !this.creep.memory.task && (this.room.energyAvailable < this.room.energyCapacityAvailable || needyTower))) {
            this.creep.memory.task = 'haul';
            this.creep.say('Haul!', true);
            if (this.creep.memory.storageDestination || this.creep.haulerDelivery()) {
                let storageItem = Game.getObjectById(this.creep.memory.storageDestination);
                if (!storageItem) return delete this.creep.memory.storageDestination;
                switch (this.creep.transfer(storageItem, RESOURCE_ENERGY)) {
                    case OK:
                        delete this.creep.memory.storageDestination;
                        delete this.creep.memory._shibMove;
                        break;
                    case ERR_NOT_IN_RANGE:
                        this.creep.shibMove(storageItem);
                        break;
                    case ERR_FULL || ERR_INVALID_TARGET:
                        delete this.creep.memory.storageDestination;
                        delete this.creep.memory._shibMove;
                        if (storageItem.memory) delete storageItem.memory.deliveryIncoming;
                        break;
                }
            } else if (this.room.energyAvailable === this.room.energyCapacityAvailable) {
                this.creep.memory.task = undefined;
            }
            return true;
        }
    }

    upgrading(force) {
        if (this.creep.memory.task && this.creep.memory.task !== 'upgrade') return;
        if (!force) {
            let controllerCheck = !this.room.controller || !this.room.controller.owner || this.room.controller.owner.username !== MY_USERNAME
                || this.room.controller.upgradeBlocked || this.room.controller.level === 8 || !this.room.controller.ticksToDowngrade || this.room.controller.ticksToDowngrade > 3000;
            if (controllerCheck) {
                this.creep.memory.task = undefined;
                return false;
            }
        }
        this.creep.memory.task = 'upgrade';
        this.creep.say('Praise!', true);
        switch (this.creep.upgradeController(this.room.controller)) {
            case OK:
                this.creep.memory.other.stationary = true;
                delete this.creep.memory._shibMove;
                break;
            case ERR_NOT_IN_RANGE:
                this.creep.shibMove(this.room.controller, {range: 3});
        }
        return true;
    }

    building() {
        if (this.creep.memory.task && this.creep.memory.task !== 'build' && this.creep.memory.task !== 'repair') return;
        if ((this.creep.memory.task === 'build' || this.creep.memory.task === 'repair') || (this.creep.memory.constructionSite || this.creep.constructionWork())) {
            if (this.creep.builderFunction()) {
                this.creep.memory.other.stationary = true;
            }
            return true;
        }
    }

    walling() {
        if (!this.creep.memory.currentTarget || !Game.getObjectById(this.creep.memory.currentTarget)) {
            // Reset target if it's null or doesn't exist
            this.creep.memory.currentTarget = undefined;
            this.creep.memory.targetWallHits = undefined;

            let barrierStructures = this.room.find(FIND_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
                    !_.find(this.room.myCreeps, c => c.memory.currentTarget === s.id)
            });

            if (!barrierStructures.length || !this.room.controller ||
                (this.room.controller.owner && this.room.controller.owner.username !== MY_USERNAME)) {
                return false;
            }

            let target;

            // Handle nuke scenarios
            if (this.room.memory.nuke) {
                let nukeRamparts = barrierStructures.filter(s =>
                    s.structureType === STRUCTURE_RAMPART &&
                    s.pos.findInRange(FIND_NUKES, 5).length > 0
                );
                if (nukeRamparts.length) {
                    target = _.min(nukeRamparts, 'hits');
                }
            }

            // Handle immediate threat from hostile creeps
            if (!target && INTEL[this.room.name].threatLevel) {
                let hostileTargets = barrierStructures.filter(s =>
                    s.pos.findInRange(this.room.hostileCreeps.filter(c =>
                        c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)
                    ), 5).length > 0
                );
                if (hostileTargets.length) {
                    target = _.min(hostileTargets, 'hits');
                }
            }

            // General maintenance
            if (!target) {
                target = _.min(barrierStructures.filter(s =>
                    s.hits < RAMPART_HITS_MAX[this.room.controller.level] * 0.9
                ), 'hits');
            }

            if (target) {
                this.creep.memory.currentTarget = target.id;
            } else {
                // If no repair targets, look for construction sites for walls or ramparts
                let site = this.room.find(FIND_CONSTRUCTION_SITES, {
                    filter: s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL
                })[0];
                if (site) {
                    this.creep.memory.constructionSite = site.id;
                    this.creep.memory.task = "build";
                    return true;
                }
                return false;  // Nothing to do
            }
        }

        let target = Game.getObjectById(this.creep.memory.currentTarget);
        if (target) {
            this.creep.memory.task = "waller";
            if (!this.creep.memory.targetWallHits) {
                this.creep.memory.targetWallHits = Math.min(target.hits + 10000, RAMPART_HITS_MAX[this.room.controller.level]);
            }

            this.creep.say(ICONS.castle, true);
            target.say(`${target.hits} / ${this.creep.memory.targetWallHits}`);

            switch (this.creep.repair(target)) {
                case OK:
                    if (target.hits >= this.creep.memory.targetWallHits) {
                        this.creep.memory.currentTarget = undefined;
                        this.creep.memory.targetWallHits = undefined;
                    }
                    break;
                case ERR_NOT_IN_RANGE:
                    this.creep.shibMove(target, {range: 3});
                    break;
                default:
                    this.creep.memory.currentTarget = undefined;
                    this.creep.memory.targetWallHits = undefined;
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