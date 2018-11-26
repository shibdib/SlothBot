/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

module.exports.role = function (creep) {
    //INITIAL CHECKS
    creep.say(ICONS.reaction, true);
    //If creep needs boosts do that first
    if (boostDelivery(creep)) return;
    if (_.sum(creep.carry) === 0) creep.memory.hauling = false;
    if (_.sum(creep.carry) > creep.carryCapacity * 0.75) creep.memory.hauling = true;
    if (droppedResources(creep)) return;
    let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB);
    // Empty labs
    if (creep.memory.empty) return emptyLab(creep);
    for (let lab of labs) {
        // If lab is empty continue
        if (!lab.mineralAmount || !lab.mineralType) continue;
        // If lab has correct resource continue
        if (lab.memory.itemNeeded && lab.memory.itemNeeded === lab.mineralType) continue;
        if (lab.memory.neededBoost && lab.memory.neededBoost === lab.mineralType) continue;
        // If lab is an output lab that isn't full continue
        if (!lab.memory.itemNeeded && !lab.memory.neededBoost && lab.mineralAmount < 750 && lab.memory.creating && lab.memory.creating === lab.mineralType) continue;
        if (!creep.memory.labHelper) creep.memory.labHelper = lab.id;
        creep.memory.empty = true;
        return;
    }
    // Fill needy labs
    if (creep.memory.supplier) return supplyLab(creep);
    for (let lab of labs) {
        // If lab doesn't need anything
        if (!lab.memory.itemNeeded) continue;
        // If lab has correct resource continue
        if (lab.mineralAmount >= creep.carryCapacity - 50) continue;
        if (!creep.memory.labHelper) creep.memory.labHelper = lab.id;
        creep.memory.supplier = true;
        return;
    }
    let closeLab = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_LAB});
    if (_.sum(creep.carry) > 0) {
        let storage = creep.room.storage;
        for (let resourceType in creep.carry) {
            switch (creep.transfer(storage, resourceType)) {
                case OK:
                    creep.memory.empty = undefined;
                    creep.memory.labHelper = undefined;
                    return;
                case ERR_NOT_IN_RANGE:
                    creep.memory.empty = true;
                    creep.shibMove(storage);
                    return;
                case ERR_FULL:
                    creep.drop(resourceType);
                    return true;
            }
        }
    } else if (creep.pos.getRangeTo(closeLab) > 3) {
        creep.shibMove(closeLab, {range: 2})
    } else if (creep.pos.checkForRoad()) {
        creep.moveRandom();
    } else {
        creep.idleFor(15);
    }
};

// Empty Function
function emptyLab(creep) {
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
    let lab = Game.getObjectById(creep.memory.labHelper);
    creep.say(ICONS.reaction + 'Emptying', true);
    if (_.sum(creep.carry) > 0) {
        for (let resourceType in creep.carry) {
            if (_.sum(terminal.store) < terminal.storeCapacity * 0.95) {
                switch (creep.transfer(terminal, resourceType)) {
                    case OK:
                        creep.memory.empty = undefined;
                        creep.memory.labHelper = undefined;
                        return;
                    case ERR_NOT_IN_RANGE:
                        creep.memory.empty = true;
                        creep.shibMove(terminal);
                        return;
                }
            } else {
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        creep.memory.empty = undefined;
                        creep.memory.labHelper = undefined;
                        return;
                    case ERR_NOT_IN_RANGE:
                        creep.memory.empty = true;
                        creep.shibMove(storage);
                        return;
                    case ERR_FULL:
                        creep.drop(resourceType);
                        return true;
                }
            }
        }
    } else {
        if (!lab.mineralType) {
            creep.memory.empty = undefined;
            creep.memory.labHelper = undefined;
            return;
        }
        switch (creep.withdraw(lab, lab.mineralType)) {
            case OK:
                creep.memory.empty = true;
                return undefined;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(lab);
                creep.memory.empty = true;
                return undefined;
            case ERR_NOT_ENOUGH_RESOURCES:
                creep.memory.empty = undefined;
                creep.memory.labHelper = undefined;
                return undefined;
        }
    }
}

// Supplier Function
function supplyLab(creep) {
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
    let lab = Game.getObjectById(creep.memory.labHelper);
    if (!lab || !terminal || !storage) {
        creep.memory.itemStorage = undefined;
        creep.memory.labHelper = undefined;
        creep.memory.componentNeeded = undefined;
        creep.memory.supplier = undefined;
        return;
    }
    creep.say(ICONS.reaction + 'Filling', true);
    creep.memory.componentNeeded = lab.memory.itemNeeded;
    if (!creep.carry[creep.memory.componentNeeded]) {
        if (!creep.memory.itemStorage) {
            if (storage.store[lab.memory.itemNeeded] > 0) {
                creep.memory.itemStorage = storage.id;
            } else if (terminal.store[lab.memory.itemNeeded] > 0) {
                creep.memory.itemStorage = terminal.id;
            } else {
                creep.memory.itemStorage = undefined;
                creep.memory.labHelper = undefined;
                creep.memory.componentNeeded = undefined;
                creep.memory.supplier = undefined;
                lab.memory = undefined;
            }
        } else {
            if (_.sum(creep.carry) > creep.carry[creep.memory.componentNeeded]) {
                for (let resourceType in creep.carry) {
                    if (resourceType === creep.memory.componentNeeded) continue;
                    switch (creep.transfer(storage, resourceType)) {
                        case OK:
                            return;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(storage);
                            return;
                    }
                }
            } else {
                switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), creep.memory.componentNeeded)) {
                    case OK:
                        creep.memory.itemStorage = undefined;
                        return;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                        return;
                    case ERR_NOT_ENOUGH_RESOURCES:
                        creep.memory.itemStorage = undefined;
                        creep.memory.labHelper = undefined;
                        creep.memory.componentNeeded = undefined;
                        creep.memory.supplier = undefined;
                        return;
                    case ERR_INVALID_ARGS:
                        creep.memory.itemStorage = undefined;
                        creep.memory.labHelper = undefined;
                        creep.memory.componentNeeded = undefined;
                        creep.memory.supplier = undefined;
                        return;
                }
            }
        }
    } else {
        if (_.sum(creep.carry) > creep.carry[creep.memory.componentNeeded]) {
            for (let resourceType in creep.carry) {
                if (resourceType === creep.memory.componentNeeded) continue;
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        return;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        return;
                }
            }
        } else {
            switch (creep.transfer(lab, creep.memory.componentNeeded)) {
                case OK:
                    creep.memory.itemStorage = undefined;
                    creep.memory.labHelper = undefined;
                    creep.memory.componentNeeded = undefined;
                    creep.memory.supplier = undefined;
                    return undefined;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(lab);
                    return undefined;
            }
        }
    }
}

function boostDelivery(creep) {
    if (creep.room.controller.level < 6 || !_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active === true && s.memory.neededBoost)[0]) return false;
    let lab = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB && s.memory.active === true && s.memory.neededBoost)[0];
    if (!lab) return delete creep.memory.labTech;
    //Make sure creep needing boost exists
    let boostCreep = _.filter(creep.room.creeps, (c) => c.memory && c.memory.boostLab === lab.id)[0];
    if (!boostCreep) {
        delete lab.memory;
        return delete creep.memory.labTech
    }
    let terminal = creep.room.terminal;
    let storage = creep.room.storage;
    creep.say(ICONS.boost, true);
    if (creep.carry[lab.memory.neededBoost] === _.sum(creep.carry)) {
        switch (creep.transfer(lab, lab.memory.neededBoost)) {
            case OK:
                return delete creep.memory.labTech;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(lab, {ignoreCreeps: false});
                creep.memory.labTech = true;
                return true;
        }
    } else if (_.sum(creep.carry) > creep.carry[lab.memory.neededBoost]) {
        for (let resourceType in creep.carry) {
            if (resourceType === lab.memory.neededBoost) continue;
            switch (creep.transfer(terminal, resourceType)) {
                case OK:
                    creep.memory.labTech = true;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(terminal);
                    creep.memory.labTech = true;
                    return true;
            }
        }
    }
    if (lab.mineralType && lab.mineralType !== lab.memory.neededBoost) {
        switch (creep.withdraw(lab, lab.mineralType)) {
            case OK:
                creep.memory.labTech = true;
                return true;
            case ERR_NOT_IN_RANGE:
                creep.shibMove(lab);
                creep.memory.labTech = true;
                return true;
        }
    } else {
        if (!creep.memory.itemStorage) {
            if (storage.store[lab.memory.neededBoost] > 0) {
                creep.memory.labTech = true;
                creep.memory.itemStorage = storage.id;
                return true;
            } else if (terminal.store[lab.memory.neededBoost] > 0) {
                creep.memory.labTech = true;
                creep.memory.itemStorage = terminal.id;
                return true;
            } else {
                delete creep.memory.labTech;
                delete creep.memory.itemStorage;
            }
        } else {
            switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), lab.memory.neededBoost)) {
                case OK:
                    delete creep.memory.itemStorage;
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                    creep.memory.labTech = true;
                    return true;
                case ERR_NOT_ENOUGH_RESOURCES:
                    delete creep.memory.itemStorage;
                    return true;
            }
        }
    }
}

function droppedResources(creep) {
    let tombstone = creep.room.find(FIND_TOMBSTONES, {filter: (r) => _.sum(r.store) > r.store[RESOURCE_ENERGY] || (!r.store[RESOURCE_ENERGY] && _.sum(r.store) > 0)})[0];
    let resources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType !== RESOURCE_ENERGY})[0];
    if (tombstone) {
        let storage = creep.room.storage;
        if (_.sum(creep.carry) > 0) {
            for (let resourceType in creep.carry) {
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        return false;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        return true;
                }
            }
        } else {
            for (let resourceType in tombstone.store) {
                switch (creep.withdraw(tombstone, resourceType)) {
                    case OK:
                        return true;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(tombstone);
                        return true;
                }
            }
        }
    } else if (resources) {
        let storage = creep.room.storage;
        if (_.sum(creep.carry) > 0) {
            for (let resourceType in creep.carry) {
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                        return false;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                        return true;
                }
            }
        } else {
            switch (creep.pickup(resources)) {
                case OK:
                    return true;
                case ERR_NOT_IN_RANGE:
                    creep.shibMove(resources);
                    return true;
            }
        }
    } else {
        return false;
    }
}