/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function role(creep) {
    if (creep.borderCheck()) return;
    // Handle remote drones
    if (creep.memory.destination && creep.room.name !== creep.memory.destination) {
        return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
    // Checks
    if (creep.carry.energy === 0) {
        creep.memory.working = null;
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
    }
    if (_.sum(creep.carry) === creep.carryCapacity) {
        creep.memory.working = true;
        creep.memory.source = undefined;
        creep.memory.harvest = undefined;
    }
    // Work
    if (creep.memory.working === true) {
        creep.memory.source = undefined;
        // Find a task
        let haulers = _.filter(creep.room.creeps, (c) => c.memory && ((c.memory.role === 'drone' && c.memory.task === 'haul') || c.memory.role === 'hauler'));
        let praisers = _.filter(creep.room.creeps, (c) => c.memory && ((c.memory.role === 'drone' && c.memory.task === 'upgrade') || c.memory.role === 'upgrader' || c.memory.role === 'remoteUpgrader'));
        // If haulers needed haul
        let needyTower = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.5).length > 0;
        if (creep.memory.task === 'haul' || (creep.carry[RESOURCE_ENERGY] === creep.carryCapacity && haulers.length < 1 && !creep.memory.task && (creep.room.energyAvailable < creep.room.energyCapacityAvailable || needyTower))) {
            creep.memory.task = 'haul';
            creep.say('Haul!', true);
            if (creep.memory.storageDestination || creep.findSpawnsExtensions() || creep.findEssentials() || creep.findStorage()) {
                let storageItem = Game.getObjectById(creep.memory.storageDestination);
                if (!storageItem) return delete creep.memory.storageDestination;
                switch (creep.transfer(storageItem, RESOURCE_ENERGY)) {
                    case OK:
                        delete creep.memory.storageDestination;
                        delete creep.memory._shibMove;
                        break;
                    case ERR_NOT_IN_RANGE:
                        if (storageItem.structureType !== STRUCTURE_TOWER) {
                            let adjacentStructure = _.filter(creep.pos.findInRange(FIND_STRUCTURES, 1), (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
                            if (adjacentStructure.length > 0) creep.transfer(adjacentStructure[0], RESOURCE_ENERGY);
                        }
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
        } else if (creep.memory.task !== 'upgrade' && praisers.length && (creep.memory.constructionSite || creep.findConstruction())) {
            let construction = Game.getObjectById(creep.memory.constructionSite);
            creep.say('Build!', true);
            if (creep.memory.task === 'repair') {
                switch (creep.repair(construction)) {
                    case OK:
                        return null;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(construction, {range: 3});
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                    case ERR_INVALID_TARGET:
                        if (construction instanceof ConstructionSite) construction.remove();
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                }
            } else {
                switch (creep.build(construction)) {
                    case OK:
                        return null;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(construction, {range: 3});
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                    case ERR_INVALID_TARGET:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                }
            }
        } else if (creep.room.controller && creep.room.controller.my) {
            creep.memory.task = 'upgrade';
            creep.say('Praise!', true);
            switch (creep.upgradeController(creep.room.controller)) {
                case OK:
                    delete creep.memory._shibMove;
                    return;
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(creep.room.controller, {range: 3});
            }
        } else {
            creep.idleFor(25);
        }
    } else {
        if (!creep.memory.harvest && (creep.memory.energyDestination || creep.findEnergy())) {
            creep.say('Energy!', true);
            creep.withdrawEnergy();
        } else {
            creep.memory.harvest = true;
            creep.say('Harvest!', true);
            let source = Game.getObjectById(creep.memory.source) || creep.pos.getClosestSource();
            if (source) {
                if (Math.random() > 0.75) return creep.memory.source = undefined;
                creep.memory.source = source.id;
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
            } else {
                delete creep.memory.harvest;
                creep.idleFor(5);
            }
        }
    }
};