/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {setRoadsBuiltFlag, canPlaceConstructionSite, tryCreateConstructionSite} = require('planUtils');
const {findRoadPath, pathTilesNeedRoads} = require('planRoadPaths');

const PLACE_RESULT = {
    COMPLETE: 'complete',
    PENDING: 'pending',
    ABORT: 'abort',
};

const ROAD_VERIFY_INTERVAL = 50;
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

        if (this.creep.memory.constructionSite || this.creep.constructionWork()) {
            if (this.creep.builderFunction()) {
                if (this.shouldPlaceRoadsAfterBuild()) {
                    this.handlePlaceRoadsResult(this.placeRoads());
                }
                return;
            }
        }

        if (this.creep.room.name === this.creep.memory.colony) {
            this.creep.memory.destination = undefined;
            this.creep.idleFor(15);
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
        if (result === PLACE_RESULT.COMPLETE) {
            this.markRoadsComplete(room);
            this.creep.memory.destination = undefined;
        } else if (result === PLACE_RESULT.ABORT) {
            this.creep.memory.destination = undefined;
            this.creep.idleFor(10);
        }
    }

    markRoadsComplete(room) {
        setRoadsBuiltFlag(room, true);
        const intel = INTEL[room.name];
        if (intel) intel.roadCount = room.roads.length;
        const claimants = intel && intel.remoteRoom;
        if (claimants) {
            for (let i = 0; i < claimants.length; i++) {
                if (INTEL[claimants[i]]) INTEL[claimants[i]].refreshRemotes = true;
            }
        }
    }

    ensureDestination() {
        if (this.creep.memory.destination) return;
        const colony = this.creep.memory.colony;
        const remoteTargets = ROOM_REMOTE_TARGETS[colony] || [];

        const unfinished = _.chain(remoteTargets)
            .filter(s => INTEL[s.room] && !INTEL[s.room].owner && !INTEL[s.room].roadsBuilt)
            .sortBy('score')
            .map('room')
            .uniq()
            .value();
        if (unfinished.length) {
            this.creep.memory.destination = unfinished[0];
            return;
        }

        const assignedRemotes = _.uniq(remoteTargets.map(s => s.room));
        if (assignedRemotes.length) {
            this.creep.memory.destination = _.sample(assignedRemotes);
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
        const intel = INTEL[room.name];
        if (!intel) return PLACE_RESULT.ABORT;
        if (intel.owner) return PLACE_RESULT.ABORT;
        if (room.constructionSites.length >= 2) return PLACE_RESULT.PENDING;
        if (_.size(Game.constructionSites) >= 70) return PLACE_RESULT.PENDING;

        const isAssigned = (ROOM_REMOTE_TARGETS[this.creep.memory.colony] || []).some(s => s.room === room.name);
        if (!isAssigned) return PLACE_RESULT.ABORT;

        if (intel.roadsBuilt) {
            if (Game.time % ROAD_VERIFY_INTERVAL === 0) {
                const currentRoads = room.roads.length;
                if ((intel.roadCount || 0) > currentRoads) {
                    setRoadsBuiltFlag(room, undefined);
                    delete intel.roadCount;
                } else {
                    return PLACE_RESULT.PENDING;
                }
            } else {
                return PLACE_RESULT.PENDING;
            }
        }

        const goHome = Game.map.findExit(room.name, this.creep.memory.colony);
        const homeExits = room.find(goHome);
        if (!homeExits.length) return PLACE_RESULT.ABORT;
        const homeTarget = homeExits[Math.round(homeExits.length / 2)];

        const containers = room.containers;
        const origins = containers.length ? containers : room.sources;

        for (const origin of origins) {
            if (_.size(Game.constructionSites) >= 70) return PLACE_RESULT.PENDING;
            if (this.buildRoadFromTo(room, origin, homeTarget)) return PLACE_RESULT.PENDING;
        }

        if (intel.sk) {
            const mineral = room.find(FIND_MINERALS)[0];
            if (mineral && this.buildRoadFromTo(room, mineral, homeTarget)) return PLACE_RESULT.PENDING;
            for (const lair of room.impassibleStructures.filter(s => s.structureType === STRUCTURE_KEEPER_LAIR)) {
                if (_.size(Game.constructionSites) >= 70) return PLACE_RESULT.PENDING;
                if (this.buildRoadFromTo(room, lair, homeTarget)) return PLACE_RESULT.PENDING;
            }
        }

        if (room.controller && this.buildRoadFromTo(room, room.controller, homeTarget)) {
            return PLACE_RESULT.PENDING;
        }

        const colonyRemotes = new Set((ROOM_REMOTE_TARGETS[this.creep.memory.colony] || []).map(s => s.room));
        for (const neighbor of Object.values(Game.map.describeExits(room.name))) {
            if (!colonyRemotes.has(neighbor)) continue;
            const exitDir = Game.map.findExit(room.name, neighbor);
            const exitTiles = room.find(exitDir);
            if (!exitTiles.length) continue;
            const exitTarget = exitTiles[Math.round(exitTiles.length / 2)];
            for (const origin of origins) {
                if (_.size(Game.constructionSites) >= 70) return PLACE_RESULT.PENDING;
                if (this.buildRoadFromTo(room, origin, exitTarget)) return PLACE_RESULT.PENDING;
            }
        }

        return PLACE_RESULT.COMPLETE;
    }

    buildRoadFromTo(room, start, end) {
        if (!room || !start || !end) return false;
        const begin = start instanceof RoomPosition ? start : start.pos;
        const target = end instanceof RoomPosition ? end : end.pos;
        const path = findRoadPath(room, begin, target, 'remote');
        if (!path || !pathTilesNeedRoads(room, path, target)) return false;

        for (const point of path) {
            const roomName = point.roomName || room.name;
            if (roomName !== room.name) continue;
            const pos = new RoomPosition(point.x, point.y, roomName);
            if (this.buildRoad(pos, room)) return true;
        }
        return false;
    }

    buildRoad(position, room) {
        if (position.checkForImpassible(true) || position.checkForRoad() || position.checkForConstructionSites()
            || !canPlaceConstructionSite(room)) {
            return false;
        }
        return tryCreateConstructionSite(position, STRUCTURE_ROAD) === OK;
    }
}

profiler.registerClass(RoleRoadBuilder, 'RoadBuilder');
module.exports = RoleRoadBuilder;