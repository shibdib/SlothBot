/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {setRoadsBuiltFlag} = require('planUtils');
const {getCreepCount} = require('spawnCounts');

const SCAN_INTERVAL = 5;

const {
    isColonyRoadRoom,
    pickRoadWorkRoom,
    colonyNeedsRoadWork,
    roadBuildersNeeded,
    tryPlaceNextRemoteRoad,
    canPlaceRemoteRoadSite,
    countRoadConstructionSites,
    remoteRoomNeedsRoadWork,
    isRemoteRoadPlanComplete,
    syncRemoteRoadBuiltFlag,
    clearRemoteRoadVerifyCache,
} = require('planRoads');

class RoleRoadBuilder {
    constructor(creep) {
        this.creep = creep;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.creep.fleeHome()) {
            this.creep.memory.task = undefined;
            this.creep.memory.constructionSite = undefined;
            this.creep.memory.destination = undefined;
            if (!this.creep.memory.other) this.creep.memory.other = {};
            this.creep.memory.other.source = undefined;
            this.creep.memory.harvest = undefined;
            return;
        }
        if (this.creep.skSafety()) return;

        if (!this.creep.memory.working) {
            this.getEnergy();
        } else {
            this.doWork();
        }
    }

    getEnergy() {
        if (this.creep.isFull) {
            this.creep.memory.working = true;
            return;
        }
        this.creep.memory.constructionSite = undefined;
        this.creep.memory.task = undefined;

        if (!this.creep.memory.harvest && (this.creep.memory.energyDestination || (this.shouldRunRoadScan() && this.creep.locateEnergy()))) {
            this.creep.say('Energy!', true);
            this.creep.withdrawResource();
        } else if (!this.creep.room.level || this.creep.room.level < 3) {
            this.creep.memory.harvest = true;
            if (!this.creep.memory.other) this.creep.memory.other = {};
            let source = Game.getObjectById(this.creep.memory.other.source) || this.creep.pos.getClosestSource();
            if (source) {
                this.creep.say('Harvest!', true);
                this.creep.memory.other.source = source.id;
                switch (this.creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        this.creep.memory.other.stationary = undefined;
                        this.creep.shibMove(source);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.creep.memory.other.source = undefined;
                        break;
                    case OK:
                        this.creep.memory.other.stationary = true;
                        break;
                }
            } else {
                delete this.creep.memory.harvest;
                delete this.creep.memory.destination;
            }
        } else {
            this.creep.memory.harvest = undefined;
            this.creep.idleFor(5);
        }
    }

    getActiveConstructionSite() {
        const id = this.creep.memory.constructionSite;
        if (!id) return null;
        const site = Game.getObjectById(id);
        if (!site) {
            this.creep.memory.constructionSite = undefined;
            this.creep.memory.task = undefined;
            this.creep.memory.sitePos = undefined;
            this.creep.memory.targetHits = undefined;
            return null;
        }
        return site;
    }

    shouldRunRoadScan() {
        const creep = this.creep;
        if (this.getActiveConstructionSite()) return true;
        const destination = creep.memory.destination;
        if (destination && creep.pos.roomName !== destination) return true;
        if (destination) {
            const room = Game.rooms[destination];
            if (room && countRoadConstructionSites(room) > 0) return true;
        }
        if (creep.memory.roadScanPhase === undefined) {
            creep.memory.roadScanPhase = creep.name.charCodeAt(creep.name.length - 1) % SCAN_INTERVAL;
        }
        return Game.time % SCAN_INTERVAL === creep.memory.roadScanPhase;
    }

    assignRoadConstructionWork() {
        if (!this.getActiveConstructionSite()) {
            this.creep.constructionWork('roads');
        }
    }

    doWork() {
        if (!this.creep.store[RESOURCE_ENERGY]) {
            this.creep.memory.working = undefined;
            return;
        }

        const colony = this.creep.memory.colony;
        if (!colonyNeedsRoadWork(colony)) {
            this.handleNoWork();
            return;
        }

        let destination = this.creep.memory.destination;
        if (!destination) {
            if (!this.shouldRunRoadScan()) {
                this.creep.idleFor(SCAN_INTERVAL - 1);
                return;
            }
            destination = this.pickDestination();
        }
        if (!destination) {
            this.handleNoWork();
            return;
        }

        if (this.creep.pos.roomName !== destination) {
            this.creep.memory.constructionSite = undefined;
            this.creep.say('Roads', true);
            this.creep.shibMove(new RoomPosition(25, 25, destination), {range: 20});
            return;
        }

        const room = this.creep.room;
        const context = this.getRoadContext(destination);
        if (!context) {
            this.creep.memory.destination = undefined;
            return;
        }

        if (this.getActiveConstructionSite()) {
            if (this.creep.builderFunction()) {
                this.tryPlaceRoadSites(room, colony, context);
            }
            return;
        }

        if (!this.shouldRunRoadScan()) {
            this.creep.idleFor(SCAN_INTERVAL - 1);
            return;
        }

        this.assignRoadConstructionWork();
        if (this.creep.memory.constructionSite && this.creep.builderFunction()) {
            this.tryPlaceRoadSites(room, colony, context);
            return;
        }

        if (this.tryPlaceRoadSites(room, colony, context)) {
            this.assignRoadConstructionWork();
            return;
        }

        syncRemoteRoadBuiltFlag(room, colony, context);
        if (isRemoteRoadPlanComplete(room, colony, context) && !remoteRoomNeedsRoadWork(room, colony, context)) {
            this.markRoadsComplete(room);
            this.creep.memory.destination = undefined;
            return;
        }

        if (countRoadConstructionSites(room) > 0) {
            this.creep.idleFor(2);
            return;
        }

        this.creep.memory.destination = undefined;
    }

    pickDestination() {
        const destination = pickRoadWorkRoom(this.creep.memory.colony, this.creep.name);
        if (destination) this.creep.memory.destination = destination;
        return destination;
    }

    tryPlaceRoadSites(room, colony, context) {
        if (!this.creep.store[RESOURCE_ENERGY] || !canPlaceRemoteRoadSite(room)) return false;
        return tryPlaceNextRemoteRoad(room, colony, context);
    }

    handleNoWork() {
        const colony = this.creep.memory.colony;
        this.creep.memory.destination = undefined;
        this.creep.memory.constructionSite = undefined;

        if (this.creep.pos.roomName !== colony) {
            this.creep.say('Home', true);
            this.creep.shibMove(new RoomPosition(25, 25, colony), {range: 20});
            return;
        }

        const liveCount = getCreepCount(undefined, 'roadBuilder', undefined, undefined, colony);
        if (liveCount > roadBuildersNeeded(colony)) {
            this.creep.recycleCreep();
            return;
        }
        this.creep.idleFor(10);
    }

    markRoadsComplete(room) {
        setRoadsBuiltFlag(room, true);
        const intel = INTEL[room.name];
        if (intel) intel.roadCount = room.roads.length;
        clearRemoteRoadVerifyCache(room.name);
        const claimants = intel && intel.remoteRoom;
        if (claimants) {
            for (let i = 0; i < claimants.length; i++) {
                if (INTEL[claimants[i]]) INTEL[claimants[i]].refreshRemotes = true;
            }
        }
    }

    getRoadContext(roomName) {
        const colony = this.creep.memory.colony;
        const info = isColonyRoadRoom(roomName, colony);
        if (!info) return null;
        return info.type === 'transit'
            ? {type: 'transit', remote: info.remote}
            : {type: 'remote'};
    }
}

profiler.registerClass(RoleRoadBuilder, 'RoadBuilder');
module.exports = RoleRoadBuilder;