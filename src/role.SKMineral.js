/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */
module.exports.role = function (creep) {
    if (creep.shibKite() || creep.fleeHome()) return true;
    //Initial move
    if (!_.sum(creep.store)) creep.memory.harvesting = true;
    if (creep.pos.roomName !== creep.memory.destination) delete creep.memory.destinationReached;
    if (creep.pos.roomName !== creep.memory.destination && !creep.memory.hauling) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20}); else creep.memory.destinationReached = true;
    // SK Safety
    if (creep.skSafety()) return;
    if (creep.isFull || !creep.memory.harvesting) {
        delete creep.memory.harvesting;
        creep.memory.hauling = true;
        return skDeposit(creep);
    } else {
        delete creep.memory.hauling;
        // Check if mineral depleted
        if (creep.memory.source && Game.getObjectById(creep.memory.source).mineralAmount === 0) {
            log.a(creep.room.name + ' supply of ' + Game.getObjectById(creep.memory.source).mineralType + ' has been depleted. Regen in ' + Game.getObjectById(creep.memory.source).ticksToRegeneration);
            Memory.roomCache[creep.room.name].mineralCooldown = Game.time + Game.getObjectById(creep.memory.source).ticksToRegeneration;
            return creep.memory.recycle = true;
        }
        if (creep.memory.source) {
            if (creep.memory.extractor) {
                if (!creep.memory.mineralStore) {
                    let currentMinerals = Memory.ownedMinerals || [];
                    currentMinerals.push(creep.room.mineral.mineralType);
                    Memory.ownedMinerals = _.uniq(currentMinerals);
                    creep.memory.mineralStore = true;
                }
                let extractor = Game.getObjectById(creep.memory.extractor);
                if (!extractor) return creep.memory.recycle = true;
                if (extractor.cooldown && extractor.pos.getRangeTo(creep) < 2) {
                    creep.idleFor(extractor.cooldown - 1)
                } else {
                    let mineral = Game.getObjectById(creep.memory.source);
                    switch (creep.harvest(mineral)) {
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(mineral);
                            break;
                        case ERR_NOT_FOUND:
                            mineral.pos.createConstructionSite(STRUCTURE_EXTRACTOR);
                            break;
                    }
                }
            } else {
                let extractor = creep.room.structures.filter((s) => s.structureType === STRUCTURE_EXTRACTOR)[0];
                if (extractor) {
                    creep.memory.extractor = extractor.id;
                } else {
                    creep.memory.recycle = true;
                }
            }
        } else {
            creep.findMineral();
        }
    }
};

function skDeposit(creep) {
    if (creep.pos.roomName === creep.memory.overlord) {
        if (creep.renewalCheck()) return;
        if (creep.room.storage) {
            for (const resourceType in creep.store) {
                switch (creep.transfer(creep.room.storage, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.storage);
                        break;
                    case ERR_FULL:
                        delete creep.memory.storageDestination;
                        break;
                }
            }
        }
    } else {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 19});
    }
}