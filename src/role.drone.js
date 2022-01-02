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
    // Trailer at low level
    if (creep.room.controller && creep.room.controller.level < 3 && creep.towTruck()) return true;
    // Handle remote drones
    if (!creep.memory.destination) creep.memory.destination = creep.memory.overlord;
    if (creep.memory.destination && creep.room.name !== creep.memory.destination && !creep.memory.remoteMining) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
    // Checks
    if (!creep.memory.working) {
        if (creep.isFull) {
            creep.memory.source = undefined;
            creep.memory.harvest = undefined;
            creep.memory.remoteMining = undefined;
            creep.memory.source = undefined;
            creep.memory.other.noBump = true;
            return creep.memory.working = true;
        }
        creep.memory.other.noBump = undefined;
        creep.memory.working = undefined;
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.locateEnergy())) {
            creep.say('Energy!', true);
            creep.withdrawResource();
        } else {
            creep.memory.harvest = true;
            let source = Game.getObjectById(creep.memory.source) || creep.pos.getClosestSource();
            if (source && (!Memory.roomCache[creep.room.name].owner || Memory.roomCache[creep.room.name].owner === MY_USERNAME) && (!Memory.roomCache[creep.room.name].reservation || Memory.roomCache[creep.room.name].reservation === MY_USERNAME)) {
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
                    if (creep.memory.remoteMining !== creep.room.name) return creep.shibMove(new RoomPosition(25, 25, creep.memory.remoteMining), {range: 24}); else creep.memory.remoteMining = undefined;
                } else {
                    delete creep.memory.harvest;
                    creep.idleFor(5);
                }
            }
        }
    } else {
        if (!creep.store[RESOURCE_ENERGY]) creep.memory.working = undefined;
        // If haulers needed haul
        if (hauling(creep)) return;
        // If builder needed build
        if (building(creep)) return;
        // If praiser needed praise
        if (upgrading(creep)) return;
        creep.idleFor(10);
    }
};

function building(creep) {
    if (creep.memory.task && creep.memory.task !== 'build' && creep.memory.task !== 'repair') return;
    if ((creep.memory.task === 'build' || creep.memory.task === 'repair') || (creep.memory.constructionSite || creep.constructionWork())) {
        creep.say('Build!', true);
        creep.builderFunction();
        return true;
    }
}

function hauling(creep) {
    if (creep.memory.task && creep.memory.task !== 'haul') return;
    if (!creep.room.controller || !creep.room.controller.owner || creep.room.controller.owner.username !== MY_USERNAME) return false;
    let haulers = _.filter(creep.room.creeps, (c) => c.my && c.memory && ((c.memory.role === 'drone' && c.memory.task === 'haul') || c.memory.role === 'hauler' || c.memory.role === 'shuttle')).length < 2;
    let needyTower = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < TOWER_CAPACITY * 0.1).length > 0;
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

function upgrading(creep) {
    if (creep.memory.task && creep.memory.task !== 'upgrade') return;
    if (!creep.room.controller || !creep.room.controller.owner || creep.room.controller.owner.username !== MY_USERNAME || creep.room.controller.upgradeBlocked || creep.room.controller.level === 8) {
        creep.memory.task = undefined;
        return false;
    }
    creep.memory.task = 'upgrade';
    creep.say('Praise!', true);
    switch (creep.upgradeController(creep.room.controller)) {
        case OK:
            delete creep.memory._shibMove;
            break;
        case ERR_NOT_IN_RANGE:
            creep.shibMove(creep.room.controller, {range: 3});
    }
    return true;
}

function findRemoteSource(creep) {
    let adjacent = _.filter(Game.map.describeExits(creep.pos.roomName), (r) => !Memory.roomCache[r] ||
        ((!Memory.roomCache[r].owner || Memory.roomCache[r].owner === MY_USERNAME) && (!Memory.roomCache[r].reservation || Memory.roomCache[r].reservation === MY_USERNAME) && !Memory.roomCache[r].sk && Memory.roomCache[r].sources));
    if (adjacent.length) {
        creep.memory.remoteMining = _.sample(adjacent);
        return true;
    } else {
        let possibles = [];
        _.filter(Game.map.describeExits(creep.pos.roomName)).forEach(function (r) {
            _.filter(Game.map.describeExits(r)).forEach(function (s) {
                if (!Memory.roomCache[s] || ((!Memory.roomCache[s].owner || Memory.roomCache[s].owner === MY_USERNAME) &&
                    (!Memory.roomCache[s].reservation || Memory.roomCache[s].reservation === MY_USERNAME) && !Memory.roomCache[s].sk && Memory.roomCache[s].sources)) return possibles.push(s);
            })
        });
        if (possibles.length) {
            creep.memory.remoteMining = _.sample(possibles);
            return true;
        }
    }
}