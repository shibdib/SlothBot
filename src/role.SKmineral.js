/**
 * Created by Bob on 7/12/2017.
 */
module.exports.role = function (creep) {
    let source;
    let hostiles = creep.findClosestEnemy();
    if (hostiles && creep.pos.getRangeTo(hostiles) <= 4) return creep.retreat();
    let lair = Game.getObjectById(creep.memory.lair);
    if (lair && creep.pos.getRangeTo(lair) <= 5 && lair.ticksToSpawn <= 10) return creep.flee(lair);
    if (creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    //Initial move
    if (_.sum(creep.carry) === 0) creep.memory.harvesting = true;
    if (creep.pos.roomName !== creep.memory.destination) delete creep.memory.destinationReached;
    if (creep.pos.roomName !== creep.memory.destination && !creep.memory.hauling) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 20});
    }
    creep.memory.destinationReached = true;
    if (_.sum(creep.carry) === creep.carryCapacity || !creep.memory.harvesting) {
        delete creep.memory.harvesting;
        creep.memory.hauling = true;
        return SKdeposit(creep);
    } else {
        delete creep.memory.hauling;
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (!source || source.pos.roomName !== creep.pos.roomName) return delete creep.memory.source;
            if (!creep.memory.lair) creep.memory.lair = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR}).id;
            if (source.energy === 0) {
                if (lair && creep.pos.getRangeTo(lair) <= 6) return creep.flee(lair);
                creep.idleFor(source.ticksToRegeneration + 1)
            } else {
                switch (creep.harvest(source)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(source);
                        break;
                    case ERR_NO_BODYPART:
                        creep.shibMove(source);
                        break;
                    case ERR_TIRED:
                        creep.idleFor(creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_EXTRACTOR}).cooldown);
                        break;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        break;
                }
            }
        } else {
            creep.findMineral();
        }
    }
};

function SKdeposit(creep) {
    if (creep.pos.roomName === creep.memory.overlord) {
        if (creep.renewalCheck()) return;
        if (creep.memory.storageDestination) {
            let storageItem = Game.getObjectById(creep.memory.storageDestination);
            for (const resourceType in creep.carry) {
                switch (creep.transfer(storageItem, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storageItem);
                        break;
                    case ERR_FULL:
                        delete creep.memory.storageDestination;
                        break;
                }
            }
        } else {
            let storage = creep.room.storage;
            let terminal = creep.room.terminal;
            if (terminal && _.sum(terminal.store) < terminal.storeCapacity * 0.70) {
                creep.memory.storageDestination = terminal.id;
                for (const resourceType in this.carry) {
                    switch (this.transfer(terminal, resourceType)) {
                        case OK:
                            delete this.memory.storageDestination;
                            delete this.memory.destinationReached;
                            break;
                        case ERR_NOT_IN_RANGE:
                            this.shibMove(terminal);
                            break;
                        case ERR_FULL:
                            delete this.memory.storageDestination;
                            break;
                    }
                }
            } else if (storage && _.sum(storage.store) < storage.storeCapacity * 0.90) {
                creep.memory.storageDestination = storage.id;
                for (const resourceType in this.carry) {
                    switch (this.transfer(storage, resourceType)) {
                        case OK:
                            delete this.memory.storageDestination;
                            delete this.memory.destinationReached;
                            break;
                        case ERR_NOT_IN_RANGE:
                            this.shibMove(storage);
                            break;
                        case ERR_FULL:
                            delete this.memory.storageDestination;
                            break;
                    }
                }
            }
        }
    } else {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 19});
    }
}