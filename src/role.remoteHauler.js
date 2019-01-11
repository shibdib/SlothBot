/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.haul2, true);
    //Invader detection
    if (creep.fleeHome()) return;
    // Set harvester pairing
    if (!creep.memory.harvester || !Game.getObjectById(creep.memory.harvester)) {
        let remoteHarvester = _.filter(Game.creeps, (c) => c.memory.overlord === creep.memory.overlord && (c.memory.role === 'remoteHarvester' || c.memory.role === 'SKworker') && !c.memory.hauler)[0];
        if (!remoteHarvester) return creep.idleFor(10);
        creep.memory.harvester = remoteHarvester.id;
        remoteHarvester.memory.hauler = creep.id;
        return;
    }
    // Check if empty
    if (_.sum(creep.carry) === 0) {
        creep.memory.storageDestination = undefined;
        creep.memory.hauling = undefined;
    }
    if (creep.memory.hauling) {
        if (creep.pos.roomName === creep.memory.overlord) {
            // If carrying minerals deposit in terminal or storage
            if (_.sum(creep.carry) > creep.carry[RESOURCE_ENERGY]) creep.memory.storageDestinatio = creep.room.terminal.id || creep.room.storage.id;
            creep.memory.destinationReached = false;
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
                            creep.memory.storageDestination = undefined;
                            break;
                    }
                }
            } else if (!creep.findEssentials() && !creep.findStorage() && !creep.findSpawnsExtensions()) creep.idleFor(5)
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Check if ready to haul
        if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) creep.memory.hauling = true;
        // Set Harvester and move to them if not nearby
        let pairedHarvester = Game.getObjectById(creep.memory.harvester);
        // Handle Moving
        if (creep.room.name !== pairedHarvester.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, pairedHarvester.room.name), {range: 22, offRoad: true});
        } else {
            if (pairedHarvester.memory.containerID) {
                let container = Game.getObjectById(pairedHarvester.memory.containerID);
                if (container && _.sum(container.store) > creep.carryCapacity * 0.7) {
                    for (const resourceType in container.store) {
                        if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                            creep.shibMove(container);
                        }
                    }
                } else {
                    if (!creep.shibMove(pairedHarvester)) creep.idleFor(10);
                }
            } else if (pairedHarvester.pos.lookFor(LOOK_RESOURCES)[0]) {
                let dropped = pairedHarvester.pos.lookFor(LOOK_RESOURCES)[0];
                if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(dropped);
                }
            } else {
                return creep.shibMove(new RoomPosition(25, 25, pairedHarvester.room.name), {range: 22, offRoad: true});
            }
        }
    }
};
