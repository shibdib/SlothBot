/**
 * Created by Bob on 7/12/2017.
 */
module.exports.role = function (creep) {
    let source;
    if (skSafety(creep)) return;
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
        return skDeposit(creep);
    } else {
        delete creep.memory.hauling;
        if (creep.memory.source) {
            source = Game.getObjectById(creep.memory.source);
            if (!source || source.pos.roomName !== creep.pos.roomName) return delete creep.memory.source;
            if (!creep.memory.lair) creep.memory.lair = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR}).id;
            if (source.energy === 0) {
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

function skSafety(creep) {
    let dangerousLair = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR && (!s.ticksToSpawn || s.ticksToSpawn < 10) && s.pos.getRangeTo(creep) <= 6);
    let keepers = _.filter(creep.room.creeps, (c) => c.owner === 'Source Keeper' && s.pos.getRangeTo(creep) <= 6);
    if (keepers.length || dangerousLair.length) {
        creep.kite();
        return true;
    }
}