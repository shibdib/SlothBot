/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

function role(creep) {
    creep.say(ICONS.haul2, true);
    //Invader detection
    if (creep.room.memory.responseNeeded || creep.room.invaderCheck() || creep.hits < creep.hitsMax) return creep.goHomeAndHeal();
    // Set harvester pairing
    if (!creep.memory.harvester || !Game.getObjectById(creep.memory.harvester)) {
        let remoteHarvester = _.filter(Game.creeps, (c) => c.memory.overlord === creep.memory.overlord && c.memory.role === 'remoteHarvester' && !c.memory.hauler)[0];
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
            } else if (!creep.findEssentials()) creep.findStorage()
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
    } else {
        // Check if ready to haul
        if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) {
            creep.memory.hauling = true;
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 23});
        }
        // Set Harvester and move to them if not nearby
        let pairedHarvester = Game.getObjectById(creep.memory.harvester);
        // Handle Moving
        if (creep.room.name !== pairedHarvester.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, pairedHarvester.room.name), {range: 23, offRoad: true});
        } else if (creep.pos.getRangeTo(pairedHarvester) > 1) {
            return creep.shibMove(pairedHarvester, {range: 1, offRoad: true});
        } else {
            let container = Game.getObjectById(pairedHarvester.memory.containerID) || undefined;
            if (container && _.sum(container.store) > creep.carryCapacity * 0.7) {
                for (const resourceType in container.store) {
                    if (creep.withdraw(container, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(container);
                    }
                }
            } else if (pairedHarvester.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {filter: (s) => s.amount > creep.carryCapacity * 0.7}).length > 0) {
                let dropped = pairedHarvester.pos.findInRange(FIND_DROPPED_RESOURCES, 3, {filter: (s) => s.amount > creep.carryCapacity * 0.7})[0];
                for (const resourceType in dropped) {
                    if (creep.pickup(dropped, resourceType) === ERR_NOT_IN_RANGE) {
                        creep.shibMove(dropped);
                    }
                }
            } else {
                creep.idleFor(10);
            }
        }
    }
}

module.exports.role = profiler.registerFN(role, 'remoteHaulerRole');
