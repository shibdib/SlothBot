/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */
module.exports.role = function (creep) {
    if (creep.kite()) return true;
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    //Initial move
    if (_.sum(creep.carry) === 0) creep.memory.harvesting = true;
    if (creep.pos.roomName !== creep.memory.destination) delete creep.memory.destinationReached;
    if (creep.pos.roomName !== creep.memory.destination && !creep.memory.hauling) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20}); else creep.memory.destinationReached = true;
    // handle safe SK movement
    let lair = creep.pos.findInRange(creep.room.structures, 5, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR})[0];
    let SK = creep.pos.findInRange(creep.room.creeps, 5, {filter: (c) => c.owner.username === 'Source Keeper'})[0];
    if (SK) return creep.kite(6); else if (lair && lair.ticksToSpawn <= 10) return creep.flee(lair);
    if (_.sum(creep.carry) === creep.carryCapacity || !creep.memory.harvesting) {
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
            for (const resourceType in creep.carry) {
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