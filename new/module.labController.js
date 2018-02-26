/**
 * Created by Bob on 6/24/2017.
 */

const profiler = require('screeps-profiler');
let _ = require('lodash');

function labManager(room) {
    for (let key in Memory.ownedRooms) {
        if (room.controller.level < 6) return;
        room = Memory.ownedRooms[key];
        let reactionRoom = _.filter(Memory.ownedRooms, (r) => r.memory.reactionRoom)[0];
        if (!reactionRoom) room.memory.reactionRoom = true;
        //if (room.memory.reactionRoom) manageReactions(room);
    }
}

module.exports.labManager = profiler.registerFN(labManager, 'labManager');

function manageReactions(room) {
    for (let lab of _.values(Game.structures)) {
        if (lab.structureType === STRUCTURE_LAB) {
            //Initial reaction setup in memory
            cacheReactions(lab);
            let labs = lab.pos.findInRange(FIND_MY_STRUCTURES, 2, {filter: (s) => s.structureType === STRUCTURE_LAB});
            if (labs.length >= 3 && !lab.room.memory.reactions.labHubs[labs[0].id] && !lab.room.memory.reactions.labHubs[labs[1].id] && !lab.room.memory.reactions.labHubs[labs[2].id]) {
                createLabHub(labs);
            }
            if (lab.room.memory.reactions.labHubs) {
                for (let keys in lab.room.memory.reactions.labHubs) {
                    let currentHub = lab.room.memory.reactions.labHubs[keys];
                    if (currentHub && !currentHub.active) {
                        if (!lab.room.memory.reactions.boostHub) {
                            currentHub.active = true;
                            currentHub.boostHub = true;
                            lab.room.memory.reactions.boostHub = keys;
                            continue;
                        }
                        reactions:
                            for (let key in lab.room.memory.reactions) {
                                if (key === 'current' || key === 'currentAge' || key === 'labHubs' || lab.room.memory.reactions[key].lab1) {
                                    continue;
                                }
                                let reaction = lab.room.memory.reactions[key];
                                let input1 = _.sum(lab.room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
                                    if (s['structure'] && s['structure'].store) {
                                        return s['structure'].store[reaction.input1] || 0;
                                    } else {
                                        return 0;
                                    }
                                }) + _.sum(lab.room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
                                    if (s['structure'] && s['structure'].mineralAmount && s['structure'].mineralType === reaction.input1) {
                                        return s['structure'].mineralAmount || 0;
                                    } else {
                                        return 0;
                                    }
                                });
                                let input2 = _.sum(lab.room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
                                    if (s['structure'] && s['structure'].store) {
                                        return s['structure'].store[reaction.input2] || 0;
                                    } else {
                                        return 0;
                                    }
                                }) + _.sum(lab.room.lookForAtArea(LOOK_STRUCTURES, 0, 0, 49, 49, true), (s) => {
                                    if (s['structure'] && s['structure'].mineralAmount && s['structure'].mineralType === reaction.input2) {
                                        return s['structure'].mineralAmount || 0;
                                    } else {
                                        return 0;
                                    }
                                });
                                if (input1 >= 200 && input2 >= 200) {
                                    reaction.assignedHub = key;
                                    reaction.lab1 = currentHub.lab1;
                                    reaction.lab2 = currentHub.lab2;
                                    reaction.outputLab = currentHub.outputLab;
                                    currentHub.active = true;
                                } else {
                                    reaction.assignedHub = undefined;
                                    reaction.lab1 = undefined;
                                    reaction.lab2 = undefined;
                                    reaction.outputLab = undefined;
                                    continue reactions;
                                }
                            }
                    } else if (currentHub.active) {
                        //if minerals are present, react!
                        let lab1 = Game.getObjectById(currentHub.lab1);
                        let lab2 = Game.getObjectById(currentHub.lab2);
                        let outputLab = Game.getObjectById(currentHub.outputLab);
                        if ((lab1.mineralAmount > 0 && lab2.mineralAmount > 0) && (outputLab.mineralAmount < outputLab.mineralCapacity * 0.97) || !outputLab.mineralAmount) {
                            outputLab.runReaction(lab1, lab2);
                        }
                    }
                }
            }
        }
    }
}

function cacheReactions(lab, force = false) {
    //Cache reaction
    let cache = lab.room.memory.reactions || {};
    if (!lab.room.memory.reactions[RESOURCE_KEANIUM_OXIDE] || !lab.room.memory.reactions[RESOURCE_KEANIUM_OXIDE].output || force) {
        cache[RESOURCE_KEANIUM_OXIDE] = {
            input1: RESOURCE_OXYGEN,
            input2: RESOURCE_KEANIUM,
            lab1: null,
            lab2: null,
            outputLab: null,
            output: RESOURCE_KEANIUM_OXIDE,
            isActive: false
        };
    }
    if (!lab.room.memory.reactions['GO'] || !lab.room.memory.reactions['GO'].output || force) {
        cache['GO'] = {
            input1: RESOURCE_OXYGEN,
            input2: RESOURCE_GHODIUM,
            lab1: null,
            lab2: null,
            outputLab: null,
            output: RESOURCE_GHODIUM_OXIDE,
            isActive: false
        };
    }
    if (!lab.room.memory.reactions['GH'] || !lab.room.memory.reactions['GH'].output || force) {
        cache['GH'] = {
            input1: RESOURCE_HYDROGEN,
            input2: RESOURCE_GHODIUM,
            lab1: null,
            lab2: null,
            outputLab: null,
            output: RESOURCE_GHODIUM_HYDRIDE,
            isActive: false
        };
    }
    if (!lab.room.memory.reactions[RESOURCE_GHODIUM_ALKALIDE] || !lab.room.memory.reactions[RESOURCE_GHODIUM_ALKALIDE].output || force) {
        cache[RESOURCE_GHODIUM_ALKALIDE] = {
            input1: RESOURCE_GHODIUM_OXIDE,
            input2: RESOURCE_HYDROXIDE,
            lab1: null,
            lab2: null,
            outputLab: null,
            output: RESOURCE_GHODIUM_ALKALIDE,
            isActive: false
        };
    }
    lab.room.memory.reactions = cache;
}

function createLabHub(labs) {
    let cache = labs[0].room.memory.reactions.labHubs || {};
    let key = labs[0].id;
    cache[key] = {
        lab1: labs[0].id,
        lab2: labs[1].id,
        outputLab: labs[2].id
    };
    labs[0].room.memory.reactions.labHubs = cache;
}