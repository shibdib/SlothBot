/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Invader detection
    if (creep.fleeHome()) return;
    //Set destination reached
    creep.memory.destinationReached = creep.pos.roomName === creep.memory.destination;
    //Harvest
    if (creep.memory.onContainer && creep.memory.destinationReached) {
        let container = Game.getObjectById(creep.memory.containerID);
        if (Math.random() > 0.7 && creep.pos.getRangeTo(container) > 0) return creep.memory.onContainer = undefined;
        if (container && creep.carry[RESOURCE_ENERGY] && container.hits < container.hitsMax * 0.5) return creep.repair(container);
        switch (creep.harvest(Game.getObjectById(creep.memory.source))) {
            case OK:
                if (Math.random() > 0.7) creep.memory.needHauler = creep.room.energy;
                if (!creep.memory.containerID || !container) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
                if (container && _.sum(container.store) >= 1980) creep.idleFor(20);
                break;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(Game.getObjectById(creep.memory.source));
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(Game.getObjectById(creep.memory.source).ticksToRegeneration + 1)
        }
        return;
    }
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        //Suicide and cache intel if room is reserved by someone else
        if (creep.room.controller && creep.room.controller.reservation && creep.room.controller.reservation.username !== USERNAME) {
            creep.room.cacheRoomIntel(true);
            return creep.suicide();
        }
        //If source is set mine
        if (creep.memory.source) {
            if (Math.random() > 0.7) creep.memory.needHauler = creep.room.energy;
            //Make sure you're on the container
            if (creep.memory.containerID && !creep.memory.onContainer) {
                let container = Game.getObjectById(creep.memory.containerID);
                if (container && creep.pos.getRangeTo(container) > 0) {
                    return creep.shibMove(container, {range: 0});
                } else if (container) {
                    creep.memory.onContainer = true;
                }
            } else if (!creep.memory.containerID) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
            //Find Source
        } else {
            creep.findSource();
        }
    }
};

function harvestDepositContainer(source, creep) {
    switch (creep.harvest(Game.getObjectById(creep.memory.source))) {
        case OK:
            let container = source.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_CONTAINER && s.pos.getRangeTo(source) === 1});
            if (container) {
                return container.id;
            } else {
                let site = source.pos.findClosestByRange(creep.room.constructionSites, {filter: (s) => s.structureType === STRUCTURE_CONTAINER});
                if (!site && creep.pos.getRangeTo(source) === 1) {
                    creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
                }
            }
            break;
        case ERR_NOT_IN_RANGE:
            creep.shibMove(Game.getObjectById(creep.memory.source));
            break;
        case ERR_NOT_ENOUGH_RESOURCES:
            creep.idleFor(Game.getObjectById(creep.memory.source).ticksToRegeneration + 1)
    }
}