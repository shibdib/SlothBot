/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {setRoadsBuiltFlag} = require('planUtils');
const {
    shouldVerifyRemoteRoads,
    remoteRoomRoadPathsComplete,
    remoteRoomNeedsRoadWork,
    isColonyRoadRoom,
    getUnfinishedRoadRooms,
    tryPlaceNextRemoteRoad,
    canPlaceRemoteRoadSite,
    countRoadConstructionSites,
    clearRemoteRoadVerifyCache,
} = require('planRoads');

const PLACE_RESULT = {
    COMPLETE: 'complete',
    PENDING: 'pending',
    ABORT: 'abort',
};

const PLACE_AFTER_BUILD_INTERVAL = 3;
const PLACE_AFTER_BUILT_INTERVAL = 5;

let harvesterCacheTick = -1;
let harvesterCache = {};

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
        this.creep.say('HIGHWAY', true);

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

        if (!this.creep.memory.harvest && (this.creep.memory.energyDestination || this.creep.locateEnergy())) {
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

    assignRoadConstructionWork() {
        if (this.creep.memory.constructionSite && !Game.getObjectById(this.creep.memory.constructionSite)) {
            this.creep.memory.constructionSite = undefined;
            this.creep.memory.task = undefined;
            this.creep.memory.sitePos = undefined;
            this.creep.memory.targetHits = undefined;
        }
        if (!this.creep.memory.constructionSite) {
            this.creep.constructionWork('roads');
        }
    }

    doWork() {
        if (!this.creep.store[RESOURCE_ENERGY]) {
            this.creep.memory.working = undefined;
            return;
        }

        this.ensureDestination();
        if (!this.creep.memory.destination) return;

        if (this.creep.pos.roomName !== this.creep.memory.destination) {
            this.creep.memory.constructionSite = undefined;
            this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 20});
            return;
        }

        this.assignRoadConstructionWork();
        if (this.creep.memory.constructionSite) {
            if (this.creep.builderFunction()) {
                if (this.shouldPlaceRoadsAfterBuild()) {
                    this.handlePlaceRoadsResult(this.placeRoads());
                }
                return;
            }
        }

        if (countRoadConstructionSites(this.creep.room) > 0 && !this.creep.memory.constructionSite) {
            this.creep.memory.destination = undefined;
            return;
        }

        if (this.creep.room.name === this.creep.memory.colony) {
            this.creep.memory.destination = undefined;
            this.creep.idleFor(15);
            return;
        }

        if (!this.shouldPlaceRoadsAfterBuild()) {
            this.creep.idleFor(2);
            return;
        }
        this.handlePlaceRoadsResult(this.placeRoads());
    }

    shouldPlaceRoadsAfterBuild() {
        if (!this.creep.store[RESOURCE_ENERGY]) return false;
        if (this.creep.room.name === this.creep.memory.colony) return false;
        const intel = INTEL[this.creep.room.name];
        if (!intel) return false;
        if (intel.roadsBuilt) return Game.time % PLACE_AFTER_BUILT_INTERVAL === 0;
        return Game.time % PLACE_AFTER_BUILD_INTERVAL === 0;
    }

    handlePlaceRoadsResult(result) {
        const room = this.creep.room;
        const colony = this.creep.memory.colony;
        const context = this.getRoadContext(room.name);

        if (result === PLACE_RESULT.COMPLETE) {
            this.markRoadsComplete(room);
            this.creep.memory.destination = undefined;
            return;
        }
        if (result === PLACE_RESULT.ABORT) {
            this.creep.memory.destination = undefined;
            this.creep.idleFor(10);
            return;
        }
        if (result === PLACE_RESULT.PENDING && context
            && !remoteRoomNeedsRoadWork(room, colony, context)
            && countRoadConstructionSites(room) === 0) {
            this.creep.memory.destination = undefined;
        }
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

    ensureDestination() {
        if (this.creep.memory.destination) return;
        const colony = this.creep.memory.colony;

        const unfinished = getUnfinishedRoadRooms(colony);
        if (unfinished.length) {
            this.creep.memory.destination = unfinished[0].room;
            return;
        }

        const remoteTargets = ROOM_REMOTE_TARGETS[colony] || [];
        const assignedRemotes = _.uniq(remoteTargets.map(s => s.room));
        if (assignedRemotes.length) {
            const maintenanceRooms = assignedRemotes.slice();
            for (const remote of assignedRemotes) {
                const route = Game.map.findRoute(colony, remote);
                if (!Array.isArray(route)) continue;
                for (const step of route) {
                    if (step.room !== colony && step.room !== remote) maintenanceRooms.push(step.room);
                }
            }
            this.creep.memory.destination = _.sample(_.uniq(maintenanceRooms));
            return;
        }

        if (harvesterCacheTick !== Game.time) {
            harvesterCacheTick = Game.time;
            harvesterCache = {};
        }
        if (!harvesterCache[colony]) {
            harvesterCache[colony] = _.filter(Game.creeps, c =>
                c.my && c.memory.colony === colony && c.memory.role === 'remoteHarvester');
        }
        const harvesters = harvesterCache[colony];
        if (!harvesters.length) {
            this.creep.memory.destination = colony;
            return;
        }
        const destinations = _.uniq(_.pluck(harvesters, 'memory.destination'));
        this.creep.memory.destination = _.sample(destinations);
    }

    placeRoads() {
        const room = this.creep.room;
        const colony = this.creep.memory.colony;
        const intel = INTEL[room.name];
        if (!intel || intel.owner) return PLACE_RESULT.ABORT;
        if (_.size(Game.constructionSites) >= 70) return PLACE_RESULT.PENDING;

        const context = this.getRoadContext(room.name);
        if (!context) return PLACE_RESULT.ABORT;

        if (intel.roadsBuilt && shouldVerifyRemoteRoads(room.name)) {
            if (!remoteRoomRoadPathsComplete(room, colony, context)) {
                setRoadsBuiltFlag(room, undefined);
                delete intel.roadCount;
                clearRemoteRoadVerifyCache(room.name);
            }
        }

        if (canPlaceRemoteRoadSite(room) && tryPlaceNextRemoteRoad(room, colony, context)) {
            return PLACE_RESULT.PENDING;
        }

        if (remoteRoomRoadPathsComplete(room, colony, context)) {
            return PLACE_RESULT.COMPLETE;
        }

        if (remoteRoomNeedsRoadWork(room, colony, context)) return PLACE_RESULT.PENDING;

        return PLACE_RESULT.COMPLETE;
    }
}

profiler.registerClass(RoleRoadBuilder, 'RoadBuilder');
module.exports = RoleRoadBuilder;