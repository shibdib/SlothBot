/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Invader detection
    if (creep.fleeHome()) {
        creep.memory.onContainer = undefined;
        return;
    }
    //Set destination reached
    creep.memory.destinationReached = creep.pos.roomName === creep.memory.destination;
    //Initial move
    if (!creep.memory.destinationReached) {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 23});
    } else {
        //Suicide and cache intel if room is reserved by someone else
        if (creep.room.controller && creep.room.controller.reservation && creep.room.controller.reservation.username !== USERNAME) {
            creep.room.cacheRoomIntel(true);
            return creep.memory.recycle = true;
        }
        //If source is set mine
        if (!creep.memory.source) creep.findSource();
    }
    //Handle SK Mining
    if (creep.memory.destinationReached && Memory.roomCache[creep.room.name] && Memory.roomCache[creep.room.name].sk && skSafety(creep)) return;
    //Harvest
    if (creep.memory.source) {
        let container = Game.getObjectById(creep.memory.containerID);
        //Make sure you're on the container
        if (!creep.memory.onContainer && creep.memory.containerID) {
            if (container && creep.pos.getRangeTo(container) > 0) {
                return creep.shibMove(container, {range: 0});
            } else if (container) {
                creep.memory.onContainer = true;
            }
        } else if (!creep.memory.containerID || !container) creep.memory.containerID = harvestDepositContainer(Game.getObjectById(creep.memory.source), creep);
        let source = Game.getObjectById(creep.memory.source);
        switch (creep.harvest(source)) {
            case ERR_NOT_IN_RANGE:
                creep.shibMove(source);
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.idleFor(source.ticksToRegeneration + 1);
                break;
            case OK:
                //if (creep.memory.hauler && Game.time % 10 === 0 && !Game.getObjectById(creep.memory.hauler)) creep.memory.hauler = undefined;
                //if (creep.memory.secondHauler && Game.time % 10 === 0 && !Game.getObjectById(creep.memory.secondHauler)) creep.memory.secondHauler = undefined;
                if (container) {
                    if (creep.carry[RESOURCE_ENERGY] && container.hits < container.hitsMax * 0.5) return creep.repair(container);
                    if (_.sum(container.store) >= 1980) creep.idleFor(20);
                }
                break;
        }
        return;
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
                if (!site && creep.pos.getRangeTo(source) === 1 && !creep.pos.checkForWall()) {
                    creep.pos.createConstructionSite(STRUCTURE_CONTAINER);
                } else if (!site && creep.pos.checkForWall()) {
                    findContainerSpot(creep.room, source.pos);
                } else if (site && site.pos.getRangeTo(source) === 1) {
                    creep.memory.containerSite = site.id;
                    if (creep.carry[RESOURCE_ENERGY] && creep.memory.containerSite) {
                        let site = Game.getObjectById(creep.memory.containerSite);
                        if (!site) return creep.memory.containerSite = undefined;
                        switch (creep.build(site)) {
                            case OK:
                                return;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(site);
                                break;
                        }
                    }
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

function skSafety(creep) {
    let dangerousLair = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_KEEPER_LAIR && (!s.ticksToSpawn || s.ticksToSpawn < 15) && s.pos.getRangeTo(creep) <= 6);
    let keepers = _.filter(creep.room.creeps, (c) => c.owner === 'Source Keeper' && s.pos.getRangeTo(creep) <= 6);
    if (keepers.length || dangerousLair.length) creep.fleeHome(true);
}

function findContainerSpot(room, position) {
    for (let xOff = -1; xOff <= 1; xOff++) {
        for (let yOff = -1; yOff <= 1; yOff++) {
            if (xOff !== 0 || yOff !== 0) {
                let pos = new RoomPosition(position.x + xOff, position.y + yOff, room.name);
                if (!pos.checkForImpassible()) pos.createConstructionSite(STRUCTURE_CONTAINER);
            }
        }
    }
}