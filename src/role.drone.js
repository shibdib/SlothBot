/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function role(creep) {
    if (creep.tryToBoost(['build'])) return;
    // If damaged move to safety
    if (!creep.getActiveBodyparts(WORK) || !creep.getActiveBodyparts(CARRY)) return creep.goToHub();
    // Trailer at low level
    if (creep.room.controller && creep.room.controller.level < 3 && creep.towTruck()) return true;
    // Handle remote drones
    if (!creep.memory.destination) creep.memory.destination = creep.memory.overlord;
    if (creep.memory.destination && creep.room.name !== creep.memory.destination && !creep.memory.remoteMining) {
        if (!creep.getActiveBodyparts(WORK)) return creep.suicide();
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
    if (!creep.store[RESOURCE_ENERGY]) creep.memory.working = undefined;
    // Checks
    if (!creep.memory.working) {
        if (creep.isFull && !creep.memory.stationaryHarvester) {
            creep.memory.source = undefined;
            creep.memory.harvest = undefined;
            creep.memory.remoteMining = undefined;
            creep.memory.source = undefined;
            return creep.memory.working = true;
        }
        creep.memory.other.noBump = undefined;
        creep.memory.working = undefined;
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
        let spawn = _.find(creep.room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_SPAWN);
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.locateEnergy())) {
            creep.say('Energy!', true);
            creep.withdrawResource();
        } else if (!spawn || creep.room.level < 2 || (!INTEL[creep.room.name] || INTEL[creep.room.name].user !== MY_USERNAME)) {
            creep.memory.harvest = true;
            let source = Game.getObjectById(creep.memory.source) || creep.pos.getClosestSource();
            if (source && (!INTEL[creep.room.name].owner || INTEL[creep.room.name].owner === MY_USERNAME) && (!INTEL[creep.room.name].reservation || INTEL[creep.room.name].reservation === MY_USERNAME)) {
                // Set a statioanry harvester on new spawns
                if (!spawn && !_.find(creep.room.myCreeps, (c) => c.id !== creep.id && c.memory.stationaryHarvester) && _.find(creep.room.myCreeps, (c) => c.id !== creep.id && c.memory.role === 'drone')) creep.memory.stationaryHarvester = true;
                creep.say('Harvest!', true);
                creep.memory.source = source.id;
                switch (creep.harvest(source)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.memory.source = undefined;
                        break;
                    case OK:
                        creep.memory.other.noBump = true;
                        break;
                }
            } else {
                if (creep.memory.remoteMining || findRemoteSource(creep)) {
                    creep.say('Remote!', true);
                    if (creep.memory.remoteMining !== creep.room.name) return creep.shibMove(new RoomPosition(25, 25, creep.memory.remoteMining), {range: 15}); else creep.memory.remoteMining = undefined;
                } else {
                    delete creep.memory.harvest;
                    creep.idleFor(5);
                }
            }
        } else {
            creep.idleFor(5);
        }
    } else {
        // If under attack, waller else chance to be a waller
        if ((INTEL[creep.room.name].threatLevel || creep.memory.currentTarget || (Math.random() > 0.5 && !creep.memory.constructionSite && !creep.room.constructionSites.length)) && wallMaintainer(creep)) return;
        // If praiser needed praise
        if (upgrading(creep)) return;
        // If haulers needed haul
        if (hauling(creep)) return;
        // If builder needed build
        if ((creep.memory.constructionSite || creep.room.constructionSites.length) && building(creep)) return;
        // If walls to repair
        if (wallMaintainer(creep)) return;
        // If nothing else to do upgrade
        if (upgrading(creep, true)) return;
        // Otherwise idle
        else {
            creep.memory.task = undefined;
            creep.idleFor(5);
        }
    }
}

function building(creep) {
    if (creep.memory.task && creep.memory.task !== 'build' && creep.memory.task !== 'repair') return;
    if ((creep.memory.task === 'build' || creep.memory.task === 'repair') || (creep.memory.constructionSite || creep.constructionWork())) {
        if (creep.builderFunction()) {
            creep.memory.other.noBump = true;
            return true;
        }
    }
}

function hauling(creep) {
    if (creep.memory.task && creep.memory.task !== 'haul') return;
    if (!creep.room.controller || !creep.room.controller.owner || creep.room.controller.owner.username !== MY_USERNAME) return false;
    let haulers = _.filter(creep.room.myCreeps, (c) => c.memory && ((c.memory.role === 'drone' && c.memory.task === 'haul') || c.memory.role === 'hauler' || c.memory.role === 'shuttle')).length < 1;
    let needyTower = _.filter(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * 0.1).length > 0;
    if (creep.memory.task === 'haul' || (creep.room.level <= 4 && creep.isFull && (haulers || needyTower) && !creep.memory.task && (creep.room.energyAvailable < creep.room.energyCapacityAvailable || needyTower))) {
        creep.memory.task = 'haul';
        creep.say('Haul!', true);
        if (creep.memory.storageDestination || creep.haulerDelivery()) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            if (!storageItem) return delete creep.memory.storageDestination;
            switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                case OK:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(storageItem);
                    break;
                case ERR_FULL || ERR_INVALID_TARGET:
                    delete creep.memory.storageDestination;
                    delete creep.memory._shibMove;
                    if (storageItem.memory) delete storageItem.memory.deliveryIncoming;
                    break;
            }
        } else if (creep.room.energyAvailable === creep.room.energyCapacityAvailable) {
            creep.memory.task = undefined;
        }
        return true;
    }
}

function upgrading(creep, force = undefined) {
    if (creep.memory.task && creep.memory.task !== 'upgrade') return;
    if (!force) {
        let controllerCheck = !creep.room.controller || !creep.room.controller.owner || creep.room.controller.owner.username !== MY_USERNAME || creep.room.controller.upgradeBlocked || creep.room.controller.level < 8 || !creep.room.controller.ticksToDowngrade || creep.room.controller.ticksToDowngrade > CREEP_LIFE_TIME * 2;
        if (!controllerCheck) {
            creep.memory.task = undefined;
            return false;
        }
    }
    creep.memory.task = 'upgrade';
    creep.say('Praise!', true);
    switch (creep.upgradeController(creep.room.controller)) {
        case OK:
            creep.memory.other.noBump = true;
            delete creep.memory._shibMove;
            break;
        case ERR_NOT_IN_RANGE:
            creep.shibMove(creep.room.controller, {range: 3});
    }
    return true;
}

function wallMaintainer(creep) {
    if (!creep.memory.currentTarget || !Game.getObjectById(creep.memory.currentTarget)) {
        let nukeSite, nukeRampart;
        let barrierStructures = _.filter(creep.room.structures, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL));
        if (creep.room.memory.nuke) {
            nukeSite = _.filter(creep.room.constructionSites, (s) => s.structureType === STRUCTURE_RAMPART && s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5)[0];
            nukeRampart = _.min(_.filter(barrierStructures, (s) => s.structureType === STRUCTURE_RAMPART && ((s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) <= 5 && s.hits < (NUKE_DAMAGE[1] * creep.room.nukes.length) + 100000) || (s.pos.getRangeTo(s.pos.findClosestByRange(FIND_NUKES)) === 0 && s.hits < (NUKE_DAMAGE[0] * creep.room.nukes.length) + 100000))), 'hits');
        }
        let hostileBarrier;
        if (INTEL[creep.room.name].threatLevel) {
            hostileBarrier = _.min(_.filter(barrierStructures, (s) => s.pos.findInRange(_.filter(s.room.hostileCreeps, (c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK)), 5)[0]), 'hits');
        }
        let barrier = _.min(_.filter(barrierStructures, (s) => s.hits < RAMPART_HITS_MAX[creep.room.controller.level] * 0.9), 'hits');
        let site = _.filter(creep.room.constructionSites, (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL))[0];
        if (!hostileBarrier && barrier.id && barrier.hits < 2000) {
            creep.memory.currentTarget = barrier.id;
            creep.shibMove(barrier, {range: 3})
        } else if (hostileBarrier) {
            creep.memory.currentTarget = hostileBarrier.id;
        } else if (nukeSite) {
            switch (creep.build(nukeSite)) {
                case OK:
                    creep.memory._shibMove = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(nukeSite, {range: 3})
            }
        } else if (nukeRampart && nukeRampart.id) {
            creep.memory.currentTarget = nukeRampart.id;
        } else if (site) {
            switch (creep.build(site)) {
                case OK:
                    creep.memory._shibMove = undefined;
                    break;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(site, {range: 3})
            }
            return true;
        } else if (barrier.id) {
            creep.memory.currentTarget = barrier.id;
        }
    }
    let target = Game.getObjectById(creep.memory.currentTarget);
    if (target) {
        if (!creep.memory.targetWallHits) {
            if (target.hits < 10000) {
                creep.memory.targetWallHits = 25000;
            } else {
                let targetHits = target.hits + 10000;
                if (targetHits > RAMPART_HITS_MAX[creep.room.controller.level]) targetHits = RAMPART_HITS_MAX[creep.room.controller.level];
                creep.memory.targetWallHits = targetHits;
            }
        }
        creep.say(ICONS.castle, true);
        target.say(target.hits + ' / ' + creep.memory.targetWallHits);
        switch (creep.repair(target)) {
            case OK:
                creep.memory.other.noBump = true;
                if (target.hits >= creep.memory.targetWallHits) {
                    creep.memory.other.noBump = undefined;
                    creep.memory.currentTarget = undefined;
                    creep.memory.targetWallHits = undefined;
                }
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(target, {range: 3})
                break;
            default:
                creep.memory.currentTarget = undefined;
                creep.memory.targetWallHits = undefined;
        }
        return true;
    } else {
        return false;
    }
}

function findRemoteSource(creep) {
    let adjacent = _.filter(Game.map.describeExits(creep.pos.roomName), (r) => INTEL[r] &&
        ((!INTEL[r].owner || INTEL[r].owner === MY_USERNAME)
            && (!INTEL[r].reservation || INTEL[r].reservation === MY_USERNAME)
            && !INTEL[r].sk && INTEL[r].sources));
    if (adjacent.length) {
        creep.memory.remoteMining = _.sample(adjacent);
        return true;
    } else {
        let possibles = [];
        _.filter(Game.map.describeExits(creep.pos.roomName)).forEach(function (r) {
            _.filter(Game.map.describeExits(r)).forEach(function (s) {
                if (!INTEL[s] || ((!INTEL[s].owner || INTEL[s].owner === MY_USERNAME) &&
                    (!INTEL[s].reservation || INTEL[s].reservation === MY_USERNAME) && !INTEL[s].sk && INTEL[s].sources)) return possibles.push(s);
            })
        });
        if (possibles.length) {
            creep.memory.remoteMining = _.sample(possibles);
            return true;
        }
    }
}