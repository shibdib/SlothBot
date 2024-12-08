/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");

class RoleRemoteHarvester {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.container = Game.getObjectById(this.creep.memory.containerID) || Game.getObjectById(this.creep.memory.containerSite);
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        this.harvestSource();
    }

    housekeeping() {
        // SK Safety
        if (this.creep.skSafety()) {
            this.creep.memory.onContainer = undefined;
            return true;
        }
        // Handle room reservation/ownership
        if (this.room.controller && (this.room.controller.reservation && this.room.controller.reservation.username !== MY_USERNAME)) {
            this.room.cacheRoomIntel(true);
            return this.creep.suicide();
        }
        // Periodically check the container
        if (this.creep.memory.onContainer && this.container && Math.random() > 0.9 && this.creep.pos.getRangeTo(this.container) > 0) {
            this.creep.memory.onContainer = undefined;
        }
    }

    harvestSource() {
        // Harvest from source
        const source = Game.getObjectById(this.creep.memory.other.source);
        if (source) {
            // Move to the container if not near it
            if (!this.creep.memory.onContainer && this.container && this.creep.pos.getRangeTo(this.container) > 0) {
                return this.creep.shibMove(this.container, {range: 0});
            } else if (!this.creep.memory.onContainer && !this.creep.pos.isNearTo(source)) {
                return this.creep.shibMove(source);
            } else {
                this.creep.memory.onContainer = true;
                switch (this.creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        this.creep.shibMove(source);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.creep.idleFor(source.ticksToRegeneration + 1);
                        break;
                    case OK:
                        if (!this.creep.memory.containerID || !Game.getObjectById(this.creep.memory.containerID)) {
                            this.creep.memory.containerID = harvestDepositContainer(Game.getObjectById(this.creep.memory.other.source), this.creep);
                        }
                        if (this.container && this.container.hits) {
                            if (this.creep.store[RESOURCE_ENERGY] && this.container.hits < this.container.hitsMax * 0.5) return this.creep.repair(this.container);
                            if (_.sum(this.container.store) >= 1980) {
                                if (this.creep.memory.assignedHauler && !Game.getObjectById(this.creep.memory.assignedHauler)) this.creep.memory.assignedHauler = undefined;
                                this.creep.idleFor(20);
                            } else if (_.sum(this.container.store) >= CONTAINER_CAPACITY * 0.75 && this.container.hits < this.container.hitsMax) {
                                this.creep.repair(this.container);
                            } else if (_.sum(this.container.store) >= CONTAINER_CAPACITY) {
                                this.creep.idleFor(20);
                            }

                            this.creep.memory.energyAmount = _.sum(this.container.store);
                            this.creep.memory.energyId = this.container.id;
                        } else {
                            const dropped = this.creep.pos.lookFor(LOOK_RESOURCES)[0];
                            if (dropped) {
                                this.creep.memory.energyAmount = dropped.amount;
                                this.creep.memory.energyId = dropped.id;
                            }
                        }
                        break;
                }
            }
        } else {
            this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 15});
        }
    }
}

function harvestDepositContainer(source, creep) {
    let container = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) === 1});
    if (container) {
        return container.id;
    } else {
        let site = source.pos.findInRange(creep.room.constructionSites, 3, {filter: (s) => s.structureType === STRUCTURE_CONTAINER})[0];
        if (!creep.memory.siteAttempt && !site && creep.pos.getRangeTo(source) === 1 && !creep.pos.checkForWall()) {
            creep.memory.siteAttempt = true;
            creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
        } else if (!site && creep.pos.checkForWall()) {
            findContainerSpot(creep.room, source.pos);
        } else if (site && site.pos.getRangeTo(source) === 1) {
            creep.memory.containerSite = site.id;
        }
    }
}

function findContainerSpot(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                if (!pos.checkForImpassible()) pos.createConstructionSite(STRUCTURE_CONTAINER);
            }
        }
    }
}

profiler.registerClass(RoleRemoteHarvester, 'RemoteHarvester');
module.exports = RoleRemoteHarvester;
