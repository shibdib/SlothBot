/**
 * Created by Bob on 7/12/2017.
 */

let _ = require('lodash');
const profiler = require('screeps-profiler');

/**
 * @return {null}
 */
function role(creep) {
    //INITIAL CHECKS
    creep.say(ICONS.reaction, true);
    if (creep.renewalCheck(6)) return null;
    if (creep.borderCheck()) return null;
    if (creep.wrongRoom()) return null;
    creep.repairRoad();
    if (creep.carry[RESOURCE_ENERGY] > 0) {
        let adjacentStructure = _.filter(creep.pos.findInRange(FIND_STRUCTURES, 1), (s) => (s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_SPAWN) && s.energy < s.energyCapacity);
        if (adjacentStructure.length > 0) creep.transfer(adjacentStructure[0], RESOURCE_ENERGY);
    }
    if (_.sum(creep.carry) === 0) creep.memory.hauling = false;
    if (_.sum(creep.carry) > creep.carryCapacity * 0.75) creep.memory.hauling = true;
    if (!creep.getSafe(true)) {
        if (droppedResources(creep)) return null;
        let labs = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_LAB);
        let terminal = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
        let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
        for (let key in labs) {
            let helper = _.filter(creep.room.creeps, (c) => c.memory && c.memory.labHelper === labs[key].id && c.id !== creep.id)[0];
            if (helper) continue;
            if (creep.memory.emptying ||
                (labs[key].mineralAmount > 0 && labs[key].mineralType !== labs[key].memory.itemNeeded && labs[key].mineralType !== labs[key].memory.creating) ||
                (labs[key].mineralAmount >= 500 && labs[key].mineralType === labs[key].memory.creating)) {
                creep.memory.labHelper = labs[key].id;
                let lab = Game.getObjectById(creep.memory.labHelper);
                if (_.sum(creep.carry) > 0) {
                    for (let resourceType in creep.carry) {
                        if (resourceType > 0 && ((_.includes(END_GAME_BOOSTS, resourceType) || _.includes(TIER_2_BOOSTS, resourceType) || resourceType === RESOURCE_GHODIUM) && _.sum(terminal.store) < terminal.storeCapacity * 0.95)) {
                            switch (creep.transfer(terminal, resourceType)) {
                                case OK:
                                    delete creep.memory.emptying;
                                    delete creep.memory.labHelper;
                                    return undefined;
                                case ERR_NOT_IN_RANGE:
                                    creep.shibMove(terminal);
                                    return undefined;
                            }
                        } else {
                            switch (creep.transfer(storage, resourceType)) {
                                case OK:
                                    delete creep.memory.emptying;
                                    delete creep.memory.labHelper;
                                    return undefined;
                                case ERR_NOT_IN_RANGE:
                                    creep.shibMove(storage);
                                    return undefined;
                            }
                        }
                    }
                } else {
                    switch (creep.withdraw(lab, lab.mineralType)) {
                        case OK:
                            creep.memory.emptying = true;
                            return undefined;
                        case ERR_NOT_IN_RANGE:
                            creep.shibMove(labs[key]);
                            creep.memory.emptying = true;
                            return undefined;
                    }
                }
            } else if (labs[key].memory.itemNeeded && (labs[key].mineralType !== labs[key].memory.itemNeeded || (labs[key].mineralType === labs[key].memory.itemNeeded && labs[key].mineralAmount < 250))) {
                if (creep.carry[labs[key].memory.itemNeeded] === 0 || !creep.carry[labs[key].memory.itemNeeded]) {
                    if (!creep.memory.itemStorage) {
                        if (storage.store[labs[key].memory.itemNeeded] > 0) {
                            creep.memory.labHelper = labs[key].id;
                            creep.memory.itemStorage = storage.id;
                            creep.memory.componentNeeded = labs[key].memory.itemNeeded;
                        } else if (terminal.store[labs[key].memory.itemNeeded] > 0) {
                            creep.memory.labHelper = labs[key].id;
                            creep.memory.itemStorage = terminal.id;
                            creep.memory.componentNeeded = labs[key].memory.itemNeeded;
                        } else {
                            delete creep.memory.itemStorage;
                            delete creep.memory.labHelper;
                            delete creep.memory.componentNeeded;
                        }
                    }
                    if (creep.memory.itemStorage) {
                        if (_.sum(creep.carry) > creep.carry[creep.memory.componentNeeded] || (_.sum(creep.carry) > 0 && !creep.carry[creep.memory.componentNeeded])) {
                            for (let resourceType in creep.carry) {
                                switch (creep.transfer(storage, resourceType)) {
                                    case OK:
                                        delete creep.memory.emptying;
                                        return undefined;
                                    case ERR_NOT_IN_RANGE:
                                        creep.shibMove(storage);
                                        return undefined;
                                }
                            }
                        } else {
                            switch (creep.withdraw(Game.getObjectById(creep.memory.itemStorage), creep.memory.componentNeeded)) {
                                case OK:
                                    delete creep.memory.itemStorage;
                                    return undefined;
                                case ERR_NOT_IN_RANGE:
                                    creep.shibMove(Game.getObjectById(creep.memory.itemStorage));
                                    return undefined;
                            }
                        }
                    }
                } else if (creep.carry[creep.memory.componentNeeded] > 0) {
                    let lab = Game.getObjectById(creep.memory.labHelper);
                    if (lab) {
                        switch (creep.transfer(lab, creep.memory.componentNeeded)) {
                            case OK:
                                delete creep.memory.itemStorage;
                                delete creep.memory.labHelper;
                                delete creep.memory.componentNeeded;
                                return undefined;
                            case ERR_NOT_IN_RANGE:
                                creep.shibMove(lab);
                                return undefined;
                        }
                    } else {
                        delete creep.memory.itemStorage;
                        delete creep.memory.labHelper;
                        delete creep.memory.componentNeeded;
                    }
                } else {
                    if (_.sum(creep.carry) > 0) {
                        for (let resourceType in creep.carry) {
                            if (resourceType > 0 && ((_.includes(END_GAME_BOOSTS, resourceType) || _.includes(TIER_2_BOOSTS, resourceType) || resourceType === RESOURCE_GHODIUM) && _.sum(terminal.store) < terminal.storeCapacity * 0.95)) {
                                switch (creep.transfer(terminal, resourceType)) {
                                    case OK:
                                        delete creep.memory.emptying;
                                        return undefined;
                                    case ERR_NOT_IN_RANGE:
                                        creep.shibMove(terminal);
                                        return undefined;
                                }
                            } else {
                                switch (creep.transfer(storage, resourceType)) {
                                    case OK:
                                        delete creep.memory.emptying;
                                        return undefined;
                                    case ERR_NOT_IN_RANGE:
                                        creep.shibMove(storage);
                                        return undefined;
                                }
                            }
                        }
                    }
                }
            }
        }
        if (_.sum(creep.carry) > 0) {
            for (let resourceType in creep.carry) {
                switch (creep.transfer(storage, resourceType)) {
                    case OK:
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(storage);
                }
            }
        } else {
            delete creep.memory.labHelper;
            delete creep.memory.emptying;
            delete creep.memory.itemStorage;
            delete creep.memory.componentNeeded;
            creep.idleFor(10);
        }
    }
}

module.exports.role = profiler.registerFN(role, 'labTechRole');

function droppedResources(creep) {
    let tombstone;
    if (!!~['shard0', 'shard1', 'shard2'].indexOf(Game.shard.name)) tombstone = creep.room.find(FIND_TOMBSTONES, {filter: (r) => _.sum(r.store) > r.store[RESOURCE_ENERGY] || (!r.store[RESOURCE_ENERGY] && _.sum(r.store) > 0)})[0];
    let resources = creep.room.find(FIND_DROPPED_RESOURCES, {filter: (r) => r.resourceType !== RESOURCE_ENERGY})[0];
    if (!!~['shard0', 'shard1', 'shard2'].indexOf(Game.shard.name) && tombstone) {
        let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
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
        let storage = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
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