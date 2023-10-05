/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/12/2017.
 */
module.exports.role = function (creep) {
    if (creep.isFull) {
        return skDeposit(creep);
    } else {
        if (creep.room.name !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
        if (creep.skSafety()) return;
        if (creep.memory.source) {
            if (creep.memory.extractor) {
                let extractor = Game.getObjectById(creep.memory.extractor);
                if (extractor.cooldown && extractor.pos.isNearTo(creep)) {
                    creep.idleFor(extractor.cooldown - 1)
                } else {
                    let mineral = Game.getObjectById(creep.memory.source);
                    // Check if mineral depleted
                    if (mineral.mineralAmount === 0) {
                        log.a(creep.room.name + ' supply of ' + mineral.mineralType + ' has been depleted. Regen in ' + mineral.ticksToRegeneration);
                        INTEL[creep.room.name].mineralCooldown = Game.time + mineral.ticksToRegeneration;
                        return creep.suicide();
                    }
                    switch (creep.harvest(mineral)) {
                        case OK:
                            break;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(mineral);
                            break;
                        case ERR_NOT_FOUND:
                            mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
                            break;
                    }
                }
            } else {
                let extractor = _.find(creep.room.impassibleStructures, (s) => s.structureType === STRUCTURE_EXTRACTOR);
                if (extractor) {
                    creep.memory.extractor = extractor.id;
                    // Store mineral as owned
                    let harvestableMinerals = Memory.harvestableMinerals || [];
                    harvestableMinerals.push(creep.room.mineral.mineralType);
                    Memory.harvestableMinerals = _.uniq(harvestableMinerals);
                }
            }
        } else {
            creep.findMineral();
        }
    }
};

function skDeposit(creep) {
    if (creep.pos.roomName === creep.memory.closestRoom) {
        let store = creep.room.terminal || creep.room.storage;
        if (store) {
            for (const resourceType in creep.store) {
                switch (creep.transfer(store, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(store);
                        break;
                    case ERR_FULL:
                        break;
                }
            }
        }
    } else {
        let closest = creep.memory.closestRoom || findClosestOwnedRoom(creep.room.name, false, 4);
        creep.memory.closestRoom = closest;
        return creep.shibMove(new RoomPosition(25, 25, closest), {range: 23});
    }
}